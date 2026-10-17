// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import type { EditWatcher } from "../Edits/EditList";
import type { SdfField } from "../Field/SdfField";
import { CreateAabb, type Aabb } from "../Spatial/Aabb";
import { BrickAtlas } from "./BrickAtlas";
import {
	BRICK_CELLS,
	BRICK_VOLUME,
	BrickClass,
	BuildBrick,
	DecodeDistance,
	RANGE_SPACINGS,
} from "./BrickCodec";
import {
	BrickMap,
	CELL_EMPTY,
	CELL_SOLID,
	CELL_STALE,
	CellSlot,
	IsBrickCell,
} from "./BrickMap";

export interface SdfVolumeOptions {
	/** Sample spacing h, world units (a cell is 8 of them). */
	Spacing: number;
	/** Cells along each axis of the window (M). Default 32. */
	MapSize?: number;
	/** Atlas texels along each axis. Default 160^3 (4096 bricks). */
	AtlasSize?: [ number, number, number ];
	/** Bricks generated per Update at most (plan.md 6.4). Default 256. */
	Budget?: number;
	/**
	 * The window follows the eye only after it is this many cells off
	 * center, so slices aren't generated every frame (plan.md 5.4). Default 2.
	 */
	Hysteresis?: number;
}

/** What one Update did. */
export interface SdfVolumeStats {
	/** Cells computed (bricks built or found empty / solid). */
	Generated: number;
	/** Of them, cells that needed a brick. */
	Bricks: number;
	/** Cells still waiting (over budget or the atlas full). */
	Remaining: number;
	/** Whether the atlas ran out of slots. */
	Starved: boolean;
}

/**
 * One level of the cached SDF (plan.md 5, 6): a brick map window around the
 * eye, the atlas behind it, and the incremental update. Each Update takes
 * the edit list's dirty boxes, grows them by the encoded range (a surface
 * change moves the distances around it too, plan.md 6.1.3), marks the cells
 * there stale, and rebuilds cells nearest the eye first within a budget.
 * Stale bricks keep their old data until rebuilt: the picture lags, it
 * never breaks (plan.md 6.4).
 *
 * This is the CPU path (the reference, and the WebGL2 tier where the CPU
 * prepares the bricks); the WebGPU path fills the same map and atlas from a
 * compute shader.
 */
export class SdfVolume {
	public readonly Map: BrickMap;

	public readonly Atlas: BrickAtlas;

	public readonly Spacing: number;

	public Budget: number;

	private readonly _hysteresis: number;

	/** Cells waiting for a rebuild, by their map index. */
	private readonly _queue = new Map<number, [ number, number, number ]>();

	private readonly _brick = new Uint8Array( BRICK_VOLUME );

	private readonly _eye: [ number, number, number ] = [ 0, 0, 0 ];

	private readonly _changes: EditWatcher;

	public constructor(
		public readonly Field: SdfField,
		options: SdfVolumeOptions,
	) {
		const size = options.AtlasSize ?? [ 160, 160, 160 ];

		this.Spacing = options.Spacing;
		this.Budget = options.Budget ?? 256;
		this._hysteresis = options.Hysteresis ?? 2;
		this.Map = new BrickMap(
			options.MapSize ?? 32,
			options.Spacing * BRICK_CELLS,
		);
		this.Atlas = new BrickAtlas( size[0], size[1], size[2] );
		this._changes = Field.Edits.Watch();
		this.CenterOn( 0, 0, 0, true );
		// the window starts out all pending
		this.EnqueueBox( CreateAabb(
			-Infinity,
			-Infinity,
			-Infinity,
			Infinity,
			Infinity,
			Infinity,
		) );
	}

	/** How far from the surface distances are encoded, world units. */
	public get Range(): number {
		return RANGE_SPACINGS * this.Spacing;
	}

	/** Cells waiting for a rebuild. */
	public get Pending(): number {
		return this._queue.size;
	}

	/**
	 * Follows the eye: moves the window when it is more than the hysteresis
	 * off center (or always, with `force`). The cells that come in are queued.
	 */
	public CenterOn( x: number, y: number, z: number, force = false ): void {
		const map = this.Map;
		const half = map.Size >> 1;
		const [ cx, cy, cz ] = map.CellOf( x, y, z );
		const [ ox, oy, oz ] = map.Origin;
		const off = FMath.Max(
			FMath.Abs( cx - half - ox ),
			FMath.Max(
				FMath.Abs( cy - half - oy ),
				FMath.Abs( cz - half - oz ),
			),
		);

		this._eye[0] = x;
		this._eye[1] = y;
		this._eye[2] = z;
		if ( !force && off < this._hysteresis ) {
			return;
		}

		const freed: number[] = [];

		// each cell that came in takes the index of one that left, so this
		// also drops the queued cells that are now outside
		for ( const cell of map.MoveTo(
			cx - half,
			cy - half,
			cz - half,
			freed,
		) ) {
			this._queue.set( map.Index( ...cell ), cell );
		}
		for ( const slot of freed ) {
			this.Atlas.Retire( slot );
		}
	}

	/**
	 * Takes the edits' changes and rebuilds up to Budget queued cells,
	 * nearest to the eye (CenterOn) first.
	 */
	public Update(): SdfVolumeStats {
		for ( const box of this._changes.Take() ) {
			this.EnqueueBox( box );
		}

		const stats: SdfVolumeStats = {
			Generated: 0,
			Bricks: 0,
			Remaining: 0,
			Starved: false,
		};
		const order = [ ...this._queue ].sort(
			( a, b ) => this.EyeDistance( a[1] ) - this.EyeDistance( b[1] ),
		);

		for ( const [ index, cell ] of order ) {
			if ( stats.Generated >= this.Budget ) {
				break;
			}

			const built = this.Rebuild( cell );

			if ( built === null ) {
				stats.Starved = true;
				break;
			}
			this._queue.delete( index );
			stats.Generated++;
			stats.Bricks += built ? 1 : 0;
		}
		stats.Remaining = this._queue.size;
		return stats;
	}

	/** Stops following the edit list. */
	public Dispose(): void {
		this._changes.Stop();
	}

	/** The frame is drawn: replaced bricks give their slots back. */
	public EndFrame(): void {
		this.Atlas.EndFrame();
	}

	/**
	 * The cached distance at a world point, as the GPU reads it (trilinear
	 * between samples): ±Range in empty and solid cells, NaN in pending ones
	 * and outside the window.
	 */
	public Sample( x: number, y: number, z: number ): number {
		const map = this.Map;
		const [ cx, cy, cz ] = map.CellOf( x, y, z );
		const value = map.Get( cx, cy, cz );

		if ( value === CELL_EMPTY ) {
			return this.Range;
		}
		if ( value === CELL_SOLID ) {
			return -this.Range;
		}
		if ( !IsBrickCell( value ) ) {
			return NaN;
		}

		const h = this.Spacing;
		const [ sx, sy, sz ] = this.Atlas.SlotOrigin( CellSlot( value ) );

		return this.Trilinear(
			sx + 1 + ( x - cx * map.CellSize ) / h,
			sy + 1 + ( y - cy * map.CellSize ) / h,
			sz + 1 + ( z - cz * map.CellSize ) / h,
		);
	}

	/** Trilinear filtering of the atlas at texel coordinates (node = texel). */
	private Trilinear( u: number, v: number, w: number ): number {
		const [ width, height ] = this.Atlas.Size;
		const data = this.Atlas.Data;
		const x0 = FMath.Floor( u );
		const y0 = FMath.Floor( v );
		const z0 = FMath.Floor( w );
		const fx = u - x0;
		const fy = v - y0;
		const fz = w - z0;
		const At = ( x: number, y: number, z: number ): number => (
			data[x + y * width + z * width * height]!
		);
		const Row = ( y: number, z: number ): number => FMath.LerpUnclamped(
			At( x0, y, z ),
			At( x0 + 1, y, z ),
			fx,
		);
		const Plane = ( z: number ): number => FMath.LerpUnclamped(
			Row( y0, z ),
			Row( y0 + 1, z ),
			fy,
		);

		return DecodeDistance(
			FMath.LerpUnclamped( Plane( z0 ), Plane( z0 + 1 ), fz ),
			this.Spacing,
		);
	}

	/** Queues the cells a box (grown by the encoded range) touches. */
	private EnqueueBox( box: Aabb ): void {
		const map = this.Map;
		const margin = this.Range + this.Spacing;
		const [ ox, oy, oz ] = map.Origin;
		const m = map.Size;
		const lo = map.CellOf(
			box[0]! - margin,
			box[1]! - margin,
			box[2]! - margin,
		);
		const hi = map.CellOf(
			box[3]! + margin,
			box[4]! + margin,
			box[5]! + margin,
		);
		const x0 = FMath.Max( lo[0], ox );
		const y0 = FMath.Max( lo[1], oy );
		const z0 = FMath.Max( lo[2], oz );
		const x1 = FMath.Min( hi[0], ox + m - 1 );
		const y1 = FMath.Min( hi[1], oy + m - 1 );
		const z1 = FMath.Min( hi[2], oz + m - 1 );

		for ( let z = z0; z <= z1; z++ ) {
			for ( let y = y0; y <= y1; y++ ) {
				for ( let x = x0; x <= x1; x++ ) {
					const index = map.Index( x, y, z );
					const value = map.Cells[index]!;

					if ( IsBrickCell( value ) ) {
						map.Cells[index] = ( value | CELL_STALE ) >>> 0;
					}
					this._queue.set( index, [ x, y, z ] );
				}
			}
		}
	}

	/**
	 * Recomputes a cell: true if it got a brick, false if it is empty or
	 * solid, null if it needs a brick and the atlas is full.
	 */
	private Rebuild( cell: [ number, number, number ] ): boolean | null {
		const map = this.Map;
		const h = this.Spacing;
		const size = map.CellSize;
		const [ cx, cy, cz ] = cell;
		const x = cx * size;
		const y = cy * size;
		const z = cz * size;
		const range = this.Range;
		// the stored nodes span -1..8 spacings: the region the brick depends on
		const region = CreateAabb(
			x - h - range,
			y - h - range,
			z - h - range,
			x + size + range,
			y + size + range,
			z + size + range,
		);
		const field = this.Field;
		const edits = field.Edits.Candidates( region );
		const Distance = ( px: number, py: number, pz: number ): number => (
			field.Evaluate( edits, px, py, pz )
		);
		// one sample decides most cells: farther than the stored nodes'
		// reach (from the center at node 3.5) plus the range, nothing in it
		// can be within range of the surface
		const reach = 4.5 * h * FMath.SQRT3 + range;
		const center = Distance( x + 3.5 * h, y + 3.5 * h, z + 3.5 * h );
		const kind = center > reach ? BrickClass.Empty
			: center < -reach ? BrickClass.Solid
				: BuildBrick( Distance, x, y, z, h, this._brick );
		const old = map.Get( cx, cy, cz );

		if ( kind !== BrickClass.Surface ) {
			map.Set(
				cx,
				cy,
				cz,
				kind === BrickClass.Empty ? CELL_EMPTY : CELL_SOLID,
			);
			this.RetireCell( old );
			return false;
		}

		const slot = this.Atlas.Allocate();

		if ( slot < 0 ) {
			return null;
		}
		this.Atlas.Write( slot, this._brick );
		map.Set( cx, cy, cz, slot );
		this.RetireCell( old );
		return true;
	}

	private RetireCell( value: number ): void {
		if ( IsBrickCell( value ) ) {
			this.Atlas.Retire( CellSlot( value ) );
		}
	}

	private EyeDistance( cell: [ number, number, number ] ): number {
		const size = this.Map.CellSize;

		return FMath.LengthSq3(
			( cell[0] + 0.5 ) * size - this._eye[0],
			( cell[1] + 0.5 ) * size - this._eye[1],
			( cell[2] + 0.5 ) * size - this._eye[2],
		);
	}
}
