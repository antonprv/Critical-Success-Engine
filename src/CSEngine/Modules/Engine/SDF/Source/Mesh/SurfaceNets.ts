// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";

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
	/** The material at a surface point; without it every vertex gets 0. */
	Material?: ( x: number, y: number, z: number ) => number;
}

/** One chunk's triangles, ready for a vertex buffer. */
export interface SdfMeshData {
	/** x, y, z per vertex. */
	Positions: Float32Array;
	/** Unit normal per vertex (the field's gradient). */
	Normals: Float32Array;
	/** Baked occlusion per vertex: 1 open, 0 fully covered. */
	Ao: Float32Array;
	MaterialIds: Uint16Array;
	/** Counter-clockwise seen from outside (the normal's side). */
	Indices: Uint16Array;
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
 * is made by exactly one chunk: no cracks, no doubles.
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

	// edges along x: base node (i, j, k), the cells around it vary in y, z
	for ( let k = 0; k < n; k++ ) {
		for ( let j = 0; j < n; j++ ) {
			for ( let i = 0; i < n; i++ ) {
				const a = grid.At( i, j, k );

				builder.Edge( a, grid.At( i + 1, j, k ), [
					[ i, j - 1, k - 1 ],
					[ i, j, k - 1 ],
					[ i, j, k ],
					[ i, j - 1, k ],
				] );
				builder.Edge( a, grid.At( i, j + 1, k ), [
					[ i - 1, j, k - 1 ],
					[ i - 1, j, k ],
					[ i, j, k ],
					[ i, j, k - 1 ],
				] );
				builder.Edge( a, grid.At( i, j, k + 1 ), [
					[ i - 1, j - 1, k ],
					[ i, j - 1, k ],
					[ i, j, k ],
					[ i - 1, j, k ],
				] );
			}
		}
	}
	return builder.Finish();
}

/** The chunk's samples: nodes -1..N+1 on each axis. */
class ChunkGrid {
	public readonly Samples: Float64Array;

	/** Samples per axis: N + 3. */
	public readonly Side: number;

	public readonly Origin: Readonly<[ number, number, number ]>;

	public readonly CellSize: number;

	public constructor(
		distance: ( x: number, y: number, z: number ) => number,
		options: ChunkOptions,
	) {
		const side = options.Cells + 3;
		const [ ox, oy, oz ] = options.Origin;
		const h = options.CellSize;
		let i = 0;

		this.Side = side;
		this.Origin = options.Origin;
		this.CellSize = h;
		this.Samples = new Float64Array( side * side * side );
		for ( let z = -1; z < side - 1; z++ ) {
			for ( let y = -1; y < side - 1; y++ ) {
				for ( let x = -1; x < side - 1; x++ ) {
					this.Samples[i++] = distance(
						ox + x * h,
						oy + y * h,
						oz + z * h,
					);
				}
			}
		}
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

/** Weights of the occlusion samples, nearest first. */
const AoWeights = [ 1, 0.5, 0.25, 0.125, 0.0625 ];

const AoTotal = AoWeights.reduce( ( a, b ) => a + b, 0 );

class MeshBuilder {
	private readonly _positions: number[] = [];

	private readonly _normals: number[] = [];

	private readonly _ao: number[] = [];

	private readonly _materials: number[] = [];

	private readonly _indices: number[] = [];

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
	 * A grid edge from sample `a` to `b`: if the surface crosses it, a quad
	 * over the four cells around it, facing from inside to outside.
	 */
	public Edge(
		a: number,
		b: number,
		cells: ReadonlyArray<[ number, number, number ]>,
	): void {
		if ( ( a < 0 ) === ( b < 0 ) ) {
			return;
		}

		const v = cells.map( ( cell ) => this.Vertex( cell ) );
		// listed for a normal along +axis: inside at a, outside at b
		const [ v0, v1, v2, v3 ] = a < 0 ? v : [ v[0], v[3], v[2], v[1] ];

		this._indices.push( v0!, v1!, v2!, v0!, v2!, v3! );
	}

	/** A cell's vertex, made the first time a quad needs it. */
	private Vertex( cell: readonly [ number, number, number ] ): number {
		const [ cx, cy, cz ] = cell;
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
		const [ nx, ny, nz ] = this.Gradient( x, y, z, h * 0.25 );

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
		x: number,
		y: number,
		z: number,
		e: number,
	): [ number, number, number ] {
		const f = this._distance;
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
		const step = this._grid.CellSize;
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

	public Finish(): SdfMeshData {
		return {
			Positions: Float32Array.from( this._positions ),
			Normals: Float32Array.from( this._normals ),
			Ao: Float32Array.from( this._ao ),
			MaterialIds: Uint16Array.from( this._materials ),
			Indices: Uint16Array.from( this._indices ),
		};
	}
}
