// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import {
	CreateIcoSphere,
} from "@babylonjs/core/Meshes/Builders/icoSphereBuilder";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { SdfDynamicEdits } from "../Edits/SdfDynamicEdits";
import { IsCarving } from "../Edits/SdfEdit";
import type { Aabb } from "../Spatial/Aabb";
import {
	CreateRaymarchMaterial,
	type RaymarchSettings,
} from "./RaymarchMaterial";
import { SdfCheckerboard } from "./SdfCheckerboard";
import { SdfConeMarch } from "./SdfConeMarch";
import type { SdfRenderContext } from "./SdfRenderContext";

/**
 * An icosphere of two subdivisions (80 faces) lies inside its sphere: its
 * faces are nearer to the center than its corners (0.94 of the radius), so
 * scaled by this, it holds the whole sphere - hardly more pixels than it.
 */
const HullScale = 1.07;

/**
 * The dynamic edits over the mesh tier: the chunks are never remeshed for
 * them - they cut out where the edits change the world (SdfMaterialPlugin,
 * Carve) - and a ray-marched hull around each edit draws the changed surface
 * from the context's volume with the edits applied (plan.md 8.1 variant 1:
 * it writes depth, so it sorts with everything else). A hull is a coarse
 * sphere around the edit's reach, not its box (half the pixels from an
 * angle), and marches only the edits that reach it. The hulls are thin
 * instances of two meshes - what edits add (casting shadows) and what they
 * take away (casting none: the light falls in through the cut chunks) - so
 * however many there are, they are two draws (and one in the shadow map);
 * each instance carries its sphere and its edits. Without a volume there is
 * nothing to march, and the hulls stay hidden.
 */
export class SdfDynamicProxies {
	/**
	 * What the hulls draw on screen with: marching every pixel, or with the
	 * checkerboard, resolving its corners.
	 */
	public readonly Material: ShaderMaterial;

	/**
	 * The checkerboard (plan.md 21.7): half the pixel grid's corners marched
	 * a frame, resolved on screen with the previous frame's (none: every
	 * pixel marched).
	 */
	public readonly Checker: SdfCheckerboard | null = null;

	/**
	 * The cone march the screen pass starts its rays from (none: from the
	 * hulls' spheres).
	 */
	public readonly Cone: SdfConeMarch | null = null;

	/** The hulls of what edits add, and of what they take away. */
	private readonly _batches: [ Batch, Batch ];

	private readonly _update: Observer<Scene>;

	private _hulls: Array<
		{
			Center: [ number, number, number ];
			Radius: number;
			Mask: number;
			Casts: boolean;
		}
	> = [];

	public constructor(
		private readonly _scene: Scene,
		private readonly _context: SdfRenderContext,
		settings: RaymarchSettings,
		checkerboard = false,
		coneTiles: readonly number[] = [],
	) {
		if ( coneTiles.length > 0 && SdfConeMarch.Supported( _scene ) ) {
			this.Cone = new SdfConeMarch(
				_scene,
				_context,
				settings,
				true,
				coneTiles,
			);
		}

		const start = this.Cone?.Start ?? null;

		// float targets for the corners, as for the cones
		if ( checkerboard && SdfConeMarch.Supported( _scene ) ) {
			this.Checker = new SdfCheckerboard(
				_scene,
				( checker ) => CreateRaymarchMaterial(
					_scene,
					_context,
					settings,
					true,
					{
						Stage: "checker",
						Checker: () => checker,
						// never through dynamic edits: a hull is nothing else
						Memory: false,
					},
					start,
				),
			);
		}

		const checker = this.Checker;

		this.Material = CreateRaymarchMaterial(
			_scene,
			_context,
			settings,
			true,
			checker ? { Stage: "resolve", Checker: () => checker } : null,
			checker ? null : start,
		);
		this._batches = [
			this.Batch( "sdfProxy adds" ),
			this.Batch( "sdfProxy cuts" ),
		];
		_context.Shadows?.addShadowCaster( this._batches[0].Mesh, false );
		this._update = _scene.onBeforeRenderObservable.add(
			() => this.Update(),
		);
	}

	/** Hulls shown now. */
	public get Count(): number {
		return this._batches[0].Count + this._batches[1].Count;
	}

	/**
	 * The two meshes the hulls are instances of: what edits add, what they take
	 * away.
	 */
	public get Meshes(): readonly [ Mesh, Mesh ] {
		return [ this._batches[0].Mesh, this._batches[1].Mesh ];
	}

	/**
	 * The hulls shown now, in the edits' order: each its sphere (center,
	 * radius) and the edits it marches, and whether it casts.
	 */
	public get Hulls(): Array<
		{
			Center: [ number, number, number ];
			Radius: number;
			Mask: number;
			Casts: boolean;
		}
	> {
		return this._hulls;
	}

	/** Puts a hull around every bounded dynamic edit; runs every frame. */
	public Update(): void {
		const volume = this._context.Volume;
		const edits = volume ? this._context.Dynamic.Edits : [];
		// as far as an edit reaches: the normals and the occlusion sample
		// the field beyond it, the march needn't
		const reaches = edits.map( ( edit ) => SdfDynamicEdits.Reach( edit ) );
		const [ adds, cuts ] = this._batches;

		adds.Count = 0;
		cuts.Count = 0;
		this._hulls = [];
		reaches.forEach( ( reach, i ) => {
			if ( !reach ) {
				return; // an intersection changes everything: not drawn
			}

			// a hole needs no shadow of its own: the chunks are cut in the
			// shadow map too, and the light falls in; what an edit adds casts,
			// marched along the sun's rays (any shape the field can hold)
			const casts = !IsCarving( edits[i]!.Op );
			const batch = casts ? adds : cuts;
			const radius = ( reach[3]! - reach[0]! ) / 2;
			const center: [ number, number, number ] = [
				( reach[0]! + reach[3]! ) / 2,
				( reach[1]! + reach[4]! ) / 2,
				( reach[2]! + reach[5]! ) / 2,
			];
			const mask = MaskOf( reach, reaches );

			batch.Put( center, radius, mask );
			this._hulls.push(
				{ Center: center, Radius: radius, Mask: mask, Casts: casts },
			);
		} );
		adds.Upload();
		cuts.Upload();
		const used = adds.Count + cuts.Count;

		// nothing to march: no cones, no corners
		this.Cone?.Draw( this.Meshes, used > 0 );
		this.Checker?.Next( this.Meshes, used > 0 );
	}

	public Dispose(): void {
		this._scene.onBeforeRenderObservable.remove( this._update );
		for ( const batch of this._batches ) {
			batch.Mesh.dispose();
		}
		this.Material.dispose();
		this.Checker?.Dispose();
		this.Cone?.Dispose();

	}

	/** A mesh whose thin instances are hulls. */
	private Batch( name: string ): Batch {
		const mesh = CreateIcoSphere(
			name,
			{ radius: 0.5, subdivisions: 2, flat: true },
			this._scene,
		);

		mesh.material = this.Material;
		mesh.isPickable = false;
		// its instances are anywhere: never culled by its own box
		mesh.alwaysSelectAsActiveMesh = true;
		mesh.thinInstanceRegisterAttribute( "proxySphereInstance", 4 );
		mesh.thinInstanceRegisterAttribute( "proxyMaskInstance", 1 );
		this._context.Own( mesh );
		return new Batch( mesh );
	}
}

/**
 * The edits a hull marches: every one whose reach meets its own (itself
 * among them), and every intersection (it reaches everywhere).
 */
function MaskOf( reach: Aabb, reaches: Array<Aabb | null> ): number {
	let mask = 0;

	reaches.forEach( ( other, i ) => {
		if ( !other || other[0]! <= reach[3]! && other[3]! >= reach[0]!
			&& other[1]! <= reach[4]! && other[4]! >= reach[1]!
			&& other[2]! <= reach[5]! && other[5]! >= reach[2]! ) {
			mask |= 1 << i;
		}
	} );
	return mask;
}

/** The hulls of one mesh: its thin instances, filled every frame. */
class Batch {
	public Count = 0;

	private _matrices: Float32Array<ArrayBuffer> = new Float32Array( 16 * 4 );

	private _spheres: Float32Array<ArrayBuffer> = new Float32Array( 4 * 4 );

	private _masks: Float32Array<ArrayBuffer> = new Float32Array( 4 );

	public constructor( public readonly Mesh: Mesh ) {
		this.Mesh.setEnabled( false );
	}

	/** One hull more: a sphere (center, radius), and the edits it marches. */
	public Put(
		center: [ number, number, number ],
		radius: number,
		mask: number,
	): void {
		const i = this.Count++;

		if ( i * 16 >= this._matrices.length ) {
			this._matrices = Grown( this._matrices );
			this._spheres = Grown( this._spheres );
			this._masks = Grown( this._masks );
		}

		const size = 2 * radius * HullScale;

		this._matrices.set(
			[ size, 0, 0, 0, 0, size, 0, 0, 0, 0, size, 0, ...center, 1 ],
			i * 16,
		);
		this._spheres.set( [ ...center, radius ], i * 4 );
		this._masks[i] = mask;
	}

	/** Hands the frame's hulls to the GPU (none: the mesh hidden). */
	public Upload(): void {
		const mesh = this.Mesh;

		mesh.thinInstanceSetBuffer( "matrix", this._matrices, 16, false );
		mesh.thinInstanceSetBuffer(
			"proxySphereInstance",
			this._spheres,
			4,
			false,
		);
		mesh.thinInstanceSetBuffer(
			"proxyMaskInstance",
			this._masks,
			1,
			false,
		);
		mesh.thinInstanceCount = this.Count;
		mesh.setEnabled( this.Count > 0 );
	}
}

/** The same numbers in an array twice as long. */
function Grown( array: Float32Array ): Float32Array<ArrayBuffer> {
	const grown = new Float32Array( array.length * 2 );

	grown.set( array );
	return grown;
}
