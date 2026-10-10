// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { nextTick, reactive } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { ButtonController } from "../Source/Controls/ButtonController";
import type { LabelController } from "../Source/Controls/LabelController";
import type { WindowController } from "../Source/Controls/WindowController";
import { UiManager } from "../Source/Documents/UiManager";
import { EngineDocuments, EngineLoadingId, EngineMenuId, EngineScreens, WithEngineDocuments } from "../Source/Runtime/EngineScreens";

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0)); await nextTick(); };

const scenes = [{ id: "ball", name: "Bouncing ball", description: "" }, { id: "coins", name: "Coin Hunt", description: "Collect the coins" }];

function Page() {
	const state = reactive({
		loading: { visible: true, label: "Starting…", fraction: 0.1 },
		menu: { visible: false, mode: 0, scenes: [] as typeof scenes, currentSceneId: null as string | null },
		hud: { visible: true, lines: [], bars: [] },
	});
	return {
		State: state, Title: "Games Sample",
		Resume: vi.fn(() => { state.menu.visible = false; }),
		SelectScene: vi.fn(),
		IsStartMenu: () => state.menu.mode === 0,
		UseDocumentScreens: vi.fn(), Pause: vi.fn(), SetTouchMode: vi.fn(),
	};
}

function Make(project: { Id: string; Path: string; Script: string; }[] = [], projectLoad = async (_path: string) => "") {
	const page = Page();
	const manager = new UiManager(WithEngineDocuments({ Manifest: { FileVersion: 1, Documents: project }, Load: projectLoad }));
	const screens = new EngineScreens(manager, page);
	return { page, manager, screens };
}

describe("EngineScreens: the engine's menu and loading screen as UI documents", () => {
	it("take over from the page's own screens; the loading screen follows the loading state", async () => {
		const { page, manager } = Make();
		expect(page.UseDocumentScreens).toHaveBeenCalled();
		await settle();
		const loading = manager.Get(EngineLoadingId)!;
		expect(loading.Controller<{ Value: number; }>("Progress").Value).toBe(10);
		expect(loading.Controller<LabelController>("Status").Label).toBe("Starting…");
		page.State.loading.fraction = 0.55;
		page.State.loading.label = "Spawning";
		await settle();
		expect(loading.Controller<{ Value: number; }>("Progress").Value).toBe(55);
		expect(loading.Controller<LabelController>("Status").Label).toBe("Spawning");
		page.State.loading.visible = false;
		await settle();
		expect(manager.IsShown(EngineLoadingId)).toBe(false);
	});

	it("the menu: the game's title, Play or Resume, the scenes; Play resumes, picking a scene loads it (the current one again too)", async () => {
		const { page, manager } = Make();
		page.State.loading.visible = false;
		page.State.menu.scenes = scenes;
		page.State.menu.currentSceneId = "ball";
		page.State.menu.visible = true;
		await settle();
		const menu = manager.Get(EngineMenuId)!;
		expect(menu.Controller<WindowController>("MenuWindow").Title).toBe("Games Sample");
		expect(menu.Controller<LabelController>("Heading").Label).toBe("Ready");
		expect(menu.Controller<ButtonController>("PlayButton").Label).toBe("Play");
		expect(menu.Controller<{ Items: { text: string; }[]; }>("Scenes").Items.map((i) => i.text)).toEqual(["Bouncing ball (current)", "Coin Hunt - Collect the coins"]);
		menu.Controller<{ SetSelection(s: Set<number>): void; }>("Scenes").SetSelection(new Set([1]));
		expect(page.SelectScene).toHaveBeenCalledWith("coins");
		menu.Controller<{ SetSelection(s: Set<number>): void; }>("Scenes").SetSelection(new Set());
		expect(page.SelectScene).toHaveBeenCalledTimes(1); // nothing picked: nothing loads
		menu.Controller<ButtonController>("PlayButton").PerformClick();
		expect(page.Resume).toHaveBeenCalledTimes(1);
		await settle();
		expect(manager.IsShown(EngineMenuId)).toBe(false); // the page closed the menu: the document goes, without resuming twice
		expect(page.Resume).toHaveBeenCalledTimes(1);

		page.State.menu.mode = 1;
		page.State.menu.visible = true;
		await settle();
		const paused = manager.Get(EngineMenuId)!;
		expect([paused.Controller<LabelController>("Heading").Label, paused.Controller<ButtonController>("PlayButton").Label]).toEqual(["Paused", "Resume"]);
		expect(paused.Controller<LabelController>("Hint").Label).toBe("Mouse released. Resume to keep playing, or pick another scene.");
	});

	it("the menu's Settings button opens the settings", async () => {
		const page = Page();
		const manager = new UiManager(WithEngineDocuments({ Manifest: { FileVersion: 1, Documents: [] }, Load: async () => "" }));
		const open = vi.fn();
		new EngineScreens(manager, page, open);
		page.State.loading.visible = false;
		page.State.menu.visible = true;
		await settle();
		manager.Get(EngineMenuId)!.Controller<ButtonController>("SettingsButton").PerformClick();
		expect(open).toHaveBeenCalledTimes(1);
		const bare = Page(); // made without a way to open the settings: the button does nothing
		const bareManager = new UiManager(WithEngineDocuments({ Manifest: { FileVersion: 1, Documents: [] }, Load: async () => "" }));
		new EngineScreens(bareManager, bare);
		bare.State.loading.visible = false;
		bare.State.menu.visible = true;
		await settle();
		expect(() => bareManager.Get(EngineMenuId)!.Controller<ButtonController>("SettingsButton").PerformClick()).not.toThrow();
	});

	it("closing the menu window (its close box) goes back to the game", async () => {
		const { page, manager } = Make();
		page.State.loading.visible = false;
		page.State.menu.visible = true;
		await settle();
		manager.Get(EngineMenuId)!.Controller<WindowController>("MenuWindow").RequestClose(); // what its close box does
		expect(page.Resume).toHaveBeenCalledTimes(1);
	});

	it("a project replaces an engine screen by giving a document the same Id; Dispose stops following the page", async () => {
		const own = '{"Format":1,"Name":"Mine","Script":"","Root":{"Name":"Root","Type":"canvas","X":0,"Y":0,"Width":800,"Height":500,"Props":{},"Children":[{"Name":"Progress","Type":"progressbar","X":0,"Y":0,"Width":100,"Height":20,"Props":{}},{"Name":"Status","Type":"label","X":0,"Y":30,"Width":100,"Height":20,"Props":{"Text":""}}]}}';
		const { page, manager, screens } = Make([{ Id: EngineLoadingId, Path: "MyLoading.ui.json", Script: "" }], async () => own);
		await settle();
		expect(manager.Get(EngineLoadingId)!.Layout.Name).toBe("Mine");
		expect(Object.keys(EngineDocuments)).toEqual([EngineMenuId, EngineLoadingId, "EngineSettings", "EngineControls"]);
		screens.Dispose();
		page.State.loading.visible = false;
		await settle();
		expect(manager.IsShown(EngineLoadingId)).toBe(true);
	});

	it("what goes wrong while drawing a screen is logged, and the next state still gets drawn", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { page, manager } = Make([{ Id: EngineLoadingId, Path: "Broken.ui.json", Script: "" }], async () => "{");
		await settle();
		expect(String(error.mock.calls[0]?.[0])).toContain('UI document "EngineLoading" (Broken.ui.json)');
		page.State.loading.visible = false;
		page.State.menu.visible = true;
		await settle();
		expect(manager.IsShown(EngineMenuId)).toBe(true);
	});
});
