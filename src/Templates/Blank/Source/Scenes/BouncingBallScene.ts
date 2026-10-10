// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { CollisionLayer } from "@cse/core/Engine/Core/CollisionLayer";
import { Comp, Ent, type SceneManifest } from "@cse/core/Engine/Core/EntityManifest";
import { MeshForShape, Shapes } from "@cse/core/Engine/Core/Shapes";
import { FixedCamera } from "@cse/core/Engine/Components/Camera/CameraComponent";
import { MeshRenderer } from "@cse/core/Engine/Components/MeshRenderer";
import { RigidBody } from "@cse/core/Engine/Components/Physics/PhysicsBodies";
import { StaticBox } from "@cse/core/Engine/Scenes/SceneHelpers";
import { HudText, JumpOnSpace } from "@cse/core/Engine/Gameplay/Scripts";

const BallShape = Shapes.Sphere(0.5);

/** The original demo: one falling ball over a ground slab; Space kicks it upwards. */
export const BouncingBallScene: SceneManifest = {
	id: "bouncing-ball",
	name: "Bouncing ball",
	description: "A ball over a ground slab. Space kicks it upwards - the original pipeline smoke test.",
	gravity: [0, -20, 0],
	clearColor: [0.06, 0.08, 0.12],
	// Its controls: the project's input manifest "Blank" (Content/Input/Blank.input.json).
	input: "Blank",
	entities: [
		StaticBox("Ground", [10, 1, 10], [0, -0.5, 0], [0.35, 0.4, 0.45]),

		Ent("Ball", [
			Comp(MeshRenderer, { Mesh: MeshForShape(BallShape), Color: [0.95, 0.6, 0.2] }),
			Comp(RigidBody, { Shape: BallShape, Mass: 1, Layer: CollisionLayer.Prop }),
			Comp(JumpOnSpace, { Impulse: 6 }),
		], { position: [0, 5, 0] }),

		Ent("Camera", [Comp(FixedCamera, { LookAt: [0, 1, 0], FovDegrees: 60 })], { position: [0, 8.5, 13] }),

		Ent("Hints", [Comp(HudText, { Lines: ["Space - kick the ball", "Esc - menu / scene select"] })]),
	],
};
