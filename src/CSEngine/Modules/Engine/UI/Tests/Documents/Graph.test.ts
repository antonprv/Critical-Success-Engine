// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import type { ButtonController } from "../../Source/Controls/ButtonController";
import type { CheckBoxController } from "../../Source/Controls/CheckBoxController";
import type { StatusBarController } from "../../Source/Controls/StatusBarController";
import type { TextBoxController } from "../../Source/Controls/TextBoxController";
import type { WindowController } from "../../Source/Controls/WindowController";
import { DialogService } from "../../Source/Documents/Dialogs";
import { ActionType, CheckCondition, GraphNodeKind, ParseGraph, type UiGraph } from "../../Source/Documents/Graph";
import { CreateNode, NewLayout, ParseLayout, SerializeLayout, WidgetType, type UiLayout } from "../../Source/Documents/Layout";
import { UiDocument } from "../../Source/Documents/UiDocument";

/** A main screen with a button that opens a settings window, a check box that disables a text box, and a status bar. */
function Screen(graph: UiGraph): UiLayout {
	const layout = NewLayout("Main screen");
	const settings = { ...CreateNode(WidgetType.Window, "Settings", 300, 20), Props: { ...CreateNode(WidgetType.Window, "x", 0, 0).Props, Title: "Settings", Visible: false } };
	layout.Root.Children!.push(
		{ ...CreateNode(WidgetType.Button, "OpenSettings", 10, 10), Props: { ...CreateNode(WidgetType.Button, "x", 0, 0).Props, Text: "Settings..." } },
		CreateNode(WidgetType.CheckBox, "Offline", 10, 40),
		CreateNode(WidgetType.TextBox, "Server", 10, 70),
		CreateNode(WidgetType.StatusBar, "Status", 0, 470),
		settings,
	);
	layout.Graph = graph;
	return layout;
}

const Event = (Id: string, Widget: string, EventName: string, extra: Record<string, string> = {}) => ({ Id, Kind: GraphNodeKind.Event, Type: EventName, X: 0, Y: 0, Params: { Widget, ...extra } });
const Action = (Id: string, Type: ActionType, Params: Record<string, string | boolean>) => ({ Id, Kind: GraphNodeKind.Action, Type, X: 0, Y: 0, Params });

const Example: UiGraph = {
	Nodes: [
		Event("e1", "OpenSettings", "click"),
		Action("a1", ActionType.Show, { Widget: "Settings" }),
		Action("a2", ActionType.SetText, { Widget: "Status", Text: "Settings opened" }),
		Event("e2", "Offline", "change", { When: CheckCondition.Checked }),
		Action("a3", ActionType.Disable, { Widget: "Server" }),
		Event("e3", "Offline", "change", { When: CheckCondition.Unchecked }),
		Action("a4", ActionType.Enable, { Widget: "Server" }),
	],
	Links: [{ From: "e1", To: "a1" }, { From: "a1", To: "a2" }, { From: "e2", To: "a3" }, { From: "e3", To: "a4" }],
};

describe("node graphs run in the document", () => {
	it("a click opens a hidden window and writes the status bar (an action chain)", () => {
		const document = new UiDocument(Screen(Example));
		const settings = document.Controller<WindowController>("Settings");
		expect(settings.Visible).toBe(false); // the window's Visible prop
		document.Controller<ButtonController>("OpenSettings").PerformClick();
		expect(settings.Visible).toBe(true);
		expect(document.Controller<StatusBarController>("Status").Panels[0]!.Text).toBe("Settings opened");
	});

	it("checking the box disables the text box, unchecking enables it again", () => {
		const document = new UiDocument(Screen(Example));
		const offline = document.Controller<CheckBoxController>("Offline");
		const server = document.Controller<TextBoxController>("Server");
		offline.Toggle();
		expect(server.Enabled).toBe(false);
		offline.Toggle();
		expect(server.Enabled).toBe(true);
	});

	it("every action does what it says", async () => {
		const dialogs = new DialogService();
		const graph: UiGraph = {
			Nodes: [
				Event("e", "OpenSettings", "click"),
				Action("hide", ActionType.Hide, { Widget: "OpenSettings" }),
				Action("toggle", ActionType.ToggleVisible, { Widget: "Server" }),
				Action("follow", ActionType.EnabledFollowsCheck, { Widget: "Status", Check: "Offline", Invert: true }),
				Action("text1", ActionType.SetText, { Widget: "Server", Text: "localhost" }),
				Action("text2", ActionType.SetText, { Widget: "Settings", Text: "Options" }),
				Action("text3", ActionType.SetText, { Widget: "OpenSettings", Text: "Again" }),
				Action("focus", ActionType.Focus, { Widget: "Server" }),
				Action("box", ActionType.MessageBox, { Text: "Hello", Title: "Greeter" }),
				Action("close", ActionType.CloseForm, { Result: "OK" }),
			],
			Links: ["hide", "toggle", "follow", "text1", "text2", "text3", "focus", "box", "close"].map((to, i, all) => ({ From: i === 0 ? "e" : all[i - 1]!, To: to })),
		};
		const document = new UiDocument(Screen(graph), { Dialogs: dialogs });
		document.Controller<CheckBoxController>("Offline").Toggle(); // checked: the status bar (inverted) is disabled after the click
		document.Controller<ButtonController>("OpenSettings").PerformClick();
		expect(document.Controller<ButtonController>("OpenSettings").Visible).toBe(false);
		expect(document.Controller<TextBoxController>("Server").Visible).toBe(false);
		expect(document.Controller<StatusBarController>("Status").Enabled).toBe(false);
		expect(document.Controller<TextBoxController>("Server").Value).toBe("localhost");
		expect(document.Controller<WindowController>("Settings").Title).toBe("Options");
		expect(document.Controller<ButtonController>("OpenSettings").Label).toBe("Again");
		expect(document.Controller<TextBoxController>("Server").Focused).toBe(true);
		expect(dialogs.Open[0]!.MessageBox!.Text).toBe("Hello");
		expect(document.Result).toBe("OK");
	});

	it("links to missing nodes, loops and disposing are handled", () => {
		// An event on a widget that was deleted from the layout is skipped, not fatal.
		const graph: UiGraph = { Nodes: [Event("e", "OpenSettings", "click"), Action("a", ActionType.Show, { Widget: "Settings" }), Event("gone", "Deleted", "click")], Links: [{ From: "e", To: "a" }, { From: "a", To: "a" }, { From: "e", To: "ghost" }] };
		const document = new UiDocument(Screen(graph));
		const show = vi.spyOn(document.Controller<WindowController>("Settings"), "SetVisible");
		document.Controller<ButtonController>("OpenSettings").PerformClick();
		expect(show).toHaveBeenCalledTimes(1); // a loop runs each action once per event
		document.Dispose();
		document.Controller<ButtonController>("OpenSettings").PerformClick();
		expect(show).toHaveBeenCalledTimes(1);
		expect(new UiDocument(NewLayout("no graph")).Layout.Graph).toBeUndefined();
	});
});

describe("graphs in layout files", () => {
	it("are saved and loaded; nodes of unknown kinds or types, bad params and dangling links are dropped", () => {
		const layout = Screen(Example);
		expect(ParseLayout(SerializeLayout(layout))).toEqual(layout);
		const raw = { Nodes: [...Example.Nodes, { Id: "x", Kind: "teleport", Type: "x", X: 0, Y: 0, Params: {} }, { Id: "y", Kind: "action", Type: "explode", X: 0, Y: 0, Params: {} }, { Id: 3 }, { Id: "z", Kind: "event", Type: "click", X: "0", Y: 0, Params: {} }, { Id: "p", Kind: "event", Type: "click", X: 0, Y: 0, Params: { Widget: 5, Other: "keep" } }], Links: [...Example.Links, { From: "e1", To: "x" }, { From: 1, To: 2 }] };
		const graph = ParseGraph(raw);
		expect(graph.Nodes.map((n) => n.Id)).toEqual([...Example.Nodes.map((n) => n.Id), "p"]);
		expect(graph.Nodes.at(-1)!.Params).toEqual({ Other: "keep" });
		expect(graph.Links).toEqual(Example.Links);
		expect(ParseGraph("nope")).toEqual({ Nodes: [], Links: [] });
		expect(ParseGraph({ Nodes: 1, Links: 2 })).toEqual({ Nodes: [], Links: [] });
	});
});



describe("graph edges", () => {
	it("a message box action without a dialog service says what is missing; params that aren't an object read as none", () => {
		const graph: UiGraph = { Nodes: [Event("e", "OpenSettings", "click"), Action("m", ActionType.MessageBox, { Text: "x", Title: "" })], Links: [{ From: "e", To: "m" }] };
		const document = new UiDocument(Screen(graph));
		expect(() => document.Controller<ButtonController>("OpenSettings").PerformClick()).toThrow(/no dialog service/);
		expect(ParseGraph({ Nodes: [{ Id: "a", Kind: "event", Type: "click", X: 0, Y: 0, Params: "x" }], Links: [] }).Nodes[0]!.Params).toEqual({});
	});
});
