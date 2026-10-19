// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import { BRICK_STORED, BRICK_VOLUME } from "./BrickCodec";

/**
 * The brick atlas (plan.md 5.2, 5.5): one R8 3D texture cut into 10^3 slots,
 * a free list of slots, and copy-on-write: a brick being replaced gives back
 * its slot only at the end of the frame (Retire, EndFrame), so a reader
 * never sees half of an update. The texels live here too, for the backends
 * that upload from the CPU (WebGL2), with the slots written since the last
 * upload.
 */
export class BrickAtlas {
	/** Texels along each axis. */
	public readonly Size: Readonly<[ number, number, number ]>;

	/** Slots along each axis. */
	public readonly Slots: Readonly<[ number, number, number ]>;

	/** The texels, x fastest. A fresh atlas is "far outside" everywhere. */
	public readonly Data: Uint8Array;

	/**
	 * With materials: four bytes a texel, as DenseSdfGrid's after the
	 * distance (the pair, then the mix and the layer); else empty.
	 */
	public readonly Materials: Uint8Array;

	private readonly _free: number[] = [];

	private readonly _retired: number[] = [];

	private readonly _dirty = new Set<number>();

	public constructor(
		sizeX: number,
		sizeY: number,
		sizeZ: number,
		materials = false,
	) {
		this.Size = [ sizeX, sizeY, sizeZ ];
		this.Slots = [
			FMath.Floor( sizeX / BRICK_STORED ),
			FMath.Floor( sizeY / BRICK_STORED ),
			FMath.Floor( sizeZ / BRICK_STORED ),
		];
		this.Data = new Uint8Array( sizeX * sizeY * sizeZ ).fill( 255 );
		this.Materials = new Uint8Array(
			materials ? sizeX * sizeY * sizeZ * 4 : 0,
		);
		// popped from the end: slot 0 is handed out first
		for ( let slot = this.Capacity - 1; slot >= 0; slot-- ) {
			this._free.push( slot );
		}
	}

	/** How many bricks fit. */
	public get Capacity(): number {
		return this.Slots[0] * this.Slots[1] * this.Slots[2];
	}

	/** Slots in use (retired ones included until EndFrame). */
	public get Used(): number {
		return this.Capacity - this._free.length;
	}

	/** A free slot, or -1 when the atlas is full. */
	public Allocate(): number {
		return this._free.pop() ?? -1;
	}

	/** Gives a slot back now (nothing reads it any more). */
	public Release( slot: number ): void {
		this._dirty.delete( slot );
		this._free.push( slot );
	}

	/** Gives a slot back at the end of the frame (copy-on-write). */
	public Retire( slot: number ): void {
		this._retired.push( slot );
	}

	/** The frame is drawn: retired slots become free. */
	public EndFrame(): void {
		for ( const slot of this._retired.splice( 0 ) ) {
			this.Release( slot );
		}
	}

	/** Texel coordinates of a slot's corner. */
	public SlotOrigin( slot: number ): [ number, number, number ] {
		const [ sx, sy ] = this.Slots;

		return [
			( slot % sx ) * BRICK_STORED,
			( FMath.Floor( slot / sx ) % sy ) * BRICK_STORED,
			FMath.Floor( slot / ( sx * sy ) ) * BRICK_STORED,
		];
	}

	/**
	 * Copies a built brick (BRICK_VOLUME bytes) into its slot, and its
	 * materials (four bytes a node) where the atlas keeps them.
	 */
	public Write(
		slot: number,
		brick: Uint8Array,
		materials: Uint8Array | null = null,
	): void {
		const [ ox, oy, oz ] = this.SlotOrigin( slot );
		const [ width, height ] = this.Size;
		const keep = materials !== null && this.Materials.length > 0;
		let i = 0;

		for ( let z = 0; z < BRICK_STORED; z++ ) {
			for ( let y = 0; y < BRICK_STORED; y++ ) {
				const row = ox + ( oy + y + ( oz + z ) * height ) * width;

				this.Data.set( brick.subarray( i, i + BRICK_STORED ), row );
				if ( keep ) {
					this.Materials.set(
						materials.subarray( i * 4, ( i + BRICK_STORED ) * 4 ),
						row * 4,
					);
				}
				i += BRICK_STORED;
			}
		}
		this._dirty.add( slot );
	}

	/** One slot's texels, as Write took them. */
	public Read( slot: number ): Uint8Array {
		const out = new Uint8Array( BRICK_VOLUME );
		const [ ox, oy, oz ] = this.SlotOrigin( slot );
		const [ width, height ] = this.Size;
		let i = 0;

		for ( let z = 0; z < BRICK_STORED; z++ ) {
			for ( let y = 0; y < BRICK_STORED; y++ ) {
				const row = ox + ( oy + y + ( oz + z ) * height ) * width;

				out.set( this.Data.subarray( row, row + BRICK_STORED ), i );
				i += BRICK_STORED;
			}
		}
		return out;
	}

	/** The slots written since the last call: what to upload. */
	public TakeDirty(): number[] {
		const dirty = [ ...this._dirty ];

		this._dirty.clear();
		return dirty;
	}
}
