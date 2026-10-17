// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ChannelHub } from "@cse/core/Engine/Core/Channels";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { HidePortalTheme, ShowPortalTheme } from "../../Source/Core/KitContext";
import type { ButtonController } from "../../Source/Controls/ButtonController";
import { ActionType, Actions, GraphNodeKind, VariableKind } from "../../Source/Documents/Graph";
import { CreateNode, NewLayout, SerializeLayout, WidgetType } from "../../Source/Documents/Layout";
import { UiManager } from "../../Source/Documents/UiManager";
import { UiScript } from "../../Source/Documents/UiScript";
import { UiDocument } from "../../Source/Documents/UiDocument";
import type { QuasarController } from "../../Source/Quasar/QuasarController";
import { ConfigureQuasarStorage, GetQuasarServices, MemoryStore, QuasarServices, WebStorageOver } from "../../Source/Quasar/QuasarServices";
import { GameUi, UiChannel } from "../../Source/Runtime/GameUi";
import { UiHostBridge } from "../../Source/Runtime/UiHostBridge";

/** Waits until no dialog is left on the page (the last one has finished leaving). */
const NoDialog = (): Promise<void> => vi.waitFor(() => expect(document.querySelector(".q-dialog")).toBeNull());

const Click = async (selector: string): Promise<void> => {
	await vi.waitFor(() => expect(document.querySelector(selector)).not.toBeNull());
	// the newest one: a dialog closed a moment ago may still be leaving
	([...document.querySelectorAll(selector)].at(-1) as HTMLElement).click();
	await flushPromises();
};

describe("the stores Quasar's storage plugins keep their data in", () => {
	it("a memory store keeps copies", () => {
		const store = new MemoryStore();
		const value = { a: [1] };
		store.Set("x", value);
		value.a.push(2);
		expect(store.Get("x", null)).toEqual({ a: [1] });
		expect(store.Get("y", "none")).toBe("none");
		expect(store.Keys).toEqual(["x"]);
		expect(store.Has("x")).toBe(true);
		store.Delete("x");
		expect(store.Has("x")).toBe(false);
	});

	it("Quasar's web storage API works over a store, under a prefix", () => {
		const store = new MemoryStore();
		store.Set("own", 1);
		const web = WebStorageOver(store) as Record<string, (...args: unknown[]) => unknown>;
		expect(web["isEmpty"]!()).toBe(true);
		web["set"]!("name", "Ann");
		web["setItem"]!("when", new Date(Date.UTC(2026, 0, 2)));
		web["set"]!("odd", () => 1);
		expect(store.Get("quasar.name", null)).toBe("Ann");
		expect(web["getItem"]!("when")).toBe("2026-01-02T00:00:00.000Z");
		expect(web["getItem"]!("odd")).toBe("() => 1");
		expect(web["has"]!("name")).toBe(true);
		expect(web["hasItem"]!("nobody")).toBe(false);
		expect(web["getLength"]!()).toBe(3);
		expect(web["getKey"]!(0)).toBe("name");
		expect(web["getKey"]!(9)).toBeNull();
		expect(web["getIndex"]!(0)).toBe("Ann");
		expect(web["getIndex"]!(9)).toBeNull();
		expect(web["getAllKeys"]!()).toEqual(["name", "when", "odd"]);
		expect(web["getAll"]!()).toMatchObject({ name: "Ann" });
		web["remove"]!("odd");
		web["removeItem"]!("when");
		expect(web["getAllKeys"]!()).toEqual(["name"]);

		const ref = web["useStorage"]!("score") as { value: unknown; };
		expect(ref.value).toBeNull();
		const withDefault = web["useStorage"]!("level", { default: () => 1 }) as { value: unknown; };
		expect(withDefault.value).toBe(1);
		ref.value = 10;
		expect(store.Get("quasar.score", null)).toBe(10);
		expect(ref.value).toBe(10);
		ref.value = null;
		expect(store.Has("quasar.score")).toBe(false);
		web["clear"]!();
		expect(store.Keys).toEqual(["own"]); // the store's own keys stay
	});

	it("Quasar's LocalStorage and SessionStorage plugins work through the engine's stores", async () => {
		const local = new MemoryStore();
		await ConfigureQuasarStorage(local);
		const { default: localStorage } = await import("quasar/src/plugins/storage/LocalStorage.js") as unknown as { default: Record<string, (...args: unknown[]) => unknown>; };
		localStorage["set"]!("volume", 0.5);
		expect(local.Get("quasar.volume", null)).toBe(0.5);
		const q: Record<string, unknown> = {};
		localStorage["install"]!({ $q: q });
		expect(q["localStorage"]).toBe(localStorage);
		const session = new MemoryStore();
		await ConfigureQuasarStorage(local, session);
		const { default: sessionStorage } = await import("quasar/src/plugins/storage/SessionStorage.js") as unknown as { default: Record<string, (...args: unknown[]) => unknown>; };
		sessionStorage["set"]!("tab", 2);
		sessionStorage["install"]!({ $q: q });
		expect(session.Get("quasar.tab", null)).toBe(2);
		expect(q["sessionStorage"]).toBe(sessionStorage);
	});
});

describe("Quasar's services", () => {
	it("are one per page", () => {
		expect(GetQuasarServices()).toBe(GetQuasarServices());
	});

	it("notify, ask in dialogs and bottom sheets, show loading, follow the theme's dark mode and the language", async () => {
		const services = new QuasarServices();
		const dismiss = await services.Notify("Saved");
		await vi.waitFor(() => expect(document.querySelector(".q-notification")?.textContent).toContain("Saved"));
		dismiss();
		await services.Notify({ message: "Typed", type: "positive" });

		const confirm = services.Dialog({ title: "Sure?", message: "Delete it?", cancel: true });
		await Click(".q-dialog .q-card__actions .q-btn:last-child");
		expect(await confirm).toEqual({ Ok: true, Data: null });
		await NoDialog();
		const prompt = services.Dialog({ title: "Name", prompt: { model: "Ann", type: "text" }, cancel: true });
		await Click(".q-dialog .q-card__actions .q-btn:last-child");
		expect(await prompt).toEqual({ Ok: true, Data: "Ann" });
		await NoDialog();
		const cancelled = services.Dialog({ title: "Sure?", cancel: true, persistent: false });
		await Click(".q-dialog .q-card__actions .q-btn:first-child");
		expect(await cancelled).toEqual({ Ok: false, Data: null });

		await NoDialog();
		const sheet = services.BottomSheet({ actions: [{ label: "Share", id: "share" }] });
		await Click(".q-bottom-sheet .q-item");
		expect(await sheet).toMatchObject({ label: "Share", id: "share" });
		// a sheet closed without picking: Quasar's chain calls onCancel
		const q = await services.Ready();
		const chain = { onOk: () => chain, onCancel: (cancel: () => void) => { cancel(); return chain; }, onDismiss: () => chain };
		vi.spyOn(q, "bottomSheet").mockReturnValueOnce(chain);
		expect(await services.BottomSheet({ actions: [] })).toBeNull();

		await services.ShowLoading("Wait");
		expect(q.loading.isActive).toBe(true);
		await services.HideLoading();
		await services.ShowLoading();
		await services.HideLoading();
		await services.LoadingBar("start");
		await services.LoadingBar("increment", 0.2);
		await services.LoadingBar("stop");

		// jsdom can't go full screen: nothing changes; a page that can, goes
		expect(await services.ToggleFullscreen()).toBe(false);
		const toggle = vi.spyOn(q.fullscreen, "toggle").mockResolvedValue();
		await services.ToggleFullscreen();
		expect(toggle).toHaveBeenCalledOnce();

		const owner = {};
		ShowPortalTheme(owner, ["win-kit--tailwind"], true);
		await flushPromises();
		expect(q.dark.isActive).toBe(true);
		HidePortalTheme(owner);
		await flushPromises();
		expect(q.dark.isActive).toBe(false);

		expect(await services.Language()).toBe("en-US");
		expect(await services.SetLanguage("ru")).toBe(true);
		expect(await services.Language()).toBe("ru");
		expect(await services.SetLanguage("de-AT")).toBe(true); // Quasar has German as "de"
		expect(await services.Language()).toBe("de");
		expect(await services.SetLanguage("ko")).toBe(true); // ... and Korean only as "ko-KR"
		expect(await services.Language()).toBe("ko-KR");
		expect(await services.SetLanguage("xx")).toBe(false);
	}, 30_000);
});

describe("Quasar's services from node graphs, scripts and the game", () => {
	it("graph actions and script helpers call them", async () => {
		const services = GetQuasarServices();
		const notify = vi.spyOn(services, "Notify").mockResolvedValue(() => undefined);
		const show = vi.spyOn(services, "ShowLoading").mockResolvedValue();
		const hide = vi.spyOn(services, "HideLoading").mockResolvedValue();
		const fullscreen = vi.spyOn(services, "ToggleFullscreen").mockResolvedValue(false);
		Actions.Notify("Hi");
		Actions.Notify("Done", "positive");
		Actions.ShowLoading();
		Actions.ShowLoading("Loading level");
		Actions.HideLoading();
		Actions.ToggleFullscreen();
		expect(notify.mock.calls).toEqual([["Hi"], [{ message: "Done", type: "positive" }]]);
		expect(show.mock.calls).toEqual([[{}], [{ message: "Loading level" }]]);
		expect(hide).toHaveBeenCalledOnce();
		expect(fullscreen).toHaveBeenCalledOnce();

		// the same, as a node graph's actions
		const layout = NewLayout("Graph");
		layout.Root.Children!.push(CreateNode(WidgetType.Button, "Go", 0, 0));
		const node = (Id: string, Type: string, Params: Record<string, string>) => ({ Id, Kind: GraphNodeKind.Action, Type, X: 0, Y: 0, Params });
		layout.Graph = {
			Nodes: [{ Id: "e", Kind: GraphNodeKind.Event, Type: "click", X: 0, Y: 0, Params: { Widget: "Go" } }, node("n", ActionType.Notify, { Text: "Graph {Count}", Type: "info" }), node("l", ActionType.ShowLoading, { Text: "" }), node("h", ActionType.HideLoading, {}), node("f", ActionType.ToggleFullscreen, {})],
			Links: [{ From: "e", To: "n" }, { From: "n", To: "l" }, { From: "l", To: "h" }, { From: "h", To: "f" }],
			Variables: [{ Name: "Count", Kind: VariableKind.Number, Default: 3 }],
		};
		const graph = new UiDocument(layout);
		graph.Controller<ButtonController>("Go").PerformClick();
		expect(notify).toHaveBeenLastCalledWith({ message: "Graph 3", type: "info" });
		expect(fullscreen).toHaveBeenCalledTimes(2);

		class Script extends UiScript {
			public Run(): QuasarServices {
				this.Notify("From a script");
				this.ShowLoading();
				this.HideLoading();
				this.ToggleFullscreen();
				return this.Quasar;
			}
		}
		const script = new Script();
		script.Attach(new UiDocument(NewLayout("Empty")));
		expect(script.Run()).toBe(services);
		expect(notify).toHaveBeenLastCalledWith("From a script");
	});

	it("the game asks through GameUi; the page runs them and answers", async () => {
		const game = new ChannelHub();
		const page = new ChannelHub();
		game.Connect((channel, payload) => page.Deliver(channel, structuredClone(payload)));
		page.Connect((channel, payload) => game.Deliver(channel, structuredClone(payload)));
		const layout = NewLayout("Form");
		layout.Root.Children!.push({ ...CreateNode("q-select", "Pick", 0, 0) }, CreateNode(WidgetType.ListBox, "List", 0, 100), CreateNode(WidgetType.Label, "Plain", 0, 200));
		const manager = new UiManager({ Manifest: { FileVersion: 1, Documents: [{ Id: "Form", Path: "Form.ui.json", Script: "" }] }, Load: async () => SerializeLayout(layout) });
		const bridge = new UiHostBridge(manager, page);
		const ui = new GameUi(game);
		const services = GetQuasarServices();
		const notify = vi.spyOn(services, "Notify").mockResolvedValue(() => undefined);
		vi.spyOn(services, "Dialog").mockResolvedValue({ Ok: true, Data: "yes" });
		vi.spyOn(services, "BottomSheet").mockResolvedValueOnce({ id: "share" }).mockResolvedValueOnce(null);
		const loading = vi.spyOn(services, "ShowLoading").mockResolvedValue();
		const hide = vi.spyOn(services, "HideLoading").mockResolvedValue();
		const bar = vi.spyOn(services, "LoadingBar").mockResolvedValue();
		const fullscreen = vi.spyOn(services, "ToggleFullscreen").mockResolvedValue(true);
		const errors: string[] = [];
		ui.Events.On("error", (message) => errors.push(message));

		ui.Show("Form");
		ui.SetValue("Form", "Pick", "b");
		ui.SetItems("Form", "Pick", ["a", "b"]);
		ui.SetItems("Form", "List", ["one", "two"]);
		ui.SetProp("Form", "Pick", "label", "Choose one");
		ui.SetProp("Form", "Pick", "outlined", true);
		ui.SetProp("Form", "Pick", "outlined", null);
		ui.SetProp("Form", "Plain", "label", "x");
		ui.Notify("Hello");
		ui.ShowLoading();
		ui.ShowLoading({ message: "Wait" });
		ui.HideLoading();
		ui.LoadingBar("start");
		ui.LoadingBar("increment", 0.5);
		ui.ToggleFullscreen();
		const answer = ui.Dialog({ title: "Quit?" });
		const sheet = ui.BottomSheet({ actions: [] });
		const empty = ui.BottomSheet({ actions: [] });
		await new Promise((resolve) => setTimeout(resolve, 50));
		await new Promise((resolve) => requestAnimationFrame(resolve));
		await flushPromises();

		const pick = manager.Get("Form")!.Controller<QuasarController>("Pick");
		expect(pick.Value).toBe("b");
		expect(pick.Props).toMatchObject({ options: ["a", "b"], label: "Choose one" });
		expect("outlined" in pick.Props).toBe(false);
		expect(errors).toEqual(['Widget "Plain" has no props to set (only Quasar\'s widgets have)']);
		expect(notify).toHaveBeenCalledWith("Hello");
		expect(loading.mock.calls).toEqual([[{}], [{ message: "Wait" }]]);
		expect(hide).toHaveBeenCalledOnce();
		expect(bar.mock.calls).toEqual([["start", undefined], ["increment", 0.5]]);
		expect(fullscreen).toHaveBeenCalledOnce();
		expect(await answer).toEqual({ Ok: true, Data: "yes" });
		expect(await sheet).toEqual({ Ok: true, Data: { id: "share" } });
		expect(await empty).toEqual({ Ok: false, Data: null });
		// a reply nobody waits for is let go
		page.Post(UiChannel, { op: "reply", request: 999, ok: true, data: null });
		bridge.Dispose();
	});
});
