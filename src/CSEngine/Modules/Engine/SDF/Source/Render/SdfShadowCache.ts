// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Constants } from "@babylonjs/core/Engines/constants";
import type {
	ShadowGenerator,
} from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import {
	RenderTargetTexture,
} from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowCacheSource } from "./RaymarchMaterial";

/**
 * The ray-marched box's shadow, marched once and kept (as cached shadow
 * maps of static geometry are): marching the box along the sun's rays into
 * the shadow map every frame costs as much as a fifth of a frame, though
 * the map only moves now and then (SdfRenderContext's steady shadows) and
 * the field rarely changes. The box is marched into this target - the
 * shadow map's size, seen as the map sees - only when something the shadow
 * depends on changed and then held for a frame: the map's matrix, bias or
 * depth range, the box, the owner's version (the field uploaded, the
 * dynamic edits, the step). The shadow pass then draws the box reading this
 * target: a texel fetched, not a march, per texel of the map. While it keeps
 * changing (a hole moving), the shadow pass marches as without a cache.
 */
export class SdfShadowCache implements ShadowCacheSource {
	public readonly Target: RenderTargetTexture;

	/** What the box is marched into the cache with. */
	public readonly Store: ShaderMaterial;

	/** Whether the target holds the shadow as the map is now. */
	public Valid = false;

	private readonly _key: number[] = [];

	private readonly _identity = Matrix.Identity();

	public constructor(
		private readonly _scene: Scene,
		private readonly _shadows: ShadowGenerator,
		store: ( cache: SdfShadowCache ) => ShaderMaterial,
	) {
		const target = new RenderTargetTexture(
			"sdfShadowCache",
			this.SizeOf(),
			_scene,
			{
				generateMipMaps: false,
				type: Constants.TEXTURETYPE_FLOAT,
				format: Constants.TEXTUREFORMAT_RG,
				samplingMode: Texture.NEAREST_SAMPLINGMODE,
				generateDepthBuffer: true,
			},
		);

		// depth 1: nothing there
		target.clearColor = new Color4( 1, 0, 0, 0 );
		// the sun's view-projection, as the shadow map's
		( target as unknown as {
			_objectRenderer: { dontSetTransformationMatrix: boolean; };
		} )._objectRenderer.dontSetTransformationMatrix = true;
		target.onBeforeRenderObservable.add( () => {
			_scene.setTransformMatrix(
				this._identity,
				_shadows.getTransformMatrix(),
			);
		} );
		target.renderList = [];
		target.refreshRate = 0;
		_scene.customRenderTargets.push( target );
		this.Target = target;
		this.Store = store( this );
	}

	/**
	 * Before a frame: the frame after anything the meshes' shadow depends
	 * on changed (`version`: the owner's own reasons) and stayed so, marches
	 * them into the cache; until then - and while the store isn't ready -
	 * the shadow pass marches them itself.
	 */
	public Refresh(
		meshes: readonly Mesh[],
		version: readonly number[],
	): void {
		const target = this.Target;
		const size = this.SizeOf();

		if ( size.width !== target.getSize().width ) {
			target.resize( size );
			this._key.length = 0;
		}
		if ( target.renderList!.length !== meshes.length
			|| meshes.some( ( mesh, i ) => target.renderList![i] !== mesh ) ) {
			target.renderList = [ ...meshes ];
			for ( const mesh of meshes ) {
				target.setMaterialForRendering( mesh, this.Store );
			}
			this._key.length = 0;
		}

		const key = this.KeyOf( meshes, version );

		// changed: marched by the shadow pass itself, as long as it keeps
		// changing (a cache filled every frame only costs more)
		if ( key.length !== this._key.length
			|| key.some( ( value, i ) => value !== this._key[i] ) ) {
			this._key.length = 0;
			this._key.push( ...key );
			this.Valid = false;
			return;
		}
		// the same as the frame before: kept from now on (once the store
		// is ready)
		if ( !this.Valid
			&& meshes.every( ( mesh ) => this.Store.isReady( mesh ) ) ) {
			this.Valid = true;
			target.resetRefreshCounter();
		}
	}

	public Dispose(): void {
		const targets = this._scene.customRenderTargets;

		targets.splice( targets.indexOf( this.Target ), 1 );
		this.Target.dispose();
		this.Store.dispose();
	}

	/** All the shadow depends on, as numbers. */
	private KeyOf(
		meshes: readonly Mesh[],
		version: readonly number[],
	): number[] {
		const shadows = this._shadows;
		const light = shadows.getLight();
		const camera = this._scene.activeCamera;
		const key = [
			...shadows.getTransformMatrix().m,
			shadows.bias,
			shadows.normalBias,
			shadows.depthScale,
			light.getDepthMinZ( camera! ),
			light.getDepthMaxZ( camera! ),
			...version,
		];

		for ( const mesh of meshes ) {
			key.push( mesh.isEnabled() ? 1 : 0, ...mesh.getWorldMatrix().m );
		}
		return key;
	}

	/** The shadow map's size. */
	private SizeOf(): { width: number; height: number; } {
		const size = this._shadows.getShadowMap()!.getSize();

		return { width: size.width, height: size.height };
	}
}
