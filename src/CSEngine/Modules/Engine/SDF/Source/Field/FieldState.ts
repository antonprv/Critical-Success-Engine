// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { SdfOp } from "../Edits/SdfEdit";

/** Layers an edit or a base can be on (a bit each in Layer and Mask). */
export const LAYER_COUNT = 8;

/**
 * The field at one point while its edits are applied, layer by layer: what
 * SdfField and SdfProgram share, so they agree to the bit.
 *
 * Each layer keeps its own distance and material. An edit's shape belongs to
 * its layer; its operation reaches only the layers of its mask:
 * - a union merges with the nearest of those surfaces - a smooth union blends
 *   it and fades the two materials into each other over SmoothK - and the
 *   result is its layer's; a layer outside the mask isn't merged with: where
 *   they meet there is a hard seam;
 * - a subtraction or an intersection cuts each layer of its mask (smooth ones
 *   with a fillet, the cut's walls fading into its material).
 * The world is the nearest layer, with that layer's material.
 *
 * A material is a pair of ids and how much of the second (0..1): where
 * surfaces blend, both show, so the colours fade instead of switching at a
 * seam. One edit of the default layer and mask on a one-layer world works
 * exactly as before layers.
 */
export class FieldState {
	/** Distance per layer (valid where Used has the layer's bit). */
	public readonly D = new Float64Array( LAYER_COUNT );

	/** Material pair per layer: first id, second id, the second's share. */
	public readonly A = new Uint16Array( LAYER_COUNT );

	public readonly B = new Uint16Array( LAYER_COUNT );

	public readonly T = new Float64Array( LAYER_COUNT );

	/** Layers that hold anything at this point. */
	public Used = 0;

	/** Of the last Result: the nearest layer and its material. */
	public Material = 0;

	public MaterialB = 0;

	public Mix = 0;

	public Layer = 0;

	/** Starts a point: nothing in any layer. */
	public Reset(): void {
		this.Used = 0;
	}

	/** The base (ground, baked layer) at this point, on its layer. */
	public SetBase(
		d: number,
		layer: number,
		a: number,
		b: number,
		t: number,
	): void {
		this.D[layer] = d;
		this.A[layer] = a;
		this.B[layer] = b;
		this.T[layer] = t;
		this.Used |= 1 << layer;
	}

	/**
	 * Applies an edit: its distance `e` here, its operation, its layer (an
	 * index), its mask (a bit set), blend radius and material.
	 */
	public Apply(
		op: SdfOp,
		layer: number,
		mask: number,
		e: number,
		k: number,
		material: number,
	): void {
		if ( op === SdfOp.Union || op === SdfOp.SmoothUnion ) {
			this.Union(
				op === SdfOp.SmoothUnion && k > 0,
				layer,
				mask,
				e,
				k,
				material,
			);
			return;
		}

		const carve = op === SdfOp.Subtract || op === SdfOp.SmoothSubtract;
		const smooth = ( op === SdfOp.SmoothSubtract
			|| op === SdfOp.SmoothIntersect ) && k > 0;
		// what the layer is cut with: the shape's inside, or its outside
		const cut = carve ? -e : e;
		let bits = mask & this.Used;

		while ( bits !== 0 ) {
			const m = 31 - Math.clz32( bits & -bits );
			const d = this.D[m]!;

			bits &= bits - 1;

			let next: number;
			let w: number;

			if ( smooth ) {
				next = -Smin( -d, -cut, k );
				w = Clamp01( 0.5 + 0.5 * ( cut - d ) / k );
			} else {
				next = d > cut ? d : cut;
				w = cut > d ? 1 : 0;
			}
			this.D[m] = next;
			if ( w > 0 ) {
				this.MixInto( m, m, material, w );
			}
		}
	}

	/**
	 * Whether an edit whose distance here is at least `least` + its blend
	 * radius can change anything: false only where Apply would leave every
	 * layer as it is (a union farther than the surfaces it merges with, a cut
	 * outside them), so it may be skipped.
	 */
	public Reaches(
		op: SdfOp,
		layer: number,
		mask: number,
		least: number,
	): boolean {
		if ( op === SdfOp.Intersect || op === SdfOp.SmoothIntersect ) {
			return true;
		}

		let bits = mask & this.Used;
		let near = Infinity;

		while ( bits !== 0 ) {
			const m = 31 - Math.clz32( bits & -bits );

			bits &= bits - 1;
			near = this.D[m]! < near ? this.D[m]! : near;
		}
		if ( op === SdfOp.Union || op === SdfOp.SmoothUnion ) {
			if ( near === Infinity ) {
				// alone on its layer: kept where it is nearer than the layer
				return ( this.Used & ( 1 << layer ) ) === 0
					|| least < this.D[layer]!;
			}
			return least < near;
		}
		// a cut reaches inside the surfaces of its mask
		return least < -near;
	}

	/** The world at this point: the nearest layer (Infinity: nothing). */
	public Result(): number {
		let best = -1;
		let d = Infinity;
		let bits = this.Used;

		while ( bits !== 0 ) {
			const l = 31 - Math.clz32( bits & -bits );

			bits &= bits - 1;
			if ( best < 0 || this.D[l]! < d ) {
				d = this.D[l]!;
				best = l;
			}
		}
		if ( best < 0 ) {
			this.Material = 0;
			this.MaterialB = 0;
			this.Mix = 0;
			this.Layer = 0;
			return Infinity;
		}
		this.Material = this.A[best]!;
		this.MaterialB = this.B[best]!;
		this.Mix = this.T[best]!;
		this.Layer = best;
		return d;
	}

	private Union(
		smooth: boolean,
		layer: number,
		mask: number,
		e: number,
		k: number,
		material: number,
	): void {
		// the surface it merges with: the nearest of its mask's layers
		let s = -1;
		let near = Infinity;
		let bits = mask & this.Used;

		while ( bits !== 0 ) {
			const m = 31 - Math.clz32( bits & -bits );

			bits &= bits - 1;
			if ( s < 0 || this.D[m]! < near ) {
				near = this.D[m]!;
				s = m;
			}
		}

		let u: number;
		let w: number;

		if ( s < 0 ) {
			u = e;
			w = 1;
		} else if ( smooth ) {
			u = Smin( near, e, k );
			w = Clamp01( 0.5 + 0.5 * ( near - e ) / k );
		} else {
			u = near < e ? near : e;
			w = e < near ? 1 : 0;
		}
		// beyond its reach the merged surface is the other one's: not copied
		// into this layer
		if ( s >= 0 && !( u < near ) ) {
			return;
		}

		const bit = 1 << layer;

		if ( ( this.Used & bit ) !== 0 && !( u < this.D[layer]! ) ) {
			return;
		}
		if ( s < 0 ) {
			this.A[layer] = material;
			this.B[layer] = material;
			this.T[layer] = 0;
		} else {
			this.MixInto( layer, s, material, w );
		}
		this.D[layer] = u;
		this.Used |= bit;
	}

	/**
	 * Layer `to` gets layer `from`'s material faded towards `material` by
	 * `w`: of the three ids the two that weigh most.
	 */
	private MixInto(
		to: number,
		from: number,
		material: number,
		w: number,
	): void {
		const a = this.A[from]!;
		const b = this.B[from]!;
		const t = this.T[from]!;
		let wa = ( 1 - w ) * ( 1 - t );
		let wb = ( 1 - w ) * t;
		let wm = w;

		// the same id twice weighs as one
		if ( b === a ) {
			wa += wb;
			wb = 0;
		}
		if ( material === a ) {
			wa += wm;
			wm = 0;
		} else if ( material === b ) {
			wb += wm;
			wm = 0;
		}

		// the heaviest two
		let first = a;
		let firstW = wa;
		let second = b;
		let secondW = wb;

		if ( secondW > firstW ) {
			first = b;
			firstW = wb;
			second = a;
			secondW = wa;
		}
		if ( wm > firstW ) {
			second = first;
			secondW = firstW;
			first = material;
			firstW = wm;
		} else if ( wm > secondW ) {
			second = material;
			secondW = wm;
		}

		const total = firstW + secondW;

		this.A[to] = first;
		this.B[to] = secondW > 0 ? second : first;
		this.T[to] = secondW > 0 && total > 0 ? secondW / total : 0;
	}
}

/** The quadratic smooth minimum (Ops.SmoothMin), inlined here. */
export function Smin( a: number, b: number, k: number ): number {
	const gap = a > b ? a - b : b - a;
	const low = a < b ? a : b;

	if ( !( gap < k ) ) {
		return low;
	}

	const h = ( k - gap ) / k;

	return low - h * h * k * 0.25;
}

function Clamp01( v: number ): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * A material pair as one number (what a mesh vertex keeps): the first id,
 * the second, and the second's share as a byte.
 */
export function PackMaterial( a: number, b: number, mix: number ): number {
	return a + b * 0x10000 + Math.round( mix * 255 ) * 0x100000000;
}

/** First id, second id and the second's share (0..1) of a packed pair. */
export function UnpackMaterial( packed: number ): [ number, number, number ] {
	const mix = Math.floor( packed / 0x100000000 );
	const ids = packed - mix * 0x100000000;

	return [ ids % 0x10000, Math.floor( ids / 0x10000 ), mix / 255 ];
}
