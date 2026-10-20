// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Constants } from "@babylonjs/core/Engines/constants";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import {
	RenderTargetTexture,
} from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { FrameSize } from "./FrameSize";
import {
	type ConeStart,
	ConeSpread,
	CreateRaymarchMaterial,
	type RaymarchSettings,
} from "./RaymarchMaterial";
import type { SdfRenderContext } from "./SdfRenderContext";

/** A level of the cone march: its tile, target and material. */
export interface ConeLevel {
	/** Screen pixels a texel of it spans, across and down. */
	readonly Tile: number;
	readonly Target: RenderTargetTexture;
	readonly Material: ShaderMaterial;
}

/**
 * Cone marching (plan.md 20.1): before the ray-marched meshes are drawn on
 * screen, they are drawn into targets of coarser and coarser tiles (16, 8, 4
 * pixels...) - coarsest first - where a texel marches one cone around all
 * the rays of its tile, from where its parent's cone stopped, until the cone
 * touches a surface. The screen pass starts each ray there: the empty space
 * before a surface is crossed once per tile, not once per pixel; where the
 * cone met nothing, the pixel is done without a step. A texel holds how far
 * along the rays (0: unknown - start where the box begins). Every pixel
 * still finds its own hit at full resolution: the picture doesn't change.
 *
 * Draws that overlap (the hulls) keep the nearest start in a texel (the
 * depth test), safe for all of them: no ray starts past its own surface.
 * It needs float render targets (Supported): a half float rounds a start
 * past the surface.
 */
export class SdfConeMarch {
	/** Coarsest first. */
	public readonly Levels: readonly ConeLevel[];

	/** What the screen pass reads: the finest level's starts. */
	public readonly Start: ConeStart;

	/** Whether the GPU draws into float targets: else no cone march. */
	public static Supported( scene: Scene ): boolean {
		return scene.getEngine().getCaps().textureFloatRender;
	}

	public constructor(
		private readonly _scene: Scene,
		context: SdfRenderContext,
		settings: RaymarchSettings,
		proxy: boolean,
		tiles: readonly number[],
	) {
		const levels: ConeLevel[] = [];
		const sorted = [ ...tiles ].sort( ( a, b ) => b - a );

		for ( const tile of sorted ) {
			const target = new RenderTargetTexture(
				`sdfCone${ tile }`,
				this.SizeOf( tile ),
				_scene,
				{
					generateMipMaps: false,
					type: Constants.TEXTURETYPE_FLOAT,
					format: Constants.TEXTUREFORMAT_RED,
					samplingMode: Texture.NEAREST_SAMPLINGMODE,
					generateDepthBuffer: true,
				},
			);
			const parent = levels.at( -1 );

			// 0: nothing known
			target.clearColor = new Color4( 0, 0, 0, 0 );
			target.renderList = [];
			target.refreshRate = 0;
			_scene.customRenderTargets.push( target );
			levels.push( {
				Tile: tile,
				Target: target,
				Material: CreateRaymarchMaterial(
					_scene,
					context,
					settings,
					proxy,
					{ Stage: "cone", Target: () => target },
					parent ? StartOf( _scene, parent.Target ) : null,
				),
			} );
		}
		this.Levels = levels;
		this.Start = StartOf( _scene, levels.at( -1 )!.Target );
	}

	/** Draws these meshes into every level, or none (nothing to march). */
	public Draw( meshes: readonly Mesh[], on: boolean ): void {
		for ( const level of this.Levels ) {
			const target = level.Target;
			const size = this.SizeOf( level.Tile );
			const now = target.getSize();

			if ( size.width !== now.width || size.height !== now.height ) {
				target.resize( size );
			}
			if ( target.renderList!.length !== meshes.length ) {
				target.renderList = [ ...meshes ];
				for ( const mesh of meshes ) {
					target.setMaterialForRendering( mesh, level.Material );
				}
			}
			// switched back on: drawn again (a target Babylon drew once with
			// rate 0 counts on and never comes round to "every frame" again)
			if ( on
				&& target.refreshRate
					!== RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME ) {
				target.resetRefreshCounter();
			}
			target.refreshRate = on
				? RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME
				: 0;
		}
	}

	public Dispose(): void {
		const targets = this._scene.customRenderTargets;

		for ( const level of this.Levels ) {
			targets.splice( targets.indexOf( level.Target ), 1 );
			level.Target.dispose();
			level.Material.dispose();
		}
	}

	/** A level's size: a texel a tile of the screen. */
	private SizeOf( tile: number ): { width: number; height: number; } {
		const frame = FrameSize( this._scene );

		return {
			width: Math.max( 1, Math.ceil( frame.width / tile ) ),
			height: Math.max( 1, Math.ceil( frame.height / tile ) ),
		};
	}
}

/**
 * A level as what the next pass starts from: its texels per screen pixel,
 * and its cones' radius per unit of distance.
 */
function StartOf( scene: Scene, target: RenderTargetTexture ): ConeStart {
	return {
		Target: () => target,
		Tan: () => {
			const camera = scene.activeCamera;
			const height = target.getSize().height;

			return camera
				? Math.tan( camera.fov / 2 )
					* 2
					/ Math.max( 1, height )
					* ConeSpread
				: 0;
		},
	};
}
