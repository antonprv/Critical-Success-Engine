// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	LayerIndex,
	SdfEditFlags,
	SdfShape,
	type SdfEdit,
} from "../Edits/SdfEdit";
import type { SdfBaseLayer } from "./BaseLayers";
import { FieldState } from "./FieldState";
import { RoundCone, ShapeRadius } from "./Shapes";

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
	/** Index of the edit's layer. */
	Layer = 17,
	/** Its mask (the layers it merges with). */
	Mask = 18,
	/** The world radius the edit changes anything within (shape and blend). */
	Bound = 19,
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

	private readonly _state = new FieldState();

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
			d[at + Slot.Layer] = LayerIndex( edit.Layer );
			d[at + Slot.Mask] = edit.Mask;
			d[at + Slot.Bound] = ShapeRadius(
				edit.Shape,
				edit.Params,
			) * edit.Scale
				+ edit.SmoothK;
		} );
	}

	/** Edits taking part (muted ones are left out). */
	public get Count(): number {
		return this._count;
	}

	/** Material at the point of the last Distance (the first of its pair). */
	public get LastMaterial(): number {
		return this._state.Material;
	}

	/** The second material there and its share (0..1): where two fade. */
	public get LastMaterialB(): number {
		return this._state.MaterialB;
	}

	public get LastMix(): number {
		return this._state.Mix;
	}

	/** The layer of the surface nearest there. */
	public get LastLayer(): number {
		return this._state.Layer;
	}

	/** Signed distance at a world point. */
	public Distance( x: number, y: number, z: number ): number {
		const data = this._data;
		const state = this._state;

		state.Reset();
		if ( this._base !== null ) {
			const base = this._base;
			const d = base.Distance( x, y, z );

			state.SetBase(
				d,
				base.LayerIndex ?? 0,
				base.MaterialId,
				base.MaterialB ?? base.MaterialId,
				base.MaterialMix ?? 0,
			);
		}
		for ( let at = 0; at < this._count * Stride; at += Stride ) {
			const dx = x - data[at + Slot.Px]!;
			const dy = y - data[at + Slot.Py]!;
			const dz = z - data[at + Slot.Pz]!;

			// too far to change this point: its shape isn't evaluated
			if ( !state.Reaches(
				data[at + Slot.Op]!,
				data[at + Slot.Layer]!,
				data[at + Slot.Mask]!,
				Math.sqrt(
					dx * dx + dy * dy + dz * dz,
				) - data[at + Slot.Bound]!,
			) ) {
				continue;
			}
			state.Apply(
				data[at + Slot.Op]!,
				data[at + Slot.Layer]!,
				data[at + Slot.Mask]!,
				EditAt( data, at, x, y, z ),
				data[at + Slot.K]!,
				data[at + Slot.Material]!,
			);
		}
		return state.Result();
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
		case SdfShape.RoundCone:
			d = RoundCone( lx, ly, lz, p0, p1, data[at + Slot.P2]! );
			break;
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
