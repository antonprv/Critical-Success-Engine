// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { ButtonController } from "../../Source/Controls/ButtonController";
import { ActionType, Actions, GraphNodeKind, VariableKind } from "../../Source/Documents/Graph";
import { CreateNode, HotkeyOf, NewLayout, ParseHotkey, ParseLayout, SerializeLayout, WidgetType, type UiLayout } from "../../Source/Documents/Layout";
import { UiDocument } from "../../Source/Documents/UiDocument";
import { UiManager } from "../../Source/Documents/UiManager";
import { UiScript } from "../../Source/Documents/UiScript";
import WinLayoutView from "../../Source/Documents/WinLayoutView.vue";
import type { QuasarController } from "../../Source/Quasar/QuasarController";

describe("data binding", () => {
	it("a prop follows a variable; a value goes both ways", () => {
		const layout = NewLayout("Search");
		layout.Root.Children!.push(
			{ ...CreateNode("q-input", "Query", 0, 0), Bindings: { "model-value": "Search", label: "Hint" } },
			{ ...CreateNode("q-table", "Data", 0, 50), Bindings: { filter: "Search" } },
			{ ...CreateNode(WidgetType.Label, "Plain", 0, 300), Bindings: { Text: "Search" } },
			{ ...CreateNode("q-badge", "Count", 0, 350), Bindings: { label: "NotSetYet" } },
		);
		layout.Graph = { Nodes: [], Links: [], Variables: [{ Name: "Search", Kind: VariableKind.Text, Default: "be" }] };
		const document = new UiDocument(layout, { Variables: { Hint: "Find" } });
		const query = document.Controller<QuasarController>("Query");
		const data = document.Controller<QuasarController>("Data");
		expect(query.Value).toBe("be");
		expect(query.Props["label"]).toBe("Find");
		expect(data.Props["filter"]).toBe("be");
		// a variable nobody has set yet leaves the prop as the layout has it, until it is set
		expect(document.Controller<QuasarController>("Count").Props["label"]).toBe("1");
		document.SetVariable("NotSetYet", "7");
		expect(document.Controller<QuasarController>("Count").Props["label"]).toBe("7");
		query.SetValue("gam");
		expect(document.Variables["Search"]).toBe("gam");
		expect(data.Props["filter"]).toBe("gam");
		document.SetVariable("Search", "al");
		expect(query.Value).toBe("al");
		// a toolkit widget has no props to bind: left as it is
		expect(document.Controller<{ Label: string; }>("Plain").Label).toBe("Label");
		document.Dispose();
		expect(ParseLayout(SerializeLayout(layout)).Root.Children![0]!.Bindings).toEqual({ "model-value": "Search", label: "Hint" });
		const raw = JSON.parse(SerializeLayout(layout));
		raw.Root.Children[0].Bindings = { "": "x", label: 3, hint: "" };
		expect(ParseLayout(JSON.stringify(raw)).Root.Children![0]!.Bindings).toBeUndefined();
	});
});

describe("keyboard shortcuts", () => {
	it("are written one way, and match a key press", () => {
		expect(ParseHotkey("ctrl + shift + s")).toBe("Ctrl+Shift+S");
		expect(ParseHotkey("Shift+Control+f5")).toBe("Ctrl+Shift+F5");
		expect(ParseHotkey("escape")).toBe("Escape");
		expect(ParseHotkey("Ctrl+")).toBeNull();
		expect(ParseHotkey("Ctrl+Bad")).toBeNull();
		expect(ParseHotkey("ctrl+pagedown")).toBe("Ctrl+PageDown");
		expect(HotkeyOf({ key: " ", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe("Space");
		expect(ParseHotkey("Ctrl+Shift")).toBeNull();
		expect(ParseHotkey("Hyper+S")).toBeNull();
		expect(ParseHotkey("")).toBeNull();
		expect(HotkeyOf({ key: "s", ctrlKey: true, altKey: false, shiftKey: true, metaKey: false })).toBe("Ctrl+Shift+S");
		expect(HotkeyOf({ key: "F5", ctrlKey: false, altKey: true, shiftKey: false, metaKey: true })).toBe("Alt+Meta+F5");
	});

	it("press the widget they name while the document is shown", async () => {
		const layout = NewLayout("Editor");
		layout.Root.Children!.push(CreateNode(WidgetType.Button, "Save", 0, 0), CreateNode("q-btn", "Open", 0, 40), CreateNode(WidgetType.Label, "Note", 0, 80));
		layout.Hotkeys = { "Ctrl+S": "Save", "Ctrl+O": "Open", "Ctrl+N": "Note", "Ctrl+X": "Nobody" };
		const parsed = ParseLayout(JSON.stringify({ ...JSON.parse(SerializeLayout(layout)), Hotkeys: { "ctrl+s": "Save", "Bad+": "Save", "F1": 3 } }));
		expect(parsed.Hotkeys).toEqual({ "Ctrl+S": "Save" });
		expect(ParseLayout(JSON.stringify({ ...JSON.parse(SerializeLayout(layout)), Hotkeys: { "Bad+": "Save" } })).Hotkeys).toBeUndefined();

		const document = new UiDocument(layout);
		const saves = vi.fn(), opens = vi.fn();
		document.On("Save", "click", saves);
		document.On("Open", "click", opens);
		const view = mount(WinLayoutView, { props: { document } });
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "o", ctrlKey: true }));
		expect(saves).toHaveBeenCalledOnce();
		expect(opens).toHaveBeenCalledOnce();
		expect(document.PressHotkey("Ctrl+N")).toBe(false); // a label can't be pressed
		expect(document.PressHotkey("Ctrl+X")).toBe(false);
		expect(document.PressHotkey("Ctrl+Q")).toBe(false);
		document.Controller<ButtonController>("Save").SetEnabled(false);
		expect(document.PressHotkey("Ctrl+S")).toBe(false);
		// on the designer's canvas shortcuts don't fire
		const design = mount(WinLayoutView, { props: { document, design: true } });
		document.Controller<ButtonController>("Save").SetEnabled(true);
		view.unmount();
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
		expect(saves).toHaveBeenCalledOnce();
		design.unmount();
		expect(new UiDocument(NewLayout("None")).PressHotkey("Ctrl+S")).toBe(false);
	});
});

describe("an app's screens", () => {
	function Screens(): UiManager {
		const screen = (name: string): UiLayout => {
			const layout = NewLayout(name);
			layout.Root.Children!.push(CreateNode(WidgetType.Button, "Next", 0, 0));
			return layout;
		};
		return new UiManager({ Manifest: { FileVersion: 1, Documents: ["Home", "Settings", "About"].map((Id) => ({ Id, Path: `${Id}.ui.json`, Script: "" })) }, Load: async (path) => SerializeLayout(screen(path)) });
	}

	it("go forward and back, one shown at a time", async () => {
		const manager = Screens();
		expect(await manager.Back()).toBe(false);
		await manager.Navigate("Home");
		await manager.Navigate("Home"); // already there
		await manager.Navigate("Settings");
		expect(manager.Shown.map((shown) => shown.Id)).toEqual(["Settings"]);
		expect(manager.History).toEqual(["Home", "Settings"]);
		expect(await manager.Back()).toBe(true);
		expect(manager.Shown.map((shown) => shown.Id)).toEqual(["Home"]);
		expect(manager.History).toEqual(["Home"]);
		// a screen that isn't there fails alone: the next move still happens
		await expect(manager.Navigate("Nowhere")).rejects.toThrow('No UI document "Nowhere" in the manifest');
		await manager.Navigate("About");
		expect(manager.History).toEqual(["Home", "About"]);
	});

	it("node graphs and scripts go there too; a document without a manager can't", async () => {
		const manager = Screens();
		const home = await manager.Navigate("Home");
		Actions.Navigate(home, "About");
		await flushPromises();
		expect(manager.History).toEqual(["Home", "About"]);
		Actions.GoBack(manager.Get("About")!);
		await flushPromises();
		expect(manager.History).toEqual(["Home"]);

		class Script extends UiScript {
			public Go(): void {
				this.Navigate("Settings");
			}

			public Return(): void {
				this.GoBack();
			}

			public Copy(): void {
				this.CopyToClipboard("copied");
			}
		}
		const script = new Script();
		script.Attach(manager.Get("Home")!);
		script.Go();
		await flushPromises();
		expect(manager.History).toEqual(["Home", "Settings"]);
		script.Return();
		await flushPromises();
		expect(manager.History).toEqual(["Home"]);

		const alone = new UiDocument(NewLayout("Alone"));
		expect(() => Actions.Navigate(alone, "Home")).toThrow("This UI has no screens to go to: show it with a UiManager");
		expect(() => Actions.GoBack(alone)).toThrow("This UI has no screens to go back to: show it with a UiManager");

		// the clipboard: Quasar's copy (the browser's API here)
		const writeText = vi.fn(async () => undefined);
		vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
		script.Copy();
		await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("copied"));
		// a page that refuses the clipboard: nothing breaks
		vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
		Actions.CopyToClipboard("x");
		await flushPromises();
	});

	it("the actions run from a node graph", async () => {
		const manager = Screens();
		const layout = NewLayout("Menu");
		layout.Root.Children!.push(CreateNode(WidgetType.Button, "Go", 0, 0));
		const action = (Id: string, Type: ActionType, Params: Record<string, string>) => ({ Id, Kind: GraphNodeKind.Action, Type, X: 0, Y: 0, Params });
		layout.Graph = { Nodes: [{ Id: "e", Kind: GraphNodeKind.Event, Type: "click", X: 0, Y: 0, Params: { Widget: "Go" } }, action("n", ActionType.Navigate, { Document: "About" }), action("c", ActionType.CopyToClipboard, { Text: "x" }), action("b", ActionType.GoBack, {})], Links: [{ From: "e", To: "n" }, { From: "n", To: "c" }, { From: "c", To: "b" }] };
		await manager.Navigate("Home");
		const menu = new UiDocument(layout, { Navigator: manager });
		menu.Controller<ButtonController>("Go").PerformClick();
		await flushPromises();
		expect(manager.History).toEqual(["Home"]); // went to About, and back
	});
});
