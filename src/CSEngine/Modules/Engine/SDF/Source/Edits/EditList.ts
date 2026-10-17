// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import { ShapeRadius } from "../Field/Shapes";
import { CreateAabb, SphereAabb, type Aabb } from "../Spatial/Aabb";
import { Bvh } from "../Spatial/Bvh";
import {
	EDIT_BYTES,
	EDIT_WORDS,
	IsGlobal,
	IsSmooth,
	PackEdit,
	SdfEditFlags,
	SdfOp,
	SdfPhysicsMode,
	UnpackEdit,
	type SdfEdit,
	type SdfEditInit,
} from "./SdfEdit";

/** "CSDF" read as a little-endian word: the start of a saved edit list. */
export const EDIT_LIST_MAGIC = 0x46445343;

/** The saved format's version (plan.md 6.6). */
export const EDIT_LIST_VERSION = 1;

/** A delta record: kind, id, version, a spare word, then the edit. */
const DELTA_WORDS = 4 + EDIT_WORDS;

const enum DeltaKind {
	Upsert = 0,
	Remove = 1,
	/** Removed after being folded into the base (SdfWorld). */
	Fold = 2,
}

/** The whole world: what a global edit (an intersection) dirties. */
const Everywhere = CreateAabb(
	-Infinity,
	-Infinity,
	-Infinity,
	Infinity,
	Infinity,
	Infinity,
);

/** What a consumer of the list's changes holds (EditList.Watch). */
export interface EditWatcher {
	/** The boxes changed since the last call. */
	Take(): Aabb[];
	Stop(): void;
}

/**
 * The ordered list of edits: the one source of truth of the SDF world (plan.md
 * 4, 6.6, 9.6). Every change bumps `Version`, records the space it touched
 * (the edit's old and new reach: what bricks and mesh chunks to rebuild,
 * plan.md 6.1) and a delta record for the other workers.
 */
export class EditList {
	private readonly _edits = new Map<number, SdfEdit>();

	/** By Order; rebuilt lazily. */
	private _ordered: SdfEdit[] = [];

	private _orderDirty = false;

	private readonly _bvh = new Bvh();

	private _bvhDirty = false;

	/** Intersections: they reach everywhere, so the BVH can't cull them. */
	private readonly _global = new Set<number>();

	private _nextId = 1;

	private _nextOrder = 1;

	private _version = 0;

	/** Per watcher: the boxes changed since it last took them. */
	private readonly _watchers = new Set<Aabb[]>();

	private _delta: Array<[ DeltaKind, SdfEdit ]> = [];

	/** Grows with every change: what a worker reports it has applied. */
	public get Version(): number {
		return this._version;
	}

	public get Count(): number {
		return this._edits.size;
	}

	/** The edits by Order (the order operations apply in). */
	public get Edits(): readonly SdfEdit[] {
		if ( this._orderDirty ) {
			this._ordered = [ ...this._edits.values() ].sort( ByOrder );
			this._orderDirty = false;
		}
		return this._ordered;
	}

	public Get( id: number ): SdfEdit | undefined {
		return this._edits.get( id );
	}

	/** Adds an edit at the end of the list. */
	public Add( init: SdfEditInit ): SdfEdit {
		const edit: SdfEdit = {
			Op: SdfOp.Union,
			Position: [ 0, 0, 0 ],
			Rotation: [ 0, 0, 0, 1 ],
			Scale: 1,
			Params: [ 0.5, 0.5, 0.5, 0 ],
			SmoothK: 0,
			MaterialId: 0,
			Flags: SdfEditFlags.None,
			PhysicsMode: SdfPhysicsMode.StaticWorld,
			Group: 0,
			...init,
			Id: this._nextId++,
			Order: this._nextOrder++,
		};

		OwnArrays( edit );

		this.Insert( edit );
		this.Touched( edit );
		return edit;
	}

	/**
	 * Changes an edit (false if there is no such one). Moving it refits the
	 * BVH; the space it left and the space it entered both get dirty.
	 */
	public Update(
		id: number,
		changes: Partial<Omit<SdfEdit, "Id">>,
	): boolean {
		const edit = this._edits.get( id );

		if ( !edit ) {
			return false;
		}
		this.MarkDirty( edit );

		const wasGlobal = IsGlobal( edit.Op );

		Object.assign( edit, changes );
		OwnArrays( edit );
		if ( changes.Order !== undefined ) {
			this._orderDirty = true;
			this._nextOrder = FMath.Max( this._nextOrder, changes.Order + 1 );
		}
		if ( wasGlobal !== IsGlobal( edit.Op ) ) {
			// in or out of the tree (global edits aren't in it)
			this.SetGlobal( edit );
			this._bvhDirty = true;
		} else if ( !this._bvhDirty && !wasGlobal ) {
			this._bvh.Refit( id, this.Reach( edit ) );
		}
		this.Touched( edit );
		return true;
	}

	/**
	 * Called by Fold with the edit and its reach before the edit leaves the
	 * list: whatever owns the base merges it in there (SdfWorld).
	 */
	public OnFold: ( ( edit: SdfEdit, reach: Aabb ) => void ) | null = null;

	/** Takes an edit out (false if there is no such one). */
	public Remove( id: number ): boolean {
		return this.Drop( id, DeltaKind.Remove );
	}

	/**
	 * Merges an edit into the base (OnFold) and takes it out of the list
	 * (false if there is no such one). Other workers replay it from the
	 * delta, so their bases fold it too.
	 */
	public Fold( id: number ): boolean {
		return this.Drop( id, DeltaKind.Fold );
	}

	private Drop( id: number, kind: DeltaKind ): boolean {
		const edit = this._edits.get( id );

		if ( !edit ) {
			return false;
		}
		if ( kind === DeltaKind.Fold ) {
			this.OnFold?.( edit, this.Reach( edit ) );
		}
		this._edits.delete( id );
		this._global.delete( id );
		this._orderDirty = true;
		this._bvhDirty = true;
		this.MarkDirty( edit );
		this._delta.push( [ kind, edit ] );
		this._version++;
		return true;
	}

	/** Removes every edit; the whole old extent gets dirty. */
	public Clear(): void {
		for ( const id of [ ...this._edits.keys() ] ) {
			this.Remove( id );
		}
	}

	/**
	 * The box an edit can change: the shape's bounding sphere, scaled and
	 * grown by its blend radius. Unbounded for intersections.
	 */
	public Reach( edit: SdfEdit ): Aabb {
		if ( IsGlobal( edit.Op ) ) {
			return Everywhere.slice();
		}

		const smooth = IsSmooth( edit.Op ) ? edit.SmoothK : 0;
		const radius = ShapeRadius( edit.Shape, edit.Params ) * edit.Scale
			+ smooth;

		return SphereAabb(
			edit.Position[0],
			edit.Position[1],
			edit.Position[2],
			radius,
		);
	}

	/**
	 * The edits that can change anything inside `box`, by Order, without
	 * muted ones: what a brick or chunk is computed from.
	 */
	public Candidates( box: Aabb ): SdfEdit[] {
		this.EnsureBvh();

		const out: SdfEdit[] = [];

		for ( const id of this._bvh.Query( box ) ) {
			out.push( this._edits.get( id )! );
		}
		for ( const id of this._global ) {
			out.push( this._edits.get( id )! );
		}
		return out.filter( IsLive ).sort( ByOrder );
	}

	/** Ids of the edits whose reach a ray passes within `tMax`. */
	public CandidatesOnRay(
		origin: Readonly<[ number, number, number ]>,
		dir: Readonly<[ number, number, number ]>,
		tMax: number,
	): SdfEdit[] {
		this.EnsureBvh();

		const out = this._bvh.QueryRay( origin, dir, tMax )
			.concat( [ ...this._global ] )
			.map( ( id ) => this._edits.get( id )! );

		return out.filter( IsLive ).sort( ByOrder );
	}

	/**
	 * Starts collecting the boxes the changes touch for one consumer (the
	 * brick volume, the mesh chunks, the physics...). Each watcher takes its
	 * own copy; Stop ends it.
	 */
	public Watch(): EditWatcher {
		const boxes: Aabb[] = [];

		this._watchers.add( boxes );
		return {
			Take: () => boxes.splice( 0 ),
			Stop: () => {
				this._watchers.delete( boxes );
			},
		};
	}

	/**
	 * The changes since the last call as one transferable buffer for another
	 * worker (plan.md 9.6): ApplyDelta replays it there. The last change of
	 * an edit wins.
	 */
	public TakeDelta(): ArrayBuffer {
		const latest = new Map<number, [ DeltaKind, SdfEdit ]>();

		// in the order of each edit's last change: folds don't commute
		for ( const entry of this._delta ) {
			latest.delete( entry[1].Id );
			latest.set( entry[1].Id, entry );
		}
		this._delta = [];

		const buffer = new ArrayBuffer(
			8 + latest.size * DELTA_WORDS * 4,
		);
		const head = new Uint32Array( buffer, 0, 2 );
		const words = new Uint32Array( buffer, 8 );
		const floats = new Float32Array( buffer, 8 );
		let index = 0;

		head[0] = latest.size;
		head[1] = this._version;
		for ( const [ kind, edit ] of latest.values() ) {
			const at = index * DELTA_WORDS;

			words[at] = kind;
			words[at + 1] = edit.Id;
			words[at + 2] = this._version;
			PackEdit(
				edit,
				floats.subarray( at + 4 ),
				words.subarray( at + 4 ),
				0,
			);
			index++;
		}
		return buffer;
	}

	/**
	 * Replays another list's TakeDelta here, keeping its ids (so both sides
	 * address the same edits). Returns the sender's version.
	 */
	public ApplyDelta( buffer: ArrayBuffer ): number {
		const head = new Uint32Array( buffer, 0, 2 );
		const words = new Uint32Array( buffer, 8 );
		const floats = new Float32Array( buffer, 8 );

		for ( let index = 0; index < head[0]!; index++ ) {
			const at = index * DELTA_WORDS;
			const id = words[at + 1]!;

			if ( words[at] === DeltaKind.Remove ) {
				this.Remove( id );
				continue;
			}

			const edit = UnpackEdit(
				id,
				floats.subarray( at + 4 ),
				words.subarray( at + 4 ),
				0,
			);

			if ( words[at] === DeltaKind.Fold ) {
				// folded as the sender had it, even if never seen here
				if ( !this.Update( id, edit ) ) {
					this.Adopt( edit );
				}
				this.Fold( id );
				continue;
			}

			// the same id: assigning it is a no-op
			if ( !this.Update( id, edit ) ) {
				this.Adopt( edit );
			}
		}
		return head[1]!;
	}

	/**
	 * The list in the saved format (plan.md 6.6): a header (magic, version,
	 * count, next id), the packed edits, then their ids. Previews are left
	 * out: they are never saved.
	 */
	public Serialize(): ArrayBuffer {
		const edits = this.Edits.filter(
			( edit ) => ( edit.Flags & SdfEditFlags.Preview ) === 0,
		);
		const buffer = new ArrayBuffer(
			16 + edits.length * ( EDIT_BYTES + 4 ),
		);
		const head = new Uint32Array( buffer, 0, 4 );
		const words = new Uint32Array( buffer, 16, edits.length * EDIT_WORDS );
		const floats = new Float32Array(
			buffer,
			16,
			edits.length * EDIT_WORDS,
		);
		const ids = new Uint32Array(
			buffer,
			16 + edits.length * EDIT_BYTES,
			edits.length,
		);

		head[0] = EDIT_LIST_MAGIC;
		head[1] = EDIT_LIST_VERSION;
		head[2] = edits.length;
		head[3] = this._nextId;
		edits.forEach( ( edit, index ) => {
			PackEdit( edit, floats, words, index );
			ids[index] = edit.Id;
		} );
		return buffer;
	}

	/** A list read back from Serialize; throws on another format. */
	public static Deserialize( buffer: ArrayBuffer ): EditList {
		const head = new Uint32Array( buffer, 0, 4 );

		if ( head[0] !== EDIT_LIST_MAGIC ) {
			throw new Error( "Not an SDF edit list" );
		}
		if ( head[1] !== EDIT_LIST_VERSION ) {
			throw new Error( `Unsupported SDF edit list version ${ head[1] }` );
		}

		const count = head[2]!;
		const words = new Uint32Array( buffer, 16, count * EDIT_WORDS );
		const floats = new Float32Array( buffer, 16, count * EDIT_WORDS );
		const ids = new Uint32Array( buffer, 16 + count * EDIT_BYTES, count );
		const list = new EditList();

		for ( let index = 0; index < count; index++ ) {
			list.Adopt( UnpackEdit( ids[index]!, floats, words, index ) );
		}
		list._nextId = FMath.Max( list._nextId, head[3]! );
		list._delta = [];
		list._version = 0;
		return list;
	}

	/** Takes in an edit that already has its id and order. */
	private Adopt( edit: SdfEdit ): void {
		this._nextId = FMath.Max( this._nextId, edit.Id + 1 );
		this._nextOrder = FMath.Max( this._nextOrder, edit.Order + 1 );
		this.Insert( edit );
		this.Touched( edit );
	}

	private Insert( edit: SdfEdit ): void {
		this._edits.set( edit.Id, edit );
		this.SetGlobal( edit );
		this._orderDirty = true;
		this._bvhDirty = true;
	}

	private SetGlobal( edit: SdfEdit ): void {
		if ( IsGlobal( edit.Op ) ) {
			this._global.add( edit.Id );
		} else {
			this._global.delete( edit.Id );
		}
	}

	private Touched( edit: SdfEdit ): void {
		this.MarkDirty( edit );
		this._delta.push( [ DeltaKind.Upsert, edit ] );
		this._version++;
	}

	private MarkDirty( edit: SdfEdit ): void {
		const box = this.Reach( edit );

		for ( const boxes of this._watchers ) {
			boxes.push( box );
		}
	}

	private EnsureBvh(): void {
		if ( !this._bvhDirty ) {
			return;
		}
		this._bvh.Build(
			[ ...this._edits.values() ]
				.filter( ( edit ) => !IsGlobal( edit.Op ) )
				.map(
					( edit ) => ( { Id: edit.Id, Box: this.Reach( edit ) } ),
				),
		);
		this._bvhDirty = false;
	}
}

function ByOrder( a: SdfEdit, b: SdfEdit ): number {
	return a.Order - b.Order || a.Id - b.Id;
}

/**
 * Copies the vectors, so a caller's array never aliases an edit's, and
 * rounds every number to float32 - what the packed form, the GPU and other
 * workers see - so all of them compute the very same world.
 */
function OwnArrays( edit: SdfEdit ): void {
	const F = Math.fround;

	edit.Position = [
		F( edit.Position[0] ),
		F( edit.Position[1] ),
		F( edit.Position[2] ),
	];
	edit.Rotation = [
		F( edit.Rotation[0] ),
		F( edit.Rotation[1] ),
		F( edit.Rotation[2] ),
		F( edit.Rotation[3] ),
	];
	edit.Params = [
		F( edit.Params[0] ),
		F( edit.Params[1] ),
		F( edit.Params[2] ),
		F( edit.Params[3] ),
	];
	edit.Scale = F( edit.Scale );
	edit.SmoothK = F( edit.SmoothK );
}

function IsLive( edit: SdfEdit ): boolean {
	return ( edit.Flags & SdfEditFlags.Muted ) === 0;
}
