// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Code of guide 02 (docs/guides/02-first-scene.md). Not registered by default - the guide shows how.

// <<imports
import { CollisionLayer } from "../Engine/Core/CollisionLayer";
import { Comp, Ent, type EntityManifest, type SceneManifest } from "../Engine/Core/EntityManifest";
import { MeshForShape, Shapes } from "../Engine/Core/Shapes";
import { FixedCamera } from "../Engine/Components/Camera/CameraComponent";
import { MeshRenderer } from "../Engine/Components/MeshRenderer";
import { RigidBody } from "../Engine/Components/Physics/PhysicsBodies";
import { StaticBox } from "../Engine/Scenes/SceneHelpers";
import { HudText } from "../Engine/Gameplay/Scripts";
// >>

// <<scene
const BallShape = Shapes.Sphere(0.5);

function Ball(index: number): EntityManifest {
	// Colours are 0..1 rgb; this just walks round the colour wheel.
	const color: [number, number, number] = [
		(Math.sin(index * 1.7) + 1) / 2,
		(Math.sin(index * 1.7 + 2) + 1) / 2,
		(Math.sin(index * 1.7 + 4) + 1) / 2,
	];

	return Ent(`Ball ${index}`, [
		Comp(MeshRenderer, { Mesh: MeshForShape(BallShape), Color: color }),
		Comp(RigidBody, { Shape: BallShape, Mass: 1, Layer: CollisionLayer.Prop }),
	], { position: [(index % 4) - 1.5, 3 + index * 1.2, Math.floor(index / 4) - 1] });
}

export const BallPitScene: SceneManifest = {
	id: "ball-pit",
	name: "Ball pit",
	description: "Twelve balls fall into a box.",
	gravity: [0, -20, 0],
	clearColor: [0.1, 0.12, 0.18],
	entities: [
		StaticBox("Floor", [12, 1, 12], [0, -0.5, 0], [0.4, 0.45, 0.5]),
		StaticBox("Wall West", [1, 3, 12], [-6.5, 1.5, 0], [0.3, 0.33, 0.4]),
		StaticBox("Wall East", [1, 3, 12], [6.5, 1.5, 0], [0.3, 0.33, 0.4]),
		StaticBox("Wall North", [14, 3, 1], [0, 1.5, -6.5], [0.3, 0.33, 0.4]),
		StaticBox("Wall South", [14, 3, 1], [0, 1.5, 6.5], [0.3, 0.33, 0.4]),

		...Array.from({ length: 12 }, (_, index) => Ball(index)),

		Ent("Camera", [Comp(FixedCamera, { LookAt: [0, 1, 0], FovDegrees: 60 })], { position: [0, 9, 12] }),
		Ent("Hints", [Comp(HudText, { Lines: ["Esc - menu / scene select"] })]),
	],
};
// >>
