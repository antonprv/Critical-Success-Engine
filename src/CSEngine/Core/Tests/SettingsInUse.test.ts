// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { CameraComponent } from "../Source/Engine/Components/Camera/CameraComponent";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { InputEvtType } from "../Source/Workers/Common/CommonEnums";
import { GameRules } from "../../../Templates/CoinHunt/Source/Scripts/CoinHunt";
import { ViewSettings } from "../../../Templates/FirstPerson/Source/Scripts/ViewSettings";
import { CameraDistance } from "../../../Templates/ThirdPerson/Source/Scripts/CameraDistance";
import { MakeEngine } from "./engine";

describe("the general settings in the engine's camera", () => {
	function Rig() {
		const t = MakeEngine();
		const camera = t.world.Spawn(Ent("Camera", [Comp(CameraComponent, { MouseSensitivity: 0.1, PadLookSpeed: 100 })])).GetComponent(CameraComponent)!;
		t.world.FlushLifecycle();
		t.input.CapturePlayerInput = true;
		return { t, camera };
	}

	it("mouse sensitivity multiplies the camera's own; inverted look turns up into down", () => {
		const { t, camera } = Rig();
		t.engine.Settings.Set("MouseSensitivity", 2);
		t.input.Handle({ kind: InputEvtType.PointerMove, dx: 10, dy: -10 });
		t.frame();
		expect([camera.Yaw, camera.Pitch]).toEqual([-2, 2]);
		t.engine.Settings.Set("InvertLook", true);
		t.input.Handle({ kind: InputEvtType.PointerMove, dx: 0, dy: -10 });
		t.frame();
		expect(camera.Pitch).toBe(0); // the same push, the other way
	});

	it("the gamepad look speed multiplies the stick's", () => {
		const { t, camera } = Rig();
		t.engine.Settings.Set("PadLookSpeed", 2);
		t.input.Handle({ kind: InputEvtType.Gamepad, buttons: [], axes: [0, 0, 1, 0] });
		t.frame();
		expect(camera.Yaw).toBeCloseTo(-100 * 2 * t.time.Delta);
	});
});

describe("each template's own settings", () => {
	it("First Person: the field of view setting sets the camera's", () => {
		const t = MakeEngine();
		const camera = t.world.Spawn(Ent("Camera", [Comp(CameraComponent), Comp(ViewSettings)])).GetComponent(CameraComponent)!;
		t.world.FlushLifecycle();
		t.frame();
		expect(camera.FovDegrees).toBe(70);
		t.engine.Settings.Set("FieldOfView", 90);
		t.frame();
		expect(camera.FovDegrees).toBe(90);
		expect(t.engine.Settings.Definitions.find((d) => d.Key === "FieldOfView")).toMatchObject({ Category: "First Person", Min: 60, Max: 100 });
		const lonely = MakeEngine();
		lonely.world.Spawn(Ent("Rig", [Comp(ViewSettings)])); // no camera on its entity: nothing to set, and no error
		lonely.world.FlushLifecycle();
		expect(() => lonely.frame()).not.toThrow();
	});

	it("Third Person: the camera distance setting sets the arm's length", () => {
		const t = MakeEngine();
		const camera = t.world.Spawn(Ent("Camera", [Comp(CameraComponent, { ThirdPerson: true }), Comp(CameraDistance)])).GetComponent(CameraComponent)!;
		t.world.FlushLifecycle();
		t.engine.Settings.Set("CameraDistance", 7);
		t.frame();
		expect(camera.ArmLength).toBe(7);
		const lonely = MakeEngine();
		lonely.world.Spawn(Ent("Rig", [Comp(CameraDistance)])); // no camera on its entity: nothing to set, and no error
		lonely.world.FlushLifecycle();
		expect(() => lonely.frame()).not.toThrow();
	});

	it("Coin Hunt: the time limit setting is the clock of the next game", () => {
		const t = MakeEngine();
		t.engine.Settings.Set("TimeLimit", "90"); // chosen before the game: kept until the game declares it
		const rules = t.world.Spawn(Ent("Rules", [Comp(GameRules)])).GetComponent(GameRules)!;
		t.world.FlushLifecycle();
		expect([rules.TimeLimitSeconds, rules.TimeLeft]).toEqual([90, 90]);
		expect(t.engine.Settings.Definitions.find((d) => d.Key === "TimeLimit")).toMatchObject({ Kind: "Choice", Default: "60", Choices: ["30", "60", "90"] });
		const odd = MakeEngine(); // a scene with a limit of its own: it is the default, and one of the choices
		odd.world.Spawn(Ent("Rules", [Comp(GameRules, { TimeLimitSeconds: 45 })]));
		odd.world.FlushLifecycle();
		expect(odd.engine.Settings.Definitions.find((d) => d.Key === "TimeLimit")).toMatchObject({ Default: "45", Choices: ["30", "45", "60", "90"] });
	});
});
