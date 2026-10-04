// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { ButtonController } from "../../../Source/Toolkit/Controls/ButtonController";
import { CheckBoxController, CheckState } from "../../../Source/Toolkit/Controls/CheckBoxController";
import { ComboBoxController } from "../../../Source/Toolkit/Controls/ComboBoxController";
import { ListViewController } from "../../../Source/Toolkit/Controls/ListViewController";
import { ProgressBarController } from "../../../Source/Toolkit/Controls/ProgressBarController";
import { RadioGroupController } from "../../../Source/Toolkit/Controls/RadioGroupController";
import { SliderController } from "../../../Source/Toolkit/Controls/SliderController";
import { SpinnerController } from "../../../Source/Toolkit/Controls/SpinnerController";
import { StatusBarController } from "../../../Source/Toolkit/Controls/StatusBarController";
import { TextBoxController } from "../../../Source/Toolkit/Controls/TextBoxController";
import { WindowController } from "../../../Source/Toolkit/Controls/WindowController";
import { CreateNode, NewLayout, ParseLayout, SerializeLayout, WidgetType, type UiLayout } from "../../../Source/Toolkit/Designer/Layout";
import { BuiltInWidgets } from "../../../Source/Toolkit/Designer/Widgets";
import { UiDocument } from "../../../Source/Toolkit/Designer/UiDocument";
import { UiScript, UiScriptRegistry } from "../../../Source/Toolkit/Designer/UiScript";

describe("widget definitions", () => {
	it("cover containers and every toolkit control, each with a palette label, a default size and typed props", () => {
		expect(BuiltInWidgets.Palette).toEqual([
			WidgetType.Window, WidgetType.GroupBox, WidgetType.Label, WidgetType.Image, WidgetType.Button, WidgetType.CheckBox,
			WidgetType.RadioGroup, WidgetType.TextBox, WidgetType.Spinner, WidgetType.ComboBox, WidgetType.ProgressBar,
			WidgetType.Slider, WidgetType.ListBox, WidgetType.StatusBar,
		]);
		for (const type of [WidgetType.Canvas, ...BuiltInWidgets.Palette]) {
			const definition = BuiltInWidgets.Get(type)!;
			expect(definition.Label.length, type).toBeGreaterThan(0);
			expect(definition.Size[0], type).toBeGreaterThan(0);
			for (const prop of definition.Props) expect(prop.Default, `${type}.${prop.Key}`).toBeDefined();
		}
		expect([WidgetType.Canvas, WidgetType.Window, WidgetType.GroupBox].every((t) => BuiltInWidgets.Get(t)!.Container)).toBe(true);
		expect(BuiltInWidgets.Get(WidgetType.Button)!.Container).toBe(false);
	});

	it("CreateNode fills in the default size and props", () => {
		const node = CreateNode(WidgetType.Button, "OkButton", 16, 24);
		expect(node).toEqual({ Name: "OkButton", Type: WidgetType.Button, X: 16, Y: 24, Width: 75, Height: 23, Props: { Text: "Button", Default: false, Enabled: true, CausesValidation: false, DialogResult: "None" } });
		expect(CreateNode(WidgetType.Window, "Main", 0, 0).Children).toEqual([]);
	});
});

describe("layout files", () => {
	it("NewLayout is an empty canvas; Serialize/Parse round-trip", () => {
		const layout = NewLayout("Main menu");
		expect(layout).toMatchObject({ Format: 1, Name: "Main menu", Script: "", Root: { Name: "Root", Type: WidgetType.Canvas, Width: 800, Height: 500, Children: [] } });
		layout.Root.Children!.push(CreateNode(WidgetType.Label, "Title", 10, 10));
		expect(ParseLayout(SerializeLayout(layout))).toEqual(layout);
	});

	it("parsing checks the structure, drops unknown props and fills missing ones with defaults", () => {
		const text = JSON.stringify({ Format: 1, Name: "x", Script: "S", Root: { Name: "Root", Type: "canvas", X: 0, Y: 0, Width: 100, Height: 100, Props: {}, Children: [
			{ Name: "A", Type: "button", X: 1, Y: 2, Width: 3, Height: 4, Props: { Text: "Go", Bogus: 1, Enabled: "yes" } },
		] } });
		const layout = ParseLayout(text);
		expect(layout.Root.Children![0]!.Props).toEqual({ Text: "Go", Default: false, Enabled: true, CausesValidation: false, DialogResult: "None" });
		expect(layout.Script).toBe("S");
	});

	it("rejects files that are not layouts", () => {
		const bad = [
			"nope",
			"{}",
			JSON.stringify({ Format: 2, Name: "x", Root: {} }),
			JSON.stringify({ Format: 1, Name: "x", Root: { Name: "Root", Type: "button", X: 0, Y: 0, Width: 1, Height: 1, Props: {} } }),
			JSON.stringify({ Format: 1, Name: "x", Root: { Name: "Root", Type: "canvas", X: 0, Y: 0, Width: 1, Height: 1, Props: {}, Children: [{ Name: "A", Type: "teleporter", X: 0, Y: 0, Width: 1, Height: 1, Props: {} }] } }),
			JSON.stringify({ Format: 1, Name: "x", Root: { Name: "Root", Type: "canvas", X: 0, Y: "0", Width: 1, Height: 1, Props: {} } }),
			JSON.stringify({ Format: 1, Name: "x", Root: { Name: "Root", Type: "canvas", X: 0, Y: 0, Width: 1, Height: 1, Props: {}, Children: [
				{ Name: "A", Type: "label", X: 0, Y: 0, Width: 1, Height: 1, Props: {} }, { Name: "A", Type: "label", X: 0, Y: 0, Width: 1, Height: 1, Props: {} },
			] } }),
			JSON.stringify({ Format: 1, Name: "x", Root: { Name: "Root", Type: "canvas", X: 0, Y: 0, Width: 1, Height: 1, Props: {}, Children: [{ Name: "A", Type: "label", X: 0, Y: 0, Width: 1, Height: 1, Props: {}, Children: [] }] } }),
		];
		for (const text of bad) expect(() => ParseLayout(text), text).toThrow(/Not a UI layout/);
	});
});

function SampleLayout(): UiLayout {
	const layout = NewLayout("Sample");
	const window = CreateNode(WidgetType.Window, "LoginWindow", 20, 20);
	window.Props["Title"] = "Log in";
	window.Children!.push(
		{ ...CreateNode(WidgetType.TextBox, "UserName", 10, 10), Props: { ...CreateNode(WidgetType.TextBox, "x", 0, 0).Props, Placeholder: "User" } },
		CreateNode(WidgetType.Button, "OkButton", 10, 40),
	);
	layout.Root.Children!.push(
		window,
		CreateNode(WidgetType.Label, "Hint", 0, 0),
		CreateNode(WidgetType.Image, "Logo", 0, 0),
		CreateNode(WidgetType.GroupBox, "Group", 0, 0),
		{ ...CreateNode(WidgetType.CheckBox, "Remember", 0, 0), Props: { Text: "Remember me", Checked: true, ThreeState: false, Enabled: false } },
		{ ...CreateNode(WidgetType.RadioGroup, "Size", 0, 0), Props: { Options: ["Small", "Large"], Selected: "Large", Enabled: true } },
		CreateNode(WidgetType.Spinner, "Count", 0, 0),
		{ ...CreateNode(WidgetType.ComboBox, "Font", 0, 0), Props: { Options: ["Tahoma", "Arial"], Selected: 1, Enabled: true } },
		CreateNode(WidgetType.ProgressBar, "Progress", 0, 0),
		CreateNode(WidgetType.Slider, "Volume", 0, 0),
		{ ...CreateNode(WidgetType.ListBox, "Files", 0, 0), Props: { Header: "Name", Items: ["a.txt", "b.txt"], Enabled: true } },
		{ ...CreateNode(WidgetType.StatusBar, "Status", 0, 0), Props: { Panels: ["Ready", "Ln 1"] } },
	);
	return layout;
}

describe("UiDocument", () => {
	it("creates a controller for every interactive widget, by name, configured from its props", () => {
		const document = new UiDocument(SampleLayout());
		expect(document.Controller<WindowController>("LoginWindow")).toBeInstanceOf(WindowController);
		expect(document.Controller<WindowController>("LoginWindow").Title).toBe("Log in");
		expect(document.Controller<TextBoxController>("UserName").Placeholder).toBe("User");
		expect(document.Controller<ButtonController>("OkButton").Label).toBe("Button");
		const remember = document.Controller<CheckBoxController>("Remember");
		expect([remember.State, remember.Enabled, remember.Label]).toEqual([CheckState.Checked, false, "Remember me"]);
		expect(document.Controller<RadioGroupController<string>>("Size").Value).toBe("Large");
		expect(document.Controller<SpinnerController>("Count")).toBeInstanceOf(SpinnerController);
		expect(document.Controller<ComboBoxController<string>>("Font").SelectedOption?.Label).toBe("Arial");
		expect(document.Controller<ProgressBarController>("Progress")).toBeInstanceOf(ProgressBarController);
		expect(document.Controller<SliderController>("Volume")).toBeInstanceOf(SliderController);
		expect(document.Controller<ListViewController<{ text: string; }>>("Files").Items.map((i) => i.text)).toEqual(["a.txt", "b.txt"]);
		expect(document.Controller<StatusBarController>("Status").Panels.map((p) => p.Text)).toEqual(["Ready", "Ln 1"]);
		expect(document.Find("Hint")).toMatchObject({ Node: { Type: WidgetType.Label }, Controller: null });
		expect(document.Find("Nobody")).toBeUndefined();
	});

	it("Controller throws a helpful error for missing or non-interactive widgets", () => {
		const document = new UiDocument(SampleLayout());
		expect(() => document.Controller("Nobody")).toThrow('No widget named "Nobody"');
		expect(() => document.Controller("Hint")).toThrow('"Hint" (label) has no controller');
	});

	it("On subscribes to a widget's event by name; every widget event is also reported as widget-event", () => {
		const document = new UiDocument(SampleLayout());
		const click = vi.fn();
		const all: unknown[][] = [];
		const off = document.On("OkButton", "click", click);
		document.Events.On("widget-event", (name, event, args) => all.push([name, event, args]));

		document.Controller<ButtonController>("OkButton").PerformClick();
		document.Controller<TextBoxController>("UserName").SetValue("anton");
		off();
		document.Controller<ButtonController>("OkButton").PerformClick();
		expect(click).toHaveBeenCalledOnce();
		expect(all).toEqual([["OkButton", "click", []], ["UserName", "change", ["anton", ""]], ["OkButton", "click", []]]);
		expect(() => document.On("Hint", "click", vi.fn())).toThrow(/has no controller/);
	});

	it("Dispose stops the event reports", () => {
		const document = new UiDocument(SampleLayout());
		const all = vi.fn();
		document.Events.On("widget-event", all);
		document.Dispose();
		document.Controller<ButtonController>("OkButton").PerformClick();
		expect(all).not.toHaveBeenCalled();
	});
});

class LoginScript extends UiScript {
	public static Constructed = 0;
	public static Destructed = 0;
	public override OnConstruct(): void {
		LoginScript.Constructed++;
		const ok = this.Widget<ButtonController>("OkButton");
		ok.SetEnabled(false);
		this.On("UserName", "change", (value) => ok.SetEnabled((value as string).length > 0));
		this.On("OkButton", "click", () => this.Widget<StatusBarController>("Status").SetText(0, `Welcome, ${this.Widget<TextBoxController>("UserName").Value}`));
	}
	public override OnDestruct(): void { LoginScript.Destructed++; }
}

describe("UI scripts", () => {
	it("the layout names its script; the document runs it after creating the widgets, and the script drives them", () => {
		const registry = new UiScriptRegistry().Register("Login", LoginScript);
		const layout = SampleLayout();
		layout.Script = "Login";
		const document = new UiDocument(layout, { Scripts: registry });
		expect(LoginScript.Constructed).toBe(1);
		const ok = document.Controller<ButtonController>("OkButton");
		expect(ok.Enabled).toBe(false);
		document.Controller<TextBoxController>("UserName").SetValue("anton");
		expect(ok.Enabled).toBe(true);
		ok.PerformClick();
		expect(document.Controller<StatusBarController>("Status").Panels[0]!.Text).toBe("Welcome, anton");

		document.Dispose();
		expect(LoginScript.Destructed).toBe(1);
		document.Controller<TextBoxController>("UserName").SetValue("");
		expect(ok.Enabled).toBe(true); // the script's subscriptions ended with it
		expect(document.Script).toBeInstanceOf(LoginScript);
	});

	it("no script name, or a name nobody registered: the document still works, without a script", () => {
		const registry = new UiScriptRegistry();
		const layout = SampleLayout();
		expect(new UiDocument(layout, { Scripts: registry }).Script).toBeNull();
		layout.Script = "Missing";
		const document = new UiDocument(layout, { Scripts: registry });
		expect(document.Script).toBeNull();
		expect(document.MissingScript).toBe("Missing");
		expect(new UiDocument(layout).Script).toBeNull();
	});

	it("the registry lists its scripts, refuses duplicates, and the base hooks do nothing", () => {
		class Empty extends UiScript {}
		const registry = new UiScriptRegistry().Register("A", Empty).Register("B", LoginScript);
		expect(registry.Names).toEqual(["A", "B"]);
		expect(() => registry.Register("A", Empty)).toThrow('A UI script named "A" is already registered');
		const layout = NewLayout("x");
		layout.Script = "A";
		const document = new UiDocument(layout, { Scripts: registry });
		expect(document.Script).toBeInstanceOf(Empty);
		expect(() => document.Dispose()).not.toThrow();
	});
});

describe("layout parsing edges", () => {
	const root = (children: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ Format: 1, Name: "x", Root: { Name: "Root", Type: "canvas", X: 0, Y: 0, Width: 9, Height: 9, ...extra, Children: children } });

	it("a widget that is not an object, props that are not an object, a container without children, a layout without a script", () => {
		expect(() => ParseLayout(root([42]))).toThrow(/a widget has no name/);
		const layout = ParseLayout(root([{ Name: "W", Type: "window", X: 0, Y: 0, Width: 9, Height: 9, Props: "nope" }]));
		expect(layout.Root.Children![0]!.Children).toEqual([]);
		expect(layout.Root.Children![0]!.Props["Title"]).toBe("Window");
		expect(layout.Script).toBe("");
		const lines = ParseLayout(root([{ Name: "L", Type: "listbox", X: 0, Y: 0, Width: 9, Height: 9, Props: { Items: ["a", 2] } }]));
		expect(lines.Root.Children![0]!.Props["Items"]).toEqual(["Item 1", "Item 2", "Item 3"]);
		expect(ParseLayout(JSON.stringify({ Format: 1, Name: "x", Root: { Name: "Root", Type: "canvas", X: 0, Y: 0, Width: 9, Height: 9 } })).Root.Children).toEqual([]);
	});

	it("controllers follow the props: an unchecked box, a selected option that isn't offered, a length limit", () => {
		const layout = NewLayout("x");
		layout.Root.Children!.push(
			CreateNode(WidgetType.CheckBox, "Box", 0, 0),
			{ ...CreateNode(WidgetType.RadioGroup, "Radio", 0, 0), Props: { Options: ["A"], Selected: "Z", Enabled: true } },
			{ ...CreateNode(WidgetType.TextBox, "Text", 0, 0), Props: { ...CreateNode(WidgetType.TextBox, "t", 0, 0).Props, MaxLength: 3 } },
		);
		const document = new UiDocument(layout);
		expect(document.Controller<CheckBoxController>("Box").State).toBe(CheckState.Unchecked);
		expect(document.Controller<RadioGroupController<string>>("Radio").Value).toBeNull();
		expect(document.Controller<TextBoxController>("Text").MaxLength).toBe(3);
	});
});
