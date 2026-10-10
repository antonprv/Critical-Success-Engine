// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { CollisionLayer } from "@cse/core/Engine/Core/CollisionLayer";
import { Comp, Ent, type EntityManifest, type SceneManifest } from "@cse/core/Engine/Core/EntityManifest";
import { MeshForShape, Meshes, Shapes } from "@cse/core/Engine/Core/Shapes";
import { CameraComponent } from "@cse/core/Engine/Components/Camera/CameraComponent";
import { Follower } from "@cse/core/Engine/Components/Follower";
import { MeshRenderer } from "@cse/core/Engine/Components/MeshRenderer";
import { MoverComponent } from "@cse/core/Engine/Components/Mover/MoverComponent";
import { KinematicBody } from "@cse/core/Engine/Components/Physics/PhysicsBodies";
import { Quat } from "@cse/core/Engine/Math/Quat";
import { Vec3, type Vec3Tuple } from "@cse/core/Engine/Math/Vec3";
import { StaticBox } from "@cse/core/Engine/Scenes/SceneHelpers";
import { Coin, FallRespawn, GameRules } from "../Scripts/CoinHunt";
import { HudText, PlatformMover, Spinner } from "@cse/core/Engine/Gameplay/Scripts";

// <<coin
const StandingUp = Quat.FromAxisAngle(Vec3.Right(), Math.PI / 2).ToTuple(); // a cylinder lies along Y; turn it into a coin on its edge
const CoinShape = Shapes.Sphere(0.6); // pickup radius - a bit generous on purpose
const LiftShape = Shapes.Box(4, 0.4, 4);
const PlayerShape = Shapes.Capsule(0.5, 2);

function CoinAt(index: number, position: Vec3Tuple): EntityManifest {
	return Ent(`Coin ${index}`, [
		Comp(MeshRenderer, { Mesh: Meshes.Cylinder(0.35, 0.08), Color: [1, 0.82, 0.2] }),
		Comp(Spinner, { RadiansPerSecond: 2.5 }),
		Comp(Coin, { Shape: CoinShape }),
	], { position, rotation: StandingUp, tags: ["coin"] });
}
// >>

// <<coin-positions
const CoinPositions: Vec3Tuple[] = [
	// on the floor
	[-9, 1, 9], [9, 1, 9], [-10, 1, 3], [0, 1, -9], [10, 1, -8],
	// on the hop blocks (block top + 1 m, because the player's origin is its centre)
	[4, 2, 0], [8, 2.5, 0],
	// on the raised deck at the top of the ramp
	[-6, 3.75, -8.8],
	// above the lift: ride it up and jump
	[2, 4.6, -9],
];
// >>

/**
 * A small complete game on top of the engine: collect every coin before the clock runs out. Uses the character mover,
 * triggers, kinematic platforms, script-to-script messaging by entity name, HUD lines, toasts and a scene reload.
 * Guide: docs/guides/07-coin-hunt.md
 */
export const CoinHuntScene: SceneManifest = {
	id: "coin-hunt",
	name: "Coin Hunt (sample game)",
	description: "Collect all 9 coins in 60 seconds. Ramp, hop blocks and a lift. R restarts.",
	gravity: [0, -20, 0],
	clearColor: [0.45, 0.62, 0.8],
	// Its controls: the project's input manifest "CoinHunt" (Content/Input/CoinHunt.input.json).
	input: "CoinHunt",
	entities: [
		//#region Arena
		StaticBox("Floor", [26, 1, 26], [0, -0.5, 0], [0.45, 0.55, 0.4]),
		StaticBox("Wall North", [26, 3, 1], [0, 1.5, -12.5], [0.35, 0.38, 0.45]),
		StaticBox("Wall South", [26, 3, 1], [0, 1.5, 12.5], [0.35, 0.38, 0.45]),
		StaticBox("Wall West", [1, 3, 24], [-12.5, 1.5, 0], [0.35, 0.38, 0.45]),
		StaticBox("Wall East", [1, 3, 24], [12.5, 1.5, 0], [0.35, 0.38, 0.45]),

		StaticBox("Hop Block 1m", [3, 1, 3], [4, 0.5, 0], [0.7, 0.5, 0.45]),
		StaticBox("Hop Block 1.5m", [3, 1.5, 3], [8, 0.75, 0], [0.7, 0.55, 0.4]),
		StaticBox("Ramp", [4, 0.4, 8], [-6, 1.2, -3], [0.5, 0.5, 0.55], { rotationX: (20 * Math.PI) / 180 }),
		StaticBox("Deck", [4, 0.4, 4], [-6, 2.55, -8.8], [0.5, 0.5, 0.55]),

		// Order matters: PlatformMover moves the Transform, THEN KinematicBody tells the physics world where it is now.
		Ent("Lift", [
			Comp(MeshRenderer, { Mesh: MeshForShape(LiftShape), Color: [0.85, 0.7, 0.25] }),
			Comp(PlatformMover, { Axis: [0, 1, 0], Distance: 1.5, PeriodSeconds: 6 }),
			Comp(KinematicBody, { Shape: LiftShape, Layer: CollisionLayer.World }),
		], { position: [2, 1.6, -9] }),
		//#endregion

		...CoinPositions.map((position, index) => CoinAt(index + 1, position)),

		// <<player-rules
		//#region Player, camera, rules
		Ent("Player", [
			Comp(MeshRenderer, { Mesh: MeshForShape(PlayerShape), Color: [0.9, 0.9, 0.95] }),
			Comp(FallRespawn, { KillY: -8, SpawnPoint: [0, 1.2, 8] }), // before the mover - see FallRespawn
			Comp(MoverComponent, { CameraName: "Camera" }),
		], { position: [0, 1.2, 8], tags: ["player"] }),

		Ent("Forward Marker", [
			Comp(MeshRenderer, { Mesh: Meshes.Box(0.2, 0.2, 1), Color: [0.9, 0.3, 0.25] }),
			Comp(Follower, { TargetName: "Player", Offset: [0, 0, -0.5] }),
		]),

		Ent("Camera", [Comp(CameraComponent, { TargetName: "Player", EyeHeight: 0.6, ThirdPerson: true, ArmLength: 5 })]),

		Ent("Game", [Comp(GameRules, { TimeLimitSeconds: 60 })]),
		// >>

		Ent("Hints", [Comp(HudText, { Lines: ["WASD move   Space jump   V camera   Esc menu"] })]),
		//#endregion
	],
};
