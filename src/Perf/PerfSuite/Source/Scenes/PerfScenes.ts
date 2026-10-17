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
import { SdfOp, SdfShape } from "@cse/sdf";
import { InteropLoad } from "../Scripts/Interop";
import { SdfDigger } from "../Scripts/SdfDigger";
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

/**
 * An SDF world: ground and smoothly joined shapes baked as the scene loads, a
 * hole circling through it and pits dug every second (the SDF worker remeshes
 * all the time), and 200 balls landing on it (its chunks in the physics).
 */
export const SdfScene: SceneManifest = {
	...Scene(
		"sdf",
		"SDF world",
		"A baked SDF world, a moving hole, pits dug, 200 balls on it.",
		[
			Ent( "Digger", [ Comp( SdfDigger ) ] ),
			...Array.from( { length: 200 }, ( _, i ) => DynamicShape(
				`Ball ${ i }`,
				Shapes.Sphere( 0.3 ),
				[
					( i % 20 ) - 9.5,
					4 + Math.floor( i / 100 ) * 1.5,
					( Math.floor( i / 20 ) % 10 ) * 2 - 9,
				],
				[0.9, 0.4 + ( i % 5 ) * 0.1, 0.2],
			) ),
			Camera( [0, 16, 22], [0, 0, 0] ),
		],
	),
	sdf: {
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
];
