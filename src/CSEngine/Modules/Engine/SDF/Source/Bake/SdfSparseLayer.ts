// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import type { SdfEdit } from "../Edits/SdfEdit";
import type { SdfBaseLayer } from "../Field/BaseLayers";
import {
	CreateBaseLayer,
	type SdfBaseDescriptor,
} from "../Field/BaseDescriptor";
import { SdfProgram } from "../Field/SdfProgram";
import type { Aabb } from "../Spatial/Aabb";
import {
	BAKED_BRICK_NODES,
	BAKED_CELLS,
	BAKED_RANGE_SPACINGS,
	MaterialBytes,
	NodeBytes,
	SampleBrick,
} from "./SdfBakedLayer";

/** "CSSL" as a little-endian word: the start of a sparse layer. */
export const SPARSE_MAGIC = 0x4c535343;

export const SPARSE_VERSION = 1;

const Cells = BAKED_CELLS;

const Nodes = Cells + 1;

/** Cell coordinates a key holds on each axis: -2^16..2^16 - 1. */
const KeyHalf = 65536;

const KeySide = KeyHalf * 2;

/** One cell the folds changed: a brick, or only its center's bound. */
interface SparseCell {
	Center: number;
	/** First, second material, mix, layer at the center. */
	Material: Uint8Array;
	/** Distances (a byte a node) then materials (four bytes a node). */
	Brick: Uint8Array | null;
}

/**
 * The base of a world without bounds (a fractal, plan.md 12): an analytic
 * layer (`Under`, from a descriptor) and, only in the cells old edits were
 * folded into, those cells sampled again - bricks of 9^3 nodes as in
 * SdfBakedLayer, or the center's bound where the surface is out of range.
 * Everywhere else the analytic layer answers. Memory grows with what was
 * folded, not with the world (a dense layer over a fractal hundreds of
 * meters across would take hundreds of megabytes).
 *
 * A fold reads the layer as it is and writes only after all reads; a cell
 * the fold leaves as the analytic layer has it keeps no entry.
 */
export class SdfSparseLayer implements SdfBaseLayer {
	public readonly Under: SdfBaseLayer;

	public MaterialId = 0;

	public MaterialB = 0;

	public MaterialMix = 0;

	public LayerIndex = 0;

	private readonly _cells = new Map<number, SparseCell>();

	public constructor(
		public readonly Descriptor: SdfBaseDescriptor,
		/** Sample spacing of the folded cells (a cell is 8 of them). */
		public readonly Spacing: number,
	) {
		this.Under = CreateBaseLayer( Descriptor );
	}

	public get CellSize(): number {
		return this.Spacing * Cells;
	}

	/** World distance a byte of 0 or 255 stands for. */
	public get Range(): number {
		return BAKED_RANGE_SPACINGS * this.Spacing;
	}

	/** Cells the folds changed. */
	public get CellCount(): number {
		return this._cells.size;
	}

	public Distance(
		x: number,
		y: number,
		z: number,
		detail = 0,
	): number {
		const c = this.CellSize;
		const fx = x / c;
		const fy = y / c;
		const fz = z / c;
		const cx = FMath.Floor( fx );
		const cy = FMath.Floor( fy );
		const cz = FMath.Floor( fz );
		const cell = this._cells.get( Key( cx, cy, cz ) );

		if ( !cell ) {
			const under = this.Under;
			const d = under.Distance( x, y, z, detail );

			this.MaterialId = under.MaterialId;
			this.MaterialB = under.MaterialB ?? under.MaterialId;
			this.MaterialMix = under.MaterialMix ?? 0;
			this.LayerIndex = under.LayerIndex ?? 0;
			return d;
		}
		if ( !cell.Brick ) {
			const off = FMath.Length3(
				fx - cx - 0.5,
				fy - cy - 0.5,
				fz - cz - 0.5,
			) * c;
			const bound = FMath.Max(
				FMath.Abs( cell.Center ) - off,
				this.Range,
			);

			this.SetMaterial( cell.Material, 0 );
			return cell.Center >= 0 ? bound : -bound;
		}
		return this.Trilinear(
			cell.Brick,
			( fx - cx ) * Cells,
			( fy - cy ) * Cells,
			( fz - cz ) * Cells,
		);
	}

	/**
	 * Folds an edit in (plan.md 10.2): the cells it reaches are sampled
	 * again as "this layer, then the edit"; all new values first, then the
	 * writes.
	 */
	public Fold( edit: SdfEdit, reach: Aabb ): void {
		const program = new SdfProgram( [ edit ], this );
		const c = this.CellSize;
		const h = this.Spacing;
		const range = this.Range;
		const margin = range + h;
		const center = c * 0.5 * FMath.SQRT3 + range;
		const lo = [ 0, 1, 2 ].map(
			( axis ) => FMath.Floor( ( reach[axis]! - margin ) / c ),
		);
		const hi = [ 0, 1, 2 ].map(
			( axis ) => FMath.Floor( ( reach[axis + 3]! + margin ) / c ),
		);
		const pending: Array<[ number, SparseCell | null ]> = [];

		for ( let z = lo[2]!; z <= hi[2]!; z++ ) {
			for ( let y = lo[1]!; y <= hi[1]!; y++ ) {
				for ( let x = lo[0]!; x <= hi[0]!; x++ ) {
					const key = Key( x, y, z );
					const ox = x * c;
					const oy = y * c;
					const oz = z * c;
					const middle = program.Distance(
						ox + c / 2,
						oy + c / 2,
						oz + c / 2,
					);
					const cell: SparseCell = {
						Center: middle,
						Material: MaterialBytes( program ),
						Brick: null,
					};

					if ( FMath.Abs( middle ) <= center ) {
						const brick = new Uint8Array(
							BAKED_BRICK_NODES * NodeBytes,
						);

						if ( SampleBrick(
							program,
							ox,
							oy,
							oz,
							h,
							range,
							brick,
						) ) {
							cell.Brick = brick;
						}
					}
					pending.push( [
						key,
						this._cells.has( key )
						|| !this.SameAsUnder( cell, ox, oy, oz )
							? cell
							: null,
					] );
				}
			}
		}
		for ( const [ key, cell ] of pending ) {
			if ( cell ) {
				this._cells.set( key, cell );
			}
		}
	}

	/**
	 * The layer in its saved form: a header (magic, version, cell count,
	 * spacing as a double, the descriptor's length), the descriptor as
	 * JSON, then each cell: key, center, material, brick flag and brick.
	 */
	public Serialize(): ArrayBuffer {
		const descriptor = new TextEncoder().encode(
			JSON.stringify( this.Descriptor ),
		);
		const brickBytes = BAKED_BRICK_NODES * NodeBytes;
		let size = 24 + Pad( descriptor.length );

		for ( const cell of this._cells.values() ) {
			size += 24 + ( cell.Brick ? Pad( brickBytes ) : 0 );
		}

		const buffer = new ArrayBuffer( size );
		const view = new DataView( buffer );
		const bytes = new Uint8Array( buffer );
		let at = 24;

		view.setUint32( 0, SPARSE_MAGIC, true );
		view.setUint32( 4, SPARSE_VERSION, true );
		view.setUint32( 8, this._cells.size, true );
		view.setUint32( 12, descriptor.length, true );
		view.setFloat64( 16, this.Spacing, true );
		bytes.set( descriptor, at );
		at += Pad( descriptor.length );
		for ( const [ key, cell ] of this._cells ) {
			view.setFloat64( at, key, true );
			view.setFloat64( at + 8, cell.Center, true );
			bytes.set( cell.Material, at + 16 );
			view.setUint32( at + 20, cell.Brick ? 1 : 0, true );
			at += 24;
			if ( cell.Brick ) {
				bytes.set( cell.Brick, at );
				at += Pad( brickBytes );
			}
		}
		return buffer;
	}

	/** A layer read back from Serialize; throws on another format. */
	public static Deserialize( buffer: ArrayBuffer ): SdfSparseLayer {
		const view = new DataView( buffer );

		if ( view.getUint32( 0, true ) !== SPARSE_MAGIC ) {
			throw new Error( "Not a sparse SDF layer" );
		}
		if ( view.getUint32( 4, true ) !== SPARSE_VERSION ) {
			throw new Error(
				"Unsupported sparse SDF layer "
					+ `version ${ view.getUint32( 4, true ) }`,
			);
		}

		const count = view.getUint32( 8, true );
		const length = view.getUint32( 12, true );
		const descriptor = JSON.parse( new TextDecoder().decode(
			new Uint8Array( buffer, 24, length ),
		) ) as SdfBaseDescriptor;
		const layer = new SdfSparseLayer(
			descriptor,
			view.getFloat64( 16, true ),
		);
		const brickBytes = BAKED_BRICK_NODES * NodeBytes;
		let at = 24 + Pad( length );

		for ( let i = 0; i < count; i++ ) {
			const key = view.getFloat64( at, true );
			const hasBrick = view.getUint32( at + 20, true ) === 1;
			const cell: SparseCell = {
				Center: view.getFloat64( at + 8, true ),
				Material: new Uint8Array( buffer.slice( at + 16, at + 20 ) ),
				Brick: null,
			};

			at += 24;
			if ( hasBrick ) {
				cell.Brick = new Uint8Array(
					buffer.slice( at, at + brickBytes ),
				);
				at += Pad( brickBytes );
			}
			layer._cells.set( key, cell );
		}
		return layer;
	}

	/**
	 * Whether a cell sampled anew is what the analytic layer gives anyway
	 * (the fold didn't reach it): then it keeps no entry.
	 */
	private SameAsUnder(
		cell: SparseCell,
		ox: number,
		oy: number,
		oz: number,
	): boolean {
		const under = new SdfProgram( [], this.Under );
		const c = this.CellSize;
		const middle = under.Distance( ox + c / 2, oy + c / 2, oz + c / 2 );

		if ( !cell.Brick ) {
			return FMath.Abs( middle - cell.Center ) < this.Spacing * 0.01;
		}

		const brick = new Uint8Array( BAKED_BRICK_NODES * NodeBytes );

		SampleBrick( under, ox, oy, oz, this.Spacing, this.Range, brick );
		return brick.every( ( byte, i ) => byte === cell.Brick![i] );
	}

	/** Trilinear distance inside a brick at node coordinates (0..8). */
	private Trilinear(
		brick: Uint8Array,
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
		const base = x0 + ( y0 + z0 * Nodes ) * Nodes;
		const Y = Nodes;
		const Z = Nodes * Nodes;
		const Lerp = FMath.LerpUnclamped;
		const value = Lerp(
			Lerp(
				Lerp( brick[base]!, brick[base + 1]!, tx ),
				Lerp( brick[base + Y]!, brick[base + Y + 1]!, tx ),
				ty,
			),
			Lerp(
				Lerp( brick[base + Z]!, brick[base + Z + 1]!, tx ),
				Lerp( brick[base + Z + Y]!, brick[base + Z + Y + 1]!, tx ),
				ty,
			),
			tz,
		);
		// the nearest node's material
		const nearest = FMath.Round( u )
			+ ( FMath.Round( v ) + FMath.Round( w ) * Nodes ) * Nodes;

		this.SetMaterial(
			brick,
			BAKED_BRICK_NODES + nearest * ( NodeBytes - 1 ),
		);
		return ( value / 255 - 0.5 ) * 2 * this.Range;
	}

	/** Reads a stored material: first, second, mix (a byte), layer. */
	private SetMaterial( bytes: Uint8Array, at: number ): void {
		this.MaterialId = bytes[at]!;
		this.MaterialB = bytes[at + 1]!;
		this.MaterialMix = bytes[at + 2]! / 255;
		this.LayerIndex = bytes[at + 3]!;
	}
}

/** A cell's key: its coordinates packed into one number (exact). */
function Key( x: number, y: number, z: number ): number {
	return ( ( x + KeyHalf ) * KeySide + ( y + KeyHalf ) ) * KeySide
		+ ( z + KeyHalf );
}

/** Rounded up to 8 bytes (the doubles stay aligned). */
function Pad( length: number ): number {
	return Math.ceil( length / 8 ) * 8;
}
