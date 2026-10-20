// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The perf harness's scenes (src/CSEngine/Core/Perf/Scenarios.mjs): one kind of
// load each.

import { CollisionLayer } from "@cse/core/Engine/Core/CollisionLayer";
import {
	Comp,
	Ent,
	type EntityManifest,
	type SceneManifest,
} from "@cse/core/Engine/Core/EntityManifest";
import { Meshes, MeshForShape, Shapes } from "@cse/core/Engine/Core/Shapes";
import {
	FixedCamera,
} from "@cse/core/Engine/Components/Camera/CameraComponent";
import { CSharp } from "@cse/core/Engine/Components/CSharp";
import { MeshRenderer } from "@cse/core/Engine/Components/MeshRenderer";
import {
	KinematicBody,
} from "@cse/core/Engine/Components/Physics/PhysicsBodies";
import { DynamicShape, StaticBox } from "@cse/core/Engine/Scenes/SceneHelpers";
import type { Vec3Tuple } from "@cse/core/Engine/Math/Vec3";
import { InvertedMandelbrot, SdfOp, SdfShape } from "@cse/sdf";
import { InteropLoad } from "../Scripts/Interop";
import { SdfDigger } from "../Scripts/SdfDigger";
import { SdfCannon } from "../Scripts/SdfCannon";
import { SplatGun } from "../Scripts/SplatGun";
import { SdfBody } from "@cse/core/Engine/Components/Sdf/SdfBody";
import { SdfWorm } from "@cse/core/Engine/Components/Sdf/SdfWorm";
import { RigidBody } from "@cse/core/Engine/Components/Physics/PhysicsBodies";
import { Flyover } from "../Scripts/Flyover";
import { Spin } from "../Scripts/Spin";
import { UiLoad } from "../Scripts/UiLoad";

const Camera = ( position: Vec3Tuple, lookAt: Vec3Tuple ): EntityManifest => (
	Ent(
		"Camera",
		[Comp( FixedCamera, { LookAt: lookAt, FovDegrees: 60 } )],
		{ position },
	)
);

const Scene = (
	id: string,
	name: string,
	description: string,
	entities: EntityManifest[],
): SceneManifest => ( {
	id, name, description, input: "PerfSuite", clearColor: [0.06, 0.08, 0.12],
	entities,
} );

/** Nothing but a camera: the engine's own cost per frame. */
export const EmptyScene = Scene(
	"empty",
	"Empty",
	"A camera and nothing else.",
	[Camera( [0, 5, 10], [0, 0, 0] )],
);

/** 10 000 small static boxes (no physics): the cost per entity of drawing. */
export const EntitiesScene = Scene(
	"entities-10k",
	"10 000 entities",
	"10 000 static boxes on a grid, no physics.",
	[
		...Array.from(
			{ length: 10_000 },
			( _, i ) => Ent(
				`Box ${ i }`,
				[
					Comp(
						MeshRenderer,
						{
							Mesh: Meshes.Box( 0.6, 0.6, 0.6 ),
							Color: [
								0.3 + ( i % 7 ) * 0.1,
								0.5,
								0.8 - ( i % 5 ) * 0.1,
							],
						},
					),
				],
				{
					position: [
						( i % 100 ) - 49.5,
						0,
						Math.floor( i / 100 ) - 49.5,
					],
				},
			),
		),
		Camera( [0, 45, 60], [0, 0, 0] ),
	],
);

/** A wavy grid of 224 x 224 quads: 100 352 triangles in one mesh. */
export function TerrainTriangles( cells = 224, size = 80 ): number[] {
	const height = ( x: number, z: number ): number => Math.sin( x * 0.35 )
		* Math.cos( z * 0.3 )
		* 1.5;
	const step = size / cells;
	const out: number[] = [];

	for ( let row = 0; row < cells; row++ ) {
		for ( let column = 0; column < cells; column++ ) {
			const x0 = column * step - size / 2,
				z0 = row * step - size / 2;
			const x1 = x0 + step,
				z1 = z0 + step;
			const a = [x0, height( x0, z0 ), z0],
				b = [
					x1,
					height( x1, z0 ),
					z0,
				];
			const c = [x1, height( x1, z1 ), z1],
				d = [
					x0,
					height( x0, z1 ),
					z1,
				];
			// counter-clockwise seen from above
			out.push( ...a, ...d, ...c, ...a, ...c, ...b );
		}
	}
	return out;
}

export const GeometryScene = Scene(
	"static-100k",
	"100 000 triangles",
	"One static mesh of 100 352 triangles.",
	[
		Ent(
			"Terrain",
			[
				Comp(
					MeshRenderer,
					{
						Mesh: Meshes.Triangles( TerrainTriangles() ),
						Color: [0.4, 0.6, 0.35],
					},
				),
			],
		),
		Camera( [0, 30, 50], [0, 0, 0] ),
	],
);

/**
 * 2 000 balls in a bowl, stirred by a turning paddle taller than the heap,
 * so they never fall asleep.
 */
export const PhysicsScene = Scene(
	"physics-2000",
	"Physics: 2 000 bodies",
	"2 000 dynamic balls stirred by a kinematic paddle.",
	[
		StaticBox( "Floor", [24, 1, 24], [0, -0.5, 0], [0.35, 0.4, 0.45] ),
		StaticBox( "Wall N", [24, 6, 1], [0, 3, -12], [0.3, 0.33, 0.4] ),
		StaticBox( "Wall S", [24, 6, 1], [0, 3, 12], [0.3, 0.33, 0.4] ),
		StaticBox( "Wall E", [1, 6, 24], [12, 3, 0], [0.3, 0.33, 0.4] ),
		StaticBox( "Wall W", [1, 6, 24], [-12, 3, 0], [0.3, 0.33, 0.4] ),
		Ent( "Paddle", [
			Comp(
				MeshRenderer,
				{
					Mesh: MeshForShape( Shapes.Box( 21, 4, 0.8 ) ),
					Color: [0.9, 0.5, 0.2],
				},
			),
			Comp(
				KinematicBody,
				{
					Shape: Shapes.Box( 21, 4, 0.8 ),
					Layer: CollisionLayer.World,
				},
			),
			Comp( Spin, { Speed: 1.2 } ),
		], { position: [0, 2, 0] } ),
		...Array.from( { length: 2000 }, ( _, i ) => DynamicShape(
			`Ball ${ i }`,
			Shapes.Sphere( 0.3 ),
			// a little off the grid: balls dropped exactly on top of each other
			// would stand in columns
			[
				( i % 20 ) - 9.5 + ( ( i * 37 ) % 11 - 5 ) * 0.04,
				1 + Math.floor( i / 400 ) * 0.8,
				( Math.floor( i / 20 ) % 20 ) - 9.5 + ( ( i * 53 ) % 13 - 6 ) * 0.04,
			],
			[0.9, 0.4 + ( i % 5 ) * 0.1, 0.2],
		) ),
		Camera( [0, 22, 24], [0, 0, 0] ),
	],
);

/**
 * TypeScript and C# calling each other 500 times a frame each, through
 * contracts.
 */
export const InteropScene = Scene(
	"interop",
	"C# and TypeScript calls",
	"500 calls a frame each way through a contract.",
	[
		Ent(
			"Interop",
			[
				Comp( InteropLoad, { CallsPerFrame: 500 } ),
				CSharp( "InteropTarget", { CallsPerFrame: 500 } ),
			],
		),
		Camera( [0, 5, 10], [0, 0, 0] ),
	],
);

/** A UI document whose 120 labels change every frame. */
export const UiScene = Scene(
	"ui-heavy",
	"Busy UI",
	"A UI document of 120 labels, every one changed every frame.",
	[
		Ent( "Ui", [Comp( UiLoad, { Labels: 120 } )] ),
		Camera( [0, 5, 10], [0, 0, 0] ),
	],
);

/** The SDF scenes' world: ground and smoothly joined shapes, baked at load. */
const SdfWorld: NonNullable<SceneManifest["sdf"]> = {
	// where the camera's focus (FocusAhead in front of it) is
	Start: [ 0, 0, 0 ],
	Base: {
		Bake: {
			Ground: 0,
			Bounds: [ -16, -2, -16, 16, 6, 16 ],
			Spacing: 0.2,
			Edits: [
				{
					Shape: SdfShape.Sphere,
					Position: [ 0, 1.5, 0 ],
					Params: [ 2.5, 0, 0, 0 ],
					MaterialId: 1,
				},
				{
					Shape: SdfShape.RoundBox,
					Op: SdfOp.SmoothUnion,
					Position: [ 5, 1, -3 ],
					Params: [ 2, 1.2, 2, 0.4 ],
					SmoothK: 1,
					MaterialId: 3,
				},
				{
					Shape: SdfShape.Torus,
					Op: SdfOp.SmoothUnion,
					Position: [ -6, 0.6, 2 ],
					Params: [ 2, 0.6, 0, 0 ],
					SmoothK: 0.6,
					MaterialId: 4,
				},
			],
		},
	},
	MaxEdits: 8,
	CellSize: 0.25,
	ChunkCells: 16,
	Radius: 3,
	FocusAhead: 26,
};

/** 200 balls dropped onto the SDF world (its chunks in the physics). */
const Balls = (): EntityManifest[] => Array.from(
	{ length: 200 },
	( _, i ) => DynamicShape(
		`Ball ${ i }`,
		Shapes.Sphere( 0.3 ),
		[
			( i % 20 ) - 9.5,
			4 + Math.floor( i / 100 ) * 1.5,
			( Math.floor( i / 20 ) % 10 ) * 2 - 9,
		],
		[0.9, 0.4 + ( i % 5 ) * 0.1, 0.2],
	),
);

/**
 * An SDF world: a hole circling through it (a dynamic edit, drawn by the
 * GPU), pits dug every second (recent edits: remeshed by the SDF worker's
 * pool and given to the physics), 200 balls on it, the sun's shadows and the
 * occlusion between the world and the balls.
 */
export const SdfScene: SceneManifest = {
	...Scene(
		"sdf",
		"SDF world",
		"A baked SDF world, a moving hole, pits dug, 200 balls on it.",
		[
			Ent( "Digger", [ Comp( SdfDigger ) ] ),
			...Balls(),
			Camera( [0, 16, 22], [0, 0, 0] ),
		],
	),
	sdf: SdfWorld,
};

/**
 * Dynamic edits moving every frame through the SDF world, over the balls:
 * what they cost is the GPU's (a ray-marched hull each, the chunks they
 * reach cut), nothing is remeshed, written or sent to the SDF worker.
 */
const SdfDynamic = ( id: string, holes: number ): SceneManifest => ( {
	...Scene(
		id,
		`SDF, ${ holes } dynamic edits`,
		`${ holes } dynamic edits moving every frame through an SDF world, `
			+ "200 balls.",
		[
			Ent( "Digger", [ Comp( SdfDigger, { Holes: holes, DigEvery: 0 } ) ] ),
			...Balls(),
			Camera( [0, 16, 22], [0, 0, 0] ),
		],
	),
	sdf: SdfWorld,
} );

/** A few interactive things at once: four holes and blobs. */
export const SdfDynamicScene = SdfDynamic( "sdf-dynamic", 4 );

/** The most there can be (MAX_DYNAMIC_EDITS), all large: a stress test. */
export const SdfDynamicStressScene = SdfDynamic( "sdf-dynamic-16", 16 );

/**
 * Real edits as fast as a game would hardly make them: ten pits a second,
 * each remeshed by the SDF worker's pool, sampled into the renderer's
 * volume and swapped into the physics under the balls resting there.
 */
export const SdfDiggingScene: SceneManifest = {
	...Scene(
		"sdf-digging",
		"SDF digging",
		"Ten pits dug a second into an SDF world under 200 balls.",
		[
			Ent( "Digger", [ Comp( SdfDigger, { Holes: 0, DigEvery: 0.1 } ) ] ),
			...Balls(),
			Camera( [0, 16, 22], [0, 0, 0] ),
		],
	),
	sdf: SdfWorld,
};

/**
 * Grass over the SDF world: 200 balls stirred through it by a turning
 * paddle, pressing the blades flat where they roll (they stand up again
 * behind them), a hole circling through it, felt by the physics.
 */
export const SdfGrassScene: SceneManifest = {
	...Scene(
		"sdf-grass",
		"SDF grass",
		"Splat grass on an SDF world, 200 balls stirred through it.",
		[
			Ent( "Digger", [ Comp( SdfDigger, { Holes: 1, DigEvery: 0 } ) ] ),
			Ent( "Paddle", [
				Comp(
					MeshRenderer,
					{
						Mesh: MeshForShape( Shapes.Box( 18, 1.2, 0.6 ) ),
						Color: [0.9, 0.5, 0.2],
					},
				),
				Comp(
					KinematicBody,
					{
						Shape: Shapes.Box( 18, 1.2, 0.6 ),
						Layer: CollisionLayer.World,
					},
				),
				Comp( Spin, { Speed: 0.8 } ),
			], { position: [0, 0.65, 0] } ),
			...Balls(),
			// a fence: the world is meshed (and felt by the physics) only so
			// far around the focus; a ball flung past it would fall out
			StaticBox( "Fence N", [ 23, 1.5, 0.4 ], [ 0, 0.75, -11.3 ], [ 0.3, 0.33, 0.4 ] ),
			StaticBox( "Fence S", [ 23, 1.5, 0.4 ], [ 0, 0.75, 11.3 ], [ 0.3, 0.33, 0.4 ] ),
			StaticBox( "Fence E", [ 0.4, 1.5, 23 ], [ 11.3, 0.75, 0 ], [ 0.3, 0.33, 0.4 ] ),
			StaticBox( "Fence W", [ 0.4, 1.5, 23 ], [ -11.3, 0.75, 0 ], [ 0.3, 0.33, 0.4 ] ),
			Camera( [0, 14, 20], [0, 0, 0] ),
		],
	),
	sdf: {
		...SdfWorld,
		Base: {
			Bake: {
				Ground: 0,
				Bounds: [ -16, -2, -16, 16, 6, 16 ],
				Spacing: 0.2,
				Edits: [
					{
						Shape: SdfShape.RoundBox,
						Op: SdfOp.SmoothUnion,
						// inside the meshed area (Radius chunks around the
						// focus): a ball flung to its edge stays on chunks
						Position: [ 0, -1.2, 0 ],
						Params: [ 11, 1.2, 11, 0.6 ],
						SmoothK: 1,
						MaterialId: 0,
					},
				],
			},
		},
		Grass: {
			Bounds: [ -11, -11, 11, 11 ],
			Density: 40,
			Seed: 7,
		},
	},
};

/**
 * Splats thrown at a wall of the SDF world: a dozen in flight (blobs of the
 * world, drawn by the GPU), each stuck where it lands (an edit, remeshed);
 * the pile grows, every other one on a layer of its own.
 */
export const SdfSplatsScene: SceneManifest = {
	...Scene(
		"sdf-splats",
		"SDF splats",
		"Splats thrown at an SDF wall, piling up.",
		[
			Ent( "Gun", [ Comp( SplatGun ) ], { position: [0, 1.2, 4] } ),
			Camera( [5, 6, 9], [0, 1.5, -4] ),
		],
	),
	sdf: {
		...SdfWorld,
		Start: [ 0, 0, -4 ],
		Base: {
			Bake: {
				Ground: 0,
				Bounds: [ -16, -2, -16, 16, 6, 16 ],
				Spacing: 0.2,
				Edits: [
					{
						Shape: SdfShape.RoundBox,
						Position: [ 0, 2, -6 ],
						Params: [ 5, 2.2, 0.4, 0.15 ],
						MaterialId: 3,
					},
				],
			},
		},
		FocusAhead: 10,
	},
};

/** A flat SDF floor (ground at 0) for the scenes below. */
const FlatWorld = ( extra: Partial<NonNullable<SceneManifest["sdf"]>> = {} ): NonNullable<SceneManifest["sdf"]> => ( {
	...SdfWorld,
	Base: {
		Bake: {
			Ground: 0,
			Bounds: [ -16, -2, -16, 16, 6, 16 ],
			Spacing: 0.2,
			Edits: [],
		},
	},
	...extra,
} );

/** A cube of the SDF world on a rigid body: melting into the floor where it stands. */
const SdfCube = ( name: string, position: Vec3Tuple, material: number ): EntityManifest => Ent( name, [
	Comp( RigidBody, { Shape: Shapes.Box( 1, 1, 1 ), Mass: 1.5, Layer: CollisionLayer.Prop } ),
	Comp( SdfBody, {
		Shape: SdfShape.RoundBox,
		Params: [ 0.5, 0.5, 0.5, 0.08 ],
		SmoothK: 0.35,
		MaterialId: material,
	} ),
], { position } );

/**
 * Cubes of the SDF world (rigid bodies drawn as dynamic edits, melting into
 * the SDF floor as they slide) pushed around by balls of the SDF world a
 * cannon fires at them.
 */
export const SdfPushScene: SceneManifest = {
	...Scene(
		"sdf-push",
		"SDF cubes pushed",
		"SDF cubes melting into the SDF floor, pushed by SDF balls fired at them.",
		[
			SdfCube( "Cube A", [ -2, 0.5, 0 ], 3 ),
			SdfCube( "Cube B", [ 0, 0.5, -1 ], 4 ),
			SdfCube( "Cube C", [ 2, 0.5, 0 ], 5 ),
			// at the cubes' middle height, 6 m off: hits them square
			Ent( "Cannon", [ Comp( SdfCannon ) ], { position: [ 0, 0.5, 6 ] } ),
			Camera( [ 7, 6, 10 ], [ 0, 0.5, 0 ] ),
		],
	),
	sdf: FlatWorld( { FocusAhead: 6, Start: [ 0, 0, 0 ] } ),
};

/**
 * Shots that take matter away, all at one spot of a wall: craters, deeper
 * with every shot, until they go through (and the shots after fly on
 * through the hole: the physics has it too).
 */
export const SdfBreachScene: SceneManifest = {
	...Scene(
		"sdf-breach",
		"SDF breach",
		"Carving shots at one spot of an SDF wall, drilling through it.",
		[
			Ent( "Gun", [
				Comp( SplatGun, {
					Carve: true,
					Spread: 0.25,
					Pitch: 0.24,
					Every: 0.15,
					InFlight: 8,
					Spots: 3,
					SpotGap: 0.17,
				} ),
			], { position: [ 0, 1.2, 4 ] } ),
			Camera( [ 5, 4, 7 ], [ 0, 1.5, -5 ] ),
		],
	),
	sdf: {
		...FlatWorld( { Start: [ 0, 0, -4 ], FocusAhead: 10 } ),
		Base: {
			Bake: {
				Ground: 0,
				Bounds: [ -16, -2, -16, 16, 6, 16 ],
				Spacing: 0.2,
				Edits: [
					{
						Shape: SdfShape.RoundBox,
						Position: [ 0, 2, -6 ],
						Params: [ 4, 2.2, 0.4, 0.1 ],
						MaterialId: 3,
					},
				],
			},
		},
	},
};

/**
 * A worm of the SDF world growing over the floor (SdfWorm: a curve, a round
 * cone per piece, real edits), balls dropped on it rolling off its back.
 */
export const SdfWormScene: SceneManifest = {
	...Scene(
		"sdf-worm",
		"SDF worm",
		"A curve of the SDF world growing over the floor, balls rolling off it.",
		[
			Ent( "Worm", [
				Comp( SdfWorm, { Radius: 0.4, MaterialId: 4, Area: 7 } ),
			], { position: [ 0, 0.15, 0 ] } ),
			// over where it grows: it grows under them, they roll off its back
			...Array.from( { length: 60 }, ( _, i ) => DynamicShape(
				`Ball ${ i }`,
				Shapes.Sphere( 0.3 ),
				[ ( i % 10 ) - 4.5, 2 + Math.floor( i / 30 ) * 1.5, ( Math.floor( i / 10 ) % 3 ) * 3 - 3 ],
				[ 0.9, 0.4 + ( i % 5 ) * 0.1, 0.2 ],
			) ),
			Camera( [ 0, 14, 14 ], [ 0, 0, 0 ] ),
		],
	),
	sdf: FlatWorld(),
};

/**
 * A land 256 m across - hills, towers - meshed with levels of detail: the
 * chunks grow with the distance (cells 0.25 m near, 4 m far). The camera
 * flies round it, so the chunks split and merge all along.
 */
export const SdfLodScene: SceneManifest = {
	...Scene(
		"sdf-lod",
		"SDF land, levels of detail",
		"A 256 m SDF land meshed with five levels of detail, flown over.",
		[
			Ent( "Camera", [
				Comp( FixedCamera, { LookAt: [ 0, 0, 0 ], FovDegrees: 60 } ),
				Comp( Flyover ),
			], { position: [ 60, 18, 0 ] } ),
		],
	),
	sdf: {
		Start: [ 60, 0, 0 ],
		Base: {
			Bake: {
				Ground: 0,
				// deep: a cell of the coarsest level still sees the solid
				// under the ground
				Bounds: [ -128, -40, -128, 128, 14, 128 ],
				Spacing: 0.5,
				Edits: Array.from( { length: 90 }, ( _, i ) => {
					// a fixed scatter: the same land every run
					const x = Math.sin( i * 12.9898 ) * 118;
					const z = Math.cos( i * 78.233 ) * 118;
					const r = 3 + ( i * 37 ) % 10;

					return i % 9 === 0
						? {
							Shape: SdfShape.RoundBox,
							Op: SdfOp.SmoothUnion,
							Position: [ x, r * 0.6, z ] as Vec3Tuple,
							Params: [ 1.5, r * 0.6, 1.5, 0.3 ] as [ number, number, number, number ],
							SmoothK: 0.5,
							MaterialId: 7,
						}
						: {
							Shape: SdfShape.Sphere,
							Op: SdfOp.SmoothUnion,
							Position: [ x, -r * 0.55, z ] as Vec3Tuple,
							Params: [ r, 0, 0, 0 ] as [ number, number, number, number ],
							SmoothK: 1.5,
							MaterialId: i % 3 === 0 ? 3 : 0,
						};
				} ),
			},
		},
		CellSize: 0.25,
		ChunkCells: 16,
		Radius: 2,
		Levels: 5,
		FocusAhead: 20,
	},
};

/**
 * "Inside the Mandelbulb": the inverted Julia bulb as the world's base (no
 * bounds, nothing baked), a cave about 60 m across with tunnels leading off,
 * meshed with five levels of detail as the camera circles inside it. The
 * sun stays out (a closed cave would be all shadow).
 */
export const SdfFractalScene: SceneManifest = {
	...Scene(
		"sdf-fractal",
		"SDF fractal cave",
		"Inside an inverted Mandelbulb, meshed with levels of detail, flown round.",
		[
			Ent( "Camera", [
				Comp( FixedCamera, { LookAt: [ 0, 0, 0 ], FovDegrees: 60 } ),
				Comp( Flyover, { Radius: 12, Height: 2 } ),
			], { position: [ 12, 2, 0 ] } ),
		],
	),
	sdf: {
		Start: [ 12, 2, 0 ],
		Base: { Analytic: InvertedMandelbrot( 20 ), Spacing: 0.25 },
		CellSize: 0.25,
		ChunkCells: 16,
		Radius: 2,
		Levels: 5,
		Shadows: false,
		VolumeBounds: [ -32, -32, -32, 32, 32, 32 ],
		VolumeTexels: 64,
	},
};

export const PerfScenes = [
	EmptyScene,
	EntitiesScene,
	GeometryScene,
	PhysicsScene,
	InteropScene,
	UiScene,
	SdfScene,
	SdfDynamicScene,
	SdfDynamicStressScene,
	SdfDiggingScene,
	SdfGrassScene,
	SdfSplatsScene,
	SdfPushScene,
	SdfBreachScene,
	SdfWormScene,
	SdfLodScene,
	SdfFractalScene,
];
