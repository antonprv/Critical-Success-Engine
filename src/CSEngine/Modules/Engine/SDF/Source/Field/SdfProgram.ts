// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	IsCarving,
	IsGlobal,
	SdfEditFlags,
	SdfOp,
	SdfShape,
	type SdfEdit,
} from "../Edits/SdfEdit";
import type { SdfBaseLayer } from "./BaseLayers";

/** Numbers per compiled edit. */
const Stride = 20;

/** Where each number of a compiled edit sits. */
const enum Slot {
	Op = 0,
	Shape = 1,
	/** Position. */
	Px = 2,
	Py = 3,
	Pz = 4,
	/** The conjugate rotation (into the edit's frame). */
	Qx = 5,
	Qy = 6,
	Qz = 7,
	Qw = 8,
	Scale = 9,
	InvScale = 10,
	P0 = 11,
	P1 = 12,
	P2 = 13,
	P3 = 14,
	K = 15,
	Material = 16,
	/** 1 carving, 2 global (intersection), 0 adding. */
	Kind = 17,
}

/**
 * A region's edits compiled for evaluating many points (plan.md 6.2 step 3
 * on the CPU): the edits that take part, in order, packed into one flat
 * array with their rotation already conjugated and their scale inverted, and
 * one loop with the shapes and operations inlined - no calls, no allocation,
 * no lookups per point. What bricks, mesh chunks and the dense grid sample
 * with; SdfField.Evaluate gives the same results one point at a time.
 *
 * A program is a snapshot: compile again after the edits change. The loop
 * calls Math directly (the instructions FMath wraps): it is the module's
 * hottest code, and a call per operation costs more than the operation.
 */
export class SdfProgram {
	private readonly _data: Float64Array;

	private readonly _count: number;

	private _material = 0;

	public constructor(
		edits: readonly SdfEdit[],
		private readonly _base: SdfBaseLayer | null,
	) {
		const live = edits.filter(
			( edit ) => ( edit.Flags & SdfEditFlags.Muted ) === 0,
		);

		this._count = live.length;
		this._data = new Float64Array( live.length * Stride );
		live.forEach( ( edit, index ) => {
			const at = index * Stride;
			const d = this._data;

			d[at + Slot.Op] = edit.Op;
			d[at + Slot.Shape] = edit.Shape;
			d[at + Slot.Px] = edit.Position[0];
			d[at + Slot.Py] = edit.Position[1];
			d[at + Slot.Pz] = edit.Position[2];
			d[at + Slot.Qx] = -edit.Rotation[0];
			d[at + Slot.Qy] = -edit.Rotation[1];
			d[at + Slot.Qz] = -edit.Rotation[2];
			d[at + Slot.Qw] = edit.Rotation[3];
			d[at + Slot.Scale] = edit.Scale;
			d[at + Slot.InvScale] = 1 / edit.Scale;
			d[at + Slot.P0] = edit.Params[0];
			d[at + Slot.P1] = edit.Params[1];
			d[at + Slot.P2] = edit.Params[2];
			d[at + Slot.P3] = edit.Params[3];
			d[at + Slot.K] = edit.SmoothK;
			d[at + Slot.Material] = edit.MaterialId;
			d[at + Slot.Kind] = IsCarving( edit.Op )
				? 1
				: IsGlobal( edit.Op )
					? 2
					: 0;
		} );
	}

	/** Edits taking part (muted ones are left out). */
	public get Count(): number {
		return this._count;
	}

	/** Material at the point of the last Distance. */
	public get LastMaterial(): number {
		return this._material;
	}

	/** Signed distance at a world point. */
	public Distance( x: number, y: number, z: number ): number {
		const data = this._data;
		let d = Infinity;
		let material = 0;

		if ( this._base !== null ) {
			d = this._base.Distance( x, y, z );
			material = this._base.MaterialId;
		}
		for ( let at = 0; at < this._count * Stride; at += Stride ) {
			const e = EditAt( data, at, x, y, z );
			const k = data[at + Slot.K]!;
			let next: number;

			switch ( data[at + Slot.Op]! ) {
				case SdfOp.Union:
					next = d < e ? d : e;
					break;
				case SdfOp.Subtract:
					next = d > -e ? d : -e;
					break;
				case SdfOp.Intersect:
					next = d > e ? d : e;
					break;
				case SdfOp.SmoothUnion:
					next = Smin( d, e, k );
					break;
				case SdfOp.SmoothSubtract:
					next = -Smin( -d, e, k );
					break;
				default:
					next = -Smin( -d, -e, k );
					break;
			}

			const kind = data[at + Slot.Kind]!;

			if ( kind === 1 ? -e > d : kind === 2 ? e > d : e < d ) {
				material = data[at + Slot.Material]!;
			}
			d = next;
		}
		this._material = material;
		return d;
	}
}

/** One compiled edit's distance at a world point. */
function EditAt(
	data: Float64Array,
	at: number,
	x: number,
	y: number,
	z: number,
): number {
	const px = x - data[at + Slot.Px]!;
	const py = y - data[at + Slot.Py]!;
	const pz = z - data[at + Slot.Pz]!;
	const qx = data[at + Slot.Qx]!;
	const qy = data[at + Slot.Qy]!;
	const qz = data[at + Slot.Qz]!;
	const qw = data[at + Slot.Qw]!;
	// v + w t + q x t, t = 2 q x v
	const tx = 2 * ( qy * pz - qz * py );
	const ty = 2 * ( qz * px - qx * pz );
	const tz = 2 * ( qx * py - qy * px );
	const inv = data[at + Slot.InvScale]!;
	const lx = ( px + qw * tx + qy * tz - qz * ty ) * inv;
	const ly = ( py + qw * ty + qz * tx - qx * tz ) * inv;
	const lz = ( pz + qw * tz + qx * ty - qy * tx ) * inv;
	const p0 = data[at + Slot.P0]!;
	const p1 = data[at + Slot.P1]!;
	let d: number;

	switch ( data[at + Slot.Shape]! ) {
		case SdfShape.Sphere:
			d = Math.sqrt( lx * lx + ly * ly + lz * lz ) - p0;
			break;
		case SdfShape.Box:
			d = RoundBox( lx, ly, lz, p0, p1, data[at + Slot.P2]!, 0 );
			break;
		case SdfShape.RoundBox:
			d = RoundBox(
				lx,
				ly,
				lz,
				p0,
				p1,
				data[at + Slot.P2]!,
				data[at + Slot.P3]!,
			);
			break;
		case SdfShape.Capsule: {
			const along = ly < -p0 ? -p0 : ly > p0 ? p0 : ly;
			const dy = ly - along;

			d = Math.sqrt( lx * lx + dy * dy + lz * lz ) - p1;
			break;
		}
		case SdfShape.Torus: {
			const ring = Math.sqrt( lx * lx + lz * lz ) - p0;

			d = Math.sqrt( ring * ring + ly * ly ) - p1;
			break;
		}
		case SdfShape.Cylinder: {
			const dr = Math.sqrt( lx * lx + lz * lz ) - p1;
			const dy = Math.abs( ly ) - p0;
			const ox = dr > 0 ? dr : 0;
			const oy = dy > 0 ? dy : 0;
			const inside = dr > dy ? dr : dy;

			d = ( inside < 0 ? inside : 0 ) + Math.sqrt( ox * ox + oy * oy );
			break;
		}
		default: {
			const rz = data[at + Slot.P2]!;
			const ax = lx / p0;
			const ay = ly / p1;
			const az = lz / rz;
			const bx = ax / p0;
			const by = ay / p1;
			const bz = az / rz;
			const k0 = Math.sqrt( ax * ax + ay * ay + az * az );
			const k1 = Math.sqrt( bx * bx + by * by + bz * bz );

			d = k1 === 0
				? -Math.min( p0, p1, rz )
				: k0 * ( k0 - 1 ) / k1;
			break;
		}
	}
	return d * data[at + Slot.Scale]!;
}

function RoundBox(
	x: number,
	y: number,
	z: number,
	hx: number,
	hy: number,
	hz: number,
	r: number,
): number {
	const qx = Math.abs( x ) - hx + r;
	const qy = Math.abs( y ) - hy + r;
	const qz = Math.abs( z ) - hz + r;
	const ox = qx > 0 ? qx : 0;
	const oy = qy > 0 ? qy : 0;
	const oz = qz > 0 ? qz : 0;
	const inside = Math.max( qx, qy, qz );

	return Math.sqrt( ox * ox + oy * oy + oz * oz )
		+ ( inside < 0 ? inside : 0 ) - r;
}

/** The quadratic smooth minimum (Ops.SmoothMin), inlined here. */
function Smin( a: number, b: number, k: number ): number {
	const gap = a > b ? a - b : b - a;
	const low = a < b ? a : b;

	if ( !( gap < k ) ) {
		return low;
	}

	const h = ( k - gap ) / k;

	return low - h * h * k * 0.25;
}
