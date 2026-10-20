// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Material } from "@babylonjs/core/Materials/material";
import type {
	MaterialDefines,
} from "@babylonjs/core/Materials/materialDefines";
import {
	MaterialPluginBase,
} from "@babylonjs/core/Materials/materialPluginBase";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { Scene } from "@babylonjs/core/scene";
import {
	DynamicDeclarations,
	DynamicFunctions,
	OccluderDeclarations,
	OccluderFunctions,
	ShapeFunctions,
	VolumeDeclarations,
	VolumeFunctions,
	VolumeSampler,
} from "./SdfGlsl";
import type { SdfRenderContext } from "./SdfRenderContext";

/** What the plugin adds to a material (bit set). */
export const enum SdfMaterialFeatures {
	None = 0,
	/** Darkened where the SDF world is near (the volume's occlusion). */
	VolumeOcclusion = 1,
	/** Darkened by the spheres standing for meshes. */
	Occluders = 2,
	/**
	 * Cut where the dynamic edits change the world: the mesh tier's chunks,
	 * whose holes the proxies draw.
	 */
	Carve = 4,
}

/**
 * The SDF world's part in an ordinary Babylon material (Standard or PBR):
 * the meshes drawn with it are occluded by the SDF world and by each other,
 * and the mesh tier's chunks are cut where the dynamic edits change the
 * world. The values come from the scene's SdfRenderContext at every bind.
 */
export class SdfMaterialPlugin extends MaterialPluginBase {
	public static readonly Name = "CseSdf";

	private readonly _pbr: boolean;

	public constructor(
		material: Material,
		private readonly _context: SdfRenderContext,
		public readonly Features: SdfMaterialFeatures,
	) {
		super( material, SdfMaterialPlugin.Name, 300, {
			SDF_PLUGIN: false,
			SDF_VOLUME_AO: false,
			SDF_OCCLUDERS: false,
			SDF_CARVE: false,
			SDF_CARVE_VOLUME: false,
			SDF_SHADE: false,
			SDF_BRICKS: false,
		}, true, false );
		this._pbr = material instanceof PBRBaseMaterial;
		// hardBindForSubMesh is one of the extra events: asked for before
		// the plugin is enabled (that is when its events are registered)
		this.registerForExtraEvents = true;
		this.doNotSerialize = true;
		this._enable( true );
	}

	/** The plugin of a material, if it has one. */
	public static Of( material: Material ): SdfMaterialPlugin | null {
		const plugin = material.pluginManager?.getPlugin(
			SdfMaterialPlugin.Name,
		);

		return plugin instanceof SdfMaterialPlugin ? plugin : null;
	}

	public override getClassName(): string {
		return "SdfMaterialPlugin";
	}

	public override prepareDefines( defines: MaterialDefines ): void {
		// a formula's field the meshes' shaders don't read (yet): no volume
		const volume = this._context.Volume !== null
			&& !this._context.Volume.Formula;
		const ao = volume
			&& ( this.Features & SdfMaterialFeatures.VolumeOcclusion ) !== 0;
		const occluders = ( this.Features & SdfMaterialFeatures.Occluders )
			!== 0;
		const carve = ( this.Features & SdfMaterialFeatures.Carve ) !== 0;

		defines["SDF_VOLUME_AO"] = ao;
		defines["SDF_OCCLUDERS"] = occluders;
		defines["SDF_CARVE"] = carve;
		defines["SDF_CARVE_VOLUME"] = carve && volume;
		defines["SDF_SHADE"] = ao || occluders;
		defines["SDF_PLUGIN"] = ao || occluders || carve;
		defines["SDF_BRICKS"] = !!this._context.Volume?.Bricks;
	}

	public override getSamplers( samplers: string[] ): void {
		samplers.push( "sdfVolume", "sdfVolumeMaterials", "sdfBrickMap" );
	}

	public override getUniforms(): { externalUniforms: string[]; } {
		return {
			externalUniforms: [
				"sdfDynamic",
				"sdfDynamicCount",
				"sdfDynamicLayered",
				"sdfOccluders",
				"sdfOccluderCount",
				"sdfBoundsMin",
				"sdfBoundsSize",
				"sdfVolumeSize",
				"sdfRange",
				"sdfBrickInfo",
				"sdfBrickMapSize",
				"sdfAo",
				"sdfCarveThreshold",
				"sdfMeshEdits",
			],
		};
	}

	public override hardBindForSubMesh(
		_uniformBuffer: UniformBuffer,
		_scene: Scene,
		_engine: AbstractEngine,
		subMesh: SubMesh,
	): void {
		const effect = subMesh.effect;

		if ( effect ) {
			this._context.BindTo( effect );
			// the edits near this mesh: its shaders loop over those alone
			effect.setFloat(
				"sdfMeshEdits",
				this._context.EditsNear( subMesh.getMesh() ),
			);
		}
	}


	public override getCustomCode(
		shaderType: string,
	): Record<string, string> | null {
		if ( shaderType === "vertex" ) {
			return {
				CUSTOM_VERTEX_DEFINITIONS: `
#ifdef SDF_SHADE
varying float vSdfVisible;
// the dynamic edits near the mesh, a bit each (a float: exact to 2^24)
uniform float sdfMeshEdits;
${ OcclusionCode }
#endif
`,
				CUSTOM_VERTEX_MAIN_END: `
#ifdef SDF_SHADE
	cseEdits = int( sdfMeshEdits );
#ifdef NORMAL
	vSdfVisible = cseSdfVisible( vPositionW, vNormalW );
#else
	vSdfVisible = 1.0;
#endif
#endif
`,
			};
		}
		if ( shaderType !== "fragment" ) {
			return null;
		}

		const out = this._pbr ? "finalColor" : "color";

		return {
			CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef SDF_SHADE
varying float vSdfVisible;
#endif
#ifdef SDF_CARVE
${ DynamicDeclarations }
${ ShapeFunctions }
#ifdef SDF_CARVE_VOLUME
// the surface's layer (what a dynamic edit's mask is checked against)
#define SDF_LAYER_LOOKUP
precision highp sampler3D;
${ VolumeSampler }
${ VolumeDeclarations }
${ VolumeFunctions }
#endif
${ DynamicFunctions }
uniform float sdfCarveThreshold;
uniform float sdfMeshEdits;
#endif
`,
			CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef SDF_CARVE
	cseEdits = int( sdfMeshEdits );
	if ( cseSdfDynamicDistance( vPositionW, 0.0 ) > sdfCarveThreshold ) {
		discard;
	}
#endif
`,
			CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef SDF_SHADE
	${ out }.rgb *= vSdfVisible;
#endif
`,
		};
	}
}

/**
 * How much light the SDF world and the occluder spheres leave a vertex: per
 * vertex, as the chunks' own occlusion is (a pixel's worth would cost a
 * loop over every sphere and several volume samples on every pixel).
 */
const OcclusionCode = /* glsl */ `
${ DynamicDeclarations }
${ ShapeFunctions }
#ifdef SDF_VOLUME_AO
#define SDF_LAYER_LOOKUP
precision highp sampler3D;
${ VolumeSampler }
${ VolumeDeclarations }
${ VolumeFunctions }
#endif
${ DynamicFunctions }
#ifdef SDF_VOLUME_AO
// strength, first step
uniform vec2 sdfAo;

// two probes along the normal, one and three steps out: the near one finds
// contact, the far one a wall or a hollow around (a texel fetch in a vertex
// shader is dear on a weak GPU: two, not the four the ray marcher takes)
float cseSdfVolumeOcclusion( vec3 p, vec3 n ) {
	vec3 near = p + n * sdfAo.y;
	vec3 far = p + n * ( 3.0 * sdfAo.y );
	float dNear = cseSdfDynamicDistance( near, cseSdfVolume( near ) );
	float dFar = cseSdfDynamicDistance( far, cseSdfVolume( far ) );
	float occlusion = clamp( ( sdfAo.y - dNear ) / sdfAo.y, 0.0, 1.0 )
		+ 0.5 * clamp( ( 3.0 * sdfAo.y - dFar ) / ( 3.0 * sdfAo.y ), 0.0, 1.0 );

	return 1.0 - sdfAo.x * occlusion / 1.5;
}
#endif
#ifdef SDF_OCCLUDERS
${ OccluderDeclarations }
${ OccluderFunctions }
#endif

float cseSdfVisible( vec3 p, vec3 n ) {
	float visible = 1.0;

#ifdef SDF_VOLUME_AO
	visible *= cseSdfVolumeOcclusion( p, n );
#endif
#ifdef SDF_OCCLUDERS
	visible *= cseSdfOccluders( p, n );
#endif
	return visible;
}
`;
