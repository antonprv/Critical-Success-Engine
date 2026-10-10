// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { CollisionLayer } from "@cse/core/Engine/Core/CollisionLayer";
import { Comp, Ent, type EntityManifest, type SceneManifest } from "@cse/core/Engine/Core/EntityManifest";
import { MeshForShape, Meshes, Shapes } from "@cse/core/Engine/Core/Shapes";
import { CameraComponent } from "@cse/core/Engine/Components/Camera/CameraComponent";
import { Follower } from "@cse/core/Engine/Components/Follower";
import { MeshRenderer } from "@cse/core/Engine/Components/MeshRenderer";
import { MoverComponent } from "@cse/core/Engine/Components/Mover/MoverComponent";
import { KinematicBody, RigidBody, StaticBody } from "@cse/core/Engine/Components/Physics/PhysicsBodies";
import { DynamicBox, DynamicShape, StaticBox, WedgeTriangles } from "@cse/core/Engine/Scenes/SceneHelpers";
import { HudText, PlatformMover, Shooter, TriggerZone } from "@cse/core/Engine/Gameplay/Scripts";
import { FpsHud } from "../Scripts/FpsHud";
import { ViewSettings } from "../Scripts/ViewSettings";

const Grey: [number, number, number] = [0.45, 0.47, 0.5];
const Wall: [number, number, number] = [0.3, 0.33, 0.38];

function Crates(): EntityManifest[] {
	const crates: EntityManifest[] = [];
	let index = 0;
	for (let row = 0; row < 3; row++) {
		for (let column = 0; column < 3 - row; column++) {
			crates.push(DynamicBox(
				`Crate ${++index}`, [0.8, 0.8, 0.8],
				[-5 + column * 0.9 + row * 0.45, 0.4 + row * 0.8, 2], [0.75, 0.55, 0.3]
			));
		}
	}
	return crates;
}

const PyramidPoints = [-0.6, 0, -0.6, 0.6, 0, -0.6, 0.6, 0, 0.6, -0.6, 0, 0.6, 0, 1, 0];
const PyramidShape = Shapes.ConvexHull(PyramidPoints);
const WedgeShape = Shapes.TriangleMesh(WedgeTriangles());
const PlatformShape = Shapes.Box(4, 0.4, 4);
const PlayerShape = Shapes.Capsule(0.5, 2);

/**
 * Test ground for the character controller: ramp, hop walls, a lift and a shuttle platform (kinematic bodies that carry
 * the player), pushable crates, a convex-hull rigid body, a triangle-mesh wedge, a trigger zone. Everything physics-related
 * the bridge exposes is used at least once here.
 */
export const CharacterTestScene: SceneManifest = {
	id: "character-test",
	name: "Character test room",
	description: "Capsule character in a room: ramp, hop walls, moving platforms, crates, trigger, projectiles. WASD/Space/mouse, N noclip, 1-5 movement modes, V camera, click to shoot.",
	gravity: [0, -20, 0],
	clearColor: [0.5, 0.6, 0.72],
	// Its controls: the project's input manifest "FirstPerson" (Content/Input/FirstPerson.input.json).
	input: "FirstPerson",
	entities: [
		//#region Room
		StaticBox("Floor", [26, 1, 26], [0, -0.5, 0], [0.5, 0.52, 0.5]),
		StaticBox("Wall North", [26, 6, 1], [0, 3, -12.5], Wall),
		StaticBox("Wall South", [26, 6, 1], [0, 3, 12.5], Wall),
		StaticBox("Wall West", [1, 6, 24], [-12.5, 3, 0], Wall),
		StaticBox("Wall East", [1, 6, 24], [12.5, 3, 0], Wall),
		//#endregion

		//#region Terrain
		// Ramp (20 degrees, rising towards -Z) leading to a raised deck.
		StaticBox("Ramp", [4, 0.4, 8], [-6, 1.2, -3], Grey, { rotationX: (20 * Math.PI) / 180 }),
		StaticBox("Deck", [4, 0.4, 4], [-6, 2.55, -8.8], Grey),
		// Two hop walls: a 1 m and a 1.5 m block to jump onto.
		StaticBox("Hop Block 1m", [3, 1, 3], [6, 0.5, 4], [0.6, 0.45, 0.45]),
		StaticBox("Hop Block 1.5m", [3, 1.5, 3], [6, 0.75, 8], [0.6, 0.5, 0.4]),

		// Triangle mesh shape (static BVH): a wedge you can walk up.
		Ent("Wedge", [
			Comp(MeshRenderer, { Mesh: MeshForShape(WedgeShape), Color: [0.5, 0.6, 0.45] }),
			Comp(StaticBody, { Shape: WedgeShape, Layer: CollisionLayer.World }),
		], { position: [-10, 0, 7] }),
		//#endregion

		//#region Moving platforms (script moves the Transform, KinematicBody carries the riders)
		Ent("Lift", [
			Comp(MeshRenderer, { Mesh: MeshForShape(PlatformShape), Color: [0.85, 0.7, 0.25] }),
			Comp(PlatformMover, { Axis: [0, 1, 0], Distance: 1.5, PeriodSeconds: 5 }),
			Comp(KinematicBody, { Shape: PlatformShape, Layer: CollisionLayer.World }),
		], { position: [5, 1.6, -6] }),

		Ent("Shuttle", [
			Comp(MeshRenderer, { Mesh: MeshForShape(PlatformShape), Color: [0.35, 0.75, 0.85] }),
			Comp(PlatformMover, { Axis: [1, 0, 0], Distance: 4, PeriodSeconds: 8 }),
			Comp(KinematicBody, { Shape: PlatformShape, Layer: CollisionLayer.World }),
		], { position: [0, 0.2, -8] }),
		//#endregion

		//#region Dynamic props
		...Crates(),
		DynamicShape("Pyramid", PyramidShape, [-2, 3, -2], [0.8, 0.35, 0.6], 2),
		Ent("Heavy Ball", [
			Comp(MeshRenderer, { Mesh: Meshes.Sphere(0.6), Color: [0.3, 0.3, 0.35] }),
			Comp(RigidBody, { Shape: Shapes.Sphere(0.6), Mass: 6, Layer: CollisionLayer.Prop }),
		], { position: [2, 4, 3] }),
		//#endregion

		//#region Trigger
		Ent("Trigger Pad", [
			Comp(MeshRenderer, { Mesh: Meshes.Box(3, 0.05, 3), Color: [0.2, 0.6, 0.9] }),
			Comp(TriggerZone, { Shape: Shapes.Box(3, 2, 3) }),
		], { position: [-6, 0.03, 8] }),
		//#endregion

		//#region Player
		Ent("Player", [
			Comp(MeshRenderer, { Mesh: MeshForShape(PlayerShape), Color: [0.9, 0.9, 0.95] }),
			Comp(MoverComponent, { CameraName: "Camera" }),
			Comp(Shooter),
		], { position: [0, 1.2, 8], tags: ["player"] }),

		Ent("Forward Marker", [
			Comp(MeshRenderer, { Mesh: Meshes.Box(0.2, 0.2, 1), Color: [0.9, 0.3, 0.25] }),
			Comp(Follower, { TargetName: "Player", Offset: [0, 0, -0.5] }),
		]),

		Ent("Camera", [Comp(CameraComponent, { TargetName: "Player", EyeHeight: 0.6, ArmLength: 4 }), Comp(ViewSettings)]),
		//#endregion

		// The game's own HUD (crosshair, shot counter): a UI document.
		Ent("Hud", [Comp(FpsHud)]),
		Ent("Hints", [Comp(HudText, {
			Lines: [
				"WASD move   Space jump   Mouse look",
				"N noclip   1-5 movement mode   V camera   LMB shoot",
				"Esc - menu / scene select",
			],
		})]),
	],
};
