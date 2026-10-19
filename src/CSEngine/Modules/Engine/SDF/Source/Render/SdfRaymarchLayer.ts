// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { DenseSdfGrid } from "../Bricks/DenseGrid";
import type { SdfVolume } from "../Bricks/SdfVolume";
import { DefaultPalette, PaletteFloats } from "./Palette";
import { SdfCheckerboard } from "./SdfCheckerboard";
import { SdfConeMarch } from "./SdfConeMarch";
import { SdfBrickTexture } from "./SdfBrickTexture";
import { SdfLightBuffer } from "./SdfLightBuffer";
import {
	CreateCasterMaterial,
	CreateRaymarchMaterial,
	type RaymarchSettings,
} from "./RaymarchMaterial";
import { SdfRenderContext } from "./SdfRenderContext";
import { SdfShadowCache } from "./SdfShadowCache";
import { SdfVolumeTexture } from "./SdfVolumeTexture";

/** What the ray-marched layer shows. */
export const enum SdfDebugView {
	Lit = 0,
	Normals = 1,
	/** Steps per pixel: blue few, red many (plan.md 7.7). */
	Steps = 2,
	/** Distance bands around the surface. */
	Distance = 3,
}

/** How much the lighting costs. */
export const enum SdfQuality {
	Plain = 0,
	/** Ambient occlusion from the field. */
	Occlusion = 1,
	/** Also soft shadows from the sun, marched through the field. */
	Shadows = 2,
}

export interface RaymarchLayerOptions {
	/** Colors of material ids 0..7 (linear). */
	Palette?: readonly Color3[];
	Quality?: SdfQuality;
	/** Shrinks steps where distances are bounds, not exact. Default 0.9. */
	StepScale?: number;
	/**
	 * What the layer shares with the scene's meshes (shadows, dynamic edits,
	 * occlusion); by default a context of its own, disposed with it.
	 */
	Context?: SdfRenderContext;
	/**
	 * The cone march the rays start from (plan.md 20.1): its tiles in
	 * pixels, by default one level of 8 (none: from the box). The empty
	 * space before a surface is crossed once a tile.
	 */
	ConeTiles?: readonly number[];
	/**
	 * Marched with the checkerboard (plan.md 21.7, SdfCheckerboard): half the
	 * rays a frame. Default on (where the GPU draws into float targets).
	 */
	Checkerboard?: boolean;
	/**
	 * The soft shadows and occlusion marched at this fraction of the
	 * screen's width and height (plan.md 21.8 item 6, SdfLightBuffer); 0:
	 * every pixel marches its own. Default 0.5.
	 */
	LightResolution?: number;
	/**
	 * The box's shadow marched once and kept while nothing it depends on
	 * changes (SdfShadowCache). Default on (with the context's shadows,
	 * where the GPU draws into float targets).
	 */
	ShadowCache?: boolean;
}

/**
 * The SDF world drawn into a Babylon scene by ray marching a dense grid
 * (plan.md 15, M0): a box around the grid whose back faces run the marcher,
 * which writes the hit's depth, so meshes in front of and behind the SDF
 * surface are sorted by the ordinary depth test (plan.md 8.1, variant 1).
 * The context's dynamic edits are applied on the GPU, the meshes and the
 * SDF shadow each other through the sun's shadow map, and both are occluded
 * by each other (plan.md 8.2-8.3).
 */
export class SdfRaymarchLayer {
	public readonly Mesh: Mesh;

	public readonly Material: ShaderMaterial;

	/** The grid's texture, or the bricks' map and atlases. */
	public readonly Volume: SdfVolumeTexture | SdfBrickTexture;

	public readonly Context: SdfRenderContext;

	public readonly Cone: SdfConeMarch | null = null;

	public readonly Checker: SdfCheckerboard | null = null;

	public readonly Light: SdfLightBuffer | null = null;

	public readonly ShadowCache: SdfShadowCache | null = null;

	/** Bumped as the grid is uploaded: the cached shadow is old. */
	private _uploads = 0;

	private readonly _settings: RaymarchSettings;

	private readonly _ownContext: boolean;

	private readonly _refresh: Observer<Scene>;

	private readonly _drawn: Observer<Scene>;

	/**
	 * @param Grid The world sampled: a dense grid over its box, or bricks
	 * (plan.md 5: memory only near the surface; the box drawn is the map's
	 * window as it is now, built so far as its budget allows each frame).
	 */
	public constructor(
		private readonly _scene: Scene,
		public readonly Grid: DenseSdfGrid | SdfVolume,
		options: RaymarchLayerOptions = {},
	) {
		this.Volume = Grid instanceof DenseSdfGrid
			? SdfVolumeTexture.FromGrid( _scene, Grid )
			: new SdfBrickTexture( _scene, Grid );

		const [ sx, sy, sz ] = this.Volume.Size;
		const [ mx, my, mz ] = this.Volume.Min;

		this._ownContext = !options.Context;
		this.Context = options.Context ?? new SdfRenderContext( _scene );
		this._settings = {
			DebugView: SdfDebugView.Lit,
			Quality: options.Quality ?? SdfQuality.Shadows,
			StepScale: options.StepScale ?? 0.9,
			ProxyThreshold: 0,
			Palette: PaletteFloats( options.Palette ?? DefaultPalette ),
		};
		this.Context.Volume = this.Volume;
		const tiles = options.ConeTiles ?? [ 8 ];

		if ( tiles.length > 0 && SdfConeMarch.Supported( _scene ) ) {
			this.Cone = new SdfConeMarch(
				_scene,
				this.Context,
				this._settings,
				false,
				tiles,
			);
		}
		const start = this.Cone?.Start ?? null;
		const resolution = options.LightResolution ?? 0.5;

		// before the corners: they read it
		if ( resolution > 0 && SdfConeMarch.Supported( _scene ) ) {
			this.Light = new SdfLightBuffer(
				_scene,
				resolution,
				( buffer ) => CreateRaymarchMaterial(
					_scene,
					this.Context,
					this._settings,
					false,
					{ Stage: "light", Target: () => buffer.Target },
					start,
				),
			);
		}

		const light = this.Light;

		// float targets for the corners, as for the cones
		if ( ( options.Checkerboard ?? true )
			&& SdfConeMarch.Supported( _scene ) ) {
			this.Checker = new SdfCheckerboard(
				_scene,
				( checker ) => CreateRaymarchMaterial(
					_scene,
					this.Context,
					this._settings,
					false,
					{ Stage: "checker", Checker: () => checker },
					start,
					light,
				),
			);
		}

		const checker = this.Checker;
		const shadows = this.Context.Shadows;

		if ( shadows && ( options.ShadowCache ?? true )
			&& SdfConeMarch.Supported( _scene ) ) {
			this.ShadowCache = new SdfShadowCache(
				_scene,
				shadows,
				() => CreateCasterMaterial(
					_scene,
					this.Context,
					this._settings,
					false,
					{ Store: true },
				),
			);
		}
		this.Material = CreateRaymarchMaterial(
			_scene,
			this.Context,
			this._settings,
			false,
			checker ? { Stage: "resolve", Checker: () => checker } : null,
			checker ? null : start,
			checker ? null : light,
			this.ShadowCache,
		);

		this.Mesh = CreateBox( "sdfVolume", { size: 1 }, _scene );
		this.Mesh.scaling.set( sx, sy, sz );
		this.Mesh.position.set( mx + sx / 2, my + sy / 2, mz + sz / 2 );
		this.Mesh.material = this.Material;
		this.Mesh.isPickable = false;
		this.Context.Own( this.Mesh, true, false );

		this._refresh = _scene.onBeforeRenderObservable.add(
			() => this.Update(),
		);
		// the bricks replaced this frame give their slots back once drawn
		this._drawn = _scene.onAfterRenderObservable.add(
			() => this.Bricks?.EndFrame(),
		);
	}

	/** The bricks, when the world is sampled into them. */
	public get Bricks(): SdfVolume | null {
		return this.Grid instanceof DenseSdfGrid ? null : this.Grid;
	}

	/** The volume's 3D texture. */
	public get Texture(): SdfVolumeTexture["Texture"]
		| SdfBrickTexture["Texture"] {
		return this.Volume.Texture;
	}

	public get DebugView(): SdfDebugView {
		return this._settings.DebugView;
	}

	public set DebugView( view: SdfDebugView ) {
		this._settings.DebugView = view;
	}

	public get Quality(): SdfQuality {
		return this._settings.Quality;
	}

	public set Quality( quality: SdfQuality ) {
		this._settings.Quality = quality;
	}

	public get StepScale(): number {
		return this._settings.StepScale;
	}

	public set StepScale( scale: number ) {
		this._settings.StepScale = scale;
	}

	/**
	 * Re-samples what the edits changed and uploads the grid if anything
	 * was (bricks: rebuilds within their budget and sends what changed);
	 * true if it was. Runs before every frame by itself. The dynamic edits
	 * never come here: the GPU applies them.
	 */
	public Update(): boolean {
		this.Cone?.Draw( [ this.Mesh ], this.Mesh.isEnabled() );
		this.Light?.Draw( [ this.Mesh ], this.Mesh.isEnabled() );
		this.Checker?.Next( [ this.Mesh ], this.Mesh.isEnabled() );

		const grid = this.Grid;
		let uploaded: boolean;

		if ( grid instanceof DenseSdfGrid ) {
			uploaded = grid.Refresh() !== 0;
			if ( uploaded ) {
				( this.Volume as SdfVolumeTexture )
					.Update( grid.Data, ...grid.Written );
			}
		} else {
			grid.Update();
			uploaded = ( this.Volume as SdfBrickTexture ).Update();
		}
		if ( uploaded ) {
			this._uploads++;
		}
		this.ShadowCache?.Refresh( [ this.Mesh ], [
			this._uploads,
			this.Context.Dynamic.Version,
			this._settings.StepScale,
		] );
		return uploaded;
	}

	/** Takes the sun and the sky from the scene's lights. */
	public SyncLights(): void {
		this.Context.SyncLights();
	}

	public Dispose(): void {
		this._scene.onBeforeRenderObservable.remove( this._refresh );
		this._scene.onAfterRenderObservable.remove( this._drawn );
		if ( this.Context.Volume === this.Volume ) {
			this.Context.Volume = null;
		}
		this.Mesh.dispose();
		this.Material.dispose();
		this.Cone?.Dispose();
		this.Checker?.Dispose();
		this.Light?.Dispose();
		this.ShadowCache?.Dispose();
		this.Volume.Dispose();
		this.Grid.Dispose();
		if ( this._ownContext ) {
			this.Context.Dispose();
		}
	}
}
