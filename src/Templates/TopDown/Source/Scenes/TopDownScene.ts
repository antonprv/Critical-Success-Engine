// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Comp, Ent, type EntityManifest, type SceneManifest } from "@cse/core/Engine/Core/EntityManifest";
import { MeshForShape, Meshes, Shapes } from "@cse/core/Engine/Core/Shapes";
import { StrategyCamera } from "@cse/core/Engine/Components/Camera/StrategyCamera";
import { MeshRenderer } from "@cse/core/Engine/Components/MeshRenderer";
import { MoverComponent } from "@cse/core/Engine/Components/Mover/MoverComponent";
import { HudText } from "@cse/core/Engine/Gameplay/Scripts";
import { StaticBox } from "@cse/core/Engine/Scenes/SceneHelpers";
import { PadCounter, VisitPad } from "../Scripts/Pads";
import { TopDownCameraSetup } from "../Scripts/TopDownCameraSetup";

const Wall: [number, number, number] = [0.3, 0.33, 0.38];
const PlayerShape = Shapes.Capsule(0.5, 2);

/** A pad in each corner of the arena. */
function Pads(): EntityManifest[] {
	return [[-10, -10], [10, -10], [-10, 10], [10, 10]].map(([x, z], i) => Ent(`Pad ${i + 1}`, [
		Comp(MeshRenderer, { Mesh: Meshes.Box(3, 0.05, 3), Color: [0.2, 0.55, 0.9] }),
		Comp(VisitPad, { Shape: Shapes.Box(3, 2, 3) }),
	], { position: [x!, 0.03, z!], tags: ["pad"] }));
}

export const TopDownScene: SceneManifest = {
	id: "top-down",
	name: "Top-down arena",
	description: "Seen from above, as in Baldur's Gate 3: walk onto the pad in every corner. Middle-drag moves the view, the wheel zooms.",
	// The cursor stays visible: the view is moved with the mouse, not turned by it. Esc opens the menu.
	cursor: "free",
	gravity: [0, -20, 0],
	clearColor: [0.2, 0.22, 0.26],
	// Its controls: the project's input manifest "TopDown" (Content/Input/TopDown.input.json).
	input: "TopDown",
	entities: [
		StaticBox("Floor", [28, 1, 28], [0, -0.5, 0], [0.42, 0.46, 0.4]),
		StaticBox("Wall North", [28, 2, 1], [0, 1, -13.5], Wall),
		StaticBox("Wall South", [28, 2, 1], [0, 1, 13.5], Wall),
		StaticBox("Wall West", [1, 2, 26], [-13.5, 1, 0], Wall),
		StaticBox("Wall East", [1, 2, 26], [13.5, 1, 0], Wall),
		StaticBox("Block 1", [3, 1.5, 3], [0, 0.75, -6], Wall),
		StaticBox("Block 2", [3, 1.5, 3], [0, 0.75, 6], Wall),
		...Pads(),
		Ent("Player", [
			Comp(MeshRenderer, { Mesh: MeshForShape(PlayerShape), Color: [0.95, 0.85, 0.3] }),
			Comp(MoverComponent, { CameraName: "Camera" }),
		], { position: [0, 1.2, 0], tags: ["player"] }),
		// Looks down at the player; middle-drag moves the view, the wheel zooms, Home (or walking) brings it back.
		// Its zoom, pitch and edge scrolling come from the TopDownCamera data asset (Content/Data/TopDownCamera.csedata).
		Ent("Camera", [Comp(TopDownCameraSetup), Comp(StrategyCamera, { TargetName: "Player", EyeHeight: 0.6 })]),
		Ent("Rules", [Comp(PadCounter)]),
		Ent("Hints", [Comp(HudText, { Lines: ["WASD move   Space jump   Middle-drag move the view   Wheel zoom", "Home back to the player   Esc - menu / scene select"] })]),
	],
};
