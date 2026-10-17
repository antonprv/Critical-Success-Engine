// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import { CreateAabb, Enclose, Overlaps, RayAabb, type Aabb } from "./Aabb";

/** What the tree is built from: an id and its box. */
export interface BvhItem {
	readonly Id: number;
	readonly Box: Aabb;
}

const NoNode = -1;

/**
 * A tree of boxes (plan.md 2.5b): finds the edits that reach a region (which
 * bricks to regenerate, which edits a brick needs) and the ones a ray passes.
 * Built top-down by splitting the longest axis at the median; a moved edit is
 * refit in place (its leaf and the boxes above it grow or shrink), so the
 * tree is rebuilt only when edits come or go.
 *
 * The nodes are flat typed arrays, ready to be copied to a GPU buffer.
 */
export class Bvh {
	/** Per node: min x, y, z, max x, y, z. */
	private _boxes = new Float64Array( 0 );

	/** Per node: its children (internal) or NoNode (leaf). */
	private _left = new Int32Array( 0 );

	private _right = new Int32Array( 0 );

	private _parent = new Int32Array( 0 );

	/** Per leaf: the item's id. */
	private _ids = new Int32Array( 0 );

	private _nodeCount = 0;

	/** Item id -> its leaf. */
	private readonly _leafOf = new Map<number, number>();

	private readonly _stack: number[] = [];

	/** How many items the tree holds. */
	public get Count(): number {
		return this._leafOf.size;
	}

	/** Rebuilds the tree over `items` (ids must be unique). */
	public Build( items: readonly BvhItem[] ): void {
		const capacity = FMath.Max( 1, items.length * 2 - 1 );

		this._boxes = new Float64Array( capacity * 6 );
		this._left = new Int32Array( capacity );
		this._right = new Int32Array( capacity );
		this._parent = new Int32Array( capacity );
		this._ids = new Int32Array( capacity );
		this._nodeCount = 0;
		this._leafOf.clear();
		if ( items.length > 0 ) {
			this.BuildRange( [ ...items ], NoNode );
		}
	}

	private BuildRange( items: BvhItem[], parent: number ): number {
		const node = this._nodeCount++;
		const box = CreateAabb();

		for ( const item of items ) {
			Enclose( box, item.Box );
		}
		this._boxes.set( box, node * 6 );
		this._parent[node] = parent;
		if ( items.length === 1 ) {
			const only = items[0]!;

			this._left[node] = NoNode;
			this._right[node] = NoNode;
			this._ids[node] = only.Id;
			this._leafOf.set( only.Id, node );
			return node;
		}

		// split the longest axis of the centers' extent at the median
		const centers = CreateAabb();

		for ( const item of items ) {
			for ( let i = 0; i < 3; i++ ) {
				const c = item.Box[i]! + item.Box[i + 3]!;

				centers[i] = FMath.Min( centers[i]!, c );
				centers[i + 3] = FMath.Max( centers[i + 3]!, c );
			}
		}

		const ex = centers[3]! - centers[0]!;
		const ey = centers[4]! - centers[1]!;
		const ez = centers[5]! - centers[2]!;
		const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;

		items.sort( ( a, b ) => (
			a.Box[axis]! + a.Box[axis + 3]! - b.Box[axis]! - b.Box[axis + 3]!
		) );

		const half = items.length >> 1;

		this._ids[node] = NoNode;
		this._left[node] = this.BuildRange( items.slice( 0, half ), node );
		this._right[node] = this.BuildRange( items.slice( half ), node );
		return node;
	}

	/**
	 * Moves an item's box (false if the tree doesn't hold it): the boxes above
	 * it are recomputed from their children up to the root.
	 */
	public Refit( id: number, box: Aabb ): boolean {
		const leaf = this._leafOf.get( id );

		if ( leaf === undefined ) {
			return false;
		}
		this._boxes.set( box, leaf * 6 );

		let node = this._parent[leaf]!;

		while ( node !== NoNode ) {
			const at = node * 6;
			const l = this._left[node]! * 6;
			const r = this._right[node]! * 6;

			for ( let i = 0; i < 3; i++ ) {
				this._boxes[at + i] = FMath.Min(
					this._boxes[l + i]!,
					this._boxes[r + i]!,
				);
				this._boxes[at + i + 3] = FMath.Max(
					this._boxes[l + i + 3]!,
					this._boxes[r + i + 3]!,
				);
			}
			node = this._parent[node]!;
		}
		return true;
	}

	/** The ids whose boxes touch `box`, appended to `out`. */
	public Query( box: Aabb, out: number[] = [] ): number[] {
		const stack = this.Start();

		while ( stack.length > 0 ) {
			const node = stack.pop()!;

			if ( !Overlaps( this.NodeBox( node ), box ) ) {
				continue;
			}
			this.Visit( node, stack, out );
		}
		return out;
	}

	/**
	 * The ids whose boxes a ray passes within `tMax` (the direction's units),
	 * appended to `out` in no particular order.
	 */
	public QueryRay(
		origin: Readonly<[ number, number, number ]>,
		dir: Readonly<[ number, number, number ]>,
		tMax: number,
		out: number[] = [],
	): number[] {
		const stack = this.Start();

		while ( stack.length > 0 ) {
			const node = stack.pop()!;
			const t = RayAabb(
				this.NodeBox( node ),
				origin[0],
				origin[1],
				origin[2],
				dir[0],
				dir[1],
				dir[2],
				tMax,
			);

			if ( t < 0 ) {
				continue;
			}
			this.Visit( node, stack, out );
		}
		return out;
	}

	private Start(): number[] {
		const stack = this._stack;

		stack.length = 0;
		if ( this._nodeCount > 0 ) {
			stack.push( 0 );
		}
		return stack;
	}

	private Visit( node: number, stack: number[], out: number[] ): void {
		if ( this._left[node] === NoNode ) {
			out.push( this._ids[node]! );
		} else {
			stack.push( this._left[node]!, this._right[node]! );
		}
	}

	private NodeBox( node: number ): Aabb {
		return this._boxes.subarray( node * 6, node * 6 + 6 );
	}

	/** The box around everything (empty when the tree is). */
	public get Bounds(): Aabb {
		return this._nodeCount > 0 ? this._boxes.slice( 0, 6 ) : CreateAabb();
	}
}
