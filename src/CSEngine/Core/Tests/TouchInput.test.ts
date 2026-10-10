// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { ParseInputManifest, TouchKindOf, type InputManifest } from "../Source/Engine/Input/InputActions";
import { InputService } from "../Source/Engine/Services/InputService";
import { InputEvtType } from "../Source/Workers/Common/CommonEnums";

const A = (Name: string, keys: [string, string], Touch?: string) => ({ Name, Label: Name, Category: "", Default: { Keyboard: keys, Gamepad: "" }, ...(Touch ? { Touch } : {}) });

describe("touch kinds in input manifests", () => {
	it("each action says which on-screen control presses it; Move and Look actions default to the sticks, the rest to buttons", () => {
		const manifest = ParseInputManifest(JSON.stringify({ Name: "M", ActionMaps: [{ Name: "Main", Actions: [
			A("MoveForward", ["KeyW", ""]), A("LookLeft", ["", ""]), A("Jump", ["Space", ""]), A("Noclip", ["KeyN", ""], "None"), A("Steer", ["", ""], "MoveStick"),
		] }] }));
		expect(manifest.ActionMaps[0]!.Actions.map(TouchKindOf)).toEqual(["MoveStick", "LookStick", "Button", "None", "MoveStick"]);
		expect(() => ParseInputManifest(JSON.stringify({ Name: "M", ActionMaps: [{ Name: "Main", Actions: [A("Jump", ["", ""], "Wheel")] }] })))
			.toThrow('Not an input manifest: "Jump" in "Main" has Touch "Wheel" (MoveStick, LookStick, Button or None)');
	});
});

describe("InputService: actions pressed from the screen", () => {
	const Manifest: InputManifest = { FileVersion: 1, Name: "M", DefaultMap: "Main", ActionMaps: [{ Name: "Main", Actions: [
		A("MoveForward", ["KeyW", ""]), A("MoveRight", ["KeyD", ""]), A("Jump", ["Space", ""]),
	] as never }] };
	function Service() {
		const input = new InputService();
		input.System.Install({ Manifests: { M: Manifest }, Default: "M" });
		input.CapturePlayerInput = true;
		return input;
	}

	it("a touch value presses the action like a key (down, just pressed once, analog value); it adds to the keyboard", () => {
		const input = Service();
		input.SetTouch("Jump", 1);
		expect([input.IsActionDown("Jump"), input.ActionJustPressed("Jump"), input.ActionJustPressedPhysics("Jump")]).toEqual([true, true, true]);
		input.EndFrame();
		input.EndPhysicsStep();
		input.SetTouch("Jump", 1); // still held: not pressed again
		expect([input.IsActionDown("Jump"), input.ActionJustPressed("Jump")]).toEqual([true, false]);
		input.SetTouch("Jump", 0);
		expect(input.IsActionDown("Jump")).toBe(false);
		input.SetTouch("MoveForward", 0.4); // a stick half-way: analog, not "down"
		expect([input.ActionValue("MoveForward"), input.IsActionDown("MoveForward")]).toEqual([0.4, false]);
		input.Handle({ kind: InputEvtType.KeyDown, code: "KeyD" });
		expect(input.GetMoveVector().map((v) => Math.round(v * 100) / 100)).toEqual([0.93, -0.37]); // the stick and the key together, never longer than 1
	});

	it("nothing from the screen while the game has no input; releasing everything lets go of it too", () => {
		const input = Service();
		input.CapturePlayerInput = false;
		input.SetTouch("Jump", 1);
		input.CapturePlayerInput = true;
		expect(input.IsActionDown("Jump")).toBe(false);
		input.SetTouch("Jump", 1);
		input.Handle({ kind: InputEvtType.ReleaseAll });
		expect([input.IsActionDown("Jump"), input.ActionValue("Jump")]).toEqual([false, 0]);
	});
});
