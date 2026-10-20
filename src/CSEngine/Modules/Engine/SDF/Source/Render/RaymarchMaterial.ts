// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import type { Effect } from "@babylonjs/core/Materials/effect";
import { Effect as EffectStore } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import {
	ShadowDepthWrapper,
} from "@babylonjs/core/Materials/shadowDepthWrapper";
import type {
	RenderTargetTexture,
} from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { Scene } from "@babylonjs/core/scene";
import { FrameSize } from "./FrameSize";
import type { SdfCheckerboard } from "./SdfCheckerboard";
import type { SdfRenderContext } from "./SdfRenderContext";
import { FormulaMarker } from "./SdfGlsl";
import {
	RaymarchFragment,
	RaymarchShaderName,
	RaymarchVertex,
} from "./Shaders";

/** What a ray-marched material draws, read at every bind. */
export interface RaymarchSettings {
	/** 0 lit, 1 normals, 2 steps, 3 distance bands (SdfDebugView). */
	DebugView: number;
	/** 0 plain, 1 occlusion, 2 also soft shadows (SdfQuality). */
	Quality: number;
	/** Shrinks steps where distances are bounds, not exact. */
	StepScale: number;
	/** Over-relaxes the march's steps (1: none). */
	Relaxation: number;
	/** Proxies: how much the dynamic edits must move the surface. */
	ProxyThreshold: number;
	/** Colors of material ids 0..7, three floats each. */
	readonly Palette: readonly number[];
}

const Uniforms = [
	"world",
	"viewProjection",
	"cameraPosition",
	"marchMin",
	"marchMax",
	"pixelAngle",
	"stepScale",
	"stepRelaxation",
	"sunDirection",
	"sunColor",
	"skyDirection",
	"skyColor",
	"groundColor",
	"palette",
	"debugMode",
	"quality",
	"proxyThreshold",
	"sdfBoundsMin",
	"sdfBoundsSize",
	"sdfVolumeSize",
	"sdfRange",
	"sdfDynamic",
	"sdfDynamicCount",
	"sdfDynamicLayered",
	"sdfOccluders",
	"sdfOccluderCount",
	"sdfLightMatrix",
	"sdfShadowInfo",
	"sdfAo",
	"sdfCarveThreshold",
	"checkerParity",
	"checkerHistory",
	"checkerFrame",
	"screenSize",
	"inverseViewProjection",
	"previousViewProjection",
	"previousInverse",
	"previousCamera",
	"coneStartScale",
	"coneStartTan",
	"lightBufferScale",
	"lightHistory",
	"sdfBrickInfo",
	"sdfBrickMapSize",
	"sdfFormulaParams",
	"sdfFormulaFrame",
	"sdfPointLights",
	"sdfPointCount",
];

/**
 * A cone's radius per unit of distance, in texels of its level: wide enough
 * for everything a finer pass that reads the texel may hit - a finer
 * texel's center falls up to 0.71 texels off its center, and what that one
 * hits lies up to its own cone off its axis (0.55 of these texels; a
 * pixel's, less): 1.26, and a margin.
 */
export const ConeSpread = 1.5;

/**
 * A pass besides the plain one on screen: a level of the cone march
 * (SdfConeMarch: drawn into its target), or the checkerboard's (plan.md
 * 21.7, SdfCheckerboard) - "checker" marches this frame's half of the pixel
 * grid's corners into its target, "resolve" draws the pixels on screen from
 * them and the previous frame's - or the low-resolution shadows and
 * occlusion ("light", SdfLightBuffer). The corners start their rays from
 * the previous frame's (MEMORY_START); with a checkerboard (`Corners`) the
 * light buffer is made after them, from them (LIGHT_CORNERS).
 */
export type PassStage =
	| { Stage: "cone"; Target(): RenderTargetTexture; }
	| {
		Stage: "light";
		Target(): RenderTargetTexture;
		Corners?: () => SdfCheckerboard | null;
		/** What the previous frame's buffer holds, to keep from. */
		Kept?: () => LightKept;
	}
	| {
		Stage: "checker" | "resolve";
		Checker(): SdfCheckerboard;
		/** The corners start from the previous frame's. Default on. */
		Memory?: boolean;
	};

/** The passes that read the checkerboard's corners (CHECKER_CORNERS). */
const CornerReaders = [
	"CHECKER_PASS",
	"CHECKER_RESOLVE",
	"MEMORY_START",
	"LIGHT_CORNERS",
];

/** Where the rays start: a level of the cone march (SdfConeMarch). */
export interface ConeStart {
	Target(): RenderTargetTexture;
	/** Its cones' radius per unit of distance. */
	Tan(): number;
}

/** The light buffer the previous frame drew, and whether it may be kept. */
export interface LightKept {
	readonly Target: RenderTargetTexture;
	readonly HasHistory: boolean;
}

/** Where the soft shadows and occlusion come from: SdfLightBuffer. */
export interface LightStart {
	readonly Target: RenderTargetTexture;
	/** Its texels per screen pixel. */
	Scale(): [ number, number ];
	/** Made after the pass that reads it: the previous frame's. */
	readonly Previous?: boolean;
}

/** Where the shadow pass may find the box's shadow (SdfShadowCache). */
export interface ShadowCacheSource {
	readonly Target: RenderTargetTexture;
	/** Whether it holds the shadow as the map is now (else: marched). */
	readonly Valid: boolean;
}

/**
 * What a caster does: marches into the shadow map (null), marches into a
 * cache in the sun's view (`Store`: its uniforms bound by itself), or casts
 * what the cache keeps (`Cached`, while it's valid).
 */
export type CasterMode =
	| { Store: true; }
	| { Cached: ShadowCacheSource; }
	| null;

// a proxy's few pixels are the dearest: the meshes' spheres don't darken
// them (the chunks around keep their own occlusion); the hulls are drawn
// all at once: their spheres and edits per instance
const HullDefines = [ "PROXY", "DYNAMIC_MASK", "PROXY_INSTANCED" ];

function AttributesOf( proxy: boolean ): string[] {
	return proxy
		? [ "position", "proxySphereInstance", "proxyMaskInstance" ]
		: [ "position" ];
}

/** What every pass of a box binds: the context, the box, the steps. */
function BindCommon(
	effect: Effect,
	mesh: AbstractMesh,
	context: SdfRenderContext,
	settings: RaymarchSettings,
	proxy: boolean,
): void {
	const box = mesh.getBoundingInfo().boundingBox;

	context.BindTo( effect );
	if ( proxy ) {
		// each hull's own sphere bounds its march
		effect.setFloat3( "marchMin", -1e6, -1e6, -1e6 );
		effect.setFloat3( "marchMax", 1e6, 1e6, 1e6 );
	} else {
		effect.setVector3( "marchMin", box.minimumWorld );
		effect.setVector3( "marchMax", box.maximumWorld );
	}
	effect.setFloat( "stepScale", settings.StepScale );
	effect.setFloat( "stepRelaxation", settings.Relaxation );
	effect.setFloat( "proxyThreshold", settings.ProxyThreshold );
}

/**
 * Puts the ray marcher's shaders where Babylon finds them, and returns
 * their name: the plain ones, or - for a formula volume - ones with the
 * formula's GLSL in (a name of their own per formula).
 */
function RegisterShader( context: SdfRenderContext ): string {
	const formula = context.Volume?.Formula;
	const name = formula
		? `${ RaymarchShaderName }F${ formula.Key }`
		: RaymarchShaderName;

	EffectStore.ShadersStore[`${ name }VertexShader`] = RaymarchVertex;
	EffectStore.ShadersStore[`${ name }FragmentShader`] = formula
		? RaymarchFragment.replace( FormulaMarker, formula.Glsl )
		: RaymarchFragment;
	return name;
}

/**
 * A box's shadow caster: marched along the sun's rays into the shadow map
 * (the hit's depth), or into a cache of it, or the cache cast (CasterMode).
 */
export function CreateCasterMaterial(
	scene: Scene,
	context: SdfRenderContext,
	settings: RaymarchSettings,
	proxy: boolean,
	mode: CasterMode = null,
): ShaderMaterial {
	const shader = RegisterShader( context );
	const defines = [ "CASTER", ...proxy ? HullDefines : [] ];
	const store = mode !== null && "Store" in mode;
	const cached = mode !== null && "Cached" in mode ? mode.Cached : null;

	if ( store ) {
		defines.push( "CASTER_STORE" );
	}
	if ( context.Volume?.Bricks ) {
		defines.push( "SDF_BRICKS" );
	}
	if ( context.Volume?.Formula ) {
		defines.push( "SDF_FORMULA" );
	}
	if ( cached ) {
		defines.push( "CASTER_CACHED" );
	}

	const caster = new SdfShaderMaterial(
		store
			? "sdfShadowStore"
			: `${ proxy ? "sdfProxy" : "sdfRaymarch" }Caster`,
		scene,
		shader,
		{
			attributes: AttributesOf( proxy ),
			uniforms: [
				...Uniforms,
				"biasAndScaleSM",
				"depthValuesSM",
				"lightDataSM",
				"casterCached",
			],
			samplers: [
				"sdfVolume",
				"sdfVolumeMaterials",
				"sdfBrickMap",
				"casterCache",
			],
			defines,
		},
		( effect, mesh ) => {
			BindCommon( effect, mesh, context, settings, proxy );
			if ( cached ) {
				effect.setTexture( "casterCache", cached.Target );
				effect.setFloat( "casterCached", cached.Valid ? 1 : 0 );
			}

			const shadows = context.Shadows;

			// drawn by the cache's target, not the shadow generator: what it
			// would bind
			if ( store && shadows ) {
				const light = shadows.getLight();
				const near = light.getDepthMinZ( scene.activeCamera! );

				effect.setFloat3(
					"biasAndScaleSM",
					shadows.bias,
					shadows.normalBias,
					shadows.depthScale,
				);
				effect.setVector3( "lightDataSM", light.getShadowDirection() );
				effect.setFloat2(
					"depthValuesSM",
					near,
					near + light.getDepthMaxZ( scene.activeCamera! ),
				);
			}
		},
	);

	// both sides: the ray starts where it enters the box either way
	caster.backFaceCulling = false;
	return caster;
}

/**
 * A shader material that sets its own uniforms on the effect actually bound
 * - its own, or the shadow generator's copy of it - for the mesh being drawn
 * (a ray-marched box marches that mesh's bounds).
 */
export class SdfShaderMaterial extends ShaderMaterial {
	public constructor(
		name: string,
		scene: Scene,
		shader: string,
		options: ConstructorParameters<typeof ShaderMaterial>[3],
		private readonly _bindTo: (
			effect: Effect,
			mesh: AbstractMesh,
		) => void,
	) {
		super( name, scene, shader, options );
	}

	public override bind(
		world: Matrix,
		mesh?: AbstractMesh,
		effectOverride?: Effect | null,
		subMesh?: SubMesh,
	): void {
		super.bind( world, mesh as Mesh, effectOverride, subMesh );

		const effect = effectOverride ?? this.getEffect();

		if ( effect && mesh ) {
			this._bindTo( effect, mesh );
		}
	}
}


/**
 * The material of a ray-marched box: the whole volume (tier B), or with
 * `proxy` only what the dynamic edits change (over the mesh tier). The box
 * marched is the mesh's own bounding box. With the context's shadows the
 * box also casts, marched along the sun's rays. With `cone` the rays start
 * where that level of the cone march says; with `light` the soft shadows
 * and occlusion come from that buffer where it saw the same surface; with
 * `cache` the box casts what that cache keeps instead of marching each time.
 */
export function CreateRaymarchMaterial(
	scene: Scene,
	context: SdfRenderContext,
	settings: RaymarchSettings,
	proxy: boolean,
	stage: PassStage | null = null,
	cone: ConeStart | null = null,
	light: LightStart | null = null,
	cache: ShadowCacheSource | null = null,
): ShaderMaterial {
	const shader = RegisterShader( context );

	// a proxy's few pixels are the dearest: the meshes' spheres don't
	// darken them (the chunks around keep their own occlusion)
	// the hulls are drawn all at once: their spheres and edits per instance
	const base = proxy ? HullDefines : [];
	const lit = proxy ? HullDefines : [ "OCCLUDERS" ];
	const defines = stage?.Stage === "cone" ? [ ...base, "CONE_PASS" ]
		: stage?.Stage === "light" ? [ ...base, "LIGHT_PASS" ]
			: stage?.Stage === "checker" ? [ ...lit, "CHECKER_PASS" ]
				: stage?.Stage === "resolve" ? [ ...base, "CHECKER_RESOLVE" ]
					: [ ...lit ];
	// what is drawn on screen (and casts)
	const screen = !stage || stage.Stage === "resolve";
	const inverse = Matrix.Identity();
	const attributes = AttributesOf( proxy );

	if ( cone ) {
		defines.push( "CONE_START" );
	}
	if ( stage?.Stage === "checker" && stage.Memory !== false ) {
		defines.push( "MEMORY_START" );
	}
	if ( stage?.Stage === "light" && stage.Corners ) {
		defines.push( "LIGHT_CORNERS" );
	}
	if ( light ) {
		defines.push( "LIGHT_START" );
		if ( light.Previous ) {
			defines.push( "LIGHT_PREVIOUS" );
		}
	}
	// the volume as it is when the material is made (a layer shows its
	// own before making its materials)
	if ( context.Volume?.Bricks ) {
		defines.push( "SDF_BRICKS" );
	}
	if ( context.Volume?.Formula ) {
		defines.push( "SDF_FORMULA" );
	}
	// what reads the checkerboard's corners
	if ( defines.some( ( define ) => CornerReaders.includes( define ) ) ) {
		defines.push( "CHECKER_CORNERS" );
	}
	// a cone pass, the light buffer and the resolve take no shadow map
	if ( context.Shadows && ( !stage || stage.Stage === "checker" ) ) {
		defines.push( "SHADOWMAP" );
	}

	const material = new SdfShaderMaterial(
		proxy ? "sdfProxy" : "sdfRaymarch",
		scene,
		shader,
		{
			attributes,
			uniforms: Uniforms,
			samplers: [
				"sdfVolume",
				"sdfVolumeMaterials",
				"sdfShadowMap",
				"checkerCurrent",
				"checkerPrevious",
				"coneStart",
				"lightBuffer",
				"sdfBrickMap",
			],
			defines,
		},
		( effect, mesh ) => {
			const camera = scene.activeCamera;
			const target = stage?.Stage === "cone" || stage?.Stage === "light"
				? stage.Target()
				: null;
			const checker = stage?.Stage === "checker"
				|| stage?.Stage === "resolve"
				? stage.Checker()
				: stage?.Stage === "light"
					? stage.Corners?.() ?? null
					: null;
			// a cone level's pixels (and the light buffer's) are its target's;
			// the checkerboard's are the screen's (also while it marches into
			// its own target)
			const height = target
				? target.getSize().height
				: checker?.Screen.Height ?? FrameSize( scene ).height;

			BindCommon( effect, mesh, context, settings, proxy );
			if ( camera ) {
				effect.setVector3( "cameraPosition", camera.globalPosition );
				effect.setFloat(
					"pixelAngle",
					FMath.FastTan( camera.fov / 2 )
						* 2
						/ FMath.Max( 1, height ),
				);
			}
			effect.setFloat( "debugMode", settings.DebugView );
			effect.setFloat( "quality", settings.Quality );
			effect.setArray3( "palette", settings.Palette as number[] );
			context.BindLights( effect );
			context.BindShadowMap( effect );
			// (the light buffer: the corners it is made from)
			if ( checker ) {
				scene.getTransformMatrix().invertToRef( inverse );
				effect.setFloat( "checkerParity", checker.Parity );
				effect.setFloat2(
					"screenSize",
					checker.Screen.Width,
					checker.Screen.Height,
				);
				effect.setMatrix( "inverseViewProjection", inverse );
				effect.setTexture( "checkerPrevious", checker.Previous );
				effect.setFloat( "checkerFrame", checker.Frame % 8 );
				effect.setFloat( "checkerHistory", checker.HasHistory ? 1 : 0 );
				effect.setMatrix(
					"previousViewProjection",
					checker.PreviousViewProjection,
				);
				effect.setMatrix( "previousInverse", checker.PreviousInverse );
				effect.setVector3( "previousCamera", checker.PreviousCamera );
				if ( stage?.Stage === "resolve" || stage?.Stage === "light" ) {
					effect.setTexture( "checkerCurrent", checker.Current );
				}
				if ( stage?.Stage === "light" ) {
					const size = stage.Target().getSize();
					const kept = stage.Kept?.();

					if ( kept ) {
						effect.setTexture( "lightBuffer", kept.Target );
						effect.setFloat(
							"lightHistory",
							kept.HasHistory ? 1 : 0,
						);
					}
					effect.setFloat2(
						"lightBufferScale",
						size.width / FMath.Max( 1, checker.Screen.Width ),
						size.height / FMath.Max( 1, checker.Screen.Height ),
					);
				}
			}
			if ( cone ) {
				const start = cone.Target();
				const size = start.getSize();
				// the pixels of this pass: the screen's, or its own target's
				const own = target
					? target.getSize()
					: checker
						? {
							width: checker.Screen.Width,
							height: checker.Screen.Height,
						}
						: FrameSize( scene );

				effect.setTexture( "coneStart", start );
				effect.setFloat2(
					"coneStartScale",
					size.width / FMath.Max( 1, own.width ),
					size.height / FMath.Max( 1, own.height ),
				);
				effect.setFloat( "coneStartTan", cone.Tan() );
			}
			if ( light ) {
				effect.setTexture( "lightBuffer", light.Target );
				effect.setFloat2( "lightBufferScale", ...light.Scale() );
			}
		},
	);

	// only the far side of the box: one fragment per pixel, also with the
	// camera inside it
	material.backFaceCulling = true;
	material.cullBackFaces = false;


	// the screen pass casts (a hull marched into a target casts nothing:
	// the shadow map draws the mesh's own material)
	if ( context.Shadows && screen ) {
		const caster = CreateCasterMaterial(
			scene,
			context,
			settings,
			proxy,
			cache ? { Cached: cache } : null,
		);

		material.shadowDepthWrapper = new ShadowDepthWrapper( caster, scene, {
			standalone: true,
			doNotInjectCode: true,
		} );
		material.onDisposeObservable.add( () => {
			material.shadowDepthWrapper?.dispose();
			caster.dispose();
		} );
	}
	return material;
}
