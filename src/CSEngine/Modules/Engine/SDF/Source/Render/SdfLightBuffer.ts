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
 *
 * With the checkerboard (`Previous`) the buffer is drawn after the corners
 * from their hits (no march of its own) and read by the next frame's
 * corners where they were; while the sun and the world stay (Invalidate)
 * it keeps the previous frame's at the same points, a quarter of its tiles
 * worked out anew each frame (plan.md 21.8: memory over marching).
 */
export class SdfLightBuffer implements LightStart {
	/**
	 * Its targets: one, or (made after its readers, `Previous`) two in
	 * turn - the one drawn this frame and the one the previous frame drew,
	 * read by the corners and kept from where the surface is the same.
	 */
	public readonly Targets: readonly RenderTargetTexture[];

	/** What the buffer is marched and lit with (its owner's, made for it). */
	public readonly Material: ShaderMaterial;

	/**
	 * Whether the previous frame's buffer holds what this frame's may keep
	 * (drawn, and nothing it depends on changed since: Invalidate).
	 */
	public HasHistory = false;

	/**
	 * The screen in pixels as this frame began (inside a target pass
	 * Babylon's is the target's).
	 */
	private readonly _screen = { Width: 1, Height: 1 };

	private _turn = 0;

	private _drawn = false;

	private _valid = false;

	public constructor(
		private readonly _scene: Scene,
		/** Of the screen's width and height. */
		public readonly Resolution: number,
		material: ( buffer: SdfLightBuffer ) => ShaderMaterial,
		/** Made after the pass that reads it (from the checkerboard). */
		public readonly Previous = false,
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

			// t 0: nothing there
			target.clearColor = new Color4( 1, 1, 0, 0 );
			target.renderList = [];
			target.refreshRate = 0;
			_scene.customRenderTargets.push( target );
			return target;
		};

		this.Targets = Previous
			? [ make( "sdfLight0" ), make( "sdfLight1" ) ]
			: [ make( "sdfLight" ) ];
		this.Material = material( this );
	}

	/** What is read: the buffer last drawn (`Previous`), or the one. */
	public get Target(): RenderTargetTexture {
		return this.Targets[( this._turn + 1 ) % this.Targets.length]!;
	}

	/** What this frame draws into. */
	public get Drawn(): RenderTargetTexture {
		return this.Targets[this._turn]!;
	}

	/** Buffer texels per screen pixel. */
	public Scale(): [ number, number ] {
		const size = this.Drawn.getSize();

		return [
			size.width / this._screen.Width,
			size.height / this._screen.Height,
		];
	}

	/**
	 * What the buffer kept no longer holds (the sun turned, the world
	 * changed): the next frame works every texel out anew.
	 */
	public Invalidate(): void {
		this._valid = false;
		this.HasHistory = false;
	}

	/** Draws these meshes into the buffer this frame, or nothing. */
	public Draw( meshes: readonly Mesh[], on: boolean ): void {
		const size = this.SizeOf();
		const frame = FrameSize( this._scene );

		this._turn = ( this._turn + 1 ) % this.Targets.length;
		this.HasHistory = this._drawn && this._valid;
		this._drawn = on;
		this._valid = true;
		this._screen.Width = Math.max( 1, frame.width );
		this._screen.Height = Math.max( 1, frame.height );

		for ( const target of this.Targets ) {
			const now = target.getSize();

			if ( size.width !== now.width || size.height !== now.height ) {
				target.resize( size );
				this.HasHistory = false;
			}
			const list = target.renderList!;

			if ( list.length !== meshes.length
				|| meshes.some( ( mesh, i ) => list[i] !== mesh ) ) {
				target.renderList = [ ...meshes ];
				for ( const mesh of meshes ) {
					target.setMaterialForRendering( mesh, this.Material );
				}
			}
		}
		// drawn once more this frame (a target Babylon drew once comes round
		// again only when its counter is reset)
		if ( on ) {
			this.Drawn.resetRefreshCounter();
		}
	}

	public Dispose(): void {
		const targets = this._scene.customRenderTargets;

		for ( const target of this.Targets ) {
			targets.splice( targets.indexOf( target ), 1 );
			target.dispose();
		}
		this.Material.dispose();
	}

	private SizeOf(): { width: number; height: number; } {
		const frame = FrameSize( this._scene );

		return {
			width: Math.max( 1, Math.ceil( frame.width * this.Resolution ) ),
			height: Math.max( 1, Math.ceil( frame.height * this.Resolution ) ),
		};
	}
}
