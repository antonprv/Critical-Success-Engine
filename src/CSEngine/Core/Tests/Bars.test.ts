// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { SceneRegistry } from "../Source/Engine/Scenes/SceneRegistry";
import { Health } from "../Source/Game/GuideExamples/HealthBar";
import { UiController } from "../Source/Workers/Ui/UiController";
import { Harness } from "./Harness";

describe("HUD bars (guide 06)", () => {
	it("script -> UiService -> message -> UiController state", async () => {
		const harness = new Harness(new SceneRegistry().Register({
			id: "t", name: "T", description: "", entities: [Ent("Hero", [Comp(Health, { Current: 40 })])],
		}));
		await harness.BootToScene();
		harness.render.Receive({ type: "frame-request", frameId: 1 });

		const bars = harness.UiMessages("bars") as unknown as { bars: { id: string; label: string; value: number; }[]; }[];
		expect(bars.at(-1)?.bars).toEqual([{ id: "hp", label: "HP 40/100", value: 0.4 }]);

		const ui = new UiController(() => undefined, () => undefined);
		ui.OnGameLogicMessage({ type: "bars", bars: bars.at(-1)!.bars });
		expect(ui.State.hud.bars).toHaveLength(1);
	});
});
