// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import { TexelBytes } from "../Bricks/DenseGrid";
import { ALL_LAYERS } from "../Edits/SdfEdit";
import type { SdfVolumeData } from "../Render/SdfVolumeTexture";

/** A field of splat grass, as a scene asks for it. */
export interface SdfGrassOptions {
	/** The area it covers: min x, min z, max x, max z. */
	Bounds: [ number, number, number, number ];
	/** Blades per square metre. Default 8. */
	Density?: number;
	/** A blade's height and width. Defaults 0.35 and 0.04. */
	Height?: number;
	Width?: number;
	/**
	 * Materials it grows on (the ground's; not on a pit's dirt). Default [0].
	 */
	OnMaterials?: number[];
	/** Colour of the tips and of the roots (linear). */
	Color?: [ number, number, number ];
	RootColor?: [ number, number, number ];
	/**
	 * Its layer and the layers it merges with, as an edit's: where its mask
	 * has the ground's layer the roots fade into the ground's colour (the
	 * grass grows out of it); else they keep their own (a hard seam).
	 * Defaults 1 and all.
	 */
	Layer?: number;
	Mask?: number;
	/** Seconds a flattened blade takes to stand up again. Default 2.5. */
	Recover?: number;
	/** Wind: how far the tips sway (radians). Default 0.15. */
	Wind?: number;
	/**
	 * Within this distance of the camera every blade is drawn; farther, a
	 * share falling with the distance squared (at least a sixth). Default 12.
	 */
	LodDistance?: number;
	/** Texels of the flattening map along each side. Default 128. */
	TrampleTexels?: number;
	Seed?: number;
}

/** The surface found under a point: height, material pair, layer. */
export interface GroundSample {
	Y: number;
	Material: number;
	MaterialB: number;
	Mix: number;
	Layer: number;
}

/**
 * The grass itself, without a renderer: where its blades stand (scattered
 * over the SDF world's surface, read from the volume the renderer has) and
 * how flat each patch is pressed - a map that what rolls or walks over the
 * grass stamps (Press) and that recovers over time (Recover). SdfGrassLayer
 * draws it.
 */
export class GrassField {
	public readonly Density: number;

	public readonly Height: number;

	public readonly Width: number;

	public readonly OnMaterials: ReadonlySet<number>;

	public readonly Color: [ number, number, number ];

	public readonly RootColor: [ number, number, number ];

	public readonly Layer: number;

	public readonly Mask: number;

	public readonly Recovery: number;

	public readonly Wind: number;

	public readonly LodDistance: number;

	public readonly Bounds: Readonly<[ number, number, number, number ]>;

	/** Texels of the flattening map along each side. */
	public readonly Texels: number;

	/**
	 * Per blade: root x, y, z, yaw, scale, phase (0..1), then the ground's
	 * material pair and mix and whether the root fades into it (1) or not.
	 */
	public Blades = new Float32Array( 0 );

	/** Floats per blade in Blades. */
	public static readonly Stride = 10;

	/** Per texel: direction x, z it is pressed to and how flat (0..1). */
	public readonly Trample: Float32Array;

	/** Per texel: the ground's height under it (NaN: no grass there). */
	public readonly Ground: Float32Array;

	private readonly _seed: number;

	public constructor( options: SdfGrassOptions ) {
		this.Bounds = [ ...options.Bounds ];
		this.Density = options.Density ?? 8;
		this.Height = options.Height ?? 0.35;
		this.Width = options.Width ?? 0.04;
		this.OnMaterials = new Set( options.OnMaterials ?? [ 0 ] );
		this.Color = options.Color ?? [ 0.28, 0.6, 0.18 ];
		this.RootColor = options.RootColor ?? [ 0.12, 0.26, 0.08 ];
		this.Layer = options.Layer ?? 1;
		this.Mask = options.Mask ?? ALL_LAYERS;
		this.Recovery = options.Recover ?? 2.5;
		this.Wind = options.Wind ?? 0.15;
		this.LodDistance = options.LodDistance ?? 12;
		this.Texels = options.TrampleTexels ?? 128;
		this._seed = options.Seed ?? 1;
		this.Trample = new Float32Array( this.Texels * this.Texels * 3 );
		this.Ground = new Float32Array( this.Texels * this.Texels ).fill( NaN );
	}

	/** Blades standing now. */
	public get Count(): number {
		return this.Blades.length / GrassField.Stride;
	}

	/**
	 * Scatters the blades over the volume's surface: a jittered grid of the
	 * density; a blade stands where the surface under it is of one of
	 * OnMaterials. Again after the volume changed (a pit dug: none in it).
	 */
	public Scatter( volume: SdfVolumeData ): number {
		const [ x0, z0, x1, z1 ] = this.Bounds;
		const step = 1 / FMath.Sqrt( this.Density );
		const nx = FMath.Max( 1, FMath.Floor( ( x1 - x0 ) / step ) );
		const nz = FMath.Max( 1, FMath.Floor( ( z1 - z0 ) / step ) );
		const blades: number[] = [];

		for ( let j = 0; j < nz; j++ ) {
			for ( let i = 0; i < nx; i++ ) {
				const r1 = Hash( i, j, this._seed );
				const r2 = Hash( i, j, this._seed + 1 );
				const x = x0 + ( i + r1 ) * step;
				const z = z0 + ( j + r2 ) * step;
				const ground = SurfaceAt( volume, x, z );

				if ( !ground || !this.OnMaterials.has( ground.Material ) ) {
					continue;
				}

				const merges = ( this.Mask & ( 1 << ground.Layer ) ) !== 0;

				blades.push(
					x,
					ground.Y,
					z,
					Hash( i, j, this._seed + 2 ) * Math.PI * 2,
					0.7 + 0.6 * Hash( i, j, this._seed + 3 ),
					Hash( i, j, this._seed + 4 ),
					ground.Material,
					ground.MaterialB,
					ground.Mix,
					merges ? 1 : 0,
				);
			}
		}
		this.Blades = Float32Array.from( blades );
		this.MapGround( volume );
		return this.Count;
	}

	/**
	 * A sphere over the grass presses it: the blades its slice at the
	 * grass's height covers (and a little around) lie down, away from its
	 * center, as flat as it sinks into them.
	 */
	public Press( x: number, y: number, z: number, radius: number ): void {
		const [ x0, z0, x1, z1 ] = this.Bounds;
		const n = this.Texels;
		const sx = ( x1 - x0 ) / n;
		const sz = ( z1 - z0 ) / n;
		const reach = radius + this.Height * 0.5;
		const i0 = FMath.Max( 0, FMath.Floor( ( x - reach - x0 ) / sx ) );
		const i1 = FMath.Min( n - 1, FMath.Floor( ( x + reach - x0 ) / sx ) );
		const j0 = FMath.Max( 0, FMath.Floor( ( z - reach - z0 ) / sz ) );
		const j1 = FMath.Min( n - 1, FMath.Floor( ( z + reach - z0 ) / sz ) );

		for ( let j = j0; j <= j1; j++ ) {
			for ( let i = i0; i <= i1; i++ ) {
				const ground = this.Ground[i + j * n]!;

				// no grass there, or the sphere passes over it
				if ( Number.isNaN( ground )
					|| y - radius > ground + this.Height ) {
					continue;
				}

				const cx = x0 + ( i + 0.5 ) * sx;
				const cz = z0 + ( j + 0.5 ) * sz;
				const dx = cx - x;
				const dz = cz - z;
				const d = FMath.Sqrt( dx * dx + dz * dz );
				// the sphere's slice half way up the blades, and the blades
				// leaning into it from around
				const mid = ground + this.Height * 0.5 - y;
				const slice = FMath.Sqrt(
					FMath.Max( 0, radius * radius - mid * mid ),
				);
				const edge = slice + this.Height * 0.5;

				if ( d >= edge ) {
					continue;
				}

				// as flat as the sphere is deep in the grass, fading at the
				// edge
				const depth = FMath.Clamp01(
					( ground + this.Height - ( y - radius ) ) / this.Height,
				);
				const flat = depth * FMath.Clamp01(
					( edge - d ) / ( this.Height * 0.5 + 1e-6 ),
				);
				const at = ( i + j * n ) * 3;

				if ( flat <= this.Trample[at + 2]! ) {
					continue;
				}
				// lying away from where it was pressed
				if ( d > 1e-4 ) {
					this.Trample[at] = dx / d;
					this.Trample[at + 1] = dz / d;
				}
				this.Trample[at + 2] = flat;
			}
		}
	}

	/** Pressed blades stand up again over Recover seconds. */
	public Recover( dt: number ): void {
		const keep = Math.exp( -dt / this.Recovery );
		const trample = this.Trample;

		for ( let at = 2; at < trample.length; at += 3 ) {
			trample[at] = trample[at]! * keep;
		}
	}

	/** How flat the grass is at a point (0 standing, 1 lying). */
	public FlatAt( x: number, z: number ): number {
		const [ x0, z0, x1, z1 ] = this.Bounds;
		const n = this.Texels;
		const i = FMath.Floor( ( x - x0 ) / ( x1 - x0 ) * n );
		const j = FMath.Floor( ( z - z0 ) / ( z1 - z0 ) * n );

		return i < 0 || j < 0 || i >= n || j >= n
			? 0
			: this.Trample[( i + j * n ) * 3 + 2]!;
	}

	/**
	 * The flattening map as RGBA bytes: direction x, z (0.5 centered),
	 * flatness.
	 */
	public Encode( out: Uint8Array ): void {
		const trample = this.Trample;

		for ( let t = 0, at = 0; at < trample.length; t += 4, at += 3 ) {
			out[t] = FMath.Round( ( trample[at]! * 0.5 + 0.5 ) * 255 );
			out[t + 1] = FMath.Round( ( trample[at + 1]! * 0.5 + 0.5 ) * 255 );
			out[t + 2] = FMath.Round( trample[at + 2]! * 255 );
			out[t + 3] = 255;
		}
	}

	/** The ground's height under each texel of the map where grass grows. */
	private MapGround( volume: SdfVolumeData ): void {
		const [ x0, z0, x1, z1 ] = this.Bounds;
		const n = this.Texels;

		for ( let j = 0; j < n; j++ ) {
			for ( let i = 0; i < n; i++ ) {
				const ground = SurfaceAt(
					volume,
					x0 + ( i + 0.5 ) * ( x1 - x0 ) / n,
					z0 + ( j + 0.5 ) * ( z1 - z0 ) / n,
				);

				this.Ground[i + j * n] = ground
					&& this.OnMaterials.has( ground.Material )
					? ground.Y
					: NaN;
			}
		}
	}
}

/**
 * The highest surface under a point of a volume: where its column first
 * crosses from outside to inside, between the two texels; null where it
 * doesn't (outside the volume, or no surface).
 */
export function SurfaceAt(
	volume: SdfVolumeData,
	x: number,
	z: number,
): GroundSample | null {
	const [ nx, ny, nz ] = volume.Resolution;
	const h = volume.Spacing;
	const i = FMath.Floor( ( x - volume.Min[0] ) / h );
	const k = FMath.Floor( ( z - volume.Min[2] ) / h );

	if ( i < 0 || k < 0 || i >= nx || k >= nz ) {
		return null;
	}

	const Distance = ( j: number ): number => (
		volume.Data[( i + j * nx + k * nx * ny ) * TexelBytes]! / 255 - 0.5
	) * 2 * volume.Range;
	let above = Distance( ny - 1 );

	for ( let j = ny - 2; j >= 0; j-- ) {
		const d = Distance( j );

		if ( above > 0 && d <= 0 ) {
			// texel j's center sits at min + (j + 0.5) h
			const y = volume.Min[1] + ( j + 0.5 + d / ( d - above ) ) * h;
			// the material of the texel just above the surface (where it shows)
			const at = ( i + ( j + 1 ) * nx + k * nx * ny ) * TexelBytes;
			const packed = volume.Data[at + 3]!;

			return {
				Y: y,
				Material: volume.Data[at + 1]!,
				MaterialB: volume.Data[at + 2]!,
				Mix: ( packed >> 3 ) / 31,
				Layer: packed & 7,
			};
		}
		above = d;
	}
	return null;
}

/** A repeatable random number in [0, 1) for a grid cell and a seed. */
function Hash( i: number, j: number, seed: number ): number {
	let h = Math.imul( i, 0x27d4eb2d )
		^ Math.imul( j, 0x165667b1 )
		^ Math.imul( seed, 0x9e3779b9 );

	h = Math.imul( h ^ ( h >>> 15 ), 0x85ebca6b );
	h = Math.imul( h ^ ( h >>> 13 ), 0xc2b2ae35 );
	return ( ( h ^ ( h >>> 16 ) ) >>> 0 ) / 4294967296;
}
