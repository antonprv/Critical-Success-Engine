// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { CameraComponent } from "../Source/Engine/Components/Camera/CameraComponent";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { Shooter } from "../Source/Engine/Gameplay/Scripts";
import { InputEvtType } from "../Source/Workers/Common/CommonEnums";
import { FpsHud } from "../../../Templates/FirstPerson/Source/Scripts/FpsHud";
import { MakeEngine } from "./engine";
import { UiCommands } from "./GameUiFixture";

const shots = (n: number) => ({ op: "set-text", id: "FirstPersonHud", widget: "Shots", text: `Shots: ${n}` });

describe("First Person template: the HUD is the FirstPersonHud UI document", () => {
	function Game(withShooter = true) {
		UiCommands.length = 0;
		const t = MakeEngine();
		t.world.Spawn(Ent("Camera", [Comp(CameraComponent, { TargetName: "Nobody" })], { position: [0, 2, 0] }));
		if (withShooter) t.world.Spawn(Ent("Player", [Comp(Shooter)]));
		const hud = t.world.Spawn(Ent("Hud", [Comp(FpsHud)])).GetComponent(FpsHud)!;
		t.world.FlushLifecycle();
		t.input.CapturePlayerInput = true;
		const shoot = (): void => {
			t.input.Handle({ kind: InputEvtType.PointerDown, button: 0 });
			t.frame();
			t.input.Handle({ kind: InputEvtType.PointerUp, button: 0 });
			t.world.FlushLifecycle();
		};
		return { t, hud, shoot };
	}

	it("shows the crosshair and the shot counter, and updates the counter only when it changes", () => {
		const { t, shoot } = Game();
		t.frame();
		expect(UiCommands).toEqual([{ op: "show", id: "FirstPersonHud" }, shots(0)]);
		t.frame();
		expect(UiCommands).toHaveLength(2);
		shoot();
		t.frame();
		expect(UiCommands.at(-1)).toEqual(shots(1));
	});

	it("without a shooter the counter reads zero; leaving the scene hides the HUD, and a HUD never drawn has nothing to hide", () => {
		const { t, hud } = Game(false);
		t.frame();
		expect(UiCommands).toEqual([{ op: "show", id: "FirstPersonHud" }, shots(0)]);
		hud.OnDestroy();
		expect(UiCommands.at(-1)).toEqual({ op: "hide", id: "FirstPersonHud" });
		UiCommands.length = 0;
		Game().hud.OnDestroy();
		expect(UiCommands).toEqual([]);
	});
});
