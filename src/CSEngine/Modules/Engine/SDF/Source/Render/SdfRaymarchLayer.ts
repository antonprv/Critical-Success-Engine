// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import { Constants } from "@babylonjs/core/Engines/constants";
import "@babylonjs/core/Engines/Extensions/engine.rawTexture";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { RawTexture3D } from "@babylonjs/core/Materials/Textures/rawTexture3D";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import type { DenseSdfGrid } from "../Bricks/DenseGrid";
import { DefaultPalette } from "./Palette";
import {
	RaymarchFragment,
	RaymarchShaderName,
	RaymarchVertex,
} from "./Shaders";

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
}

/**
 * The SDF world drawn into a Babylon scene by ray marching a dense grid
 * (plan.md 15, M0): a box around the grid whose back faces run the marcher,
 * which writes the hit's depth, so meshes in front of and behind the SDF
 * surface are sorted by the ordinary depth test (plan.md 8.1, variant 1).
 * The sun and sky come from the scene's first directional and hemispheric
 * lights (SyncLights), so both worlds are lit alike (plan.md 8.2).
 */
export class SdfRaymarchLayer {
	public readonly Mesh: Mesh;

	public readonly Material: ShaderMaterial;

	public readonly Texture: RawTexture3D;

	public DebugView = SdfDebugView.Lit;

	public Quality: SdfQuality;

	public StepScale: number;

	private readonly _sunDirection = new Vector3( -0.4, -1, -0.5 );

	private readonly _sunColor = new Color3( 0.7, 0.7, 0.7 );

	private readonly _skyColor = new Color3( 0.65, 0.65, 0.65 );

	private readonly _groundColor = new Color3( 0.16, 0.16, 0.2 );

	private readonly _palette: number[];

	private readonly _refresh: Observer<Scene>;

	public constructor(
		private readonly _scene: Scene,
		public readonly Grid: DenseSdfGrid,
		options: RaymarchLayerOptions = {},
	) {
		const [ nx, ny, nz ] = Grid.Resolution;
		const [ sx, sy, sz ] = Grid.Size;

		this.Quality = options.Quality ?? SdfQuality.Shadows;
		this.StepScale = options.StepScale ?? 0.9;
		this._palette = ( options.Palette ?? DefaultPalette )
			.slice( 0, 8 )
			.flatMap( ( color ) => [ color.r, color.g, color.b ] );
		while ( this._palette.length < 24 ) {
			this._palette.push( 1, 1, 1 );
		}

		Effect.ShadersStore[`${ RaymarchShaderName }VertexShader`] =
			RaymarchVertex;
		Effect.ShadersStore[`${ RaymarchShaderName }FragmentShader`]
			= RaymarchFragment;

		this.Texture = new RawTexture3D(
			Grid.Data,
			nx,
			ny,
			nz,
			Constants.TEXTUREFORMAT_RG,
			_scene,
			false,
			false,
			Texture.BILINEAR_SAMPLINGMODE,
		);
		this.Texture.wrapU = Texture.CLAMP_ADDRESSMODE;
		this.Texture.wrapV = Texture.CLAMP_ADDRESSMODE;
		this.Texture.wrapR = Texture.CLAMP_ADDRESSMODE;

		this.Material = new ShaderMaterial(
			"sdfRaymarch",
			_scene,
			RaymarchShaderName,
			{
				attributes: [ "position" ],
				uniforms: [
					"world",
					"viewProjection",
					"cameraPosition",
					"boundsMin",
					"boundsSize",
					"volumeSize",
					"range",
					"pixelAngle",
					"stepScale",
					"sunDirection",
					"sunColor",
					"skyColor",
					"groundColor",
					"palette",
					"debugMode",
					"quality",
				],
				samplers: [ "sdfVolume" ],
			},
		);
		// only the far side of the box: one fragment per pixel, also with the
		// camera inside it
		this.Material.backFaceCulling = true;
		this.Material.cullBackFaces = false;
		this.Material.setTexture( "sdfVolume", this.Texture );
		this.Material.setVector3(
			"boundsMin",
			new Vector3( Grid.Min[0], Grid.Min[1], Grid.Min[2] ),
		);
		this.Material.setVector3( "boundsSize", new Vector3( sx, sy, sz ) );
		this.Material.setVector3( "volumeSize", new Vector3( nx, ny, nz ) );
		this.Material.setFloat( "range", Grid.Range );
		this.Material.onBindObservable.add( () => this.Bind() );

		this.Mesh = CreateBox( "sdfVolume", { size: 1 }, _scene );
		this.Mesh.scaling.set( sx, sy, sz );
		this.Mesh.position.set(
			Grid.Min[0] + sx / 2,
			Grid.Min[1] + sy / 2,
			Grid.Min[2] + sz / 2,
		);
		this.Mesh.material = this.Material;
		this.Mesh.isPickable = false;

		this._refresh = _scene.onBeforeRenderObservable.add(
			() => this.Update(),
		);
		this.SyncLights();
	}

	/**
	 * Re-samples what the edits changed and uploads the grid if anything
	 * was; true if it was. Runs before every frame by itself.
	 */
	public Update(): boolean {
		if ( this.Grid.Refresh() === 0 ) {
			return false;
		}
		this.Texture.update( this.Grid.Data );
		return true;
	}

	/** Takes the sun and the sky from the scene's lights. */
	public SyncLights(): void {
		for ( const light of this._scene.lights ) {
			if ( light instanceof DirectionalLight ) {
				this._sunDirection.copyFrom( light.direction );
				this._sunColor.copyFrom(
					light.diffuse.scale( light.intensity ),
				);
			} else if ( light instanceof HemisphericLight ) {
				this._skyColor.copyFrom(
					light.diffuse.scale( light.intensity ),
				);
				this._groundColor.copyFrom(
					light.groundColor.scale( light.intensity ),
				);
			}
		}
	}

	public Dispose(): void {
		this._scene.onBeforeRenderObservable.remove( this._refresh );
		this.Mesh.dispose();
		this.Material.dispose();
		this.Texture.dispose();
		this.Grid.Dispose();
	}

	/** Per-frame uniforms, set as the material is bound. */
	private Bind(): void {
		const material = this.Material;
		const camera = this._scene.activeCamera;
		const height = this._scene.getEngine().getRenderHeight();

		if ( camera ) {
			material.setVector3( "cameraPosition", camera.globalPosition );
			material.setFloat(
				"pixelAngle",
				FMath.FastTan( camera.fov / 2 ) * 2 / FMath.Max( 1, height ),
			);
		}
		material.setFloat( "stepScale", this.StepScale );
		material.setFloat( "debugMode", this.DebugView );
		material.setFloat( "quality", this.Quality );
		material.setVector3( "sunDirection", this._sunDirection );
		material.setColor3( "sunColor", this._sunColor );
		material.setColor3( "skyColor", this._skyColor );
		material.setColor3( "groundColor", this._groundColor );
		material.setArray3( "palette", this._palette );
	}
}
