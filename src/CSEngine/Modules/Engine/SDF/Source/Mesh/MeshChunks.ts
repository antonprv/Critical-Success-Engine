// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import type { EditWatcher } from "../Edits/EditList";
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
}

/** A meshed chunk. */
export interface SdfChunk {
	readonly Key: string;
	/** Chunk coordinates (world origin = coordinates * chunk size). */
	readonly Coord: Readonly<[ number, number, number ]>;
	readonly Mesh: SdfMeshData;
	/** The edit list's version the mesh was made at (plan.md 9.6). */
	readonly Version: number;
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
 * The mesh tier (plan.md 22.3, 23): the SDF world as ordinary triangles
 * around a center (the player), for devices that can't ray march, and the
 * same chunks the physics collides with (plan.md 9.2). Edits mark the chunks
 * they reach; each Update remeshes a budget of them, nearest first, so a
 * moving hole costs a few chunks a frame and lags a frame or two.
 */
export class SdfMeshChunks {
	public readonly CellSize: number;

	public readonly ChunkCells: number;

	public readonly Radius: number;

	public Budget: number;

	private readonly _ao: boolean;

	/** Chunks in the area: key -> coordinates. */
	private readonly _area = new Map<string, [ number, number, number ]>();

	/** Chunks waiting for a (re)mesh. */
	private readonly _queue = new Set<string>();

	private _removed: string[] = [];

	private readonly _center: [ number, number, number ] = [ 0, 0, 0 ];

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
		this.Budget = options.Budget ?? 4;
		this._ao = options.Ao ?? true;
		this._changes = Field.Edits.Watch();
		this.CenterOn( 0, 0, 0 );
	}

	/** World size of a chunk. */
	public get ChunkSize(): number {
		return this.CellSize * this.ChunkCells;
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
	 * leave are reported by the next Update.
	 */
	public CenterOn( x: number, y: number, z: number ): void {
		const size = this.ChunkSize;
		const cx = FMath.Floor( x / size );
		const cy = FMath.Floor( y / size );
		const cz = FMath.Floor( z / size );
		const r = this.Radius;
		const next = new Map<string, [ number, number, number ]>();

		this._center[0] = x;
		this._center[1] = y;
		this._center[2] = z;
		for ( let k = cz - r; k <= cz + r; k++ ) {
			for ( let j = cy - r; j <= cy + r; j++ ) {
				for ( let i = cx - r; i <= cx + r; i++ ) {
					next.set( ChunkKey( i, j, k ), [ i, j, k ] );
				}
			}
		}
		for ( const key of this._area.keys() ) {
			if ( !next.has( key ) ) {
				this._area.delete( key );
				this._queue.delete( key );
				this._removed.push( key );
			}
		}
		for ( const [ key, coord ] of next ) {
			if ( !this._area.has( key ) ) {
				this._area.set( key, coord );
				this._queue.add( key );
			}
		}
	}

	/** Takes the edits' changes and remeshes up to Budget chunks. */
	public Update(): MeshChunksUpdate {
		const reach = this.CellSize * ( AoReachCells + 2 );

		for ( const box of this._changes.Take() ) {
			const grown = Expanded( box, reach );

			for ( const [ key, coord ] of this._area ) {
				if ( Overlaps( grown, this.ChunkBox( coord ) ) ) {
					this._queue.add( key );
				}
			}
		}

		const order = [ ...this._queue ]
			.map( ( key ) => [ key, this._area.get( key )! ] as const )
			.sort(
				( a, b ) => this.CenterDistance( a[1] ) - this.CenterDistance(
					b[1],
				),
			);
		const built: SdfChunk[] = [];

		for ( const [ key, coord ] of order.slice( 0, this.Budget ) ) {
			this._queue.delete( key );
			built.push( this.Mesh( key, coord ) );
		}

		const removed = this._removed;

		this._removed = [];
		return { Built: built, Removed: removed, Remaining: this._queue.size };
	}

	/** Meshes one chunk now (also outside the area: e.g. for the physics). */
	public Mesh(
		key: string,
		coord: Readonly<[ number, number, number ]>,
	): SdfChunk {
		const field = this.Field;
		const program = field.Compile( field.Edits.Candidates(
			Expanded(
				this.ChunkBox( coord ),
				this.CellSize * ( AoReachCells + 2 ),
			),
		) );
		const size = this.ChunkSize;
		const center = program.Distance(
			( coord[0] + 0.5 ) * size,
			( coord[1] + 0.5 ) * size,
			( coord[2] + 0.5 ) * size,
		);
		// the samples reach one cell past the chunk: farther from the surface
		// than that, nothing in it can cross (most chunks of an area)
		const reach = ( size / 2 + this.CellSize ) * FMath.SQRT3;

		return {
			Key: key,
			Coord: coord,
			Version: field.Edits.Version,
			Mesh: FMath.Abs( center ) > reach ? EmptyMesh() : ExtractChunk(
				( x, y, z ) => program.Distance( x, y, z ),
				{
					Origin: [
						coord[0] * size,
						coord[1] * size,
						coord[2] * size,
					],
					CellSize: this.CellSize,
					Cells: this.ChunkCells,
					Ao: this._ao,
					Material: ( x, y, z ) => {
						program.Distance( x, y, z );
						return program.LastMaterial;
					},
				},
			),
		};
	}

	/** Stops following the edit list. */
	public Dispose(): void {
		this._changes.Stop();
	}

	private ChunkBox( coord: Readonly<[ number, number, number ]> ): Aabb {
		const size = this.ChunkSize;

		return CreateAabb(
			coord[0] * size,
			coord[1] * size,
			coord[2] * size,
			( coord[0] + 1 ) * size,
			( coord[1] + 1 ) * size,
			( coord[2] + 1 ) * size,
		);
	}

	private CenterDistance(
		coord: Readonly<[ number, number, number ]>,
	): number {
		const size = this.ChunkSize;

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
		Indices: new Uint16Array( 0 ),
	};
}

/** A chunk's key from its coordinates. */
export function ChunkKey( x: number, y: number, z: number ): string {
	return `${ x },${ y },${ z }`;
}
