// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { MeshRenderer } from "../Source/Engine/Components/MeshRenderer";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { Meshes, Shapes } from "../Source/Engine/Core/Shapes";
import { DistanceHud } from "../../../Templates/ThirdPerson/Source/Scripts/DistanceHud";
import { PadCounter, VisitPad } from "../../../Templates/TopDown/Source/Scripts/Pads";
import { MakeEngine } from "./engine";
import { UiCommands } from "./GameUiFixture";

describe("Third Person template: the distance HUD", () => {
	function Game(withPlayer = true) {
		UiCommands.length = 0;
		const t = MakeEngine();
		const player = withPlayer ? t.world.Spawn(Ent("Player", [], { position: [0, 1, 0] })) : null;
		const hud = t.world.Spawn(Ent("Hud", [Comp(DistanceHud)])).GetComponent(DistanceHud)!;
		t.world.FlushLifecycle();
		return { t, player, hud };
	}
	const distance = (meters: number) => ({ op: "set-text", id: "ThirdPersonHud", widget: "Distance", text: `Distance: ${meters} m` });

	it("counts the ground the player covers (jumps don't count), shown in whole metres when they change", () => {
		const { t, player } = Game();
		t.frame();
		expect(UiCommands).toEqual([{ op: "show", id: "ThirdPersonHud" }, distance(0)]);
		player!.Transform.Position.Set(3, 1, 4); // 5 m away
		t.frame();
		player!.Transform.Position.Set(3, 6, 4); // up: not walking
		t.frame();
		expect(UiCommands.at(-1)).toEqual(distance(5));
		expect(UiCommands).toHaveLength(3);
	});

	it("without a player it reads zero; leaving hides it, and a HUD never drawn has nothing to hide", () => {
		const { t, hud } = Game(false);
		t.frame();
		expect(UiCommands).toEqual([{ op: "show", id: "ThirdPersonHud" }, distance(0)]);
		hud.OnDestroy();
		expect(UiCommands.at(-1)).toEqual({ op: "hide", id: "ThirdPersonHud" });
		UiCommands.length = 0;
		Game().hud.OnDestroy();
		expect(UiCommands).toEqual([]);
	});
});

describe("Top-Down template: visit every pad", () => {
	function Game() {
		UiCommands.length = 0;
		const t = MakeEngine();
		const pads = [1, 2].map((n) => t.world.Spawn(Ent(`Pad ${n}`, [Comp(MeshRenderer, { Mesh: Meshes.Box(3, 0.05, 3) }), Comp(VisitPad, { Shape: Shapes.Box(3, 2, 3) })], { tags: ["pad"] })));
		const rules = t.world.Spawn(Ent("Rules", [Comp(PadCounter)])).GetComponent(PadCounter)!;
		const player = t.world.Spawn(Ent("Player", [], { tags: ["player"] }));
		const crate = t.world.Spawn(Ent("Crate", []));
		t.world.FlushLifecycle();
		return { t, pads: pads.map((p) => p.GetComponent(VisitPad)!), rules, player, crate };
	}
	const visited = (text: string) => ({ op: "set-text", id: "TopDownHud", widget: "Visited", text });

	it("a pad counts once, for the player only, and turns green; the HUD counts the pads, then says they're all done", () => {
		const { t, pads, player, crate } = Game();
		t.frame();
		expect(UiCommands).toEqual([{ op: "show", id: "TopDownHud" }, visited("Visited: 0 / 2")]);
		pads[0]!.OnTriggerEnter(crate);
		t.frame();
		expect(pads[0]!.Visited).toBe(false);
		pads[0]!.OnTriggerEnter(player);
		pads[0]!.OnTriggerEnter(player);
		t.frame();
		expect(pads[0]!.Visited).toBe(true);
		expect(UiCommands.at(-1)).toEqual(visited("Visited: 1 / 2"));
		pads[1]!.OnTriggerEnter(player);
		t.frame();
		expect(UiCommands.at(-1)).toEqual(visited("All pads visited!"));
	});

	it("leaving the scene hides the HUD; a HUD never drawn has nothing to hide", () => {
		const { t, rules } = Game();
		t.frame();
		rules.OnDestroy();
		expect(UiCommands.at(-1)).toEqual({ op: "hide", id: "TopDownHud" });
		UiCommands.length = 0;
		Game().rules.OnDestroy();
		expect(UiCommands).toEqual([]);
	});
});
