// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The SDF demo (plan.md 15, M0 criterion): Babylon cubes and SDF shapes in
// one scene, sorted by depth both ways, shadowing and occluding each other.
// The "editor" edits are baked into the world's base; in play, a hole moves
// through it (a dynamic edit: drawn by the GPU, never written anywhere) and a
// double click digs (recent edits; the oldest fold into the base). The mesh
// tier is meshed in workers. ?tier=mesh shows the mesh tier, ?view=0..3 the
// debug views, ?hole=0 stops the hole, ?shadows=0 turns the shadow map off,
// ?cone=16,8 sets the cone march's tiles (?cone= turns it off), ?levels=
// the mesh tier's levels of detail (?skirts=0 without skirts), ?cam=alpha,
// beta,radius[,x,y,z] another view. ?scene=lod is a land for the levels,
// ?fly=8 flies the camera over it at 8 m/s; ?checker=0 marches every pixel
// (no checkerboard).
// ?scene=depth and ?scene=light are the end-to-end checks' still scenes
// (Presets).

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
// scene.createPickingRay, for digging
import "@babylonjs/core/Culling/ray";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { Scene } from "@babylonjs/core/scene";
import {
	ChooseTier,
	CreateAabb,
	Expanded as Grown,
	CreateMeshWorker,
	DenseSdfGrid,
	DetectCapabilities,
	EditList,
	GroundPlane,
	SdfBakedLayer,
	SdfSparseLayer,
	InvertedMandelbrot,
	FindStandingPlace,
	FormulaPresets,
	FormulaBase,
	type SdfBaseDescriptor,
	SdfField,
	SdfMeshWorkers,
	SdfOp,
	type SdfDynamicEdit,
	SdfShape,
	SdfTier,
	SdfVolume,
	SdfWorld,
	type Aabb,
	type SdfDynamicInit,
	type SdfEditInit,
	type SdfGrassOptions,
} from "../Source/Index";
import { RollingBalls, SplatThrower } from "./Behaviours";
import {
	DefaultPalette,
	FsrUpscaler,
	SdfGrassLayer,
	SdfMeshLayer,
	SdfRaymarchLayer,
	SdfRenderContext,
	SdfVolumeTexture,
	type SdfDebugView,
	SdfFormulaVolume,
	type RaymarchLayerOptions,
} from "../Source/Render/Index";

const params = new URLSearchParams( location.search );

/** What a demo scene is made of. */
interface Preset {
	/** Arc rotate camera: alpha, beta, radius, target. */
	Camera: [ number, number, number, [ number, number, number ] ];
	Interactive: boolean;
	Sun: [ number, number, number ];
	Shadows: boolean;
	/** Height of the ground plane; null: none. */
	Ground: number | null;
	/** The editor's edits, baked into the base. */
	Edits: SdfEditInit[];
	Bake: Aabb;
	/** What the ray marcher (and the mesh tier's proxies) sample. */
	Volume: Aabb;
	/** Babylon cubes: x, y, z, size. */
	Cubes: Array<readonly [ number, number, number, number ]>;
	Tilted: boolean;
	/** A dynamic edit (moving unless ?hole=0). */
	Hole: SdfDynamicInit | null;
	Moving: boolean;
	/** Where the mesh tier meshes. */
	Focus: [ number, number, number ];
	/** Splat grass, balls rolling over it, a thrower of splats. */
	Grass?: SdfGrassOptions;
	Balls?: number;
	SplatsFrom?: [ number, number, number ];
	/** The splats thrown carve (craters, holes) instead of sticking. */
	SplatsCarve?: boolean;
	/** More dynamic edits, standing still. */
	Still?: SdfDynamicInit[];
	/** The base's sample spacing (default 0.1). */
	BakeSpacing?: number;
	/** The mesh tier's levels of detail (?levels= overrides; default 1). */
	Levels?: number;
	/** The mesh tier meshes around the camera's target as it moves. */
	Follow?: boolean;
	/**
	 * An analytic base without bounds (a fractal) instead of the baked
	 * edits: old edits fold into a sparse layer over it.
	 */
	Base?: SdfBaseDescriptor;
}

const Presets: Record<string, Preset> = {
	// the editor's world: ground, a blob of smoothly joined shapes, a tunnel;
	// cubes crossing it; a hole circling through it
	showcase: {
		Camera: [ -Math.PI / 2.6, 1.05, 17, [ 0, 1, 0 ] ],
		Interactive: true,
		Sun: [ -0.4, -1, -0.5 ],
		Shadows: params.get( "shadows" ) !== "0",
		Ground: 0,
		Edits: [
			{
				Shape: SdfShape.Sphere,
				Position: [ 0, 1.6, 0 ],
				Params: [ 2, 0, 0, 0 ],
				MaterialId: 1,
			},
			{
				Shape: SdfShape.RoundBox,
				Op: SdfOp.SmoothUnion,
				Position: [ 2.4, 0.8, 1.2 ],
				Rotation: [ 0, 0.38, 0, 0.92 ],
				Params: [ 1.2, 0.8, 1.2, 0.25 ],
				SmoothK: 0.8,
				MaterialId: 3,
			},
			// a layer of its own merging only with itself: a hard seam
			// where it meets the ground (the others melt into it)
			{
				Shape: SdfShape.Torus,
				Op: SdfOp.SmoothUnion,
				Position: [ -3.2, 0.5, 1.5 ],
				Params: [ 1.3, 0.45, 0, 0 ],
				SmoothK: 0.5,
				MaterialId: 4,
				Layer: 2,
				Mask: 2,
			},
			{
				Shape: SdfShape.Capsule,
				Op: SdfOp.Subtract,
				Position: [ 0, 1.4, 0 ],
				Rotation: [ 0.7071, 0, 0, 0.7071 ],
				Params: [ 3, 0.7, 0, 0 ],
				MaterialId: 5,
			},
		],
		Bake: CreateAabb( -8, -1.5, -8, 8, 5, 8 ),
		Volume: CreateAabb( -8, -1, -8, 8, 5, 8 ),
		Cubes: [
			[ 1.4, 2.4, 1.4, 1.2 ],
			[ -1.8, 3.2, -0.5, 0.9 ],
			[ 4, 0.4, -2.5, 1.4 ],
			[ 0, 1.4, 0, 0.8 ],
		],
		Tilted: true,
		Hole: {
			Shape: SdfShape.Sphere,
			Op: SdfOp.SmoothSubtract,
			Position: [ 0, 0, 3 ],
			Params: [ 0.9, 0, 0, 0 ],
			SmoothK: 0.3,
			MaterialId: 2,
		},
		Moving: params.get( "hole" ) !== "0",
		Focus: [ 0, 1, 0 ],
	},
	// the end-to-end depth check: a ball, a cube in front of it and a
	// larger one behind, seen along -Z
	depth: {
		Camera: [ Math.PI / 2, Math.PI / 2, 10, [ 0, 0, 0 ] ],
		Interactive: false,
		Sun: [ -0.4, -1, -0.5 ],
		Shadows: false,
		Ground: null,
		Edits: [
			{
				Shape: SdfShape.Sphere,
				Params: [ 1, 0, 0, 0 ],
				MaterialId: 1,
			},
		],
		Bake: CreateAabb( -3, -3, -3, 3, 3, 3 ),
		Volume: CreateAabb( -2, -2, -2, 2, 2, 2 ),
		Cubes: [ [ 0, 0, 2.5, 0.5 ], [ 0, 0, -2.5, 3 ] ],
		Tilted: false,
		Hole: null,
		Moving: false,
		Focus: [ 0, 0, 0 ],
	},
	// the end-to-end light check, the sun straight above: a cube floating
	// over the SDF ground, an SDF ball floating over a cube, a dynamic hole
	light: {
		Camera: [ -Math.PI / 2, 0.75, 13, [ 0, 0.5, 0 ] ],
		Interactive: false,
		Sun: [ 0, -1, 0 ],
		Shadows: true,
		Ground: 0,
		Edits: [
			{
				Shape: SdfShape.Sphere,
				Position: [ 0, 3.2, 0 ],
				Params: [ 0.6, 0, 0, 0 ],
				MaterialId: 1,
			},
		],
		Bake: CreateAabb( -6, -1.5, -6, 6, 5, 6 ),
		Volume: CreateAabb( -6, -1, -6, 6, 5, 6 ),
		Cubes: [ [ 0, 0.75, 0, 1.5 ], [ 3, 1.5, 0, 1 ] ],
		Tilted: false,
		Hole: {
			Shape: SdfShape.Sphere,
			Op: SdfOp.SmoothSubtract,
			Position: [ -3, 0.3, 0 ],
			Params: [ 1, 0, 0, 0 ],
			SmoothK: 0.2,
			MaterialId: 2,
		},
		Moving: false,
		Focus: [ 0, 1, 0 ],
	},
};

// grass over the ground, balls rolling over it and pressing it
Presets["grass"] = {
	Camera: [ -Math.PI / 2.3, 0.85, 11, [ 0, 0, 0 ] ],
	Interactive: true,
	Sun: [ -0.4, -1, -0.5 ],
	Shadows: true,
	Ground: 0,
	Edits: [
		// a mound the grass grows over, a rock (another material: none on it)
		{
			Shape: SdfShape.Ellipsoid,
			Op: SdfOp.SmoothUnion,
			Position: [ 2.5, -0.6, -1.5 ],
			Params: [ 2, 1, 1.5, 0 ],
			SmoothK: 0.6,
			MaterialId: 0,
		},
		{
			Shape: SdfShape.RoundBox,
			Op: SdfOp.SmoothUnion,
			Position: [ -2.5, 0.3, 2 ],
			Rotation: [ 0, 0.38, 0, 0.92 ],
			Params: [ 0.6, 0.5, 0.6, 0.2 ],
			SmoothK: 0.3,
			MaterialId: 7,
		},
	],
	Bake: CreateAabb( -7, -1.5, -7, 7, 3, 7 ),
	Volume: CreateAabb( -7, -1, -7, 7, 3, 7 ),
	Cubes: [],
	Tilted: false,
	Hole: {
		Shape: SdfShape.Sphere,
		Op: SdfOp.SmoothSubtract,
		Position: [ -4, 0.2, -3 ],
		Params: [ 0.8, 0, 0, 0 ],
		SmoothK: 0.2,
		MaterialId: 5,
	},
	Moving: false,
	Focus: [ 0, 0, 0 ],
	Grass: { Bounds: [ -6, -6, 6, 6 ], Density: 40, Height: 0.3, Recover: 3 },
	Balls: 4,
};
// a wall splats are thrown at: half merge with it, half stick with a seam
Presets["splats"] = {
	Camera: [ Math.PI * 0.85, 1.2, 10, [ 2, 1.5, 0 ] ],
	Interactive: true,
	Sun: [ -0.6, -1, 0.3 ],
	Shadows: true,
	Ground: 0,
	Edits: [
		{
			Shape: SdfShape.RoundBox,
			Op: SdfOp.SmoothUnion,
			Position: [ 4, 1.5, 0 ],
			Params: [ 0.4, 1.8, 3, 0.1 ],
			SmoothK: 0.3,
			MaterialId: 6,
		},
	],
	Bake: CreateAabb( -6, -1.5, -5, 6, 4.5, 5 ),
	Volume: CreateAabb( -6, -1, -5, 6, 4.5, 5 ),
	Cubes: [],
	Tilted: false,
	Hole: null,
	Moving: false,
	Focus: [ 3, 1.5, 0 ],
	SplatsFrom: [ -3, 1, 0 ],
};

// a land 256 m across - hills, towers - for the mesh tier's levels of
// detail: the chunks grow with the distance from the camera's target
Presets["lod"] = {
	Camera: [ -Math.PI / 2.4, 1.2, 40, [ 0, 0, 0 ] ],
	Interactive: true,
	Sun: [ -0.4, -1, -0.5 ],
	Ground: 0,
	Edits: Array.from( { length: 90 }, ( _, i ): SdfEditInit => {
		// a fixed scatter: the same land every time
		const x = Math.sin( i * 12.9898 ) * 118;
		const z = Math.cos( i * 78.233 ) * 118;
		const r = 3 + ( ( i * 37 ) % 10 );

		return i % 9 === 0
			? {
				Shape: SdfShape.RoundBox,
				Op: SdfOp.SmoothUnion,
				Position: [ x, r * 0.6, z ],
				Params: [ 1.5, r * 0.6, 1.5, 0.3 ],
				SmoothK: 0.5,
				MaterialId: 7,
			}
			: {
				Shape: SdfShape.Sphere,
				Op: SdfOp.SmoothUnion,
				Position: [ x, -r * 0.55, z ],
				Params: [ r, 0, 0, 0 ],
				SmoothK: 1.5,
				MaterialId: i % 3 === 0 ? 3 : 0,
			};
	} ),
	// deep: a cell of the coarsest level (3.2 m) still sees the ground's
	// solid under it (a slab thinner than a cell vanishes from afar)
	Bake: CreateAabb( -128, -40, -128, 128, 14, 128 ),
	Volume: CreateAabb( -16, -1, -16, 16, 8, 16 ),
	Cubes: [],
	Tilted: false,
	Hole: null,
	Moving: false,
	Focus: [ 0, 0, 0 ],
	BakeSpacing: 0.25,
	Shadows: params.get( "shadows" ) !== "0",
	Levels: 5,
	Follow: true,
};

// "inside the Mandelbulb": the inverted Julia bulb, a cave 30 m across
// with spiral tunnels (?power=, ?scale= to vary it)
Presets["fractal"] = {
	Camera: [ -Math.PI / 2.6, 1.2, 12, [ 0, 0, 0 ] ],
	Interactive: true,
	Sun: [ -0.4, -1, -0.5 ],
	// a closed cave: the sun's shadow would leave it all dark (?shadows=1)
	Shadows: params.get( "shadows" ) === "1",
	Ground: null,
	Edits: [],
	Bake: CreateAabb( -1, -1, -1, 1, 1, 1 ),
	Volume: CreateAabb( -64, -64, -64, 64, 64, 64 ),
	Cubes: [],
	Tilted: false,
	Hole: null,
	Moving: false,
	Focus: [ 0, 0, 0 ],
	Levels: 5,
	Follow: true,
	// ?formula=Mandelbox: another preset of the formula editor's
	Base: ( () => {
		const preset = FormulaPresets.find(
			( it ) => it.Name === params.get( "formula" ),
		);

		const base = preset
			? { Kind: "Formula", Options: preset.Options } as const
			: InvertedMandelbrot( Number( params.get( "scale" ) ?? 20 ) );
		const ds = params.get( "ds" );

		// ?ds=1: the estimate less shrunk (FractalFrameOptions)
		return base.Kind === "Formula" && ds
			? {
				...base,
				Options: {
					...base.Options,
					Frame: {
						...base.Options.Frame,
						DistanceScale: Number( ds ),
					},
				},
			}
			: base;
	} )(),
};

// the same wall, shot with splats that take matter away: three holes
Presets["breach"] = { ...Presets["splats"]!, SplatsCarve: true };

// the showcase with 16 dynamic edits standing still (the stress scene's
// holes and blobs, frozen): a picture to compare renderer changes against
Presets["stress"] = {
	...Presets["showcase"]!,
	Hole: null,
	Moving: false,
	Still: Array.from( { length: 16 }, ( _, i ): SdfDynamicInit => {
		const blob = i % 2 === 1;
		const angle = i * Math.PI * 2 / 16;
		const radius = 6 * ( 0.5 + ( i % 3 ) * 0.25 );

		return {
			Shape: SdfShape.Sphere,
			Op: blob ? SdfOp.SmoothUnion : SdfOp.SmoothSubtract,
			Position: [
				Math.cos( angle ) * radius,
				0.3,
				Math.sin( angle ) * radius,
			],
			Params: [ blob ? 0.8 : 1.5, 0, 0, 0 ],
			SmoothK: 0.4,
			MaterialId: blob ? 6 : 2,
		};
	} ),
};

const preset = Presets[params.get( "scene" ) ?? "showcase"]
	?? Presets["showcase"]!;
const canvas = document.getElementById( "view" ) as HTMLCanvasElement;
const engine = new Engine( canvas, true, { preserveDrawingBuffer: true } );
const scene = new Scene( engine );

// the engine's convention; ?lh=1 checks Babylon's default too
scene.useRightHandedSystem = params.get( "lh" ) !== "1";
scene.clearColor = new Color4( 0.08, 0.1, 0.14, 1 );

// ?rs=0.5: the frame drawn at half the screen's size, brought up by FSR 1
// (?sharp=: RCAS's stops, -1 none)
const upscaler = params.get( "rs" )
	? new FsrUpscaler( scene, {
		Scale: Number( params.get( "rs" ) ),
		Sharpness: Number( params.get( "sharp" ) ?? 0.25 ),
	} )
	: null;

// ?cam=alpha,beta,radius,x,y,z: another view of the preset
const view0 = params.get( "cam" )?.split( "," )
	.map( Number );
const camera = new ArcRotateCamera(
	"camera",
	view0?.[0] ?? preset.Camera[0],
	view0?.[1] ?? preset.Camera[1],
	view0?.[2] ?? preset.Camera[2],
	view0 && view0.length >= 6
		? new Vector3( view0[3]!, view0[4]!, view0[5]! )
		: new Vector3( ...preset.Camera[3] ),
	scene,
);

camera.minZ = 0.05;
if ( preset.Interactive ) {
	camera.attachControl( canvas, true );
}

const sky = new HemisphericLight( "sky", new Vector3( 0.2, 1, 0.1 ), scene );

sky.intensity = 0.65;
sky.groundColor = new Color3( 0.25, 0.25, 0.3 );

const sun = new DirectionalLight( "sun", new Vector3( ...preset.Sun ), scene );

sun.intensity = 0.7;
// where the shadow map looks from (its extents follow the casters)
sun.position = new Vector3( ...preset.Sun ).scale( -20 );

// what the SDF world shares with the cubes: the sun's shadow map, the
// occlusion both ways and the dynamic edits
const context = new SdfRenderContext( scene, { Shadows: preset.Shadows } );
const edits = new EditList();

for ( const edit of preset.Edits ) {
	edits.Add( edit );
}

const field = new SdfField(
	edits,
	preset.Ground === null ? null : new GroundPlane( preset.Ground, 0 ),
);

// the editor's build: all of it baked into one sampled base
const bakeStart = performance.now();
const world = new SdfWorld( preset.Base
	? new SdfSparseLayer( preset.Base, preset.BakeSpacing ?? 0.1 )
	: SdfBakedLayer.Bake( field, {
		Bounds: preset.Bake,
		Spacing: preset.BakeSpacing ?? 0.1,
	} ), { MaxEdits: 8 } );
const bakeMs = performance.now() - bakeStart;

// a world without a known floor (a fractal): the camera on a place to
// stand near the focus, a lantern over it (the sun can't reach in)
if ( preset.Base ) {
	const place = view0
		? null
		: FindStandingPlace( world.Field, preset.Focus, { Radius: 30 } );

	if ( place ) {
		// someone standing there, seen from above and behind
		const body = CreateCapsule(
			"player",
			{ height: 1.8, radius: 0.35 },
			scene,
		);

		body.position.set(
			place.Position[0],
			place.Position[1] + 0.9,
			place.Position[2],
		);
		camera.target = new Vector3( ...place.Position )
			.addInPlaceFromFloats( 0, 1.5, 0 );
		camera.radius = 9;
		// the first view down at it no wall stands in front of
		for ( let k = 0; k < 64; k++ ) {
			const alpha = k * 2.39996;
			const beta = 0.6 + ( k % 8 ) * 0.1;
			const dir: [ number, number, number ] = [
				Math.cos( alpha ) * Math.sin( beta ),
				Math.cos( beta ),
				Math.sin( alpha ) * Math.sin( beta ),
			];

			if ( !world.Field.Raycast(
				camera.target.asArray() as [ number, number, number ],
				dir,
				10,
			) ) {
				camera.alpha = alpha;
				camera.beta = beta;
				break;
			}
		}
	}

	const lantern = new PointLight( "lantern", camera.target.clone(), scene );

	lantern.diffuse = new Color3( 1, 0.85, 0.65 );
	lantern.intensity = 1.4;
	lantern.range = 30;
	scene.onBeforeRenderObservable.add( () => {
		lantern.position.copyFrom( camera.target )
			.addInPlaceFromFloats( 0, 1, 0 );
	} );
}

// in play: a dynamic edit - drawn by the GPU, never written anywhere
for ( const still of preset.Still ?? [] ) {
	context.Dynamic.Add( still );
}

const hole: SdfDynamicEdit | null = preset.Hole
	? context.Dynamic.Add( preset.Hole )
	: null;

// Babylon meshes crossing the SDF shapes: the depth test sorts them
const cubeMaterial = new StandardMaterial( "cube", scene );

cubeMaterial.diffuseColor = new Color3( 0.25, 0.75, 0.95 );
for ( const [ x, y, z, size ] of preset.Cubes ) {
	const cube = CreateBox( "cube", { size }, scene );

	cube.position.set( x, y, z );
	if ( preset.Tilted ) {
		cube.rotation.set( 0.4, 0.7, 0 );
	}
	cube.material = cubeMaterial;
}

const gl = ( engine as unknown as { _gl: WebGL2RenderingContext; } )._gl;
const auto = ChooseTier( DetectCapabilities( gl, "gpu" in navigator ) );
let tier = params.get( "tier" ) === "mesh" ? SdfTier.Mesh
	: params.get( "tier" ) === "gl" ? SdfTier.Gl
		: auto.Tier;
let marched: SdfRaymarchLayer | null = null;

/** The second variant of an A/B measurement (?ab=). */
let marchedB: SdfRaymarchLayer | null = null;
let meshed: SdfMeshLayer | null = null;
let volume: { Grid: DenseSdfGrid; Texture: SdfVolumeTexture; } | null = null;
let grass: SdfGrassLayer | null = null;
/** The grid the grass grew over, and its version then. */
let grassGrid: DenseSdfGrid | null = null;
let grassVersion = -1;
const balls = preset.Balls
	? new RollingBalls( scene, preset.Balls, preset.Ground ?? 0 )
	: null;
const thrower = preset.SplatsFrom
	? new SplatThrower(
		world,
		context.Dynamic,
		preset.SplatsFrom,
		0.12,
		0.22,
		preset.SplatsCarve ?? false,
	)
	: null;
let view = Number( params.get( "view" ) ?? 0 ) as SdfDebugView;
const fly = Number( params.get( "fly" ) ?? 0 );
let flyAngle = 0;
/** The chunks that follow the camera's target (Preset.Follow). */
let following: SdfMeshWorkers | null = null;
let moving = preset.Moving;

function Show( next: SdfTier ): void {
	marched?.Dispose();
	meshed?.Dispose();
	following = null;
	volume?.Grid.Dispose();
	volume?.Texture.Dispose();
	marched = null;
	meshed = null;
	volume = null;
	grassGrid = null;
	grassVersion = -1;
	tier = next;
	if ( tier === SdfTier.Mesh ) {
		// ?cell=0.4, ?radius=1: the finest level's cell and its radius in
		// chunks
		const chunks = new SdfMeshWorkers( world, {
			CellSize: Number( params.get( "cell" ) ?? 0.2 ),
			ChunkCells: 20,
			Radius: Number( params.get( "radius" ) ?? 2 ),
			Levels: Number( params.get( "levels" ) ?? preset.Levels ?? 1 ),
			...params.get( "skirts" ) === "0" ? { Skirts: false } : {},
		}, CreateMeshWorker );

		const grid = new DenseSdfGrid( world.Field, preset.Volume, 96 );

		volume = {
			Grid: grid,
			Texture: SdfVolumeTexture.FromGrid( scene, grid ),
		};
		context.Volume = volume.Texture;
		grassGrid = grid;
		chunks.CenterOn( ...preset.Focus );
		following = chunks;
		meshed = new SdfMeshLayer( scene, chunks, {
			Context: context,
			Checkerboard: params.get( "checker" ) !== "0",
		} );
	} else {
		const res = Number( params.get( "res" ) ?? 160 );
		const under = world.Base instanceof SdfSparseLayer
			? world.Base.Under
			: null;
		// a formula world: the formula marched on the GPU as it is (no
		// grid); ?bricks=1: the world in bricks (plan.md 5)
		const grid = under instanceof FormulaBase
			? new SdfFormulaVolume(
				scene,
				under,
				// ?box=16: marched only this far round the camera's target
				params.get( "box" )
					? Grown(
						CreateAabb(
							...camera.target.asArray(),
							...camera.target.asArray(),
						),
						Number( params.get( "box" ) ),
					)
					: preset.Volume,
				0.05,
			)
			: params.get( "bricks" ) === "1"
				? Bricks( world.Field, preset.Volume, res )
				: new DenseSdfGrid( world.Field, preset.Volume, res );

		// ?cone=16,8: the cone march's tiles (?cone=: none)
		const cone = params.get( "cone" );

		// ?ab=checker (light, scache, cone, memory, relax): a second layer
		// with that one
		// option the other way, shown in turn by sdfDemo.AB( 0 / 1 ) - two
		// variants measured in one page (the GPU's clocks differ between
		// launches more than most of what is measured)
		const ab = params.get( "ab" );
		const Options = ( flip: boolean ): RaymarchLayerOptions => {
			const checker = params.get( "checker" ) !== "0";
			const light = Number( params.get( "light" ) ?? 0.5 );
			const shadowCache = params.get( "scache" ) !== "0";

			return {
				Context: context,
				Checkerboard: flip && ab === "checker" ? !checker : checker,
				// ?light=0: no low-resolution shadows and occlusion
				LightResolution: flip && ab === "light" ? ( light > 0
					? 0
					: 0.5 ) : light,
				// ?scache=0: the box's shadow marched every frame
				ShadowCache: flip && ab === "scache"
					? !shadowCache
					: shadowCache,
				// ?memory=0: every corner marches from scratch
				Memory: ( params.get( "memory" ) !== "0" )
					!== ( flip && ab === "memory" ),
				// ?relax=1: no over-relaxation
				Relaxation: flip && ab === "relax"
					? 1
					: Number( params.get( "relax" ) ?? 1.6 ),
				...flip && ab === "cone"
					? { ConeTiles: cone === "" ? [ 8 ] : [] }
					: cone === null ? {} : {
						ConeTiles: cone.split( "," ).filter( Boolean )
							.map( Number ),
					},
			};
		};

		marched = new SdfRaymarchLayer( scene, grid, Options( false ) );
		if ( ab ) {
			marchedB = new SdfRaymarchLayer( scene, grid, Options( true ) );
			marchedB.Mesh.setEnabled( false );
			marchedB.DebugView = view;
		}
		marched.DebugView = view;
		// grass grows on the dense grid (not on bricks yet)
		grassGrid = grid instanceof DenseSdfGrid ? grid : null;
	}
}

Show( tier );

document.querySelectorAll<HTMLButtonElement>( "[data-tier]" )
	.forEach( ( button ) => {
		button.onclick = () => Show(
			button.dataset["tier"] === "mesh" ? SdfTier.Mesh : SdfTier.Gl,
		);
	} );
document.querySelectorAll<HTMLButtonElement>( "[data-view]" )
	.forEach( ( button ) => {
		button.onclick = () => {
			view = Number( button.dataset["view"] ) as SdfDebugView;
			if ( marched ) {
				marched.DebugView = view;
			}
		};
	} );

const holeBox = document.getElementById( "hole" ) as HTMLInputElement;

holeBox.checked = moving;
holeBox.onchange = () => {
	moving = holeBox.checked;
};

const stats = document.getElementById( "stats" )!;
let time = 0;
let frames = 0;
let lastReport = performance.now();
let lastWork = 0;

scene.onBeforeRenderObservable.add( () => {
	if ( moving && hole ) {
		time += engine.getDeltaTime() / 1000;
		context.Dynamic.Update( hole.Id, {
			Position: [
				Math.sin( time * 0.7 ) * 3.5,
				0.2,
				Math.cos( time * 0.7 ) * 3.5,
			],
		} );
	}

	const start = performance.now();

	const dt = engine.getDeltaTime() / 1000;

	// ?fly=8: the camera's target circles the land at 8 m/s (the levels
	// split and merge as it goes)
	if ( fly > 0 ) {
		flyAngle += fly * dt / 40;
		camera.target.set(
			Math.cos( flyAngle ) * 40,
			0,
			Math.sin( flyAngle ) * 40,
		);
	}
	if ( preset.Follow && following ) {
		following.CenterOn( camera.target.x, camera.target.y, camera.target.z );
	}
	balls?.Update( dt );
	thrower?.Update( dt );
	meshed?.Update();
	if ( volume && volume.Grid.Refresh() > 0 ) {
		volume.Texture.Update( volume.Grid.Data, ...volume.Grid.Written );
	}
	// the grass grows over the grid, again when it changed
	if ( preset.Grass && grassGrid && grassGrid.Version !== grassVersion ) {
		grass ??= new SdfGrassLayer(
			scene,
			context,
			preset.Grass,
			DefaultPalette,
		);
		grass.Scatter( grassGrid );
		grassVersion = grassGrid.Version;
	}
	lastWork = performance.now() - start;
} );

engine.runRenderLoop( () => {
	scene.render();
	frames++;

	const now = performance.now();

	if ( now - lastReport > 500 ) {
		stats.textContent = [
			`tier ${ tier } (auto: ${ auto.Tier }, ${ auto.Reason })`,
			`${ ( frames * 1000 / ( now - lastReport ) ).toFixed( 0 ) } fps`,
			`recent edits ${ world.Edits.Count }, version `
				+ `${ world.Edits.Version }, `
				+ `dynamic ${ context.Dynamic.Count }`,
			`base: ${ world.Base instanceof SdfBakedLayer
				? world.Base.BrickCount
				: world.Base.CellCount } bricks, baked in `
				+ `${ bakeMs.toFixed( 0 ) } ms`,
			meshed
				? `chunks ${ meshed.Count }, `
					+ `${ ( meshed.Triangles / 1000 ).toFixed( 0 ) }k `
					+ "triangles, main thread "
					+ `${ lastWork.toFixed( 2 ) } ms`
				: marched!.Bricks
					? `bricks ${ marched!.Bricks.Atlas.Used }, map `
						+ `${ marched!.Bricks.Map.Size }^3`
					: `grid ${ ( marched!.Grid as DenseSdfGrid ).Resolution
						.join( "x" ) }`,
		].join( "\n" );
		frames = 0;
		lastReport = now;
	}
} );

window.addEventListener( "resize", () => engine.resize() );

// a double click digs where the ray meets the world: a recent edit
canvas.addEventListener( "dblclick", ( event ) => {
	const ray = scene.createPickingRay(
		event.offsetX * engine.getHardwareScalingLevel(),
		event.offsetY * engine.getHardwareScalingLevel(),
		Matrix.Identity(),
		camera,
	);
	const hit = world.Field.Raycast(
		[ ray.origin.x, ray.origin.y, ray.origin.z ],
		[ ray.direction.x, ray.direction.y, ray.direction.z ],
		200,
	);

	if ( hit ) {
		world.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.SmoothSubtract,
			Position: hit.Position,
			Params: [ 0.7, 0, 0, 0 ],
			SmoothK: 0.15,
			MaterialId: 6,
		} );
	}
} );
/**
 * For the end-to-end check: the color drawn where a world point lands on
 * screen (0..1 per channel), and how many chunks still wait to be meshed.
 */
const probe = {
	async Pixel( x: number, y: number, z: number ): Promise<number[]> {
		const width = engine.getRenderWidth();
		const height = engine.getRenderHeight();
		const at = Vector3.Project(
			new Vector3( x, y, z ),
			Matrix.Identity(),
			scene.getTransformMatrix(),
			camera.viewport.toGlobal( width, height ),
		);
		const pixels = await engine.readPixels(
			Math.round( at.x ),
			Math.round( height - at.y ),
			1,
			1,
		) as Uint8Array;

		return [ ...pixels.slice( 0, 3 ) ].map( ( v ) => v / 255 );
	},
	get Pending(): number {
		return meshed?.Chunks?.Pending ?? 0;
	},
	/**
	 * Whether the GPU drew the same surface the CPU's field has: on a grid
	 * of pixels, a hit on screen (not the clear colour) against a ray
	 * marched through the pixel on the CPU, reading no detail finer than
	 * the pixel (as the GPU's march). Counts of each and of disagreements.
	 */
	async Agreement( columns: number, rows: number ): Promise<{
		Samples: number;
		Gpu: number;
		Cpu: number;
		Disagree: number;
	}> {
		const width = engine.getRenderWidth();
		const height = engine.getRenderHeight();
		const pixels = await engine.readPixels(
			0,
			0,
			width,
			height,
		) as Uint8Array;
		const clear = scene.clearColor;
		const angle = Math.tan( camera.fov / 2 ) * 2 / height;
		const box = preset.Volume;
		const result = { Samples: 0, Gpu: 0, Cpu: 0, Disagree: 0 };

		for ( let j = 0; j < rows; j++ ) {
			for ( let i = 0; i < columns; i++ ) {
				const x = Math.floor( ( i + 0.5 ) * width / columns );
				const y = Math.floor( ( j + 0.5 ) * height / rows );
				// rows from the bottom in the read pixels
				const at = ( ( height - 1 - y ) * width + x ) * 4;
				const gpu = Math.abs( pixels[at]! / 255 - clear.r )
					+ Math.abs( pixels[at + 1]! / 255 - clear.g )
					+ Math.abs( pixels[at + 2]! / 255 - clear.b ) > 0.05;
				const ray = scene.createPickingRay(
					x,
					y,
					Matrix.Identity(),
					camera,
				);
				const o = ray.origin;
				const d = ray.direction;
				let t = 0;
				let cpu = false;

				for ( let step = 0; step < 400; step++ ) {
					const px = o.x + d.x * t;
					const py = o.y + d.y * t;
					const pz = o.z + d.z * t;

					if ( px < box[0]! || py < box[1]! || pz < box[2]!
						|| px > box[3]! || py > box[4]! || pz > box[5]! ) {
						break;
					}

					const detail = t * angle;
					const distance = world.Base.Distance( px, py, pz, detail );

					if ( distance < Math.max( detail, 0.0025 ) ) {
						cpu = true;
						break;
					}
					t += Math.max( distance * 0.9, 0.005 );
				}
				result.Samples++;
				result.Gpu += gpu ? 1 : 0;
				result.Cpu += cpu ? 1 : 0;
				result.Disagree += gpu !== cpu ? 1 : 0;
			}
		}
		return result;
	},
};

Object.assign(
	window,
	{
		sdfProbe: probe,
		sdfReady: true,
		sdfDemo: {
			/** Shows variant A (0) or B (1) of ?ab=. */
			AB: ( which: number ): void => {
				marched?.Mesh.setEnabled( which === 0 );
				marchedB?.Mesh.setEnabled( which === 1 );
			},
			/**
			 * The GPU's milliseconds per frame: `count` frames drawn back to
			 * back, the queue drained before and after by a pixel read
			 * back - no vsync, no compositor (Scratch: bench2.mjs); `turn`
			 * turns the camera that much each frame.
			 */
			Bench: ( count: number, turn = 0 ): number => {
				const gl = engine._gl;
				const pixel = new Uint8Array( 4 );
				const Drain = (): void => gl.readPixels(
					0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel,
				);

				Drain();

				const start = performance.now();

				for ( let i = 0; i < count; i++ ) {
					// ( turn: radians a frame round the target, a moving view )
					camera.alpha += turn;
					scene.render();
				}
				Drain();
				return ( performance.now() - start ) / count;
			},
			scene,
			context,
			world,
			upscaler,
			Layers: () => ( {
				marched,
				meshed,
				volume,
				grass,
				thrower,
				balls,
			} ),
		},
	},
);

/**
 * The world over a box in bricks of the dense grid's spacing (`texels` along
 * its longest axis), the map's window around it, all built at once.
 */
function Bricks( field: SdfField, box: Aabb, texels: number ): SdfVolume {
	const size = Math.max(
		box[3]! - box[0]!,
		box[4]! - box[1]!,
		box[5]! - box[2]!,
	);
	const spacing = size / texels;
	const volume = new SdfVolume( field, {
		Spacing: spacing,
		// the box and a cell to spare on each side
		MapSize: Math.ceil( texels / 8 ) + 2,
		AtlasSize: [ 160, 160, 160 ],
		Budget: Infinity,
		Materials: true,
		// occlusion and soft shadows read the field this far out
		RangeSpacings: 8,
		// as the dense grid: only the box
		Bounds: box,
	} );

	volume.CenterOn(
		( box[0]! + box[3]! ) / 2,
		( box[1]! + box[4]! ) / 2,
		( box[2]! + box[5]! ) / 2,
		true,
	);
	volume.Update();
	volume.Budget = 256;
	return volume;
}
