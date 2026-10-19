// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import { PackMaterial } from "../Field/FieldState";
import type { EditWatcher } from "../Edits/EditList";
import type { SdfEdit } from "../Edits/SdfEdit";
import type { SdfField } from "../Field/SdfField";
import { CreateAabb, Expanded, Overlaps, type Aabb } from "../Spatial/Aabb";
import { ExtractChunk, MAX_CHUNK_CELLS, type SdfMeshData } from "./SurfaceNets";

export interface MeshChunksOptions {
	/** World size of a cell (plan.md 23.4: 0.3-0.5 m on phones). */
	CellSize: number;
	/** Cells along a chunk's edge. Default 16. */
	ChunkCells?: number;
	/** Chunks kept around the center along each axis. Default 2. */
	Radius?: number;
	/** Chunks meshed per Update at most (plan.md 22.3). Default 4. */
	Budget?: number;
	/** Bake ambient occlusion into the vertices. Default true. */
	Ao?: boolean;
	/**
	 * Levels of detail (plan.md 22.3): a chunk of level L has cells 2^L as
	 * big, as many of them. The last level's chunks fill Radius around the
	 * center; nearer, each splits into the next finer level's eight, down to
	 * level 0 within about Radius chunks of the center (an octree). Default
	 * 1: one level.
	 */
	Levels?: number;
	/**
	 * Skirts along the chunks' open borders, hanging into the solid: they
	 * hide the cracks where levels meet. Default: with more than one level.
	 */
	Skirts?: boolean;
}

/** A meshed chunk. */
export interface SdfChunk {
	readonly Key: string;
	/** Chunk coordinates (world origin = coordinates * its level's size). */
	readonly Coord: Readonly<[ number, number, number ]>;
	/** Its level of detail (none: 0). */
	readonly Level?: number;
	readonly Mesh: SdfMeshData;
	/** The edit list's version the mesh was made at (plan.md 9.6). */
	readonly Version: number;
}

/** A chunk to mesh. */
export interface ChunkJob {
	readonly Key: string;
	readonly Coord: Readonly<[ number, number, number ]>;
	/** Its level of detail. */
	readonly Level: number;
}

/** A chunk of the area: where, at which level. */
interface AreaChunk {
	readonly Coord: [ number, number, number ];
	readonly Level: number;
}

/** What one Update produced. */
export interface MeshChunksUpdate {
	/** New or rebuilt chunks: replace what was drawn for their keys. */
	Built: SdfChunk[];
	/** Chunks that left the area: drop them. */
	Removed: string[];
	/** Chunks still waiting. */
	Remaining: number;
}

/** How far baked occlusion reads the field, in cells (Surface Nets). */
const AoReachCells = 5;

/**
 * Where a mesh layer gets its chunks: meshed here (SdfMeshChunks) or in
 * workers (SdfMeshWorkers).
 */
export interface SdfChunkSource {
	/** Moves the area's center (the player). */
	CenterOn( x: number, y: number, z: number ): void;
	/** New and rebuilt chunks, and the ones that left. */
	Update(): MeshChunksUpdate;
	/** Chunks waiting or being meshed. */
	readonly Pending: number;
	Dispose(): void;
}

/**
 * The mesh tier (plan.md 22.3, 23): the SDF world as ordinary triangles
 * around a center (the player), for devices that can't ray march, and the
 * same chunks the physics collides with (plan.md 9.2). Edits mark the chunks
 * they reach; each Update remeshes a budget of them, nearest first, so a
 * moving hole costs a few chunks a frame and lags a frame or two.
 *
 * With levels of detail the chunks grow with the distance (MeshChunksOptions
 * .Levels). As the center moves, chunks split and merge: one that leaves is
 * reported gone only once what replaces it is built, so nothing blinks out.
 */
export class SdfMeshChunks implements SdfChunkSource {
	public readonly CellSize: number;

	public readonly ChunkCells: number;

	public readonly Radius: number;

	public readonly Levels: number;

	public Budget: number;

	private readonly _ao: boolean;

	private readonly _skirts: boolean;

	/** Chunks in the area. */
	private readonly _area = new Map<string, AreaChunk>();

	/** Chunks of the area not built yet: what replaces the leaving ones. */
	private readonly _unbuilt = new Set<string>();

	/** Chunks that left the area, still shown until their place is built. */
	private readonly _leaving = new Map<string, AreaChunk>();

	/** Something was built or left since the leaving ones were looked at. */
	private _leavingDirty = false;

	/** Chunks waiting for a (re)mesh. */
	private readonly _queue = new Set<string>();

	/** Chunks handed out at least once: a rebuild waits behind new ones. */
	private readonly _given = new Set<string>();

	private readonly _center: [ number, number, number ] = [ 0, 0, 0 ];

	/** Where the area was laid out from last (NaN: never). */
	private readonly _laidAt: [ number, number, number ] = [ NaN, NaN, NaN ];

	private readonly _changes: EditWatcher;

	public constructor(
		public readonly Field: SdfField,
		options: MeshChunksOptions,
	) {
		this.CellSize = options.CellSize;
		this.ChunkCells = FMath.Clamp(
			options.ChunkCells ?? 16,
			1,
			MAX_CHUNK_CELLS,
		);
		this.Radius = options.Radius ?? 2;
		this.Levels = FMath.Max( 1, FMath.Floor( options.Levels ?? 1 ) );
		this.Budget = options.Budget ?? 4;
		this._ao = options.Ao ?? true;
		this._skirts = options.Skirts ?? this.Levels > 1;
		this._changes = Field.Edits.Watch();
		this.CenterOn( 0, 0, 0 );
	}

	/** World size of a chunk (of level 0). */
	public get ChunkSize(): number {
		return this.CellSize * this.ChunkCells;
	}

	/** World size of a chunk of a level. */
	public SizeAt( level: number ): number {
		return this.ChunkSize * 2 ** level;
	}

	/** Chunks waiting for a (re)mesh (edits taken by the next Update aside). */
	public get Pending(): number {
		return this._queue.size;
	}

	/** Keys of the chunks in the area. */
	public get Keys(): string[] {
		return [ ...this._area.keys() ];
	}

	/**
	 * Moves the area's center: chunks that come in are queued, the ones that
	 * leave are reported by an Update once their place is built.
	 */
	public CenterOn( x: number, y: number, z: number ): void {
		this._center[0] = x;
		this._center[1] = y;
		this._center[2] = z;
		// called every frame: laid out again only once the center went an
		// eighth of a chunk from where it was laid out from
		const step = this.ChunkSize / 8;

		if ( FMath.Abs( x - this._laidAt[0] ) < step
			&& FMath.Abs( y - this._laidAt[1] ) < step
			&& FMath.Abs( z - this._laidAt[2] ) < step ) {
			return;
		}
		this._laidAt[0] = x;
		this._laidAt[1] = y;
		this._laidAt[2] = z;

		const top = this.Levels - 1;
		const size = this.SizeAt( top );
		const cx = FMath.Floor( x / size );
		const cy = FMath.Floor( y / size );
		const cz = FMath.Floor( z / size );
		const r = this.Radius;
		const next = new Map<string, AreaChunk>();

		for ( let k = cz - r; k <= cz + r; k++ ) {
			for ( let j = cy - r; j <= cy + r; j++ ) {
				for ( let i = cx - r; i <= cx + r; i++ ) {
					this.Refine( top, [ i, j, k ], next );
				}
			}
		}
		for ( const [ key, chunk ] of this._area ) {
			if ( !next.has( key ) ) {
				this._area.delete( key );
				this._queue.delete( key );
				this._given.delete( key );
				this._unbuilt.delete( key );
				this._leaving.set( key, chunk );
				this._leavingDirty = true;
			}
		}
		for ( const [ key, chunk ] of next ) {
			if ( this._area.has( key ) ) {
				continue;
			}
			this._area.set( key, chunk );
			this._queue.add( key );
			// back before it was gone: still shown, so it waits for nothing
			if ( !this._leaving.delete( key ) ) {
				this._unbuilt.add( key );
			}
		}
	}

	/** Says a chunk's mesh is in (it no longer holds the leaving ones). */
	public Built( key: string ): void {
		if ( this._unbuilt.delete( key ) ) {
			this._leavingDirty = true;
		}
	}

	/** Takes the edits' changes and remeshes up to Budget chunks. */
	public Update(): MeshChunksUpdate {
		this.Collect();

		const built = this.Next( this.Budget ).map(
			( job ) => this.Mesh( job.Key, job.Coord, [], this._ao, job.Level ),
		);

		for ( const chunk of built ) {
			this.Built( chunk.Key );
		}

		return {
			Built: built,
			Removed: this.TakeRemoved(),
			Remaining: this._queue.size,
		};
	}

	/** Queues the chunks the edits changed since the last call reach. */
	public Collect(): void {
		for ( const box of this._changes.Take() ) {
			for ( const [ key, chunk ] of this._area ) {
				const reach = this.CellSize * 2 ** chunk.Level
					* ( AoReachCells + 2 );

				if ( Overlaps(
					Expanded( box, reach ),
					this.ChunkBox( chunk.Coord, chunk.Level ),
				) ) {
					this._queue.add( key );
				}
			}
		}
	}

	/**
	 * Takes up to `count` queued chunks off the queue: what to mesh next
	 * (here or in a worker). Chunks never meshed go first, so an edit that
	 * keeps moving can't starve the rest of the area; then the nearest to
	 * the center. Chunks `busy` says no to stay queued.
	 */
	public Next(
		count: number,
		busy: ( key: string ) => boolean = () => false,
	): ChunkJob[] {
		const order = [ ...this._queue ]
			.filter( ( key ) => !busy( key ) )
			.map( ( key ) => {
				const chunk = this._area.get( key )!;

				return {
					Key: key,
					Coord: chunk.Coord,
					Level: chunk.Level,
					Rank: ( this._given.has( key ) ? 1e30 : 0 )
						+ this.CenterDistance( chunk ),
				};
			} )
			.sort( ( a, b ) => a.Rank - b.Rank )
			.slice( 0, FMath.Max( 0, count ) )
			.map( ( job ) => (
				{ Key: job.Key, Coord: job.Coord, Level: job.Level }
			) );

		for ( const job of order ) {
			this._queue.delete( job.Key );
			this._given.add( job.Key );
		}
		return order;
	}

	/**
	 * Every chunk a box reaches: the area's, at their levels, and past the
	 * area those of level 0.
	 */
	public ChunksIn( box: Aabb ): ChunkJob[] {
		const size = this.ChunkSize;
		const jobs = new Map<string, ChunkJob>();
		const lo = [ 0, 1, 2 ].map(
			( axis ) => FMath.Floor( box[axis]! / size ),
		);
		const hi = [ 0, 1, 2 ].map(
			( axis ) => FMath.Floor( box[axis + 3]! / size ),
		);

		for ( let k = lo[2]!; k <= hi[2]!; k++ ) {
			for ( let j = lo[1]!; j <= hi[1]!; j++ ) {
				for ( let i = lo[0]!; i <= hi[0]!; i++ ) {
					const job = this.Covering( i, j, k );

					jobs.set( job.Key, job );
				}
			}
		}
		return [ ...jobs.values() ];
	}

	/**
	 * The chunks that left the area and whose place is built since the last
	 * call (or that left it altogether).
	 */
	public TakeRemoved(): string[] {
		const removed: string[] = [];

		if ( this._leaving.size === 0 || !this._leavingDirty ) {
			return removed;
		}
		this._leavingDirty = false;

		// the levels nest (an octree): two chunks share space only if one
		// holds the other. What the unbuilt ones are, and what holds them:
		const unbuilt = this._unbuilt;
		const held = new Set<string>();

		for ( const key of unbuilt ) {
			this.Ancestors( this._area.get( key )!, ( up ) => held.add( up ) );
		}
		for ( const [ key, chunk ] of this._leaving ) {
			// it holds an unbuilt chunk, or one holds it
			let waits = held.has( key );

			this.Ancestors( chunk, ( up ) => {
				waits ||= unbuilt.has( up );
			} );
			if ( !waits ) {
				removed.push( key );
				this._leaving.delete( key );
			}
		}
		return removed;
	}

	/**
	 * Meshes one chunk now (also outside the area: e.g. for the physics).
	 * `extra`: edits applied after the world's (the dynamic edits the physics
	 * feels; only those reaching the chunk count); `ao` false: no occlusion
	 * (the physics needs none); `level`: its level of detail.
	 */
	public Mesh(
		key: string,
		coord: Readonly<[ number, number, number ]>,
		extra: readonly SdfEdit[] = [],
		ao = this._ao,
		level = 0,
	): SdfChunk {
		const field = this.Field;
		const cell = this.CellSize * 2 ** level;
		const box = Expanded(
			this.ChunkBox( coord, level ),
			cell * ( AoReachCells + 2 ),
		);
		const reaching = extra.filter(
			( edit ) => Overlaps( field.Edits.Reach( edit ), box ),
		);
		const edits = [ ...field.Edits.Candidates( box ), ...reaching ];
		const program = field.Compile( edits );
		const Distance = ( x: number, y: number, z: number ): number => (
			program.Distance( x, y, z )
		);
		const size = this.SizeAt( level );
		const center = program.Distance(
			( coord[0] + 0.5 ) * size,
			( coord[1] + 0.5 ) * size,
			( coord[2] + 0.5 ) * size,
		);
		// the samples reach one cell past the chunk: farther from the surface
		// than that, nothing in it can cross (most chunks of an area)
		const reach = ( size / 2 + cell ) * FMath.SQRT3;

		return {
			Key: key,
			Coord: coord,
			Level: level,
			Version: field.Edits.Version,
			Mesh: FMath.Abs( center ) > reach ? EmptyMesh() : ExtractChunk(
				Distance,
				{
					Origin: [
						coord[0] * size,
						coord[1] * size,
						coord[2] * size,
					],
					CellSize: cell,
					Cells: this.ChunkCells,
					Ao: ao,
					AoStep: this.CellSize,
					// two cells: a crack is at most a cell of the coarser
					// neighbour wide
					Skirt: this._skirts ? cell * 2 : 0,
					// a block's nodes from only the edits reaching it
					Region: ( min, max ) => {
						const block = CreateAabb( ...min, ...max );
						const some = edits.filter( ( edit ) => Overlaps(
							field.Edits.Reach( edit ),
							block,
						) );

						if ( some.length === edits.length ) {
							return Distance;
						}

						const part = field.Compile( some );

						return ( x, y, z ) => part.Distance( x, y, z );
					},
					Material: ( x, y, z ) => {
						program.Distance( x, y, z );
						return PackMaterial(
							program.LastMaterial,
							program.LastMaterialB,
							program.LastMix,
						);
					},
				},
			),
		};
	}

	/** Stops following the edit list. */
	public Dispose(): void {
		this._changes.Stop();
	}

	/**
	 * A chunk of the area, or (past `level`, the coarsest) none: its eight
	 * of the next finer level within Radius of it (to their boxes).
	 */
	private Refine(
		level: number,
		coord: [ number, number, number ],
		into: Map<string, AreaChunk>,
	): void {
		if ( level === 0 || this.BoxDistance( coord, level )
			>= this.Radius * this.SizeAt( level - 1 ) ) {
			into.set(
				ChunkKey( ...coord, level ),
				{ Coord: coord, Level: level },
			);
			return;
		}
		for ( let c = 0; c < 8; c++ ) {
			this.Refine( level - 1, [
				coord[0] * 2 + ( c & 1 ),
				coord[1] * 2 + ( ( c >> 1 ) & 1 ),
				coord[2] * 2 + ( c >> 2 ),
			], into );
		}
	}

	/** The keys of the chunks of the coarser levels that hold a chunk. */
	private Ancestors( chunk: AreaChunk, each: ( key: string ) => void ): void {
		for ( let level = chunk.Level + 1; level < this.Levels; level++ ) {
			const scale = 2 ** ( level - chunk.Level );

			each( ChunkKey(
				FMath.Floor( chunk.Coord[0] / scale ),
				FMath.Floor( chunk.Coord[1] / scale ),
				FMath.Floor( chunk.Coord[2] / scale ),
				level,
			) );
		}
	}

	/**
	 * The area's chunk holding the chunk of level 0 at these coordinates (of
	 * level 0 itself past the area).
	 */
	private Covering( i: number, j: number, k: number ): ChunkJob {
		for ( let level = 0; level < this.Levels; level++ ) {
			const scale = 2 ** level;
			const coord: [ number, number, number ] = [
				FMath.Floor( i / scale ),
				FMath.Floor( j / scale ),
				FMath.Floor( k / scale ),
			];
			const key = ChunkKey( ...coord, level );

			if ( this._area.has( key ) ) {
				return { Key: key, Coord: coord, Level: level };
			}
		}
		return { Key: ChunkKey( i, j, k ), Coord: [ i, j, k ], Level: 0 };
	}

	/** How far the center is from a chunk's box, along the farthest axis. */
	private BoxDistance(
		coord: Readonly<[ number, number, number ]>,
		level: number,
	): number {
		const size = this.SizeAt( level );
		let far = 0;

		for ( let axis = 0; axis < 3; axis++ ) {
			const lo = coord[axis]! * size;
			const at = this._center[axis]!;

			far = FMath.Max( far, FMath.Max( lo - at, at - lo - size ) );
		}
		return far;
	}

	private ChunkBox(
		coord: Readonly<[ number, number, number ]>,
		level = 0,
	): Aabb {
		const size = this.SizeAt( level );

		return CreateAabb(
			coord[0] * size,
			coord[1] * size,
			coord[2] * size,
			( coord[0] + 1 ) * size,
			( coord[1] + 1 ) * size,
			( coord[2] + 1 ) * size,
		);
	}

	private CenterDistance( chunk: AreaChunk ): number {
		const size = this.SizeAt( chunk.Level );
		const coord = chunk.Coord;

		return FMath.LengthSq3(
			( coord[0] + 0.5 ) * size - this._center[0],
			( coord[1] + 0.5 ) * size - this._center[1],
			( coord[2] + 0.5 ) * size - this._center[2],
		);
	}
}

/** A chunk without a surface. */
function EmptyMesh(): SdfMeshData {
	return {
		Positions: new Float32Array( 0 ),
		Normals: new Float32Array( 0 ),
		Ao: new Float32Array( 0 ),
		MaterialIds: new Uint16Array( 0 ),
		MaterialIdsB: new Uint16Array( 0 ),
		MaterialMix: new Uint8Array( 0 ),
		Indices: new Uint16Array( 0 ),
	};
}

/** A chunk's key from its coordinates and level (level 0: no prefix). */
export function ChunkKey(
	x: number,
	y: number,
	z: number,
	level = 0,
): string {
	return level === 0
		? `${ x },${ y },${ z }`
		: `${ level }:${ x },${ y },${ z }`;
}
