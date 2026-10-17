// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import type { EditWatcher } from "../Edits/EditList";
import type { SdfField } from "../Field/SdfField";
import { Expanded, type Aabb } from "../Spatial/Aabb";
import { EncodeDistance, RANGE_SPACINGS } from "./BrickCodec";

/**
 * A dense grid of the field over one box (plan.md 15, M0): two bytes per
 * texel, the distance (R8, as the bricks encode it, but with a wider range
 * so rays take long steps through empty space) and the material id (G8).
 * Texel i sits at the center of cell i, so the hardware filter reads it at
 * uvw = (p - min) / size with no half-texel offset. An edit re-samples only
 * the texels within its reach.
 *
 * The prototype the bricks replace: simple and exact, but its memory grows
 * with the cube of the resolution.
 */
export class DenseSdfGrid {
	/** Texels along each axis. */
	public readonly Resolution: Readonly<[ number, number, number ]>;

	/** World size of a texel. */
	public readonly Spacing: number;

	/** Lowest corner and size of the covered box (whole texels). */
	public readonly Min: Readonly<[ number, number, number ]>;

	public readonly Size: Readonly<[ number, number, number ]>;

	/** Distance, material per texel; x fastest. */
	public readonly Data: Uint8Array;

	/** Encoded range in texels on each side of the surface. */
	public readonly RangeSpacings: number;

	private readonly _changes: EditWatcher;

	/**
	 * @param texels Texels along the box's longest axis; the others get as
	 * many as fit the same spacing.
	 */
	public constructor(
		public readonly Field: SdfField,
		bounds: Aabb,
		texels: number,
		rangeSpacings = 8,
	) {
		const sx = bounds[3]! - bounds[0]!;
		const sy = bounds[4]! - bounds[1]!;
		const sz = bounds[5]! - bounds[2]!;
		const h = FMath.Max( sx, FMath.Max( sy, sz ) ) / texels;
		const nx = FMath.Max( 1, FMath.Ceil( sx / h - 1e-9 ) );
		const ny = FMath.Max( 1, FMath.Ceil( sy / h - 1e-9 ) );
		const nz = FMath.Max( 1, FMath.Ceil( sz / h - 1e-9 ) );

		this.Spacing = h;
		this.RangeSpacings = rangeSpacings;
		this.Resolution = [ nx, ny, nz ];
		this.Min = [ bounds[0]!, bounds[1]!, bounds[2]! ];
		this.Size = [ nx * h, ny * h, nz * h ];
		this.Data = new Uint8Array( nx * ny * nz * 2 );
		this._changes = Field.Edits.Watch();
		this.Sample( 0, 0, 0, nx - 1, ny - 1, nz - 1 );
	}

	/** World distance a byte of 0 or 255 stands for. */
	public get Range(): number {
		return this.RangeSpacings * this.Spacing;
	}

	/**
	 * Re-samples what the edits changed since the last call; returns how
	 * many texels were written (0: nothing to upload).
	 */
	public Refresh(): number {
		let written = 0;

		for ( const box of this._changes.Take() ) {
			written += this.SampleBox(
				Expanded( box, this.Range + this.Spacing ),
			);
		}
		return written;
	}

	/** Stops following the edit list. */
	public Dispose(): void {
		this._changes.Stop();
	}

	/** Re-samples the texels inside a world box; returns how many. */
	private SampleBox( box: Aabb ): number {
		const [ nx, ny, nz ] = this.Resolution;
		const Lo = ( axis: number ): number => FMath.Max(
			0,
			FMath.Ceil( ( box[axis]! - this.Min[axis]! ) / this.Spacing - 0.5 ),
		);
		const Hi = ( axis: number, n: number ): number => FMath.Min(
			n - 1,
			FMath.Floor(
				( box[axis + 3]! - this.Min[axis]! ) / this.Spacing - 0.5,
			),
		);

		return this.Sample(
			Lo( 0 ),
			Lo( 1 ),
			Lo( 2 ),
			Hi( 0, nx ),
			Hi( 1, ny ),
			Hi( 2, nz ),
		);
	}

	private Sample(
		x0: number,
		y0: number,
		z0: number,
		x1: number,
		y1: number,
		z1: number,
	): number {
		if ( x0 > x1 || y0 > y1 || z0 > z1 ) {
			return 0;
		}

		const h = this.Spacing;
		const [ mx, my, mz ] = this.Min;
		const [ nx, ny ] = this.Resolution;
		const range = this.Range;
		const field = this.Field;
		// the edits that reach this part, within the encoded range
		const program = field.Compile(
			field.Edits.Candidates( Expanded( Float64Array.of(
				mx + x0 * h,
				my + y0 * h,
				mz + z0 * h,
				mx + ( x1 + 1 ) * h,
				my + ( y1 + 1 ) * h,
				mz + ( z1 + 1 ) * h,
			), range ) ),
		);
		// EncodeDistance clamps at RANGE_SPACINGS spacings: scale the
		// spacing so the clamp lands at this grid's range
		const unit = range / RANGE_SPACINGS;

		for ( let z = z0; z <= z1; z++ ) {
			const wz = mz + ( z + 0.5 ) * h;

			for ( let y = y0; y <= y1; y++ ) {
				const wy = my + ( y + 0.5 ) * h;
				let at = ( x0 + y * nx + z * nx * ny ) * 2;

				for ( let x = x0; x <= x1; x++ ) {
					const d = program.Distance( mx + ( x + 0.5 ) * h, wy, wz );

					this.Data[at] = EncodeDistance( d, unit );
					this.Data[at + 1] = program.LastMaterial & 0xff;
					at += 2;
				}
			}
		}
		return ( x1 - x0 + 1 ) * ( y1 - y0 + 1 ) * ( z1 - z0 + 1 );
	}
}
