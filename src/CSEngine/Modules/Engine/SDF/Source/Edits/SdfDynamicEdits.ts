// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import type { SdfBaseLayer } from "../Field/BaseLayers";
import { SdfProgram } from "../Field/SdfProgram";
import { ShapeRadius } from "../Field/Shapes";
import { CreateAabb, Enclose, SphereAabb, type Aabb } from "../Spatial/Aabb";
import {
	ALL_LAYERS,
	IsCarving,
	IsGlobal,
	IsSmooth,
	SdfEditFlags,
	SdfOp,
	SdfPhysicsMode,
	type SdfEdit,
	type SdfEditInit,
} from "./SdfEdit";

/** Dynamic edits at once: the length of the shaders' uniform array. */
export const MAX_DYNAMIC_EDITS = 16;

/**
 * Floats of one packed dynamic edit, five vec4s: position and scale,
 * rotation, params, then op, shape, smoothK and material, then layer, mask
 * and flags.
 */
export const DYNAMIC_EDIT_FLOATS = 20;

/** What a dynamic edit does besides being drawn (bit set). */
export const enum SdfDynamicFlags {
	None = 0,
	/**
	 * The physics feels it too: the SDF worker remeshes the chunks it
	 * reaches for the physics alone (a few times a second, as the meshes
	 * come back), never for drawing, never written into the world.
	 */
	Physics = 1,
}

/** A dynamic edit: an edit's shape, pose, operation and layers. */
export type SdfDynamicEdit = Omit<
	SdfEdit,
	"Flags" | "PhysicsMode" | "Group" | "Order"
> & {
	Flags: SdfDynamicFlags;
};

/** What a new dynamic edit is made of; the rest has defaults. */
export type SdfDynamicInit = Omit<
	SdfEditInit,
	"Flags" | "PhysicsMode" | "Group"
> & {
	Flags?: SdfDynamicFlags;
};

/**
 * Edits that move or come and go every frame - a hole that follows a tunnel
 * gun, a crater that pulses, a blob that floats - kept apart from the world: no
 * edit list, no version, no delta, never folded, baked, saved or meshed for
 * drawing (nor collided with, unless flagged Physics: then the SDF worker
 * remeshes what they reach for the physics alone). They are drawn by the GPU on
 * top of the world (the shaders apply them to the sampled distance, plan.md
 * 6.3), so moving one costs a few uniforms a frame and nothing else. Their
 * order is the order they were added in; at most MAX_DYNAMIC_EDITS at once.
 *
 * `Data` is what the shaders read: Count packed edits.
 */
export class SdfDynamicEdits {
	public readonly Data = new Float32Array(
		MAX_DYNAMIC_EDITS * DYNAMIC_EDIT_FLOATS,
	);

	private readonly _edits: SdfDynamicEdit[] = [];

	private _nextId = 1;

	private _changed = false;

	private _version = 0;

	public get Count(): number {
		return this._edits.length;
	}

	/** The edits in the order they apply. */
	public get Edits(): readonly SdfDynamicEdit[] {
		return this._edits;
	}

	public Get( id: number ): SdfDynamicEdit | undefined {
		return this._edits.find( ( edit ) => edit.Id === id );
	}

	/**
	 * Adds a dynamic edit after the others. Throws when MAX_DYNAMIC_EDITS are
	 * there already.
	 */
	public Add( init: SdfDynamicInit ): SdfDynamicEdit {
		if ( this._edits.length >= MAX_DYNAMIC_EDITS ) {
			throw new RangeError(
				`at most ${ MAX_DYNAMIC_EDITS } dynamic SDF edits at once`,
			);
		}

		const edit: SdfDynamicEdit = {
			Op: SdfOp.Union,
			Position: [ 0, 0, 0 ],
			Rotation: [ 0, 0, 0, 1 ],
			Scale: 1,
			Params: [ 0.5, 0.5, 0.5, 0 ],
			SmoothK: 0,
			MaterialId: 0,
			Layer: 1,
			Mask: ALL_LAYERS,
			Flags: SdfDynamicFlags.None,
			...init,
			Id: this._nextId++,
		};

		edit.Position = [ ...edit.Position ];
		edit.Rotation = [ ...edit.Rotation ];
		edit.Params = [ ...edit.Params ];
		this._edits.push( edit );
		this.Pack( this._edits.length - 1 );
		return edit;
	}

	/** Changes a dynamic edit; false if there is no such one. */
	public Update(
		id: number,
		changes: Partial<Omit<SdfDynamicEdit, "Id">>,
	): boolean {
		const index = this._edits.findIndex( ( edit ) => edit.Id === id );

		if ( index < 0 ) {
			return false;
		}

		const edit = this._edits[index]!;

		Object.assign( edit, changes );
		edit.Position = [ ...edit.Position ];
		edit.Rotation = [ ...edit.Rotation ];
		edit.Params = [ ...edit.Params ];
		this.Pack( index );
		return true;
	}

	public Remove( id: number ): boolean {
		const index = this._edits.findIndex( ( edit ) => edit.Id === id );

		if ( index < 0 ) {
			return false;
		}
		this._edits.splice( index, 1 );
		// the ones after it move up a place: their order stays
		for ( let i = index; i < this._edits.length; i++ ) {
			this.Pack( i );
		}
		this.Touch();
		return true;
	}

	public Clear(): void {
		if ( this._edits.length > 0 ) {
			this._edits.length = 0;
			this.Touch();
		}
	}

	/** Grows with every change: what each consumer compares with its own. */
	public get Version(): number {
		return this._version;
	}

	/** Whether any edit is felt by the physics. */
	public get HasPhysics(): boolean {
		return this._edits.some(
			( edit ) => ( edit.Flags & SdfDynamicFlags.Physics ) !== 0,
		);
	}

	/**
	 * Whether anything changed since the last call: what decides if the
	 * edits are sent to the renderer again.
	 */
	public TakeChanged(): boolean {
		const changed = this._changed;

		this._changed = false;
		return changed;
	}

	/** The packed edits the physics feels, in their order, as a new array. */
	public PackedPhysics(): Float32Array {
		const physics = this._edits
			.map( ( edit, index ) => ( { edit, index } ) )
			.filter(
				( { edit } ) => ( edit.Flags & SdfDynamicFlags.Physics ) !== 0,
			);
		const packed = new Float32Array( physics.length * DYNAMIC_EDIT_FLOATS );

		physics.forEach( ( { index }, i ) => packed.set(
			this.Data.subarray(
				index * DYNAMIC_EDIT_FLOATS,
				( index + 1 ) * DYNAMIC_EDIT_FLOATS,
			),
			i * DYNAMIC_EDIT_FLOATS,
		) );
		return packed;
	}

	/** The packed edits alone (Count of them), as a new array to send. */
	public Packed(): Float32Array {
		return this.Data.slice( 0, this._edits.length * DYNAMIC_EDIT_FLOATS );
	}

	/**
	 * Takes the edits another thread packed (Packed): the renderer's copy.
	 * Ids are those of the sender's order (1, 2, ...).
	 */
	public Load( packed: Float32Array ): void {
		const count = FMath.Min(
			MAX_DYNAMIC_EDITS,
			FMath.Floor( packed.length / DYNAMIC_EDIT_FLOATS ),
		);

		this._edits.length = 0;
		for ( let i = 0; i < count; i++ ) {
			const at = i * DYNAMIC_EDIT_FLOATS;

			this._edits.push( {
				Id: i + 1,
				Position: [ packed[at]!, packed[at + 1]!, packed[at + 2]! ],
				Scale: packed[at + 3]!,
				Rotation: [
					packed[at + 4]!,
					packed[at + 5]!,
					packed[at + 6]!,
					packed[at + 7]!,
				],
				Params: [
					packed[at + 8]!,
					packed[at + 9]!,
					packed[at + 10]!,
					packed[at + 11]!,
				],
				Op: packed[at + 12]! as SdfOp,
				Shape: packed[at + 13]!,
				SmoothK: packed[at + 14]!,
				MaterialId: packed[at + 15]!,
				Layer: packed[at + 16]!,
				Mask: packed[at + 17]!,
				Flags: packed[at + 18]!,
			} );
		}
		this.Data.set( packed.subarray( 0, count * DYNAMIC_EDIT_FLOATS ) );
		this.Touch();
	}

	/**
	 * The edits as an edit list's edits, in their order (`physics`: only the
	 * ones the physics feels): what the SDF worker meshes the physics' chunks
	 * with, after the world's own edits.
	 */
	public AsEdits( physics = false ): SdfEdit[] {
		return this._edits
			.filter( ( edit ) => !physics
				|| ( edit.Flags & SdfDynamicFlags.Physics ) !== 0 )
			.map( ( edit, index ) => ( {
				...edit,
				Flags: SdfEditFlags.None,
				PhysicsMode: SdfPhysicsMode.StaticWorld,
				Group: 0,
				Order: 1e9 + index,
			} ) );
	}

	/**
	 * The world's distance `d` (on layer `layer`, an index) at a point with
	 * the dynamic edits applied, as the shaders compute it: for tests and
	 * gameplay guesses.
	 */
	public Apply(
		d: number,
		x: number,
		y: number,
		z: number,
		layer = 0,
	): number {
		const base: SdfBaseLayer = {
			Distance: () => d,
			MaterialId: 0,
			LayerIndex: layer,
		};

		return new SdfProgram( this.AsEdits(), base ).Distance( x, y, z );
	}

	/**
	 * The box a dynamic edit can change (as EditList.Reach), null for an
	 * intersection (it changes everything).
	 */
	public static Reach( edit: SdfDynamicEdit, margin = 0 ): Aabb | null {
		if ( IsGlobal( edit.Op ) ) {
			return null;
		}
		return SphereAabb(
			edit.Position[0],
			edit.Position[1],
			edit.Position[2],
			ShapeRadius( edit.Shape, edit.Params ) * edit.Scale
				+ ( IsSmooth( edit.Op ) ? edit.SmoothK : 0 ) + margin,
		);
	}

	/** The box all the bounded edits can change (empty: none). */
	public Bounds( margin = 0 ): Aabb {
		const box = CreateAabb();

		for ( const edit of this._edits ) {
			const reach = SdfDynamicEdits.Reach( edit, margin );

			if ( reach ) {
				Enclose( box, reach );
			}
		}
		return box;
	}

	/** Whether any edit only removes (a hole: the mesh tier must cut). */
	public get Carves(): boolean {
		return this._edits.some( ( edit ) => IsCarving( edit.Op ) );
	}

	/**
	 * Whether any edit's mask leaves a layer out: the shaders then follow
	 * the layers (else every edit merges with everything, a cheaper loop).
	 */
	public get Layered(): boolean {
		return this._edits.some(
			( edit ) => ( edit.Mask & ALL_LAYERS ) !== ALL_LAYERS,
		);
	}

	private Touch(): void {
		this._changed = true;
		this._version++;
	}

	private Pack( index: number ): void {
		const edit = this._edits[index]!;
		const at = index * DYNAMIC_EDIT_FLOATS;
		const data = this.Data;

		data[at] = edit.Position[0];
		data[at + 1] = edit.Position[1];
		data[at + 2] = edit.Position[2];
		data[at + 3] = edit.Scale;
		data.set( edit.Rotation, at + 4 );
		data.set( edit.Params, at + 8 );
		data[at + 12] = edit.Op;
		data[at + 13] = edit.Shape;
		data[at + 14] = edit.SmoothK;
		data[at + 15] = edit.MaterialId;
		data[at + 16] = edit.Layer;
		data[at + 17] = edit.Mask;
		data[at + 18] = edit.Flags;
		data[at + 19] = 0;
		this.Touch();
	}
}
