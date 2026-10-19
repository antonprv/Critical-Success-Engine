// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Constants } from "@babylonjs/core/Engines/constants";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import {
	RenderTargetTexture,
} from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Checkerboard rendering of the ray-marched passes (plan.md 21.7, after
 * Decima): each frame marches half the corners of the screen's pixel grid -
 * those whose x + y + parity is even - into a target of a texel a corner
 * ((width / 2 + 1) x (height + 1)), and the parity flips every frame. A
 * pixel on screen (the resolve) is the mean of its two corners of this frame
 * and, where the previous frame's two other corners - reprojected through
 * that frame's camera - saw the same surface, of those too: four samples a
 * pixel from half the rays. No hints at full resolution, no accumulation
 * past two frames (no TAA smear).
 *
 * The two targets take turns: this frame's, the previous frame's. Its owner
 * calls Next once a frame, before the frame renders.
 */
export class SdfCheckerboard {
	/** This frame's corners and the previous frame's, in turn. */
	public readonly Targets: readonly [
		RenderTargetTexture,
		RenderTargetTexture,
	];

	/** Which half of the corners this frame marches (0 or 1). */
	public Parity = 0;

	/**
	 * The previous frame's view-projection, its inverse and camera position.
	 */
	public readonly PreviousViewProjection = Matrix.Identity();

	public readonly PreviousInverse = Matrix.Identity();

	public readonly PreviousCamera = new Vector3();

	/** Whether the previous frame marched corners at all (else: no history). */
	public HasHistory = false;

	/**
	 * The screen in pixels and the camera's projection for it, as this frame
	 * began (inside a target pass Babylon's are the target's).
	 */
	public readonly Screen = { Width: 1, Height: 1 };

	private readonly _projection = Matrix.Identity();

	private readonly _after: Observer<Scene>;

	private _drawn = false;

	/** What the corners are marched with. */
	public readonly March: ShaderMaterial;

	public constructor(
		private readonly _scene: Scene,
		march: ( checker: SdfCheckerboard ) => ShaderMaterial,
	) {
		const make = ( name: string ): RenderTargetTexture => {
			const target = new RenderTargetTexture(
				name,
				this.SizeOf(),
				_scene,
				{
					generateMipMaps: false,
					type: Constants.TEXTURETYPE_FLOAT,
					samplingMode: Texture.NEAREST_SAMPLINGMODE,
					generateDepthBuffer: true,
				},
			);

			// alpha 0: nothing there
			target.clearColor = new Color4( 0, 0, 0, 0 );
			// the screen's view-projection, not one Babylon would fit to the
			// target's shape (half as wide: the corners' rays wouldn't be
			// where their texels rasterize)
			( target as unknown as {
				_objectRenderer: { dontSetTransformationMatrix: boolean; };
			} )._objectRenderer.dontSetTransformationMatrix = true;
			target.onBeforeRenderObservable.add( () => {
				const camera = _scene.activeCamera;

				if ( camera ) {
					_scene.setTransformMatrix(
						camera.getViewMatrix(),
						this._projection,
					);
				}
			} );
			target.renderList = [];
			target.refreshRate = 0;
			_scene.customRenderTargets.push( target );
			return target;
		};

		this.Targets = [ make( "sdfChecker0" ), make( "sdfChecker1" ) ];
		this.March = march( this );
		this._after = _scene.onAfterRenderObservable.add(
			() => this.Remember(),
		);
	}

	/** This frame's corners. */
	public get Current(): RenderTargetTexture {
		return this.Targets[this.Parity]!;
	}

	/** The previous frame's corners. */
	public get Previous(): RenderTargetTexture {
		return this.Targets[1 - this.Parity]!;
	}


	public Dispose(): void {
		this.March.dispose();
		this._scene.onAfterRenderObservable.remove( this._after );

		const targets = this._scene.customRenderTargets;

		for ( const target of this.Targets ) {
			targets.splice( targets.indexOf( target ), 1 );
			target.dispose();
		}
	}

	/**
	 * Before a frame: the other half of the corners, into the other target,
	 * marching these meshes (or, `on` false, nothing: no pass).
	 */
	public Next( meshes: readonly Mesh[], on: boolean ): void {
		const engine = this._scene.getEngine();
		const camera = this._scene.activeCamera;

		this.Parity = 1 - this.Parity;
		this._drawn = on;
		this.Screen.Width = engine.getRenderWidth();
		this.Screen.Height = engine.getRenderHeight();
		if ( camera ) {
			this._projection.copyFrom( camera.getProjectionMatrix() );
		}

		const size = this.SizeOf();

		for ( const target of this.Targets ) {
			const now = target.getSize();

			if ( size.width !== now.width || size.height !== now.height ) {
				target.resize( size );
				this.HasHistory = false;
			}
		}

		const current = this.Current;

		if ( current.renderList!.length !== meshes.length
			|| meshes.some( ( mesh, i ) => current.renderList![i] !== mesh ) ) {
			for ( const target of this.Targets ) {
				target.renderList = [ ...meshes ];
				for ( const mesh of meshes ) {
					target.setMaterialForRendering( mesh, this.March );
				}
			}
		}
		// drawn this frame only: a target Babylon drew once (refresh rate 0)
		// draws again only when its counter is reset (a rate turned back to
		// "every frame" would never come round again)
		if ( on ) {
			current.resetRefreshCounter();
		}
	}

	/** After a frame: its camera, for the next frame's reprojection. */
	private Remember(): void {
		const camera = this._scene.activeCamera;

		this.HasHistory = this._drawn && camera !== null;
		if ( !camera ) {
			return;
		}
		this.PreviousViewProjection.copyFrom(
			this._scene.getTransformMatrix(),
		);
		this.PreviousViewProjection.invertToRef( this.PreviousInverse );
		this.PreviousCamera.copyFrom( camera.globalPosition );
	}

	/** A texel a corner of the pixel grid, half of them. */
	private SizeOf(): { width: number; height: number; } {
		const engine = this._scene.getEngine();

		return {
			width: Math.floor( engine.getRenderWidth() / 2 ) + 1,
			height: engine.getRenderHeight() + 1,
		};
	}
}
