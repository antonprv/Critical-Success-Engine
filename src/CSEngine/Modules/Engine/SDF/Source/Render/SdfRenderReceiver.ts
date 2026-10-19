// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Scene } from "@babylonjs/core/scene";
import type { SdfToRender } from "../Engine/SdfProtocol";
import { SdfMeshLayer, type MeshLayerOptions } from "./SdfMeshLayer";
import { SdfRenderContext } from "./SdfRenderContext";
import { SdfVolumeTexture } from "./SdfVolumeTexture";
import { SdfGrassLayer } from "./SdfGrassLayer";
import { DefaultPalette } from "./Palette";
import type { SdfGrassOptions } from "../Splats/GrassField";

export interface RenderReceiverOptions extends Omit<
	MeshLayerOptions,
	"Context"
> {
	/** Texels along a side of the sun's shadow map. Default 1024. */
	ShadowMapSize?: number;
	/** Shadows where a scene asks for them (false: never). Default true. */
	Shadows?: boolean;
	/** See SdfRenderContextOptions.ShadowHz. Default 120. */
	ShadowHz?: number;
	/** See SdfRenderContextOptions.Occlusion. Default true. */
	Occlusion?: boolean;
}

/**
 * The render worker's end of the SDF worker's port: the chunks it sends,
 * drawn as the mesh tier, and the volume it samples. A scene's "begin" drops
 * the old scene's chunks, and chunks of an older scene still on their way
 * are ignored. A scene with an SDF world gets a render context (the sun's
 * shadows between the world and the meshes, their occlusion, the dynamic
 * edits - SetDynamic - drawn by proxies); a scene without one gets none, so
 * it costs nothing.
 */
export class SdfRenderReceiver {
	private _layer: SdfMeshLayer;

	private _context: SdfRenderContext | null = null;

	private _volume: SdfVolumeTexture | null = null;

	/** The whole volume as last sent (parts come in slices). */
	private _volumeData: Uint8Array | null = null;

	private _grass: SdfGrassLayer | null = null;

	/** The current scene's grass, grown once its volume is in. */
	private _grassOptions: SdfGrassOptions | null = null;

	private _epoch = 0;

	public constructor(
		private readonly _scene: Scene,
		private readonly _options: RenderReceiverOptions = {},
	) {
		this._layer = new SdfMeshLayer( _scene, null, _options );
	}

	public get Layer(): SdfMeshLayer {
		return this._layer;
	}

	/** The current scene's grass, if it has any and its volume came. */
	public get Grass(): SdfGrassLayer | null {
		return this._grass;
	}

	/** The current scene's context (null: it has no SDF world). */
	public get Context(): SdfRenderContext | null {
		return this._context;
	}

	/** Takes a message; true if something to draw changed. */
	public Handle( message: SdfToRender ): boolean {
		if ( message.Type === "begin" ) {
			this._epoch = message.Epoch;
			this.Reset( message.Settings?.Shadows ?? null );
			this._grassOptions = message.Settings?.Grass ?? null;
			return true;
		}
		if ( message.Epoch !== this._epoch ) {
			return false;
		}
		if ( message.Type === "volume" ) {
			const part = message.Volume;
			const [ nx, ny, nz ] = part.Resolution;
			const first = part.First ?? 0;
			const last = first + part.Data.length / ( nx * ny * 4 ) - 1;

			if ( this._volume
				&& this._volumeData
				&& this._volume.Fits( part ) ) {
				// the slices that changed, into the whole volume and the
				// textures
				this._volumeData.set( part.Data, first * nx * ny * 4 );
				this._volume.Update( part.Data, first, last, first );
			} else if ( first === 0 && last === nz - 1 ) {
				this._volume?.Dispose();
				this._volume = new SdfVolumeTexture( this._scene, part );
				this._volumeData = part.Data;
			} else {
				// a part of a volume not had: wait for a whole one
				return false;
			}
			const whole = { ...part, Data: this._volumeData!, First: 0 };

			if ( this._context ) {
				this._context.Volume = this._volume;
				if ( this._grassOptions ) {
					this._grass ??= new SdfGrassLayer(
						this._scene,
						this._context,
						this._grassOptions,
						this._options.Palette ?? DefaultPalette,
					);
					this._grass.Scatter( whole );
				}
			}
			return true;
		}
		this._layer.Apply( {
			Built: message.Built,
			Removed: message.Removed,
			Remaining: 0,
		} );
		return true;
	}

	/**
	 * The game's dynamic edits (SdfDynamicEdits.Packed); false without an
	 * SDF world to apply them to.
	 */
	public SetDynamic( packed: Float32Array ): boolean {
		if ( !this._context ) {
			return false;
		}
		this._context.Dynamic.Load( packed );
		return true;
	}

	public Dispose(): void {
		this._grass?.Dispose();
		this._grass = null;
		this._layer.Dispose();
		this._volume?.Dispose();
		this._volume = null;
		this._volumeData = null;
		this._context?.Dispose();
		this._context = null;
	}

	/** Drops the old scene; `shadows` null: the new one has no SDF world. */
	private Reset( shadows: boolean | null ): void {
		this._grass?.Dispose();
		this._grass = null;
		this._layer.Dispose();
		this._volume?.Dispose();
		this._volume = null;
		this._volumeData = null;
		this._context?.Dispose();
		this._context = shadows === null
			? null
			: new SdfRenderContext( this._scene, {
				Shadows: shadows && ( this._options.Shadows ?? true ),
				Occlusion: this._options.Occlusion ?? true,
				ShadowHz: this._options.ShadowHz ?? 120,
				...this._options.ShadowMapSize === undefined
					? {}
					: { ShadowMapSize: this._options.ShadowMapSize },
			} );
		this._layer = new SdfMeshLayer( this._scene, null, {
			...this._options,
			...this._context ? { Context: this._context } : {},
		} );
	}
}
