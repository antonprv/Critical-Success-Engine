// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ChannelHub } from "@cse/core/Engine/Core/Channels";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import type { ButtonController } from "../Source/Controls/ButtonController";
import { UiManager } from "../Source/Documents/UiManager";
import { WithEngineDocuments } from "../Source/Runtime/EngineScreens";
import { EngineSettingsId, SettingsScreen } from "../Source/Runtime/SettingsScreen";

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0)); await nextTick(); };

const definitions = [
	{ Key: "MouseSensitivity", Label: "Mouse sensitivity", Category: "Controls", Kind: "Number", Default: 1, Min: 0.2, Max: 3, Step: 0.1 },
	{ Key: "InvertLook", Label: "Invert looking up and down", Category: "Controls", Kind: "Toggle", Default: false },
	{ Key: "TimeLimit", Label: "Time limit (seconds)", Category: "Coin Hunt", Kind: "Choice", Default: "60", Choices: ["30", "60", "90"] },
];

function Make() {
	const page = new ChannelHub();
	const fromPage: { op: string; [key: string]: unknown; }[] = [];
	page.Connect((_c, payload) => fromPage.push(payload as never));
	const manager = new UiManager(WithEngineDocuments({ Manifest: { FileVersion: 1, Documents: [] }, Load: async () => "" }));
	const screen = new SettingsScreen(manager, page);
	const game = (values: Record<string, unknown>) => page.Deliver("settings", { op: "definitions", definitions, values });
	return { manager, screen, fromPage, game };
}

const rows = (manager: UiManager) => manager.Get(EngineSettingsId)!.Controller<{ Items: { text: string; }[]; }>("Settings").Items.map((i) => i.text);
const pick = (manager: UiManager, index: number) => manager.Get(EngineSettingsId)!.Controller<{ SetSelection(s: Set<number>): void; }>("Settings").SetSelection(new Set([index]));
const press = (manager: UiManager, name: string) => manager.Get(EngineSettingsId)!.Controller<ButtonController>(name).PerformClick();

describe("SettingsScreen: the game's settings on the page", () => {

	it("keeps nothing itself: it sends nothing until the player changes something", () => {
		expect(Make().fromPage).toEqual([]);
	});

	it("lists the settings by category with their values", async () => {
		const { manager, screen, game } = Make();
		game({ MouseSensitivity: 1, InvertLook: false, TimeLimit: "60" });
		screen.Open();
		await settle();
		expect(rows(manager)).toEqual(["[Controls] Mouse sensitivity: 1.0", "[Controls] Invert looking up and down: Off", "[Coin Hunt] Time limit (seconds): 60"]);
	});

	it("More and Less change the picked setting (on its step, within its range; a toggle flips; a choice moves); the game is told", async () => {
		const { manager, screen, game, fromPage } = Make();
		game({ MouseSensitivity: 2.9, InvertLook: false, TimeLimit: "60" });
		screen.Open();
		await settle();
		pick(manager, 0);
		press(manager, "MoreButton");
		press(manager, "MoreButton"); // at the top already
		expect(fromPage.filter((m) => m.op === "set")).toEqual([{ op: "set", key: "MouseSensitivity", value: 3 }, { op: "set", key: "MouseSensitivity", value: 3 }]);
		expect(rows(manager)[0]).toBe("[Controls] Mouse sensitivity: 3.0");
		pick(manager, 1);
		press(manager, "LessButton");
		expect(rows(manager)[1]).toBe("[Controls] Invert looking up and down: On");
		pick(manager, 2);
		press(manager, "LessButton");
		press(manager, "LessButton");
		press(manager, "LessButton"); // the first choice already
		expect(rows(manager)[2]).toBe("[Coin Hunt] Time limit (seconds): 30");
		pick(manager, 2);
		press(manager, "MoreButton");
		expect(rows(manager)[2]).toBe("[Coin Hunt] Time limit (seconds): 60");
	});

	it("nothing picked: More and Less do nothing; the game's update redraws an open screen and keeps the pick; Back closes it", async () => {
		const { manager, screen, game, fromPage } = Make();
		game({ MouseSensitivity: 1, InvertLook: false, TimeLimit: "60" });
		screen.Open();
		await settle();
		press(manager, "MoreButton");
		expect(fromPage).toEqual([]);
		pick(manager, 1);
		game({ MouseSensitivity: 1.5, InvertLook: false, TimeLimit: "60" });
		expect(rows(manager)[0]).toBe("[Controls] Mouse sensitivity: 1.5");
		press(manager, "LessButton");
		expect(rows(manager)[1]).toBe("[Controls] Invert looking up and down: On"); // still the second row
		press(manager, "BackButton");
		expect(manager.IsShown(EngineSettingsId)).toBe(false);
		screen.Dispose();
		game({ MouseSensitivity: 2, InvertLook: false, TimeLimit: "60" }); // after Dispose: not listening
		expect(screen.Values["MouseSensitivity"]).toBe(1.5);
	});
});

describe("SettingsScreen: loose settings and odd input", () => {

	it("a number with no step or range moves by 1; a choice with no options stays; a missing value shows the default; other messages are ignored", async () => {
		const page = new ChannelHub();
		const manager = new UiManager(WithEngineDocuments({ Manifest: { FileVersion: 1, Documents: [] }, Load: async () => "" }));
		const screen = new SettingsScreen(manager, page);
		page.Deliver("settings", { op: "something-else" });
		page.Deliver("settings", { op: "definitions", values: {}, definitions: [
			{ Key: "Count", Label: "Count", Category: "Game", Kind: "Number", Default: 2 },
			{ Key: "Mode", Label: "Mode", Category: "Game", Kind: "Choice", Default: "a" },
		] });
		screen.Open();
		await settle();
		expect(rows(manager)).toEqual(["[Game] Count: 2", "[Game] Mode: a"]);
		pick(manager, 0);
		press(manager, "MoreButton");
		pick(manager, 1);
		press(manager, "MoreButton");
		expect(rows(manager)).toEqual(["[Game] Count: 3", "[Game] Mode: a"]);
	});
});

describe("SettingsScreen: the way to the controls", () => {
	it("its Controls button opens the controls screen", async () => {
		const page = new ChannelHub();
		const manager = new UiManager(WithEngineDocuments({ Manifest: { FileVersion: 1, Documents: [] }, Load: async () => "" }));
		let opened = 0;
		const screen = new SettingsScreen(manager, page, () => opened++);
		screen.Open();
		await settle();
		press(manager, "ControlsButton");
		expect(opened).toBe(1);
		const bare = new UiManager(WithEngineDocuments({ Manifest: { FileVersion: 1, Documents: [] }, Load: async () => "" }));
		new SettingsScreen(bare, page).Open(); // made without one: the button does nothing
		await settle();
		expect(() => bare.Get(EngineSettingsId)!.Controller<ButtonController>("ControlsButton").PerformClick()).not.toThrow();
	});
});
