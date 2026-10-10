// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { CameraComponent } from "../Source/Engine/Components/Camera/CameraComponent";
import { StrategyCamera } from "../Source/Engine/Components/Camera/StrategyCamera";
import { DataAssets } from "../Source/Engine/Data/DataAsset";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { GameRules } from "../../../Templates/CoinHunt/Source/Scripts/CoinHunt";
import { ViewSettings } from "../../../Templates/FirstPerson/Source/Scripts/ViewSettings";
import { CameraDistance } from "../../../Templates/ThirdPerson/Source/Scripts/CameraDistance";
import { TopDownCameraSetup } from "../../../Templates/TopDown/Source/Scripts/TopDownCameraSetup";
import { MakeEngine } from "./engine";
import { GamesSampleData } from "./InputFixture";

/** A test engine with the given data assets (as the project's .csedata files). */
function WithData(files: Record<string, { Type: string; Values: Record<string, unknown>; }>) {
	const t = MakeEngine();
	(t.engine as { Data: DataAssets; }).Data = DataAssets.Loaded(Object.fromEntries(Object.entries(files).map(([id, file]) => [id, { Url: `data/${id}.csedata`, Text: JSON.stringify(file) }])));
	return t;
}

describe("the templates read their .csedata files", () => {
	it("Games Sample has every template's data, and each file is valid for its class", () => {
		const data = GamesSampleData();
		expect(data.Ids).toEqual(["CoinHuntRules", "FirstPersonView", "ThirdPersonCamera", "TopDownCamera"]);
	});

	it("Coin Hunt: its rules give the default limit and the choices", () => {
		const t = WithData({ CoinHuntRules: { Type: "CoinHuntRules", Values: { TimeLimitSeconds: 45, TimeLimitChoices: [15, 45] } } });
		const rules = t.world.Spawn(Ent("Rules", [Comp(GameRules)])).GetComponent(GameRules)!;
		t.world.FlushLifecycle();
		expect([rules.TimeLimitSeconds, rules.TimeLeft]).toEqual([45, 45]);
		expect(t.engine.Settings.Definitions.find((d) => d.Key === "TimeLimit")).toMatchObject({ Default: "45", Choices: ["15", "45"] });
	});

	it("First Person and Third Person: their camera numbers", () => {
		const t = WithData({
			FirstPersonView: { Type: "FirstPersonView", Values: { FieldOfView: 80, Min: 50 } },
			ThirdPersonCamera: { Type: "ThirdPersonCamera", Values: { Distance: 6 } },
		});
		const fps = t.world.Spawn(Ent("Fps", [Comp(CameraComponent), Comp(ViewSettings)])).GetComponent(CameraComponent)!;
		const tps = t.world.Spawn(Ent("Tps", [Comp(CameraComponent, { ThirdPerson: true }), Comp(CameraDistance)])).GetComponent(CameraComponent)!;
		t.world.FlushLifecycle();
		t.frame();
		expect([fps.FovDegrees, tps.ArmLength]).toEqual([80, 6]);
		expect(t.engine.Settings.Definitions.find((d) => d.Key === "FieldOfView")).toMatchObject({ Min: 50, Max: 100 });
	});

	it("Top-Down: the camera's zoom, pitch and edge scrolling", () => {
		const t = WithData({ TopDownCamera: { Type: "TopDownCamera", Values: { Zoom: 12, ZoomMax: 20, EdgeScroll: true } } });
		const camera = t.world.Spawn(Ent("Camera", [Comp(TopDownCameraSetup), Comp(StrategyCamera, { TargetName: "Nobody" })])).GetComponent(StrategyCamera)!;
		t.world.FlushLifecycle();
		expect([camera.Zoom, camera.ZoomMax, camera.EdgeScroll, t.engine.Settings.Toggle("EdgeScroll")]).toEqual([12, 20, true, true]);
		const lonely = MakeEngine();
		lonely.world.Spawn(Ent("Setup", [Comp(TopDownCameraSetup)])); // no camera beside it: nothing to set, and no error
		expect(() => lonely.world.FlushLifecycle()).not.toThrow();
	});

	it("without the files, the classes' defaults (the same numbers the templates ship with)", () => {
		const t = MakeEngine();
		const camera = t.world.Spawn(Ent("Camera", [Comp(TopDownCameraSetup), Comp(StrategyCamera, { TargetName: "Nobody" })])).GetComponent(StrategyCamera)!;
		t.world.FlushLifecycle();
		expect([camera.Zoom, camera.ZoomMin, camera.ZoomMax]).toEqual([18, 6, 30]);
	});
});
