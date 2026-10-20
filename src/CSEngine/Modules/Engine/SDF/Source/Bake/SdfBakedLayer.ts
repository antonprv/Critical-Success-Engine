// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import type { SdfEdit } from "../Edits/SdfEdit";
import type { SdfBaseLayer } from "../Field/BaseLayers";
import type { SdfField } from "../Field/SdfField";
import { SdfProgram } from "../Field/SdfProgram";
import { CreateAabb, Overlaps, type Aabb } from "../Spatial/Aabb";

/** "CSDB" as a little-endian word: the start of a baked layer. */
export const BAKED_MAGIC = 0x42445343;

/** 2: every node and cell keeps a material pair, its mix and its layer. */
export const BAKED_VERSION = 2;

/** Bytes a node keeps: distance, first and second material, mix, layer. */
export const NodeBytes = 5;

/** Bytes a cell keeps besides its brick index and center distance. */
const CellBytes = 4;

/** Cells along a baked brick's edge; it stores the 9 nodes of each axis. */
export const BAKED_CELLS = 8;

const Cells = BAKED_CELLS;

const Nodes = Cells + 1;

/** Nodes of one baked brick. */
export const BAKED_BRICK_NODES = Nodes * Nodes * Nodes;

/** Encoded range on each side of the surface, in sample spacings. */
export const BAKED_RANGE_SPACINGS = 4;

const RangeSpacings = BAKED_RANGE_SPACINGS;

/** Byte offset of the cell arrays in the saved form. */
const HeaderBytes = 56;

export interface BakeOptions {
	/** World box the bake covers (whole cells: it may grow a little). */
	Bounds: Aabb;
	/** Sample spacing h; a cell is 8 of them. */
	Spacing: number;
}

/**
 * Many edits merged into one sampled field (plan.md 10.2, "a sampled edit"):
 * what the editor builds from its whole edit list, and the base the game
 * folds its old edits into, so the game only ever keeps a few recent ones.
 *
 * The box is cut into cells of 8^3 samples. A cell the surface passes near
 * keeps a brick of 9^3 nodes (distance, a material pair and how much of the
 * second, and the layer: a byte each); any other cell keeps only the distance
 * at its center (and its material and layer), which bounds the distance
 * anywhere in it (the cell is farther from the surface than the brick range, so
 * rays still take long steps there). Outside the box the world is empty.
 */
export class SdfBakedLayer implements SdfBaseLayer {
	/** Material at the point of the last Distance (the nearest node's). */
	public MaterialId = 0;

	/** The second material there, its share (0..1) and the layer. */
	public MaterialB = 0;

	public MaterialMix = 0;

	public LayerIndex = 0;

	/** Lowest corner of the box. */
	public readonly Min: Readonly<[ number, number, number ]>;

	public readonly Spacing: number;

	/** Cells along each axis. */
	public readonly Size: Readonly<[ number, number, number ]>;

	/** Per cell: its brick, or -1. */
	private _brickOf: Int32Array;

	/** Per cell: the distance at its center. */
	private _center: Float32Array;

	/** Per cell: material, second material, mix, layer at its center. */
	private _cellMaterial: Uint8Array;

	/** Bricks, BAKED_BRICK_NODES apiece: distance bytes. */
	private _distances: Uint8Array;

	/**
	 * Bricks, BAKED_BRICK_NODES * 4 apiece: per node material, second, mix,
	 * layer.
	 */
	private _materials: Uint8Array;

	private _brickCount: number;

	/** Free brick slots (from bricks that stopped being needed). */
	private readonly _free: number[] = [];

	private constructor(
		min: [ number, number, number ],
		spacing: number,
		size: [ number, number, number ],
	) {
		const cells = size[0] * size[1] * size[2];

		this.Min = min;
		this.Spacing = spacing;
		this.Size = size;
		this._brickOf = new Int32Array( cells ).fill( -1 );
		this._center = new Float32Array( cells ).fill( Infinity );
		this._cellMaterial = new Uint8Array( cells * CellBytes );
		this._distances = new Uint8Array( 0 );
		this._materials = new Uint8Array( 0 );
		this._brickCount = 0;
	}

	/**
	 * Samples a world - its base and all its edits - into a new layer: the
	 * editor's build step. Each cell is sampled with only the edits that
	 * reach it.
	 */
	public static Bake(
		world: SdfField,
		options: BakeOptions,
	): SdfBakedLayer {
		const b = options.Bounds;
		const cell = options.Spacing * Cells;
		const size: [ number, number, number ] = [
			FMath.Max( 1, FMath.Ceil( ( b[3]! - b[0]! ) / cell - 1e-9 ) ),
			FMath.Max( 1, FMath.Ceil( ( b[4]! - b[1]! ) / cell - 1e-9 ) ),
			FMath.Max( 1, FMath.Ceil( ( b[5]! - b[2]! ) / cell - 1e-9 ) ),
		];
		const layer = new SdfBakedLayer(
			[ b[0]!, b[1]!, b[2]! ],
			options.Spacing,
			size,
		);

		layer.Resample(
			( box ) => world.Compile( world.Edits.Candidates( box ) ),
			0,
			0,
			0,
			size[0] - 1,
			size[1] - 1,
			size[2] - 1,
		);
		return layer;
	}

	/** World size of a cell. */
	public get CellSize(): number {
		return this.Spacing * Cells;
	}

	/** Cells that keep a brick. */
	public get BrickCount(): number {
		return this._brickCount - this._free.length;
	}

	/** The box the layer covers. */
	public get Bounds(): Aabb {
		const c = this.CellSize;

		return CreateAabb(
			this.Min[0],
			this.Min[1],
			this.Min[2],
			this.Min[0] + this.Size[0] * c,
			this.Min[1] + this.Size[1] * c,
			this.Min[2] + this.Size[2] * c,
		);
	}

	/** World distance a byte of 0 or 255 stands for. */
	public get Range(): number {
		return RangeSpacings * this.Spacing;
	}

	public Distance( x: number, y: number, z: number ): number {
		const c = this.CellSize;
		const fx = ( x - this.Min[0] ) / c;
		const fy = ( y - this.Min[1] ) / c;
		const fz = ( z - this.Min[2] ) / c;
		const [ sx, sy, sz ] = this.Size;

		if ( fx < 0 || fy < 0 || fz < 0 || fx >= sx || fy >= sy || fz >= sz ) {
			// empty outside: at least as far as the box
			this.SetMaterial( 0, 0, 0, 0 );
			return FMath.Max( this.BoxDistance( x, y, z ), this.Range );
		}

		const cx = FMath.Floor( fx );
		const cy = FMath.Floor( fy );
		const cz = FMath.Floor( fz );
		const index = cx + ( cy + cz * sy ) * sx;
		const brick = this._brickOf[index]!;

		if ( brick < 0 ) {
			const center = this._center[index]!;
			const off = FMath.Length3(
				fx - cx - 0.5,
				fy - cy - 0.5,
				fz - cz - 0.5,
			) * c;

			// every node of a cell without a brick is out of range, so its
			// points are too (to within a fraction of a spacing): the
			// center's bound never reads nearer than that
			const bound = FMath.Max( FMath.Abs( center ) - off, this.Range );

			this.SetMaterialFrom( this._cellMaterial, index * CellBytes );
			return center >= 0 ? bound : -bound;
		}
		return this.Trilinear(
			brick,
			( fx - cx ) * Cells,
			( fy - cy ) * Cells,
			( fz - cz ) * Cells,
		);
	}

	/**
	 * Folds an edit into the layer (plan.md 10.2: the auto-bake): the cells
	 * it reaches are sampled again as "this layer, then the edit". Every new
	 * value is computed before any is written, so the layer never reads its
	 * own half-updated state.
	 */
	public Fold( edit: SdfEdit, reach: Aabb ): void {
		if ( !Overlaps( reach, this.Bounds ) ) {
			return;
		}

		// reads this layer as it is: Resample writes only after all reads
		const program = new SdfProgram( [ edit ], this );
		const c = this.CellSize;
		const margin = this.Range + this.Spacing;
		const Lo = ( axis: number ): number => FMath.Max(
			0,
			FMath.Floor( ( reach[axis]! - margin - this.Min[axis]! ) / c ),
		);
		const Hi = ( axis: number ): number => FMath.Min(
			this.Size[axis]! - 1,
			FMath.Floor( ( reach[axis + 3]! + margin - this.Min[axis]! ) / c ),
		);

		this.Resample(
			() => program,
			Lo( 0 ),
			Lo( 1 ),
			Lo( 2 ),
			Hi( 0 ),
			Hi( 1 ),
			Hi( 2 ),
		);
	}

	/**
	 * The layer in its saved form: a header (magic, version, cell counts,
	 * brick count; then spacing and min as doubles), the per-cell arrays and
	 * the bricks.
	 */
	public Serialize(): ArrayBuffer {
		const cells = this._brickOf.length;
		const bricks = this._brickCount;
		const brickBytes = bricks * BAKED_BRICK_NODES;
		const buffer = new ArrayBuffer(
			HeaderBytes + cells * ( 8 + CellBytes ) + brickBytes * NodeBytes,
		);
		const head = new Uint32Array( buffer, 0, 6 );
		const floats = new Float64Array( buffer, 24, 4 );
		let at = HeaderBytes;
		const Put = ( bytes: Uint8Array ): void => {
			new Uint8Array( buffer, at, bytes.length ).set( bytes );
			at += bytes.length;
		};

		head.set( [ BAKED_MAGIC, BAKED_VERSION, ...this.Size, bricks ] );
		floats.set( [ this.Spacing, ...this.Min ] );
		Put( new Uint8Array( this._brickOf.buffer ) );
		Put( new Uint8Array( this._center.buffer ) );
		Put( this._cellMaterial );
		Put( this._distances.subarray( 0, brickBytes ) );
		Put( this._materials.subarray( 0, brickBytes * ( NodeBytes - 1 ) ) );
		return buffer;
	}

	/** A layer read back from Serialize; throws on another format. */
	public static Deserialize( buffer: ArrayBuffer ): SdfBakedLayer {
		const head = new Uint32Array( buffer, 0, 6 );

		if ( head[0] !== BAKED_MAGIC ) {
			throw new Error( "Not a baked SDF layer" );
		}
		if ( head[1] !== BAKED_VERSION ) {
			throw new Error(
				`Unsupported baked SDF layer version ${ head[1] }`,
			);
		}

		const size: [ number, number, number ] = [
			head[2]!,
			head[3]!,
			head[4]!,
		];
		const bricks = head[5]!;
		const floats = new Float64Array( buffer, 24, 4 );
		const layer = new SdfBakedLayer(
			[ floats[1]!, floats[2]!, floats[3]! ],
			floats[0]!,
			size,
		);
		const cells = layer._brickOf.length;
		const brickBytes = bricks * BAKED_BRICK_NODES;
		let at = HeaderBytes;
		const Take = ( length: number ): Uint8Array => {
			const bytes = new Uint8Array( buffer.slice( at, at + length ) );

			at += length;
			return bytes;
		};

		layer._brickOf = new Int32Array( Take( cells * 4 ).buffer );
		layer._center = new Float32Array( Take( cells * 4 ).buffer );
		layer._cellMaterial = Take( cells * CellBytes );
		layer._distances = Take( brickBytes );
		layer._materials = Take( brickBytes * ( NodeBytes - 1 ) );
		layer._brickCount = bricks;
		// slots no cell points at (freed before saving) are free again
		const used = new Set( layer._brickOf );

		for ( let brick = 0; brick < bricks; brick++ ) {
			if ( !used.has( brick ) ) {
				layer._free.push( brick );
			}
		}
		return layer;
	}

	/**
	 * Samples cells x0..x1, y0..y1, z0..z1 (inclusive), each with the program
	 * `programFor` gives for the box its samples depend on: all new values
	 * first, then writes them.
	 */
	private Resample(
		programFor: ( box: Aabb ) => SdfProgram,
		x0: number,
		y0: number,
		z0: number,
		x1: number,
		y1: number,
		z1: number,
	): void {
		const h = this.Spacing;
		const c = this.CellSize;
		const range = this.Range;
		// farther than this from the surface at the center: no node of the
		// cell is within range
		const reach = c * 0.5 * FMath.SQRT3 + range;
		// edits are gathered this far around a cell
		const far = range + 2 * c;
		const [ sx, sy ] = this.Size;
		const pending: Array<{
			index: number;
			center: number;
			material: Uint8Array;
			brick: Uint8Array | null;
		}> = [];

		for ( let z = z0; z <= z1; z++ ) {
			for ( let y = y0; y <= y1; y++ ) {
				for ( let x = x0; x <= x1; x++ ) {
					const ox = this.Min[0] + x * c;
					const oy = this.Min[1] + y * c;
					const oz = this.Min[2] + z * c;
					const program = programFor( CreateAabb(
						ox - far,
						oy - far,
						oz - far,
						ox + c + far,
						oy + c + far,
						oz + c + far,
					) );
					// an edit left out is at least `far` away: the center
					// can't be trusted beyond that
					const center = FMath.Clamp( program.Distance(
						ox + c / 2,
						oy + c / 2,
						oz + c / 2,
					), -far, far );
					const centerMaterial = MaterialBytes( program );
					let brick: Uint8Array | null = null;

					if ( FMath.Abs( center ) <= reach ) {
						brick = new Uint8Array( BAKED_BRICK_NODES * NodeBytes );
						if ( !SampleBrick(
							program,
							ox,
							oy,
							oz,
							h,
							range,
							brick,
						) ) {
							brick = null;
						}
					}
					pending.push( {
						index: x + ( y + z * sy ) * sx,
						center,
						material: centerMaterial,
						brick,
					} );
				}
			}
		}
		for ( const cell of pending ) {
			this.Write( cell.index, cell.center, cell.material, cell.brick );
		}
	}

	private Write(
		index: number,
		center: number,
		material: Uint8Array,
		brick: Uint8Array | null,
	): void {
		let slot = this._brickOf[index]!;

		this._center[index] = center;
		this._cellMaterial.set( material, index * CellBytes );
		if ( brick === null ) {
			if ( slot >= 0 ) {
				this._free.push( slot );
			}
			this._brickOf[index] = -1;
			return;
		}
		if ( slot < 0 ) {
			slot = this._free.pop() ?? this.Grow();
			this._brickOf[index] = slot;
		}

		const at = slot * BAKED_BRICK_NODES;

		this._distances.set( brick.subarray( 0, BAKED_BRICK_NODES ), at );
		this._materials.set(
			brick.subarray( BAKED_BRICK_NODES ),
			at * ( NodeBytes - 1 ),
		);
	}

	/** A new brick slot at the end (the arrays grow by half when full). */
	private Grow(): number {
		const slot = this._brickCount++;
		const needed = this._brickCount * BAKED_BRICK_NODES;

		if ( needed > this._distances.length ) {
			const capacity = FMath.Max(
				needed,
				this._distances.length * 1.5 | 0,
			);
			const distances = new Uint8Array( capacity );
			const materials = new Uint8Array( capacity * ( NodeBytes - 1 ) );

			distances.set( this._distances );
			materials.set( this._materials );
			this._distances = distances;
			this._materials = materials;
		}
		return slot;
	}

	/** Trilinear distance inside a brick at node coordinates (0..8). */
	private Trilinear(
		brick: number,
		u: number,
		v: number,
		w: number,
	): number {
		const x0 = FMath.Min( FMath.Floor( u ), Cells - 1 );
		const y0 = FMath.Min( FMath.Floor( v ), Cells - 1 );
		const z0 = FMath.Min( FMath.Floor( w ), Cells - 1 );
		const tx = u - x0;
		const ty = v - y0;
		const tz = w - z0;
		const data = this._distances;
		const base = brick * BAKED_BRICK_NODES
			+ x0
			+ ( y0 + z0 * Nodes ) * Nodes;
		const Y = Nodes;
		const Z = Nodes * Nodes;
		const Lerp = FMath.LerpUnclamped;
		const value = Lerp(
			Lerp(
				Lerp( data[base]!, data[base + 1]!, tx ),
				Lerp( data[base + Y]!, data[base + Y + 1]!, tx ),
				ty,
			),
			Lerp(
				Lerp( data[base + Z]!, data[base + Z + 1]!, tx ),
				Lerp( data[base + Z + Y]!, data[base + Z + Y + 1]!, tx ),
				ty,
			),
			tz,
		);
		// the nearest node's material
		const nearest = brick * BAKED_BRICK_NODES
			+ FMath.Round( u )
			+ ( FMath.Round( v ) + FMath.Round( w ) * Nodes ) * Nodes;

		this.SetMaterialFrom( this._materials, nearest * ( NodeBytes - 1 ) );
		return ( value / 255 - 0.5 ) * 2 * this.Range;
	}

	private SetMaterial(
		a: number,
		b: number,
		mix: number,
		layer: number,
	): void {
		this.MaterialId = a;
		this.MaterialB = b;
		this.MaterialMix = mix;
		this.LayerIndex = layer;
	}

	/** Reads a stored material: first, second, mix (a byte), layer. */
	private SetMaterialFrom( bytes: Uint8Array, at: number ): void {
		this.SetMaterial(
			bytes[at]!,
			bytes[at + 1]!,
			bytes[at + 2]! / 255,
			bytes[at + 3]!,
		);
	}

	/** Distance from a point to the layer's box (0 inside). */
	private BoxDistance( x: number, y: number, z: number ): number {
		const b = this.Bounds;
		const dx = FMath.Max( b[0]! - x, FMath.Max( 0, x - b[3]! ) );
		const dy = FMath.Max( b[1]! - y, FMath.Max( 0, y - b[4]! ) );
		const dz = FMath.Max( b[2]! - z, FMath.Max( 0, z - b[5]! ) );

		return FMath.Length3( dx, dy, dz );
	}
}

/**
 * Samples a brick's 9^3 nodes (corner at o, spacing h) into `out` (distance
 * bytes, then per node the material, second material, mix and layer); false if
 * every node is out of range on the same side (no brick needed after all).
 */
export function SampleBrick(
	program: SdfProgram,
	ox: number,
	oy: number,
	oz: number,
	h: number,
	range: number,
	out: Uint8Array,
): boolean {
	let below = false;
	let above = false;
	let i = 0;

	for ( let z = 0; z < Nodes; z++ ) {
		for ( let y = 0; y < Nodes; y++ ) {
			for ( let x = 0; x < Nodes; x++ ) {
				const d = program.Distance(
					ox + x * h,
					oy + y * h,
					oz + z * h,
				);
				const t = FMath.Clamp( d / range, -1, 1 );
				const byte = FMath.Round( ( t * 0.5 + 0.5 ) * 255 );

				out[i] = byte;
				WriteMaterial(
					program,
					out,
					BAKED_BRICK_NODES + i * ( NodeBytes - 1 ),
				);
				below ||= byte < 255;
				above ||= byte > 0;
				i++;
			}
		}
	}
	return below && above;
}

/**
 * The material at a program's last point as stored: first, second, mix, layer.
 */
export function MaterialBytes( program: SdfProgram ): Uint8Array {
	const bytes = new Uint8Array( 4 );

	WriteMaterial( program, bytes, 0 );
	return bytes;
}

function WriteMaterial(
	program: SdfProgram,
	out: Uint8Array,
	at: number,
): void {
	out[at] = program.LastMaterial;
	out[at + 1] = program.LastMaterialB;
	out[at + 2] = FMath.Round( program.LastMix * 255 );
	out[at + 3] = program.LastLayer;
}
