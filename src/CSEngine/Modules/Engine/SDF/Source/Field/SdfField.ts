// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import type { EditList } from "../Edits/EditList";
import {
	LayerIndex,
	SdfEditFlags,
	type SdfEdit,
} from "../Edits/SdfEdit";
import type { SdfBaseLayer } from "./BaseLayers";
import { FieldState } from "./FieldState";
import { ShapeDistance } from "./Shapes";
import { SdfProgram } from "./SdfProgram";

/** Where a ray met the surface. */
export interface SdfHit {
	/** Distance along the ray (in units of its direction). */
	T: number;
	Position: [ number, number, number ];
	/** Unit surface normal (the field's gradient). */
	Normal: [ number, number, number ];
	MaterialId: number;
}

/** Sphere tracing gives up after this many steps. */
const MaxSteps = 256;

/**
 * Shrinks every step: smooth operations, the ellipsoid and the terrain only
 * bound the distance (plan.md 7.1, 10.6).
 */
const StepScale = 0.9;

/**
 * The exact field of an edit list on the CPU (plan.md 6.5): distances, normals,
 * material and raycasts for gameplay, the physics and the mesh tier, and the
 * reference the bricks are checked against. Operations apply in the list's
 * order on top of the base layer (L0).
 */
export class SdfField {
	/** The last Evaluate's layers and materials. */
	private readonly _state = new FieldState();

	public constructor(
		public readonly Edits: EditList,
		public Base: SdfBaseLayer | null = null,
	) {
	}

	/** Signed distance at a world point over the whole list. */
	public Distance( x: number, y: number, z: number ): number {
		return this.Evaluate( this.Edits.Edits, x, y, z );
	}

	/**
	 * Signed distance over `edits` only (by Order, e.g. a region's
	 * Candidates): exact wherever no other edit reaches. The reference the
	 * compiled SdfProgram is checked against (both apply edits with
	 * FieldState).
	 */
	public Evaluate(
		edits: readonly SdfEdit[],
		x: number,
		y: number,
		z: number,
	): number {
		const state = this._state;

		state.Reset();
		if ( this.Base ) {
			const base = this.Base;
			const d = base.Distance( x, y, z );

			state.SetBase(
				d,
				base.LayerIndex ?? 0,
				base.MaterialId,
				base.MaterialB ?? base.MaterialId,
				base.MaterialMix ?? 0,
			);
		}
		for ( const edit of edits ) {
			if ( ( edit.Flags & SdfEditFlags.Muted ) !== 0 ) {
				continue;
			}
			state.Apply(
				edit.Op,
				LayerIndex( edit.Layer ),
				edit.Mask,
				EditDistance( edit, x, y, z ),
				edit.SmoothK,
				edit.MaterialId,
			);
		}
		return state.Result();
	}

	/**
	 * `edits` (by Order, e.g. a region's Candidates) and the base compiled
	 * for sampling many points: what bricks and chunks use.
	 */
	public Compile( edits: readonly SdfEdit[] = this.Edits.Edits ): SdfProgram {
		return new SdfProgram( edits, this.Base );
	}

	/** Material at the point of the last Evaluate (or Distance). */
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

	/** Material of the surface nearest to a world point. */
	public MaterialAt( x: number, y: number, z: number ): number {
		return this.MaterialOf( this.Edits.Edits, x, y, z );
	}

	/** Material at a point over `edits` only (see Evaluate). */
	public MaterialOf(
		edits: readonly SdfEdit[],
		x: number,
		y: number,
		z: number,
	): number {
		this.Evaluate( edits, x, y, z );
		return this._state.Material;
	}

	/**
	 * Unit gradient at a point: four samples on a tetrahedron (plan.md 5.7),
	 * `eps` apart. A flat field (no gradient) gives +Y.
	 */
	public Normal(
		x: number,
		y: number,
		z: number,
		eps = 1e-3,
		edits: readonly SdfEdit[] = this.Edits.Edits,
	): [ number, number, number ] {
		const a = this.Evaluate( edits, x + eps, y - eps, z - eps );
		const b = this.Evaluate( edits, x - eps, y - eps, z + eps );
		const c = this.Evaluate( edits, x - eps, y + eps, z - eps );
		const d = this.Evaluate( edits, x + eps, y + eps, z + eps );
		const nx = a - b - c + d;
		const ny = -a - b + c + d;
		const nz = -a + b - c + d;
		const length = FMath.Length3( nx, ny, nz );

		return length > 0
			? [ nx / length, ny / length, nz / length ]
			: [ 0, 1, 0 ];
	}

	/**
	 * Sphere-traces a ray (`dir` need not be unit) up to `tMax` of its units
	 * against the edits its path reaches and the base layer. A ray that starts
	 * inside a solid hits at once.
	 */
	public Raycast(
		origin: Readonly<[ number, number, number ]>,
		dir: Readonly<[ number, number, number ]>,
		tMax: number,
		epsilon = 1e-3,
	): SdfHit | null {
		const length = FMath.Length3( dir[0], dir[1], dir[2] );

		if ( length === 0 ) {
			return null;
		}

		const ux = dir[0] / length;
		const uy = dir[1] / length;
		const uz = dir[2] / length;
		const edits = this.Edits.CandidatesOnRay( origin, dir, tMax );
		const far = tMax * length;
		let t = 0;

		for ( let step = 0; step < MaxSteps && t <= far; step++ ) {
			const x = origin[0] + ux * t;
			const y = origin[1] + uy * t;
			const z = origin[2] + uz * t;
			const d = this.Evaluate( edits, x, y, z );

			if ( d < epsilon ) {
				const material = this._state.Material;

				return {
					T: t / length,
					Position: [ x, y, z ],
					Normal: this.Normal( x, y, z, epsilon, edits ),
					MaterialId: material,
				};
			}
			t += d * StepScale;
		}
		return null;
	}
}

/**
 * One edit's own signed distance at a world point: into its frame (undo the
 * position, the rotation and the uniform scale), the shape's distance, back
 * to world units.
 */
export function EditDistance(
	edit: SdfEdit,
	x: number,
	y: number,
	z: number,
): number {
	const [ qx, qy, qz, qw ] = edit.Rotation;
	const s = edit.Scale;
	const px = x - edit.Position[0];
	const py = y - edit.Position[1];
	const pz = z - edit.Position[2];

	// rotate by the conjugate: v + w t + q x t, t = 2 q x v, q = -xyz
	const tx = 2 * ( -qy * pz + qz * py );
	const ty = 2 * ( -qz * px + qx * pz );
	const tz = 2 * ( -qx * py + qy * px );
	const lx = px + qw * tx + ( -qy * tz + qz * ty );
	const ly = py + qw * ty + ( -qz * tx + qx * tz );
	const lz = pz + qw * tz + ( -qx * ty + qy * tx );

	return ShapeDistance( edit.Shape, edit.Params, lx / s, ly / s, lz / s ) * s;
}
