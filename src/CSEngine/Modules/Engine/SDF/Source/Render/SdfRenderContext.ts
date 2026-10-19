// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import type { Effect } from "@babylonjs/core/Materials/effect";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import {
	ShadowGenerator,
} from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import type {
	BaseTexture,
} from "@babylonjs/core/Materials/Textures/baseTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { SdfDynamicEdits } from "../Edits/SdfDynamicEdits";
import type { Aabb } from "../Spatial/Aabb";
import {
	SdfMaterialFeatures,
	SdfMaterialPlugin,
} from "./SdfMaterialPlugin";

/** Spheres standing for meshes in the occlusion (the shaders' array). */
export const MAX_OCCLUDERS = 16;


/**
 * The radius of a mesh's stand-in sphere: the mean of its box's half sizes -
 * exact for a ball, a cube's inscribed sphere (the bounding sphere would
 * reach far past a cube's faces and darken the ground well beyond it).
 */
function MeanHalfSize( half: Vector3 ): number {
	return ( half.x + half.y + half.z ) / 3;
}

/** A refresh rate the shadow map never reaches by itself. */
const NeverRefresh = 0x7fffffff;

/** The sampled world as a 3D texture, where the shaders find it. */
export interface SdfVolumeBinding {
	/** The distance (filtered). */
	Texture: BaseTexture;
	/** Materials, mix and layer per texel (SdfVolumeTexture.Materials). */
	Materials: BaseTexture;
	Min: Readonly<[ number, number, number ]>;
	Size: Readonly<[ number, number, number ]>;
	Resolution: Readonly<[ number, number, number ]>;
	/** World distance of a byte of 0 or 255. */
	Range: number;
	/**
	 * With bricks (SdfBrickTexture): Texture and Materials are the atlases,
	 * this the map over them; the shaders compile with SDF_BRICKS.
	 */
	Bricks?: SdfBrickBinding | null;
}

/** A brick map as the shaders read it (SdfBrickTexture). */
export interface SdfBrickBinding {
	/** RGBA8, a texel a cell (SdfVolume.MapTexels). */
	Map: BaseTexture;
	/** The window's lowest cell, world cells. */
	Origin: Readonly<[ number, number, number ]>;
	CellSize: number;
	/** Cells along the window's edge. */
	MapSize: number;
}

export interface SdfRenderContextOptions {
	/**
	 * The sun's shadow map: meshes and the SDF world shadow each other.
	 * Default true (with a directional light in the scene).
	 */
	Shadows?: boolean;
	/** Texels along a side of the shadow map. Default 1024. */
	ShadowMapSize?: number;
	/**
	 * The shadow map is drawn again at most this many times a second (0:
	 * every frame, the default). At 60 fps a limit of 120 changes nothing;
	 * at 600 the map is drawn every fifth frame, and a moving shadow lags
	 * up to 8 ms - less than a frame of a 120 Hz display.
	 */
	ShadowHz?: number;
	/**
	 * Every mesh added to the scene (but the SDF world's own) casts and
	 * receives shadows and is occluded by the SDF world. Default true.
	 */
	AutoMeshes?: boolean;
	/** Meshes larger than this never stand in as occluder spheres. */
	MaxOccluderRadius?: number;
	/**
	 * The SDF world and the meshes occluding each other (the volume's
	 * occlusion on the meshes, occluder spheres on everything). Default
	 * true.
	 */
	Occlusion?: boolean;
}

/**
 * What the SDF layers of one scene share with each other and with the
 * scene's ordinary meshes (plan.md 8.2-8.3): the dynamic edits, the sampled
 * volume, the sun's shadow map that both worlds cast into and receive from,
 * the lights, and up to MAX_OCCLUDERS spheres standing for the meshes nearest
 * to the camera in the SDF's occlusion. Ordinary meshes get SdfMaterialPlugin
 * (the SDF world occludes them); the SDF's own meshes say so with Own.
 *
 * Update runs before every frame by itself.
 */
export class SdfRenderContext {
	public readonly Dynamic = new SdfDynamicEdits();

	/** The sun's shadow map, if there is a sun and shadows are on. */
	public readonly Shadows: ShadowGenerator | null;

	/** Center and radius of each occluder sphere. */
	public readonly Occluders = new Float32Array( MAX_OCCLUDERS * 4 );

	public OccluderCount = 0;

	/** How dark the SDF world makes the meshes near it (0..1). */
	public AoStrength = 1;

	/** First step of the meshes' occlusion probe, world units. */
	public AoStep = 0.25;

	/** The dynamic edits' reaches (EditsNear), as of a frame and a version. */
	private _reaches: Array<Aabb | null> = [];

	private _reachesAt = -1;

	private _reachesVersion = -1;

	/**
	 * How far the dynamic edits must move a chunk's surface for the chunk
	 * to be cut there (the proxies draw it instead).
	 */
	public CarveThreshold = 0.02;

	public readonly SunDirection = new Vector3( -0.4, -1, -0.5 );

	/** The casters' box the shadow map was last fitted to, with its margin. */
	private _shadowBox: number[] | null = null;

	/** Babylon fits the shadow map this frame: snap it the next. */
	private _shadowFitted = false;

	public readonly SunColor = new Color3( 0.7, 0.7, 0.7 );

	public readonly SkyDirection = new Vector3( 0, 1, 0 );

	public readonly SkyColor = new Color3( 0.65, 0.65, 0.65 );

	public readonly GroundColor = new Color3( 0.16, 0.16, 0.2 );

	private _volume: SdfVolumeBinding | null = null;

	/** The SDF's own meshes: no plugin, no occluder sphere. */
	private readonly _own = new WeakSet<AbstractMesh>();

	/** Ordinary meshes taken in. */
	private readonly _meshes = new Set<AbstractMesh>();

	/** Meshes added to the scene, looked at before the next frame. */
	private _pending: AbstractMesh[] = [];

	private readonly _plugins = new Set<SdfMaterialPlugin>();

	/** Per effect: the frame its uniform arrays were set in. */
	private readonly _arraysBound = new WeakMap<Effect, number>();

	private readonly _maxRadius: number;

	private readonly _occlusion: boolean;

	private readonly _shadowMs: number;

	/** When the shadow map was last asked to be drawn. */
	private _shadowAt = -Infinity;

	private readonly _added: Observer<AbstractMesh> | null;

	private readonly _removed: Observer<AbstractMesh>;

	private readonly _update: Observer<Scene>;

	// the nearest occluders so far: distances, sorted
	private readonly _distances = new Float64Array( MAX_OCCLUDERS );

	public constructor(
		public readonly Scene: Scene,
		options: SdfRenderContextOptions = {},
	) {
		const sun = this.Sun;

		this._maxRadius = options.MaxOccluderRadius ?? 2;
		this._occlusion = options.Occlusion ?? true;
		this._shadowMs = ( options.ShadowHz ?? 0 ) > 0
			? 1000 / options.ShadowHz!
			: 0;
		this.Shadows = sun && ( options.Shadows ?? true )
			? CreateShadows( sun, options.ShadowMapSize ?? 1024 )
			: null;
		if ( this.Shadows && this._shadowMs > 0 ) {
			// drawn when Update asks for it (resetRefreshCounter)
			this.Shadows.getShadowMap()!.refreshRate = NeverRefresh;
		}
		this._added = options.AutoMeshes ?? true
			? Scene.onNewMeshAddedObservable.add(
				( mesh ) => this._pending.push( mesh ),
			)
			: null;
		if ( this._added ) {
			this._pending.push( ...Scene.meshes );
		}
		this._removed = Scene.onMeshRemovedObservable.add(
			( mesh ) => this.Forget( mesh ),
		);
		this._update = Scene.onBeforeRenderObservable.add(
			() => this.Update(),
		);
		this.SyncLights();
	}

	/** The scene's first directional light. */
	public get Sun(): DirectionalLight | null {
		return this.Scene.lights.find(
			( light ) => light instanceof DirectionalLight,
		) as DirectionalLight | undefined ?? null;
	}

	public get Volume(): SdfVolumeBinding | null {
		return this._volume;
	}

	/**
	 * Shows the shaders a volume (null: none); materials recompile when it
	 * comes or goes, or turns to bricks or back.
	 */
	public set Volume( volume: SdfVolumeBinding | null ) {
		const had = this._volume !== null;
		const bricks = !!this._volume?.Bricks;

		this._volume = volume;
		if ( had !== ( volume !== null ) || bricks !== !!volume?.Bricks ) {
			for ( const plugin of this._plugins ) {
				plugin.markAllDefinesAsDirty();
			}
		}
	}

	/** Meshes taken in as ordinary meshes. */
	public get Meshes(): ReadonlySet<AbstractMesh> {
		return this._meshes;
	}

	/**
	 * Marks a mesh as the SDF world's own: never taken in as an ordinary
	 * mesh. `cast`: it goes into the shadow map (its material decides how);
	 * `receive`: Babylon's shadows fall on it.
	 */
	public Own( mesh: AbstractMesh, cast = false, receive = false ): void {
		this._own.add( mesh );
		this.Forget( mesh );
		if ( cast ) {
			this.Shadows?.addShadowCaster( mesh, false );
		}
		mesh.receiveShadows = receive && this.Shadows !== null;
	}

	/**
	 * Takes an ordinary mesh in: it casts and receives shadows, and its
	 * material is occluded by the SDF world and the occluder spheres. Meshes
	 * added to the scene are taken in by themselves (AutoMeshes).
	 */
	public AddMesh( mesh: AbstractMesh ): void {
		if ( this._own.has( mesh ) || this._meshes.has( mesh ) ) {
			return;
		}
		this._meshes.add( mesh );
		this.Shadows?.addShadowCaster( mesh, false );
		mesh.receiveShadows = this.Shadows !== null;
		if ( mesh.material && this._occlusion ) {
			this.Plug(
				mesh.material,
				SdfMaterialFeatures.VolumeOcclusion
					| SdfMaterialFeatures.Occluders,
			);
		}
	}

	/**
	 * Adds the plugin to a material (once; a material that has one keeps
	 * it). The SDF's own materials use it too.
	 */
	public Plug(
		material: NonNullable<AbstractMesh["material"]>,
		features: SdfMaterialFeatures,
	): SdfMaterialPlugin {
		const plugin = SdfMaterialPlugin.Of( material )
			?? new SdfMaterialPlugin(
				material,
				this,
				this._occlusion
					? features
					: features & SdfMaterialFeatures.Carve,
			);

		this._plugins.add( plugin );
		return plugin;
	}

	/**
	 * Before every frame: meshes added meanwhile are taken in, the lights
	 * and the occluder spheres follow the scene.
	 */
	public Update(): void {
		if ( this._pending.length > 0 ) {
			this.TakePending();
		}
		this.SyncLights();
		this.CollectOccluders();
		this.SteadyShadows();
		if ( this.Shadows && this._shadowMs > 0 ) {
			const now = performance.now();

			// a little early rather than a frame late
			if ( now - this._shadowAt >= this._shadowMs * 0.9 ) {
				this._shadowAt = now;
				this.Shadows.getShadowMap()!.resetRefreshCounter();
			}
		}
	}

	/**
	 * Keeps the sun's shadow map where it is while its casters stay inside
	 * the box it was last fitted to (with a margin), instead of fitting it to
	 * them every frame: as chunks of the levels of detail come and go and
	 * bodies move, a map fitted anew slides its texels over the world every
	 * frame, and the acne on every slope crawls (a flicker). When the casters
	 * leave the box, or shrink to under half of it, Babylon fits the map once
	 * more; the frame after, its size is rounded up to a step of 2^(1/4) and
	 * its center to a texel, so the grid stays put across refits too, its
	 * depth range gets a margin for casters moving within the box, and its
	 * normal bias grows with its texels (a wide map - the levels of detail -
	 * would shadow every slope with itself: acne, crawling as the camera
	 * moves).
	 */
	private SteadyShadows(): void {
		const sun = this.Sun;
		const map = this.Shadows?.getShadowMap();

		if ( !sun || !map ) {
			return;
		}
		if ( this._shadowFitted ) {
			this._shadowFitted = false;
			const texel = SnapShadowFrustum( sun, map.getSize().width );

			// a texel and a half along the normal: a slope never shadows
			// itself however wide the map is (acne)
			this.Shadows!.normalBias = Math.max( NormalBias, texel * 1.5 );
			sun.autoUpdateExtends = false;
			return;
		}

		const box = CastersBox( map.renderList! );
		const fit = this._shadowBox;

		if ( box && ( !fit
			|| !Contains( fit, box )
			|| Volume( box ) < Volume( fit ) * 0.5 ) ) {
			this._shadowBox = Grown( box, ShadowMargin );
			this._shadowFitted = true;
			sun.autoUpdateExtends = true;
		}
	}

	/** Takes the sun and the sky from the scene's lights. */
	public SyncLights(): void {
		for ( const light of this.Scene.lights ) {
			if ( light instanceof DirectionalLight ) {
				this.SunDirection.copyFrom( light.direction ).normalize();
				this.SunColor.copyFrom(
					light.diffuse.scale( light.intensity ),
				);
			} else if ( light instanceof HemisphericLight ) {
				this.SkyDirection.copyFrom( light.direction ).normalize();
				this.SkyColor.copyFrom(
					light.diffuse.scale( light.intensity ),
				);
				this.GroundColor.copyFrom(
					light.groundColor.scale( light.intensity ),
				);
			}
		}
	}

	/**
	 * Sets the shared uniforms and the volume on an effect. The arrays go
	 * once a frame per effect (a program keeps its uniforms; every chunk of
	 * the mesh tier binds the same one).
	 */
	/**
	 * The dynamic edits that may touch a mesh, a bit each: as far as an edit
	 * reaches, and the occlusion's probes beyond it, against the mesh's
	 * bounds in the world - all its thin instances' (a batch of balls is one
	 * mesh: its own box is a single ball's). Its shaders loop over these
	 * alone.
	 */
	public EditsNear( mesh: AbstractMesh ): number {
		const frame = this.Scene.getFrameId();

		if ( this._reachesAt !== frame
			|| this._reachesVersion !== this.Dynamic.Version ) {
			this._reachesAt = frame;
			this._reachesVersion = this.Dynamic.Version;
			this._reaches = this.Dynamic.Edits.map(
				( edit ) => SdfDynamicEdits.Reach(
					edit,
					3 * this.AoStep + 0.1,
				),
			);
		}

		const [ min, max ] = WorldBounds( mesh );
		let mask = 0;

		this._reaches.forEach( ( reach, i ) => {
			if ( !reach || reach[0]! <= max.x && reach[3]! >= min.x
				&& reach[1]! <= max.y && reach[4]! >= min.y
				&& reach[2]! <= max.z && reach[5]! >= min.z ) {
				mask |= 1 << i;
			}
		} );
		return mask;
	}

	public BindTo( effect: Effect, withVolume = true ): void {
		const volume = this._volume;
		const frame = this.Scene.getFrameId();

		if ( this._arraysBound.get( effect ) !== frame ) {
			this._arraysBound.set( effect, frame );
			effect.setFloatArray4( "sdfDynamic", this.Dynamic.Data );
			effect.setFloatArray4( "sdfOccluders", this.Occluders );
		}
		effect.setFloat( "sdfDynamicCount", this.Dynamic.Count );
		effect.setFloat( "sdfDynamicLayered", this.Dynamic.Layered ? 1 : 0 );
		effect.setFloat( "sdfOccluderCount", this.OccluderCount );
		effect.setFloat2( "sdfAo", this.AoStrength, this.AoStep );
		effect.setFloat( "sdfCarveThreshold", this.CarveThreshold );
		if ( volume && withVolume ) {
			effect.setTexture( "sdfVolume", volume.Texture );
			effect.setTexture( "sdfVolumeMaterials", volume.Materials );
			effect.setFloat3( "sdfBoundsMin", ...volume.Min );
			effect.setFloat3( "sdfBoundsSize", ...volume.Size );
			effect.setFloat3( "sdfVolumeSize", ...volume.Resolution );
			effect.setFloat( "sdfRange", volume.Range );

			const bricks = volume.Bricks;

			if ( bricks ) {
				effect.setTexture( "sdfBrickMap", bricks.Map );
				effect.setFloat4(
					"sdfBrickInfo",
					...bricks.Origin,
					bricks.CellSize,
				);
				effect.setFloat( "sdfBrickMapSize", bricks.MapSize );
			}
		}
	}

	/** The lights' uniforms of the SDF shaders. */
	public BindLights( effect: Effect ): void {
		effect.setVector3( "sunDirection", this.SunDirection );
		effect.setColor3( "sunColor", this.SunColor );
		effect.setVector3( "skyDirection", this.SkyDirection );
		effect.setColor3( "skyColor", this.SkyColor );
		effect.setColor3( "groundColor", this.GroundColor );
	}

	/** The shadow map's uniforms of the SDF shaders (SHADOWMAP). */
	public BindShadowMap( effect: Effect ): void {
		const shadows = this.Shadows;
		const map = shadows?.getShadowMapForRendering();

		if ( !shadows || !map ) {
			return;
		}

		const size = map.getSize().width;

		effect.setDepthStencilTexture( "sdfShadowMap", map );
		effect.setMatrix( "sdfLightMatrix", shadows.getTransformMatrix() );
		effect.setFloat4(
			"sdfShadowInfo",
			size,
			1 / size,
			shadows.getDarkness(),
			shadows.normalBias * 4,
		);
	}

	public Dispose(): void {
		if ( this._added ) {
			this.Scene.onNewMeshAddedObservable.remove( this._added );
		}
		this.Scene.onMeshRemovedObservable.remove( this._removed );
		this.Scene.onBeforeRenderObservable.remove( this._update );
		for ( const plugin of this._plugins ) {
			plugin.dispose();
		}
		this._plugins.clear();
		for ( const mesh of this._meshes ) {
			mesh.receiveShadows = false;
		}
		this._meshes.clear();
		this._pending = [];
		this.Shadows?.dispose();
	}

	private TakePending(): void {
		const waiting: AbstractMesh[] = [];

		for ( const mesh of this._pending.splice( 0 ) ) {
			if ( mesh.isDisposed() || this._own.has( mesh ) ) {
				continue;
			}
			if ( mesh.getTotalVertices() === 0 || !mesh.material ) {
				// a glTF root, or a mesh whose geometry or material comes later
				waiting.push( mesh );
				continue;
			}
			this.AddMesh( mesh );
		}
		this._pending.push( ...waiting );
	}

	private Forget( mesh: AbstractMesh ): void {
		if ( this._meshes.delete( mesh ) ) {
			this.Shadows?.removeShadowCaster( mesh, false );
		}
	}

	/**
	 * The MAX_OCCLUDERS spheres nearest to the camera among the meshes taken
	 * in, thin instances one by one.
	 */
	private CollectOccluders(): void {
		const eye = this.Scene.activeCamera?.globalPosition;
		const distances = this._distances;

		this.OccluderCount = 0;
		if ( !eye || !this._occlusion ) {
			return;
		}
		this.ForEachSphere( ( x, y, z, radius ) => this.Consider(
			eye,
			distances,
			x,
			y,
			z,
			radius,
		) );
	}

	/**
	 * Every shown mesh taken in as a sphere standing for it (its box's
	 * center, MeanHalfSize), thin instances one by one: what occludes the
	 * SDF world and what flattens grass.
	 */
	public ForEachSphere(
		visit: ( x: number, y: number, z: number, radius: number ) => void,
	): void {
		for ( const mesh of this._meshes ) {
			if ( !mesh.isEnabled() || !mesh.isVisible ) {
				continue;
			}

			const thin = ( mesh as Mesh )._thinInstanceDataStorage;

			if ( thin?.matrixData && thin.instancesCount > 0 ) {
				const box = mesh.getRawBoundingInfo().boundingBox;
				const center = box.center;
				const radius = MeanHalfSize( box.extendSize );
				const data = thin.matrixData;

				for ( let i = 0; i < thin.instancesCount; i++ ) {
					const at = i * 16;
					const scale = FMath.Sqrt(
						data[at]! * data[at]! + data[at + 1]! * data[at + 1]!
						+ data[at + 2]! * data[at + 2]!,
					);

					visit(
						data[at + 12]! + center.x * scale,
						data[at + 13]! + center.y * scale,
						data[at + 14]! + center.z * scale,
						radius * scale,
					);
				}
				continue;
			}

			const box = mesh.getBoundingInfo().boundingBox;

			visit(
				box.centerWorld.x,
				box.centerWorld.y,
				box.centerWorld.z,
				MeanHalfSize( box.extendSizeWorld ),
			);
		}
	}

	/** Keeps a sphere if it is among the nearest so far. */
	private Consider(
		eye: Vector3,
		distances: Float64Array,
		x: number,
		y: number,
		z: number,
		radius: number,
	): void {
		if ( radius <= 0 || radius > this._maxRadius ) {
			return;
		}

		const distance = FMath.Length3( x - eye.x, y - eye.y, z - eye.z );
		const count = this.OccluderCount;

		if ( count === MAX_OCCLUDERS && distance >= distances[count - 1]! ) {
			return;
		}

		// insertion: the farthest falls off the end when full
		let at = FMath.Min( count, MAX_OCCLUDERS - 1 );
		const spheres = this.Occluders;

		while ( at > 0 && distances[at - 1]! > distance ) {
			distances[at] = distances[at - 1]!;
			spheres.copyWithin( at * 4, ( at - 1 ) * 4, at * 4 );
			at--;
		}
		distances[at] = distance;
		spheres[at * 4] = x;
		spheres[at * 4 + 1] = y;
		spheres[at * 4 + 2] = z;
		spheres[at * 4 + 3] = radius;
		this.OccluderCount = FMath.Min( count + 1, MAX_OCCLUDERS );
	}
}

/**
 * The sun's shadow map: filtered in hardware (one 2x2 compare a pixel - the
 * medium quality's sixteen cost the target laptop a tenth of its frame),
 * both worlds read it.
 */
function CreateShadows( sun: DirectionalLight, size: number ): ShadowGenerator {
	const shadows = new ShadowGenerator( size, sun );

	// the depth range from the casters, not the camera's (0.05 to 10 000:
	// no precision left for a shadow)
	sun.autoCalcShadowZBounds = true;

	shadows.usePercentageCloserFiltering = true;
	shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
	shadows.bias = 0.001;
	shadows.normalBias = NormalBias;
	shadows.darkness = 0.2;
	return shadows;
}

/**
 * A mesh's bounds in the world: its box, or with thin instances the box
 * around all of them (each instance's center, grown by the mesh's own extent
 * at the instance's scale).
 */
function WorldBounds( mesh: AbstractMesh ): [ Vector3, Vector3 ] {
	const box = mesh.getBoundingInfo().boundingBox;
	const thin = ( mesh as Mesh )._thinInstanceDataStorage;

	if ( !thin?.matrixData || thin.instancesCount === 0 ) {
		return [ box.minimumWorld, box.maximumWorld ];
	}

	const raw = mesh.getRawBoundingInfo().boundingBox;
	const extent = raw.extendSize.length() + raw.center.length();
	const world = mesh.getWorldMatrix();
	const data = thin.matrixData;
	const min = new Vector3( Infinity, Infinity, Infinity );
	const max = new Vector3( -Infinity, -Infinity, -Infinity );
	const center = new Vector3();

	for ( let i = 0; i < thin.instancesCount; i++ ) {
		const at = i * 16;
		const scale = FMath.Sqrt( FMath.Max(
			data[at]! * data[at]!
				+ data[at + 1]! * data[at + 1]!
				+ data[at + 2]! * data[at + 2]!,
			FMath.Max(
				data[at + 4]! * data[at + 4]!
					+ data[at + 5]! * data[at + 5]!
					+ data[at + 6]! * data[at + 6]!,
				data[at + 8]! * data[at + 8]!
					+ data[at + 9]! * data[at + 9]!
					+ data[at + 10]! * data[at + 10]!,
			),
		) );
		const reach = extent * scale;

		Vector3.TransformCoordinatesFromFloatsToRef(
			data[at + 12]!,
			data[at + 13]!,
			data[at + 14]!,
			world,
			center,
		);
		min.minimizeInPlaceFromFloats(
			center.x - reach,
			center.y - reach,
			center.z - reach,
		);
		max.maximizeInPlaceFromFloats(
			center.x + reach,
			center.y + reach,
			center.z + reach,
		);
	}
	return [ min, max ];
}

/** The shadow map's normal bias at least (world units). */
const NormalBias = 0.02;

/**
 * The shadow map keeps its place while its casters move this far (share of the
 * box).
 */
const ShadowMargin = 0.08;

/** The world box around a shadow map's casters (min xyz, max xyz), or null. */
function CastersBox( casters: readonly AbstractMesh[] ): number[] | null {
	let box: number[] | null = null;

	for ( const mesh of casters ) {
		const b = mesh.getBoundingInfo().boundingBox;
		const lo = b.minimumWorld;
		const hi = b.maximumWorld;

		box = box
			? [
				Math.min( box[0]!, lo.x ), Math.min( box[1]!, lo.y ),
				Math.min( box[2]!, lo.z ),
				Math.max( box[3]!, hi.x ), Math.max( box[4]!, hi.y ),
				Math.max( box[5]!, hi.z ),
			]
			: [ lo.x, lo.y, lo.z, hi.x, hi.y, hi.z ];
	}
	return box;
}

function Grown( box: number[], share: number ): number[] {
	const out = [ ...box ];

	for ( let axis = 0; axis < 3; axis++ ) {
		const pad = ( box[axis + 3]! - box[axis]! ) * share + 0.01;

		out[axis] = box[axis]! - pad;
		out[axis + 3] = box[axis + 3]! + pad;
	}
	return out;
}

function Contains( outer: number[], inner: number[] ): boolean {
	return [ 0, 1, 2 ].every(
		( axis ) => inner[axis]! >= outer[axis]!
			&& inner[axis + 3]! <= outer[axis + 3]!,
	);
}

function Volume( box: number[] ): number {
	return ( box[3]! - box[0]! )
		* ( box[4]! - box[1]! )
		* ( box[5]! - box[2]! );
}

/**
 * A shadow frustum Babylon just fitted, made steady: its size rounded up to
 * a step of 2^(1/4), its center to a texel of that size, and its depth range
 * grown by a margin.
 */
function SnapShadowFrustum( sun: DirectionalLight, texels: number ): number {
	const width = sun.orthoRight - sun.orthoLeft;
	const height = sun.orthoTop - sun.orthoBottom;
	const size = 2 ** ( Math.ceil(
		Math.log2( Math.max( width, height, 1e-3 ) ) * 4,
	) / 4 );
	const texel = size / texels;
	const cx = Math.round(
		( sun.orthoLeft + sun.orthoRight ) / 2 / texel,
	) * texel;
	const cy = Math.round(
		( sun.orthoBottom + sun.orthoTop ) / 2 / texel,
	) * texel;
	const depth = sun.shadowMaxZ - sun.shadowMinZ;

	sun.orthoLeft = cx - size / 2;
	sun.orthoRight = cx + size / 2;
	sun.orthoBottom = cy - size / 2;
	sun.orthoTop = cy + size / 2;
	sun.shadowMinZ -= depth * ShadowMargin + 0.5;
	sun.shadowMaxZ += depth * ShadowMargin + 0.5;
	return texel;
}
