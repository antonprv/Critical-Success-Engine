// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import { GetPageUi, LinkPageUi } from "../Source/Engine/Core/PageUi";
import { UiStore } from "../Source/Ui/UiStore";
import { CreateUi } from "../Source/Ui/CreateUi";

// Quasar's Platform reads the screen orientation, which jsdom does not implement.
Object.defineProperty(window.screen, "orientation", { value: { type: "landscape-primary", angle: 0, addEventListener: () => undefined }, configurable: true });

describe("PageUi: the page's menu and loading screen, for the plugin that draws them", () => {
	it("is nothing until the page links its store; then it shows the store's state and calls its actions", () => {
		expect(GetPageUi()).toBeNull();
		const store = new UiStore();
		store.Actions = { Resume: vi.fn(), SelectScene: vi.fn(), Pause: vi.fn(), SetTouchMode: vi.fn() };
		LinkPageUi(store, "Starfall");
		const page = GetPageUi()!;
		expect(page.State).toBe(store.State);
		expect(page.Title).toBe("Starfall");
		page.Resume();
		page.SelectScene("coin-hunt");
		expect(store.Actions.Resume).toHaveBeenCalled();
		expect(store.Actions.SelectScene).toHaveBeenCalledWith("coin-hunt");
		page.Pause();
		page.SetTouchMode(true);
		expect([store.Actions.Pause, store.Actions.SetTouchMode]).toSatisfy(([pause, touch]: [ReturnType<typeof vi.fn>, ReturnType<typeof vi.fn>]) => pause.mock.calls.length === 1 && touch.mock.calls[0]?.[0] === true);
		expect(page.IsStartMenu()).toBe(true);
		store.State.menu.mode = 1; // MenuMode.Paused
		expect(page.IsStartMenu()).toBe(false);
	});

	it("once documents draw the screens, the page's own menu and loading screen step aside (the HUD stays)", async () => {
		const store = new UiStore();
		store.State.menu.visible = true;
		const element = document.createElement("div");
		document.body.appendChild(element);
		CreateUi(store, element);
		await nextTick();
		const has = (selector: string) => element.querySelector(selector) !== null;
		expect(has(".loading-overlay")).toBe(true);
		expect(has(".menu-card")).toBe(true);
		LinkPageUi(store, "x");
		GetPageUi()!.UseDocumentScreens();
		await nextTick();
		expect(store.State.documentScreens).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 400)); // the fade-out transition
		expect(has(".loading-overlay")).toBe(false);
		expect(has(".menu-card")).toBe(false);
	});

	it("the Engine module hands the plugin the page's link", async () => {
		const { default: EngineModule } = await import("../Source/Engine/EngineModule");
		const store = new UiStore();
		LinkPageUi(store, "y");
		expect(new EngineModule().PageUi?.State).toBe(store.State);
	});
});
