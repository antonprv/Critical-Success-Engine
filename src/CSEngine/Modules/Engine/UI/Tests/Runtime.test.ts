// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ChannelHub } from "@cse/core/Engine/Core/Channels";
import { LoadingPhase, ModuleInterface, ModuleManager, ModuleThread, ModuleType } from "@cse/core/modules";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import { LabelController } from "../Source/Controls/LabelController";
import type { ButtonController } from "../Source/Controls/ButtonController";
import { CreateNode, NewLayout, SerializeLayout, WidgetType } from "../Source/Documents/Layout";
import { UiDocument } from "../Source/Documents/UiDocument";
import { UiManager } from "../Source/Documents/UiManager";
import { Actions } from "../Source/Documents/Graph";
import { GameUi, UiChannel } from "../Source/Runtime/GameUi";
import { UiHostBridge } from "../Source/Runtime/UiHostBridge";

/** A HUD: a label and a button. */
function Hud(): string {
	const layout = NewLayout("Hud");
	layout.Root.Children!.push({ ...CreateNode(WidgetType.Label, "Coins", 10, 10), Props: { Text: "Coins: 0", FontSize: 14, Bold: true } }, CreateNode(WidgetType.Button, "Restart", 10, 40));
	return SerializeLayout(layout);
}

/** Two hubs wired to each other, as the engine's threads are (game logic <-> page). */
function Wire(): { game: ChannelHub; page: ChannelHub; } {
	const game = new ChannelHub();
	const page = new ChannelHub();
	game.Connect((channel, payload) => page.Deliver(channel, structuredClone(payload)));
	page.Connect((channel, payload) => game.Deliver(channel, structuredClone(payload)));
	return { game, page };
}

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0)); await nextTick(); };

describe("labels are live widgets", () => {
	it("a label has a controller: scripts change its text and visibility", () => {
		const layout = NewLayout("x");
		layout.Root.Children!.push(CreateNode(WidgetType.Label, "Title", 0, 0));
		const document = new UiDocument(layout);
		const label = document.Controller<LabelController>("Title");
		expect(label.Label).toBe("Label");
		Actions.SetText(document, "Title", "Hello");
		expect(label.Label).toBe("Hello");
		expect(new LabelController().Label).toBe("");
	});
});

describe("GameUi (the game thread's side of the UI plugin)", () => {
	it("posts commands for the page: show, hide, toggle, text, visibility, enabled", () => {
		const channels = new ChannelHub();
		const sent: unknown[] = [];
		channels.Connect((channel, payload) => { expect(channel).toBe(UiChannel); sent.push(payload); });
		const ui = new GameUi(channels);
		ui.Show("Hud");
		ui.SetText("Hud", "Coins", "Coins: 3");
		ui.SetVisible("Hud", "Restart", false);
		ui.SetEnabled("Hud", "Restart", true);
		ui.Toggle("Map");
		ui.Hide("Hud");
		expect(sent).toEqual([
			{ op: "show", id: "Hud" }, { op: "set-text", id: "Hud", widget: "Coins", text: "Coins: 3" },
			{ op: "set-visible", id: "Hud", widget: "Restart", visible: false }, { op: "set-enabled", id: "Hud", widget: "Restart", enabled: true },
			{ op: "toggle", id: "Map" }, { op: "hide", id: "Hud" },
		]);
	});

	it("On listens to a widget's event once per kind, calls every handler, and stops when they unsubscribe; errors from the page are reported", () => {
		const channels = new ChannelHub();
		const sent: unknown[] = [];
		channels.Connect((_channel, payload) => sent.push(payload));
		const ui = new GameUi(channels);
		const a = vi.fn();
		const b = vi.fn();
		const offA = ui.On("Hud", "Restart", "click", a);
		ui.On("Hud", "Restart", "click", b);
		expect(sent).toEqual([{ op: "listen", id: "Hud", widget: "Restart", event: "click" }]);
		channels.Deliver(UiChannel, { op: "event", id: "Hud", widget: "Restart", event: "click", args: [] });
		channels.Deliver(UiChannel, { op: "event", id: "Hud", widget: "Other", event: "click", args: [] });
		offA();
		channels.Deliver(UiChannel, { op: "event", id: "Hud", widget: "Restart", event: "click", args: [1] });
		expect(a).toHaveBeenCalledTimes(1);
		expect(b.mock.calls).toEqual([[], [1]]);
		const errors: string[] = [];
		ui.Events.On("error", (message) => errors.push(message));
		channels.Deliver(UiChannel, { op: "error", message: "No UI document \"Nope\" in the manifest" });
		expect(errors).toEqual(['No UI document "Nope" in the manifest']);
	});
});

describe("UiHostBridge (the page's side): commands from the game reach the UI documents", () => {
	function Make() {
		const { game, page } = Wire();
		const manager = new UiManager({ Manifest: { FileVersion: 1, Documents: [{ Id: "Hud", Path: "Hud.ui.json", Script: "" }] }, Load: async () => Hud() });
		const bridge = new UiHostBridge(manager, page);
		return { ui: new GameUi(game), manager, bridge };
	}

	it("runs commands in order: show, then set text right away, though loading is asynchronous", async () => {
		const { ui, manager } = Make();
		ui.Show("Hud");
		ui.SetText("Hud", "Coins", "Coins: 5");
		ui.SetVisible("Hud", "Restart", false);
		await settle();
		const hud = manager.Get("Hud")!;
		expect(hud.Controller<LabelController>("Coins").Label).toBe("Coins: 5");
		expect(hud.Controller<ButtonController>("Restart").Visible).toBe(false);
		ui.SetEnabled("Hud", "Restart", false);
		ui.Toggle("Hud");
		await settle();
		expect(manager.IsShown("Hud")).toBe(false);
		ui.Toggle("Hud");
		await settle();
		ui.Hide("Hud");
		await settle();
		expect(manager.IsShown("Hud")).toBe(false);
	});

	it("widget events go back to the game, also for documents shown after the game started listening", async () => {
		const { ui, manager } = Make();
		const clicked = vi.fn();
		ui.On("Hud", "Restart", "click", clicked);
		ui.Show("Hud");
		await settle();
		manager.Get("Hud")!.Controller<ButtonController>("Restart").PerformClick();
		expect(clicked).toHaveBeenCalledTimes(1);
		ui.Hide("Hud");
		ui.Show("Hud"); // shown again: listening goes on
		await settle();
		manager.Get("Hud")!.Controller<ButtonController>("Restart").PerformClick();
		expect(clicked).toHaveBeenCalledTimes(2);
	});

	it("a listen for a document that is already shown attaches at once; arguments that can't cross threads become text", async () => {
		const { ui, manager } = Make();
		ui.Show("Hud");
		await settle();
		const seen: unknown[][] = [];
		ui.On("Hud", "Coins", "custom", (...args) => seen.push(args));
		await settle();
		(manager.Get("Hud")!.Find("Coins")!.Controller as LabelController).Events.Emit("custom" as never, ...([1, "two", { three: 3 }, () => 4] as never[]));
		expect(seen).toEqual([[1, "two", { three: 3 }, "() => 4"]]);
	});

	it("what fails (an unknown document or widget) is reported to the game, and the next commands still run", async () => {
		const { ui, manager } = Make();
		const errors: string[] = [];
		ui.Events.On("error", (message) => errors.push(message));
		ui.Show("Nope");
		ui.SetText("Hud", "Coins", "x"); // Hud isn't shown
		ui.Show("Hud");
		ui.SetText("Hud", "Ghost", "x");
		await settle();
		expect(errors).toEqual(['No UI document "Nope" in the manifest', 'UI document "Hud" is not shown', 'No widget named "Ghost".']);
		expect(manager.IsShown("Hud")).toBe(true);
	});

	it("a command queued before Dispose doesn't run after it; a listen for another document leaves this one alone", async () => {
		const { ui, manager, bridge } = Make();
		const other = vi.fn();
		ui.On("Other", "Restart", "click", other);
		ui.Show("Hud");
		await settle();
		manager.Get("Hud")!.Controller<ButtonController>("Restart").PerformClick();
		expect(other).not.toHaveBeenCalled();
		ui.Hide("Hud");
		bridge.Dispose(); // the Hide is queued already
		await settle();
		expect(manager.IsShown("Hud")).toBe(true);
	});

	it("Dispose stops it", async () => {
		const { ui, manager, bridge } = Make();
		bridge.Dispose();
		ui.Show("Hud");
		await settle();
		expect(manager.IsShown("Hud")).toBe(false);
	});
});

describe("the UI plugin's modules", () => {
	it("UIGame gives the game its GameUi; UIHost draws the project's documents over the game, and goes away when unloaded", async () => {
		const page = ModuleManager.Get();
		const engineChannels = new ChannelHub();
		class FakeEngine extends ModuleInterface {
			public readonly Channels = engineChannels;
			public readonly ProjectUi = { Manifest: { FileVersion: 1, Documents: [{ Id: "Hud", Path: "Hud.ui.json", Script: "" }] }, Load: async () => Hud() };
		}
		const descriptor = (Name: string, Load: () => Promise<{ default: new () => ModuleInterface; }>) => ({ Name, Type: ModuleType.Runtime, LoadingPhase: LoadingPhase.Default, Thread: ModuleThread.Any, Dependencies: Name === "Engine" ? [] : ["Engine"], Load });
		page.Register(descriptor("Engine", async () => ({ default: FakeEngine })))
			.Register(descriptor("UIHost", () => import("../Source/Runtime/UiHostModule")))
			.Register(descriptor("UIGame", () => import("../Source/Runtime/GameUiModule")));
		document.body.innerHTML = '<canvas id="gameCanvas"></canvas><div id="ui"></div>';
		const host = await page.LoadModuleChecked<import("../Source/Runtime/UiHostModule").default>("UIHost");
		const layer = document.querySelector(".cse-ui-host")!;
		expect(layer.nextElementSibling?.id).toBe("ui"); // under the engine's own menus and HUD
		const { GetGameUi } = await import("../Source/Runtime/GameUiModule");
		await page.LoadModuleChecked("UIGame");
		const sent: unknown[] = [];
		engineChannels.Connect((_c, payload) => { sent.push(payload); engineChannels.Deliver(UiChannel, payload); }); // one thread plays both sides
		GetGameUi().Show("Hud");
		await settle();
		expect(host.Manager.IsShown("Hud")).toBe(true);
		expect(layer.querySelector('[data-ui="Hud"] [data-name="Coins"]')?.textContent).toBe("Coins: 0");
		page.UnloadModule("UIHost");
		expect(document.querySelector(".cse-ui-host")).toBeNull();
		expect(sent).toContainEqual({ op: "show", id: "Hud" });
	});

	it("on a page that offers its menu and loading screen, UIHost draws them as the engine's documents", async () => {
		vi.resetModules();
		const { ModuleManager: Fresh, ModuleInterface: Base, ModuleThread: Thread, LoadingPhase: Phase, ModuleType: Type } = await import("@cse/core/modules");
		const { ChannelHub: Hub } = await import("@cse/core/Engine/Core/Channels");
		const { reactive } = await import("vue");
		const page = {
			State: reactive({ loading: { visible: true, label: "Starting workers…", fraction: 0.02 }, menu: { visible: false, mode: 0, scenes: [], currentSceneId: null } }),
			Title: "T", Resume: vi.fn(), SelectScene: vi.fn(), IsStartMenu: () => true, UseDocumentScreens: vi.fn(), Pause: vi.fn(), SetTouchMode: vi.fn(),
		};
		class PageEngine extends Base {
			public readonly Channels = new Hub();
			public readonly ProjectUi = { Manifest: { FileVersion: 1, Documents: [] }, Load: async () => "" };
			public readonly PageUi = page;
		}
		const modules = Fresh.Get();
		modules.Register({ Name: "Engine", Type: Type.Runtime, LoadingPhase: Phase.Default, Thread: Thread.Any, Load: async () => ({ default: PageEngine }) })
			.Register({ Name: "UIHost", Type: Type.Runtime, LoadingPhase: Phase.Default, Thread: Thread.Any, Dependencies: ["Engine"], Load: () => import("../Source/Runtime/UiHostModule") });
		document.body.innerHTML = "";
		await modules.LoadModuleChecked("UIHost");
		await settle();
		expect(page.UseDocumentScreens).toHaveBeenCalled();
		expect(document.querySelector('[data-ui="EngineLoading"] [data-name="Status"]')?.textContent).toBe("Starting workers…");
		page.State.loading.visible = false;
		page.State.menu.visible = true;
		await settle();
		// A button presses like a real one: pointer down, then up over it.
		const button = document.querySelector('[data-ui="EnginePauseMenu"] [data-name="SettingsButton"] button')!;
		button.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
		button.dispatchEvent(new MouseEvent("pointerup", { button: 0, bubbles: true }));
		await settle();
		expect(document.querySelector('[data-ui="EngineSettings"]')).not.toBeNull(); // the menu's Settings opens the settings
		const controls = document.querySelector('[data-ui="EngineSettings"] [data-name="ControlsButton"] button')!;
		controls.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
		controls.dispatchEvent(new MouseEvent("pointerup", { button: 0, bubbles: true }));
		await settle();
		expect(document.querySelector('[data-ui="EngineControls"]')).not.toBeNull(); // and the settings' Controls, the controls
		const pressButton = (element: Element) => {
			element.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
			element.dispatchEvent(new MouseEvent("pointerup", { button: 0, bubbles: true }));
		};
		pressButton(document.querySelector('[data-ui="EngineControls"] [data-name="ArrangeButton"] button')!);
		await settle();
		expect(document.querySelector('[data-ui="EngineControls"]')).toBeNull(); // it steps aside...
		expect(document.querySelector(".cse-touch--arranging")).not.toBeNull(); // ...for arranging the touch controls
		pressButton([...document.querySelectorAll(".cse-touch__toolbar button")].find((b) => b.textContent === "Done")!);
		await settle();
		expect(document.querySelector(".cse-touch")).toBeNull();
		expect(document.querySelector('[data-ui="EngineControls"]')).not.toBeNull(); // Done comes back to it
		modules.UnloadModule("UIHost");
	});

	it("without the engine's own UI mount, the layer is appended to the page", async () => {
		vi.resetModules();
		const { ModuleManager: Fresh, ModuleInterface: Base, ModuleThread: Thread, LoadingPhase: Phase, ModuleType: Type } = await import("@cse/core/modules");
		const { ChannelHub: Hub } = await import("@cse/core/Engine/Core/Channels");
		class FakeEngine extends Base {
			public readonly Channels = new Hub();
			public readonly ProjectUi = { Manifest: { FileVersion: 1, Documents: [] }, Load: async () => "" };
		}
		const page = Fresh.Get();
		page.Register({ Name: "Engine", Type: Type.Runtime, LoadingPhase: Phase.Default, Thread: Thread.Any, Load: async () => ({ default: FakeEngine }) })
			.Register({ Name: "UIHost", Type: Type.Runtime, LoadingPhase: Phase.Default, Thread: Thread.Any, Dependencies: ["Engine"], Load: () => import("../Source/Runtime/UiHostModule") });
		document.body.innerHTML = "";
		await page.LoadModuleChecked("UIHost");
		expect(document.body.lastElementChild?.classList.contains("cse-ui-host")).toBe(true);
	});
});

describe("values, lists and loading screens", () => {
	/** A loading screen: a progress bar, a status label, a list. */
	function Loading(): string {
		const layout = NewLayout("Loading");
		layout.Root.Children!.push(
			CreateNode(WidgetType.ProgressBar, "Progress", 10, 10), CreateNode(WidgetType.Label, "Status", 10, 40),
			CreateNode(WidgetType.ListBox, "Tips", 10, 70), CreateNode(WidgetType.Slider, "Volume", 10, 200),
		);
		return SerializeLayout(layout);
	}

	function Make() {
		const { game, page } = Wire();
		const manager = new UiManager({ Manifest: { FileVersion: 1, Documents: [{ Id: "Loading", Path: "Loading.ui.json", Script: "" }] }, Load: async () => Loading() });
		new UiHostBridge(manager, page);
		return { ui: new GameUi(game), manager };
	}

	it("GameUi posts values and items; the page puts them on the widgets", async () => {
		const sent: unknown[] = [];
		const channels = new ChannelHub();
		channels.Connect((_c, payload) => sent.push(payload));
		new GameUi(channels).SetValue("Loading", "Progress", 40);
		new GameUi(channels).SetItems("Loading", "Tips", ["Jump with Space"]);
		expect(sent).toEqual([{ op: "set-value", id: "Loading", widget: "Progress", value: 40 }, { op: "set-items", id: "Loading", widget: "Tips", items: ["Jump with Space"] }]);

		const { ui, manager } = Make();
		ui.Show("Loading");
		ui.SetValue("Loading", "Progress", 40);
		ui.SetValue("Loading", "Volume", 7);
		ui.SetItems("Loading", "Tips", ["Jump with Space", "Esc opens the menu"]);
		await settle();
		const screen = manager.Get("Loading")!;
		expect(screen.Controller<{ Value: number; }>("Progress").Value).toBe(40);
		expect(screen.Controller<{ Value: number; }>("Volume").Value).toBe(7);
		expect(screen.Controller<{ Items: { text: string; }[]; }>("Tips").Items.map((i) => i.text)).toEqual(["Jump with Space", "Esc opens the menu"]);
	});

	it("a widget without a value or without items says so", async () => {
		const { ui } = Make();
		const errors: string[] = [];
		ui.Events.On("error", (message) => errors.push(message));
		ui.Show("Loading");
		ui.SetValue("Loading", "Status", 1);
		ui.SetItems("Loading", "Progress", ["x"]);
		await settle();
		expect(errors).toEqual(['Widget "Status" has no value', 'Widget "Progress" has no items']);
	});

	it("LoadingScreen: show any document with a progress bar, drive it with a fraction (as a percentage), change its status, hide it", async () => {
		const { LoadingScreen } = await import("../Source/Runtime/LoadingScreen");
		const { ui, manager } = Make();
		const loading = new LoadingScreen(ui, "Loading");
		loading.Show("Loading the level");
		loading.SetProgress(0.256);
		await settle();
		const screen = manager.Get("Loading")!;
		expect(screen.Controller<{ Value: number; }>("Progress").Value).toBe(26);
		expect(screen.Controller<LabelController>("Status").Label).toBe("Loading the level");
		expect(loading.Progress).toBe(0.256);
		loading.SetProgress(2); // clamped
		loading.SetProgress(-1);
		loading.SetLabel("Spawning");
		await settle();
		expect(screen.Controller<{ Value: number; }>("Progress").Value).toBe(0);
		expect(screen.Controller<LabelController>("Status").Label).toBe("Spawning");
		loading.Hide();
		await settle();
		expect(manager.IsShown("Loading")).toBe(false);
	});

	it("LoadingScreen sends a value or a label only when it changes, and takes other widget names", () => {
		const sent: unknown[] = [];
		const channels = new ChannelHub();
		channels.Connect((_c, payload) => sent.push(payload));
		return import("../Source/Runtime/LoadingScreen").then(({ LoadingScreen }) => {
			const loading = new LoadingScreen(new GameUi(channels), "Splash", { Bar: "Bar", Label: "Text" });
			loading.Show();
			loading.SetProgress(0.5);
			loading.SetProgress(0.501); // still 50%
			loading.SetLabel("a");
			loading.SetLabel("a");
			expect(sent).toEqual([
				{ op: "show", id: "Splash" }, { op: "set-value", id: "Splash", widget: "Bar", value: 50 }, { op: "set-text", id: "Splash", widget: "Text", text: "a" },
			]);
		});
	});
});

describe("labels: wrapping, colour, alignment", () => {
	it("a label wraps its text, takes a colour and an alignment when its props say so; by default one line, the theme's colour, left", async () => {
		const { mount } = await import("@vue/test-utils");
		const { default: WinLayoutView } = await import("../Source/Documents/WinLayoutView.vue");
		const layout = NewLayout("x");
		layout.Root.Children!.push(
			{ ...CreateNode(WidgetType.Label, "Hint", 0, 0), Props: { Text: "A long hint", Wrap: true, Color: "#ffffff", Align: "center" } },
			CreateNode(WidgetType.Label, "Plain", 0, 30),
		);
		const view = mount(WinLayoutView, { props: { document: new UiDocument(layout) } });
		const hint = view.get('[data-name="Hint"] .win-layout__label').element as HTMLElement;
		expect([hint.style.whiteSpace, hint.style.color, hint.style.textAlign]).toEqual(["normal", "rgb(255, 255, 255)", "center"]);
		const plain = view.get('[data-name="Plain"] .win-layout__label').element as HTMLElement;
		expect([plain.style.whiteSpace, plain.style.color, plain.style.textAlign]).toEqual(["nowrap", "", "left"]);
		const { BuiltInWidgets } = await import("../Source/Documents/Widgets");
		expect(BuiltInWidgets.Get(WidgetType.Label)!.Props.map((p) => p.Key)).toEqual(expect.arrayContaining(["Wrap", "Color", "Align"]));
	});
});
