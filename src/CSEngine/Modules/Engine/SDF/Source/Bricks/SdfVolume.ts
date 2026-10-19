// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import type { EditWatcher } from "../Edits/EditList";
import type { SdfField } from "../Field/SdfField";
import { CreateAabb, Overlaps, type Aabb } from "../Spatial/Aabb";
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
	CELL_PENDING,
	CELL_SOLID,
	CELL_STALE,
	CellSlot,
	IsBrickCell,
} from "./BrickMap";

/**
 * A map texel's alpha (MapTexels): a brick, a solid cell; below, an empty
 * cell's distance in cells to the nearest one that isn't.
 */
export const MapTexelBrick = 255;

export const MapTexelSolid = 254;

/** The farthest distance an empty cell's texel tells. */
const MapTexelFar = 253;

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
	/**
	 * Keeps each node's materials too (the atlas's Materials), for drawing.
	 * Default false.
	 */
	Materials?: boolean;
	/**
	 * How far from the surface distances are encoded, in spacings. Default
	 * RANGE_SPACINGS (2.5: enough to march and for normals); drawing with
	 * occlusion and soft shadows wants more (they read the field farther
	 * out: 8, as the dense grid).
	 */
	RangeSpacings?: number;
	/**
	 * Only the world inside this box: a cell wholly outside it stays empty
	 * (what lies beyond - a field's far side, the base's own bounds - isn't
	 * sampled). Default: all of it.
	 */
	Bounds?: Aabb;
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

	/**
	 * Grows whenever a cell of the map changes (what follows the map
	 * compares).
	 */
	public Version = 0;

	private readonly _brick = new Uint8Array( BRICK_VOLUME );

	/** How far from the surface distances are encoded, world units. */
	public readonly Range: number;

	/** The only part of the world sampled (SdfVolumeOptions.Bounds). */
	public readonly Bounds: Aabb | null;

	/** The spacing the codec encodes for, so its range is Range. */
	private readonly _unit: number;

	/** The brick's materials, four bytes a node (with Materials). */
	private readonly _materials: Uint8Array | null;

	private readonly _eye: [ number, number, number ] = [ 0, 0, 0 ];

	private readonly _changes: EditWatcher;

	public constructor(
		public readonly Field: SdfField,
		options: SdfVolumeOptions,
	) {
		const size = options.AtlasSize ?? [ 160, 160, 160 ];

		this.Spacing = options.Spacing;
		this.Range = ( options.RangeSpacings ?? RANGE_SPACINGS )
			* options.Spacing;
		this._unit = this.Range / RANGE_SPACINGS;
		this.Bounds = options.Bounds ?? null;
		this.Budget = options.Budget ?? 256;
		this._hysteresis = options.Hysteresis ?? 2;
		this.Map = new BrickMap(
			options.MapSize ?? 32,
			options.Spacing * BRICK_CELLS,
		);
		this.Atlas = new BrickAtlas(
			size[0],
			size[1],
			size[2],
			options.Materials ?? false,
		);
		this._materials = options.Materials
			? new Uint8Array( BRICK_VOLUME * 4 )
			: null;
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
		this.Version++;
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
		if ( stats.Generated > 0 ) {
			this.Version++;
		}
		return stats;
	}

	/**
	 * The map as a texture's texels (RGBA8, toroidal as Cells): a brick's
	 * slot (x, y, z in slots) with alpha MapTexelBrick, a solid cell's
	 * MapTexelSolid, an empty one's distance in cells to the nearest cell
	 * that isn't empty (or the window's edge: beyond it nothing is known),
	 * so a ray crosses empty space in long steps. A pending cell counts as
	 * not empty: nothing is known of it.
	 */
	public MapTexels( out: Uint8Array ): void {
		const map = this.Map;
		const m = map.Size;
		const [ ox, oy, oz ] = map.Origin;
		const [ sx, sy ] = this.Atlas.Slots;
		const far = new Uint8Array( m * m * m );

		// window order (local x fastest), then a chamfer pass each way
		// over the 26 neighbors: the Chebyshev distance in cells
		for ( let z = 0, i = 0; z < m; z++ ) {
			for ( let y = 0; y < m; y++ ) {
				for ( let x = 0; x < m; x++, i++ ) {
					const value = map.Cells[map.Index(
						ox + x,
						oy + y,
						oz + z,
					)]!;

					far[i] = value === CELL_EMPTY ? MapTexelFar : 0;
				}
			}
		}
		Chamfer( far, m, 1 );
		Chamfer( far, m, -1 );
		for ( let z = 0, i = 0; z < m; z++ ) {
			for ( let y = 0; y < m; y++ ) {
				for ( let x = 0; x < m; x++, i++ ) {
					const at = map.Index( ox + x, oy + y, oz + z ) * 4;
					const value = map.Cells[at / 4]!;

					if ( IsBrickCell( value ) ) {
						const slot = CellSlot( value );

						out[at] = slot % sx;
						out[at + 1] = FMath.Floor( slot / sx ) % sy;
						out[at + 2] = FMath.Floor( slot / ( sx * sy ) );
						out[at + 3] = MapTexelBrick;
						continue;
					}
					out[at] = 0;
					out[at + 1] = 0;
					out[at + 2] = 0;
					out[at + 3] = value === CELL_SOLID
						? MapTexelSolid
						: value === CELL_PENDING
							? 0
							: Math.min(
								far[i]!,
								x + 1,
								y + 1,
								z + 1,
								m - x,
								m - y,
								m - z,
							);
				}
			}
		}
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
			this._unit,
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
		const bounds = this.Bounds;

		// wholly outside the bounds: nothing there
		if ( bounds && !Overlaps( bounds, CreateAabb(
			x,
			y,
			z,
			x + size,
			y + size,
			z + size,
		) ) ) {
			this.RetireCell( map.Get( cx, cy, cz ) );
			map.Set( cx, cy, cz, CELL_EMPTY );
			return false;
		}

		const field = this.Field;
		const program = field.Compile( field.Edits.Candidates( region ) );
		const Distance = ( px: number, py: number, pz: number ): number => (
			program.Distance( px, py, pz )
		);
		const materials = this._materials;
		// as DenseSdfGrid keeps them: the pair, then the mix and the layer
		const Sampled = materials
			? ( index: number ): void => {
				const at = index * 4;

				materials[at] = program.LastMaterial & 0xff;
				materials[at + 1] = program.LastMaterialB & 0xff;
				materials[at + 2] = ( Math.round( program.LastMix * 31 ) << 3 )
					| ( program.LastLayer & 7 );
			}
			: null;
		// one sample decides most cells: farther than the stored nodes'
		// reach (from the center at node 3.5) plus the range, nothing in it
		// can be within range of the surface
		const reach = 4.5 * h * FMath.SQRT3 + range;
		const center = Distance( x + 3.5 * h, y + 3.5 * h, z + 3.5 * h );
		const kind = center > reach ? BrickClass.Empty
			: center < -reach ? BrickClass.Solid
				: BuildBrick(
					Distance,
					x,
					y,
					z,
					h,
					this._brick,
					Sampled,
					this._unit,
				);
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
		this.Atlas.Write( slot, this._brick, materials );
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

/**
 * One chamfer pass of the Chebyshev distance over an m^3 grid (x fastest):
 * forward (`way` 1) each cell takes the least of its 13 neighbors before it
 * plus one, backward (-1) of the 13 after it.
 */
function Chamfer( far: Uint8Array, m: number, way: 1 | -1 ): void {
	const first = way > 0 ? 0 : m - 1;
	const end = way > 0 ? m : -1;

	for ( let z = first; z !== end; z += way ) {
		for ( let y = first; y !== end; y += way ) {
			for ( let x = first; x !== end; x += way ) {
				const i = x + ( y + z * m ) * m;
				let best = far[i]!;

				if ( best === 0 ) {
					continue;
				}
				// the neighbors already passed: a step back in z, or in the
				// same z a step back in y, or the one back in x
				for ( let dz = 0; dz <= 1; dz++ ) {
					for ( let dy = -1; dy <= 1; dy++ ) {
						for ( let dx = -1; dx <= 1; dx++ ) {
							if ( dz === 0
								&& ( dy < 0 || ( dy === 0 && dx <= 0 ) ) ) {
								continue;
							}

							const nx = x - dx * way;
							const ny = y - dy * way;
							const nz = z - dz * way;

							if ( nx < 0 || ny < 0 || nz < 0
								|| nx >= m || ny >= m || nz >= m ) {
								continue;
							}
							best = FMath.Min(
								best,
								far[nx + ( ny + nz * m ) * m]! + 1,
							);
						}
					}
				}
				far[i] = best;
			}
		}
	}
}
