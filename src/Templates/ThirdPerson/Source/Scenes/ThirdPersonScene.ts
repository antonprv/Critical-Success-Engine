// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Comp, Ent, type EntityManifest, type SceneManifest } from "@cse/core/Engine/Core/EntityManifest";
import { MeshForShape, Shapes } from "@cse/core/Engine/Core/Shapes";
import { CameraComponent } from "@cse/core/Engine/Components/Camera/CameraComponent";
import { MeshRenderer } from "@cse/core/Engine/Components/MeshRenderer";
import { MoverComponent } from "@cse/core/Engine/Components/Mover/MoverComponent";
import { HudText } from "@cse/core/Engine/Gameplay/Scripts";
import { StaticBox } from "@cse/core/Engine/Scenes/SceneHelpers";
import { CameraDistance } from "../Scripts/CameraDistance";
import { DistanceHud } from "../Scripts/DistanceHud";

const Grey: [number, number, number] = [0.45, 0.47, 0.5];
const Wall: [number, number, number] = [0.3, 0.33, 0.38];
const PlayerShape = Shapes.Capsule(0.5, 2);

/** A walled arena with steps and a deck to climb. */
function Arena(): EntityManifest[] {
	return [
		StaticBox("Floor", [30, 1, 30], [0, -0.5, 0], [0.48, 0.55, 0.45]),
		StaticBox("Wall North", [30, 4, 1], [0, 2, -14.5], Wall),
		StaticBox("Wall South", [30, 4, 1], [0, 2, 14.5], Wall),
		StaticBox("Wall West", [1, 4, 28], [-14.5, 2, 0], Wall),
		StaticBox("Wall East", [1, 4, 28], [14.5, 2, 0], Wall),
		StaticBox("Step 1", [3, 0.4, 3], [6, 0.2, -4], Grey),
		StaticBox("Step 2", [3, 0.8, 3], [6, 0.4, -7], Grey),
		StaticBox("Deck", [6, 1.2, 4], [6, 0.6, -11], [0.6, 0.5, 0.35]),
		StaticBox("Pillar", [1.5, 3, 1.5], [-5, 1.5, -5], Wall),
	];
}

export const ThirdPersonScene: SceneManifest = {
	id: "third-person",
	name: "Third person arena",
	description: "A character seen from behind: the camera arm shortens against walls. WASD/Space/mouse, V first person.",
	gravity: [0, -20, 0],
	clearColor: [0.55, 0.68, 0.82],
	// Its controls: the project's input manifest "ThirdPerson" (Content/Input/ThirdPerson.input.json).
	input: "ThirdPerson",
	entities: [
		...Arena(),
		Ent("Player", [
			Comp(MeshRenderer, { Mesh: MeshForShape(PlayerShape), Color: [0.9, 0.9, 0.95] }),
			Comp(MoverComponent, { CameraName: "Camera" }),
		], { position: [0, 1.2, 6], tags: ["player"] }),
		Ent("Camera", [Comp(CameraComponent, { TargetName: "Player", EyeHeight: 0.6, ThirdPerson: true, ArmLength: 5, Pitch: -15 }), Comp(CameraDistance)]),
		// The game's own HUD (distance walked): a UI document.
		Ent("Hud", [Comp(DistanceHud)]),
		Ent("Hints", [Comp(HudText, { Lines: ["WASD move   Space jump   Mouse look   V first person", "Esc - menu / scene select"] })]),
	],
};
