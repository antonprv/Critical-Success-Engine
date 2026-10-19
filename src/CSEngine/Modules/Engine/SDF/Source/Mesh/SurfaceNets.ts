// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import { UnpackMaterial } from "../Field/FieldState";

/**
 * Cells along a chunk's edge at most: a chunk's vertices (one per cell of
 * its N + 2 cells per axis) then always fit 16-bit indices (plan.md 24.2).
 */
export const MAX_CHUNK_CELLS = 38;

export interface ChunkOptions {
	/** World position of the chunk's lowest node. */
	Origin: Readonly<[ number, number, number ]>;
	/** World size of a cell. */
	CellSize: number;
	/** Cells along each axis (1..MAX_CHUNK_CELLS). */
	Cells: number;
	/**
	 * Bakes ambient occlusion into the vertices (plan.md 23.3): a few
	 * samples of the field along the normal. Default true.
	 */
	Ao?: boolean;
	/**
	 * The occlusion's step along the normal (world units; default a cell):
	 * the same at every level of detail, so the shading doesn't change where
	 * the levels meet.
	 */
	AoStep?: number;
	/**
	 * The material at a surface point as a packed pair (PackMaterial);
	 * without it every vertex gets 0.
	 */
	Material?: ( x: number, y: number, z: number ) => number;
	/**
	 * How deep skirts hang from the mesh's open borders, into the solid
	 * (world units; 0, the default: none). They hide the cracks where a
	 * chunk meets one of another level of detail.
	 */
	Skirt?: number;
	/**
	 * Skips the empty space inside the chunk (plan.md 21.8 item 1): the
	 * nodes go in blocks of 4^3, and a block whose center is farther from
	 * the surface than the block reaches (and a cell beyond, and a margin
	 * for fields whose distances are bounds) takes the center's distance
	 * for all its nodes - no edge touching it can cross the surface, so the
	 * mesh is the same - one sample instead of 64. Default true.
	 */
	SkipEmpty?: boolean;
	/**
	 * The field to sample a block's nodes with, given the box they span
	 * (RegionCells grown, world units): a shorter one where fewer edits reach
	 * (plan.md 21.8 item 2). The normals of the vertices in the block's
	 * cells take it too. By default the chunk's own `distance`.
	 */
	Region?: (
		min: Readonly<[ number, number, number ]>,
		max: Readonly<[ number, number, number ]>,
	) => ( x: number, y: number, z: number ) => number;
}

/** Nodes along a block's edge (ChunkOptions.SkipEmpty). */
const BlockNodes = 4;

/**
 * How much farther than it reaches a block's center must be from the
 * surface to be skipped: a margin for distances that are only bounds.
 */
const BlockMargin = 1.25;

/**
 * Cells a block's box grows by for its own field (ChunkOptions.Region):
 * its vertices lie a cell past its nodes and their normals sample a
 * quarter cell around; a smooth subtraction reaches deeper than its bounds
 * inside the solid (by the distance there): one more for that.
 */
const RegionCells = 3;

/** One chunk's triangles, ready for a vertex buffer. */
export interface SdfMeshData {
	/** x, y, z per vertex. */
	Positions: Float32Array;
	/** Unit normal per vertex (the field's gradient). */
	Normals: Float32Array;
	/** Baked occlusion per vertex: 1 open, 0 fully covered. */
	Ao: Float32Array;
	/** Per vertex: its material, a second one and the second's share (/255). */
	MaterialIds: Uint16Array;
	MaterialIdsB: Uint16Array;
	MaterialMix: Uint8Array;
	/** Counter-clockwise seen from outside (the normal's side). */
	Indices: Uint16Array;
	/**
	 * Where the skirts' triangles start in Indices (none: no skirts): the
	 * physics takes only what comes before.
	 */
	SkirtFrom?: number;
}

/**
 * Extracts a chunk's surface with Surface Nets (plan.md 9.2, 22.3): one
 * vertex per cell the surface crosses, at the mean of the crossings on the
 * cell's edges, and a quad for every crossed grid edge, joining the four
 * cells around it.
 *
 * Seams: the chunk samples one node beyond itself on each side and owns the
 * edges whose lower node lies inside it, so neighbouring chunks create the
 * same vertices on their shared border from the same samples and every quad
 * is made by exactly one chunk: no cracks, no doubles. Between chunks of
 * different cell sizes the borders don't meet: with skirts
 * (ChunkOptions.Skirt) the chunks overlap by a cell and the skirts cover the
 * steps.
 */
export function ExtractChunk(
	distance: ( x: number, y: number, z: number ) => number,
	options: ChunkOptions,
): SdfMeshData {
	const n = options.Cells;

	if ( !Number.isInteger( n ) || n < 1 || n > MAX_CHUNK_CELLS ) {
		throw new RangeError(
			`A chunk has 1..${ MAX_CHUNK_CELLS } cells per axis, not ${ n }`,
		);
	}

	const grid = new ChunkGrid( distance, options );
	const builder = new MeshBuilder( grid, distance, options );
	// with skirts the edges on the far faces too: the mesh reaches half a
	// cell past the chunk on every side, so a neighbour of another level
	// overlaps it instead of leaving a gap (the skirts close the steps)
	const last = ( options.Skirt ?? 0 ) > 0 ? n : n - 1;

	for ( let k = 0; k <= last; k++ ) {
		for ( let j = 0; j <= last; j++ ) {
			for ( let i = 0; i <= last; i++ ) {
				const a = grid.At( i, j, k );

				builder.Edge( a, grid.At( i + 1, j, k ), 0, i, j, k );
				builder.Edge( a, grid.At( i, j + 1, k ), 1, i, j, k );
				builder.Edge( a, grid.At( i, j, k + 1 ), 2, i, j, k );
			}
		}
	}
	builder.Skirts( options.Skirt ?? 0 );
	return builder.Finish();
}

/** The chunk's samples: nodes -1..N+1 on each axis. */
class ChunkGrid {
	public readonly Samples: Float64Array;

	/** Samples per axis: N + 3. */
	public readonly Side: number;

	public readonly Origin: Readonly<[ number, number, number ]>;

	public readonly CellSize: number;

	/** Each block's field (Region), where it has one of its own. */
	private readonly _fields: Array<
		( ( x: number, y: number, z: number ) => number ) | undefined
	> = [];

	/** Blocks along an axis. */
	private readonly _blocks: number;

	public constructor(
		distance: ( x: number, y: number, z: number ) => number,
		options: ChunkOptions,
	) {
		const side = options.Cells + 3;
		const h = options.CellSize;

		this.Side = side;
		this.Origin = options.Origin;
		this.CellSize = h;
		this.Samples = new Float64Array( side * side * side );
		this._blocks = Math.ceil( side / BlockNodes );
		if ( options.SkipEmpty === false ) {
			this.Fill( distance, 0, 0, 0, side, side, side );
			return;
		}

		const [ ox, oy, oz ] = options.Origin;

		for ( let z = 0; z < side; z += BlockNodes ) {
			for ( let y = 0; y < side; y += BlockNodes ) {
				for ( let x = 0; x < side; x += BlockNodes ) {
					const x1 = Math.min( x + BlockNodes, side );
					const y1 = Math.min( y + BlockNodes, side );
					const z1 = Math.min( z + BlockNodes, side );
					// the block's center and how far its nodes lie from it
					// (node n of the samples sits at n - 1 cells)
					const cx = ( x + x1 - 1 ) / 2 - 1;
					const cy = ( y + y1 - 1 ) / 2 - 1;
					const cz = ( z + z1 - 1 ) / 2 - 1;
					const reach = FMath.Length3(
						x1 - 1 - x,
						y1 - 1 - y,
						z1 - 1 - z,
					) / 2;
					const d = distance(
						ox + cx * h,
						oy + cy * h,
						oz + cz * h,
					);

					if ( FMath.Abs( d ) > ( reach + 1 ) * h * BlockMargin ) {
						this.Set( d, x, y, z, x1, y1, z1 );
					} else {
						// sample x is node x - 1, the last x1 - 2; grown by
						// RegionCells
						const field = options.Region?.(
							[
								ox + ( x - 1 - RegionCells ) * h,
								oy + ( y - 1 - RegionCells ) * h,
								oz + ( z - 1 - RegionCells ) * h,
							],
							[
								ox + ( x1 - 2 + RegionCells ) * h,
								oy + ( y1 - 2 + RegionCells ) * h,
								oz + ( z1 - 2 + RegionCells ) * h,
							],
						);

						this._fields[this.BlockOf( x, y, z )] = field;
						this.Fill( field ?? distance, x, y, z, x1, y1, z1 );
					}
				}
			}
		}
	}

	/** Samples the nodes x0..x1-1 (sample indices) of each axis. */
	private Fill(
		distance: ( x: number, y: number, z: number ) => number,
		x0: number,
		y0: number,
		z0: number,
		x1: number,
		y1: number,
		z1: number,
	): void {
		const [ ox, oy, oz ] = this.Origin;
		const h = this.CellSize;
		const s = this.Side;

		for ( let z = z0; z < z1; z++ ) {
			for ( let y = y0; y < y1; y++ ) {
				let i = x0 + ( y + z * s ) * s;

				for ( let x = x0; x < x1; x++ ) {
					this.Samples[i++] = distance(
						ox + ( x - 1 ) * h,
						oy + ( y - 1 ) * h,
						oz + ( z - 1 ) * h,
					);
				}
			}
		}
	}

	/** One value for the nodes x0..x1-1 of each axis. */
	private Set(
		d: number,
		x0: number,
		y0: number,
		z0: number,
		x1: number,
		y1: number,
		z1: number,
	): void {
		const s = this.Side;

		for ( let z = z0; z < z1; z++ ) {
			for ( let y = y0; y < y1; y++ ) {
				const i = x0 + ( y + z * s ) * s;

				this.Samples.fill( d, i, i + x1 - x0 );
			}
		}
	}

	/**
	 * The field near cell (x, y, z) (each -1..N): its lowest node's block's
	 * own, or none (the chunk's).
	 */
	public FieldOf( x: number, y: number, z: number ): (
		( x: number, y: number, z: number ) => number
	) | undefined {
		return this._fields[this.BlockOf( x + 1, y + 1, z + 1 )];
	}

	/** The block of a node (sample indices). */
	private BlockOf( x: number, y: number, z: number ): number {
		const b = this._blocks;

		return ( ( x / BlockNodes ) | 0 )
			+ ( ( ( y / BlockNodes ) | 0 )
				+ ( ( z / BlockNodes ) | 0 ) * b ) * b;
	}

	/** The sample at node (x, y, z), each -1..N+1. */
	public At( x: number, y: number, z: number ): number {
		const s = this.Side;

		return this.Samples[( x + 1 ) + ( y + 1 ) * s + ( z + 1 ) * s * s]!;
	}
}

/** The 12 edges of a cell as pairs of corner offsets. */
const CellEdges: ReadonlyArray<readonly [ number, number ]> = [
	[ 0, 1 ], [ 2, 3 ], [ 4, 5 ], [ 6, 7 ],
	[ 0, 2 ], [ 1, 3 ], [ 4, 6 ], [ 5, 7 ],
	[ 0, 4 ], [ 1, 5 ], [ 2, 6 ], [ 3, 7 ],
];

/**
 * The four cells around an edge from node (i, j, k), as offsets, per axis
 * of the edge; listed counter-clockwise seen from +axis.
 */
const QuadCells: ReadonlyArray<
	ReadonlyArray<readonly [ number, number, number ]>
> = [
	[ [ 0, -1, -1 ], [ 0, 0, -1 ], [ 0, 0, 0 ], [ 0, -1, 0 ] ],
	[ [ -1, 0, -1 ], [ -1, 0, 0 ], [ 0, 0, 0 ], [ 0, 0, -1 ] ],
	[ [ -1, -1, 0 ], [ 0, -1, 0 ], [ 0, 0, 0 ], [ -1, 0, 0 ] ],
];

/** Weights of the occlusion samples, nearest first. */
const AoWeights = [ 1, 0.5, 0.25, 0.125, 0.0625 ];

const AoTotal = AoWeights.reduce( ( a, b ) => a + b, 0 );

class MeshBuilder {
	private readonly _positions: number[] = [];

	private readonly _normals: number[] = [];

	private readonly _ao: number[] = [];

	private readonly _materials: number[] = [];

	private readonly _indices: number[] = [];

	private _skirtFrom = -1;

	/** Cell -> its vertex (-1: none yet), cells -1..N on each axis. */
	private readonly _vertexOf: Int32Array;

	private readonly _cellSide: number;

	private readonly _corners = new Float64Array( 8 );

	public constructor(
		private readonly _grid: ChunkGrid,
		private readonly _distance: (
			x: number,
			y: number,
			z: number,
		) => number,
		private readonly _options: ChunkOptions,
	) {
		this._cellSide = _options.Cells + 2;
		this._vertexOf = new Int32Array( this._cellSide ** 3 ).fill( -1 );
	}

	/**
	 * The grid edge from node (i, j, k) along `axis`, with samples `a` and
	 * `b` at its ends: if the surface crosses it, a quad over the four cells
	 * around it, facing from inside to outside.
	 */
	public Edge(
		a: number,
		b: number,
		axis: number,
		i: number,
		j: number,
		k: number,
	): void {
		if ( ( a < 0 ) === ( b < 0 ) ) {
			return;
		}

		const offsets = QuadCells[axis]!;
		const v: number[] = [];

		for ( let c = 0; c < 4; c++ ) {
			const o = offsets[c]!;

			v.push( this.Vertex( i + o[0], j + o[1], k + o[2] ) );
		}

		// listed for a normal along +axis: inside at a, outside at b
		const [ v0, v1, v2, v3 ] = a < 0 ? v : [ v[0], v[3], v[2], v[1] ];

		this._indices.push( v0!, v1!, v2!, v0!, v2!, v3! );
	}

	/** A cell's vertex, made the first time a quad needs it. */
	private Vertex( cx: number, cy: number, cz: number ): number {
		const s = this._cellSide;
		const key = ( cx + 1 ) + ( cy + 1 ) * s + ( cz + 1 ) * s * s;
		const known = this._vertexOf[key]!;

		if ( known >= 0 ) {
			return known;
		}

		const grid = this._grid;
		const corners = this._corners;

		for ( let c = 0; c < 8; c++ ) {
			corners[c] = grid.At(
				cx + ( c & 1 ),
				cy + ( ( c >> 1 ) & 1 ),
				cz + ( c >> 2 ),
			);
		}

		// mean of the crossings, in cell units
		let sx = 0;
		let sy = 0;
		let sz = 0;
		let count = 0;

		for ( const [ p, q ] of CellEdges ) {
			const dp = corners[p]!;
			const dq = corners[q]!;

			if ( ( dp < 0 ) === ( dq < 0 ) ) {
				continue;
			}

			const t = dp / ( dp - dq );

			sx += FMath.LerpUnclamped( p & 1, q & 1, t );
			sy += FMath.LerpUnclamped( ( p >> 1 ) & 1, ( q >> 1 ) & 1, t );
			sz += FMath.LerpUnclamped( p >> 2, q >> 2, t );
			count++;
		}

		const h = grid.CellSize;
		const x = grid.Origin[0] + ( cx + sx / count ) * h;
		const y = grid.Origin[1] + ( cy + sy / count ) * h;
		const z = grid.Origin[2] + ( cz + sz / count ) * h;
		const index = this._positions.length / 3;
		const [ nx, ny, nz ] = this.Gradient(
			grid.FieldOf( cx, cy, cz ) ?? this._distance,
			x,
			y,
			z,
			h * 0.25,
		);

		this._positions.push( x, y, z );
		this._normals.push( nx, ny, nz );
		this._ao.push(
			this._options.Ao === false
				? 1
				: this.Occlusion( x, y, z, nx, ny, nz ),
		);
		this._materials.push( this._options.Material?.( x, y, z ) ?? 0 );
		this._vertexOf[key] = index;
		return index;
	}

	/** Unit gradient by four samples on a tetrahedron; +Y where flat. */
	private Gradient(
		f: ( x: number, y: number, z: number ) => number,
		x: number,
		y: number,
		z: number,
		e: number,
	): [ number, number, number ] {
		const a = f( x + e, y - e, z - e );
		const b = f( x - e, y - e, z + e );
		const c = f( x - e, y + e, z - e );
		const d = f( x + e, y + e, z + e );
		const gx = a - b - c + d;
		const gy = -a - b + c + d;
		const gz = -a + b - c + d;
		const length = FMath.Length3( gx, gy, gz );

		return length > 0
			? [ gx / length, gy / length, gz / length ]
			: [ 0, 1, 0 ];
	}

	/**
	 * How open a vertex is: the field sampled at growing steps along the
	 * normal; where it is nearer than the step, something covers the vertex.
	 */
	private Occlusion(
		x: number,
		y: number,
		z: number,
		nx: number,
		ny: number,
		nz: number,
	): number {
		const step = this._options.AoStep ?? this._grid.CellSize;
		// the vertex sits near, not on, the surface: measure from where it is
		const start = this._distance( x, y, z );
		let occlusion = 0;

		AoWeights.forEach( ( weight, i ) => {
			const t = step * ( i + 1 );
			const d = this._distance(
				x + nx * t,
				y + ny * t,
				z + nz * t,
			) - start;

			occlusion += weight * FMath.Clamp01( ( t - d ) / t );
		} );
		return 1 - occlusion / AoTotal;
	}

	/**
	 * A skirt along every open border edge (an edge of one triangle only): a
	 * quad down from it along the vertices' normals, into the solid, facing
	 * the way the surface would go on. Its vertices are copies, shaded as
	 * the border's. None if they would overflow 16-bit indices.
	 */
	public Skirts( depth: number ): void {
		if ( depth <= 0 ) {
			return;
		}

		const indices = this._indices;
		// an edge seen once, as its triangle runs it; a shared edge runs
		// both ways and cancels
		const open = new Map<number, [ number, number ]>();
		const stride = this._positions.length / 3;

		for ( let t = 0; t < indices.length; t += 3 ) {
			for ( let e = 0; e < 3; e++ ) {
				const a = indices[t + e]!;
				const b = indices[t + ( e + 1 ) % 3]!;
				const back = b * stride + a;

				if ( open.has( back ) ) {
					open.delete( back );
				} else {
					open.set( a * stride + b, [ a, b ] );
				}
			}
		}

		const dropped = new Map<number, number>();
		const borders = new Set( [ ...open.values() ].flat() );

		if ( stride + borders.size > 65535 ) {
			return;
		}
		this._skirtFrom = indices.length;

		const Drop = ( v: number ): number => {
			const known = dropped.get( v );

			if ( known !== undefined ) {
				return known;
			}

			const n = [ 0, 1, 2 ].map( ( c ) => this._normals[v * 3 + c]! );
			const index = this._positions.length / 3;

			for ( let c = 0; c < 3; c++ ) {
				this._positions.push(
					this._positions[v * 3 + c]! - n[c]! * depth,
				);
				this._normals.push( n[c]! );
			}
			this._ao.push( this._ao[v]! );
			this._materials.push( this._materials[v]! );
			dropped.set( v, index );
			return index;
		};

		for ( const [ a, b ] of open.values() ) {
			const da = Drop( a );
			const db = Drop( b );

			// the triangle runs a -> b; the skirt across the edge runs b -> a
			indices.push( b, a, da, b, da, db );
		}
	}

	public Finish(): SdfMeshData {
		return {
			Positions: Float32Array.from( this._positions ),
			Normals: Float32Array.from( this._normals ),
			Ao: Float32Array.from( this._ao ),
			MaterialIds: Uint16Array.from(
				this._materials,
				( packed ) => UnpackMaterial( packed )[0],
			),
			MaterialIdsB: Uint16Array.from(
				this._materials,
				( packed ) => UnpackMaterial( packed )[1],
			),
			MaterialMix: Uint8Array.from(
				this._materials,
				( packed ) => Math.round( UnpackMaterial( packed )[2] * 255 ),
			),
			Indices: Uint16Array.from( this._indices ),
			...this._skirtFrom >= 0 ? { SkirtFrom: this._skirtFrom } : {},
		};
	}
}
