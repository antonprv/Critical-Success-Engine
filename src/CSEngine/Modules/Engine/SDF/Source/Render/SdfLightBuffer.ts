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
import type { LightStart } from "./RaymarchMaterial";

/**
 * The ray-marched passes' shadows and occlusion at a lower resolution
 * (plan.md 21.8 item 6, as Epic's distance field occlusion): a pass at
 * `Resolution` of the screen marches to the hit and keeps there the soft
 * shadow (marched toward the sun) and the occlusion, with how far along the
 * ray. The full-resolution pass still lights each pixel itself (forward) -
 * normal, colour, the sun, the sky, the shadow map - but takes those two
 * factors from the nearest texels that saw the same surface (as deep along
 * their rays), and marches them itself only where none did (an edge, a
 * step in depth).
 */
export class SdfLightBuffer implements LightStart {
	public readonly Target: RenderTargetTexture;

	/** What the buffer is marched and lit with (its owner's, made for it). */
	public readonly Material: ShaderMaterial;

	/**
	 * The screen in pixels as this frame began (inside a target pass
	 * Babylon's is the target's).
	 */
	private readonly _screen = { Width: 1, Height: 1 };

	public constructor(
		private readonly _scene: Scene,
		/** Of the screen's width and height. */
		public readonly Resolution: number,
		material: ( buffer: SdfLightBuffer ) => ShaderMaterial,
	) {
		const target = new RenderTargetTexture(
			"sdfLight",
			this.SizeOf(),
			_scene,
			{
				generateMipMaps: false,
				type: Constants.TEXTURETYPE_FLOAT,
				samplingMode: Texture.NEAREST_SAMPLINGMODE,
				generateDepthBuffer: true,
			},
		);

		// t 0: nothing there
		target.clearColor = new Color4( 1, 1, 0, 0 );
		target.renderList = [];
		target.refreshRate = 0;
		_scene.customRenderTargets.push( target );
		this.Target = target;
		this.Material = material( this );
	}

	/** Buffer texels per screen pixel. */
	public Scale(): [ number, number ] {
		const size = this.Target.getSize();

		return [
			size.width / this._screen.Width,
			size.height / this._screen.Height,
		];
	}

	/** Draws these meshes into the buffer this frame, or nothing. */
	public Draw( meshes: readonly Mesh[], on: boolean ): void {
		const engine = this._scene.getEngine();
		const target = this.Target;
		const size = this.SizeOf();
		const now = target.getSize();

		this._screen.Width = Math.max( 1, engine.getRenderWidth() );
		this._screen.Height = Math.max( 1, engine.getRenderHeight() );

		if ( size.width !== now.width || size.height !== now.height ) {
			target.resize( size );
		}
		if ( target.renderList!.length !== meshes.length
			|| meshes.some( ( mesh, i ) => target.renderList![i] !== mesh ) ) {
			target.renderList = [ ...meshes ];
			for ( const mesh of meshes ) {
				target.setMaterialForRendering( mesh, this.Material );
			}
		}
		// drawn once more this frame (a target Babylon drew once comes round
		// again only when its counter is reset)
		if ( on ) {
			target.resetRefreshCounter();
		}
	}

	public Dispose(): void {
		const targets = this._scene.customRenderTargets;

		targets.splice( targets.indexOf( this.Target ), 1 );
		this.Target.dispose();
		this.Material.dispose();
	}

	private SizeOf(): { width: number; height: number; } {
		const engine = this._scene.getEngine();

		return {
			width: Math.max(
				1,
				Math.ceil( engine.getRenderWidth() * this.Resolution ),
			),
			height: Math.max(
				1,
				Math.ceil( engine.getRenderHeight() * this.Resolution ),
			),
		};
	}
}
