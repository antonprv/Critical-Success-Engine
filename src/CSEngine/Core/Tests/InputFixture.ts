// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { DataAssets } from "../Source/Engine/Data/DataAsset";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ParseInputManifest, type ActionDefinition, type InputManifest, type ProjectInput } from "../Source/Engine/Input/InputActions";
import { ParseProject } from "../Source/Engine/Projects/ProjectDescriptor";

const A = (Name: string, Keyboard: [string, string], Gamepad: string): ActionDefinition => ({ Name, Label: Name, Category: "", Default: { Keyboard, Gamepad } });

/**
 * The actions the engine's components are written against (by name), with the usual bindings: the controls the unit
 * tests of those components play with. A test fixture - the engine itself has no actions; projects define theirs.
 */
export const TestInput: InputManifest = {
	FileVersion: 1, Name: "Tests", DefaultMap: "Main",
	ActionMaps: [{
		Name: "Main",
		Actions: [
			A("MoveForward", ["KeyW", "ArrowUp"], "Pad:LeftStickUp"), A("MoveBack", ["KeyS", "ArrowDown"], "Pad:LeftStickDown"),
			A("MoveLeft", ["KeyA", "ArrowLeft"], "Pad:LeftStickLeft"), A("MoveRight", ["KeyD", "ArrowRight"], "Pad:LeftStickRight"),
			A("Jump", ["Space", ""], "Pad:A"), A("Sprint", ["ShiftLeft", ""], "Pad:LS"), A("Noclip", ["KeyN", ""], ""),
			A("LookLeft", ["", ""], "Pad:RightStickLeft"), A("LookRight", ["", ""], "Pad:RightStickRight"),
			A("LookUp", ["", ""], "Pad:RightStickUp"), A("LookDown", ["", ""], "Pad:RightStickDown"),
			A("ToggleView", ["KeyV", ""], "Pad:RS"), A("PanView", ["Mouse1", ""], ""), A("ZoomIn", ["", ""], "Pad:DUp"),
			A("ZoomOut", ["", ""], "Pad:DDown"), A("Recenter", ["Home", ""], "Pad:Back"), A("Fire", ["Mouse0", ""], "Pad:RT"),
			A("Restart", ["KeyR", ""], "Pad:Start"),
		],
	}],
};

export const TestProjectInput: ProjectInput = { Manifests: { Tests: TestInput }, Default: "Tests" };

/**
 * What the runtime harness plays with: Games Sample's input manifests (its scenes switch to theirs) and the test
 * fixture as the default (test scenes that name none get it - the rule for any scene that names none).
 */
export function HarnessInput(): ProjectInput {
	return { Manifests: { ...GamesSampleInput().Manifests, Tests: TestInput }, Default: "Tests" };
}

/** Games Sample's data assets, read from disk (as the game fetches them from beside the page). */
export function GamesSampleData(): DataAssets {
	const file = resolve("Samples/GamesSample.cseproject");
	const project = ParseProject(readFileSync(file, "utf8"));
	return DataAssets.Loaded(Object.fromEntries(project.Data.map(({ Id, Path }) => [Id, { Url: `data/${Id}.csedata`, Text: readFileSync(join(dirname(file), Path), "utf8") }])));
}

/** Games Sample's input manifests, read from disk as the build reads them. */
export function GamesSampleInput(): ProjectInput {
	const file = resolve("Samples/GamesSample.cseproject");
	const project = ParseProject(readFileSync(file, "utf8"));
	const manifests = Object.fromEntries(project.Input.Manifests.map(({ Id, Path }) => [Id, ParseInputManifest(readFileSync(join(dirname(file), Path), "utf8"))]));
	return { Manifests: manifests, Default: project.Input.Default };
}
