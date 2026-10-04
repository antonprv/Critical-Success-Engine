// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { DesignerController, DesignerMode } from "../../../Source/Toolkit/Designer/DesignerController";
import { NewLayout, SerializeLayout, WidgetType } from "../../../Source/Toolkit/Designer/Layout";

const names = (designer: DesignerController) => designer.Hierarchy.map((h) => `${"  ".repeat(h.Depth)}${h.Node.Name}`);

describe("DesignerController: building a layout", () => {
	it("starts with an empty canvas; Add places a widget with a unique name, snapped to the grid, and selects it", () => {
		const designer = new DesignerController();
		expect(names(designer)).toEqual(["Root"]);
		const change = vi.fn();
		designer.Events.On("change", change);

		const a = designer.Add(WidgetType.Button, { X: 13, Y: 21 });
		const b = designer.Add(WidgetType.Button);
		expect([a.Name, a.X, a.Y]).toEqual(["Button1", 16, 24]);
		expect([b.Name, b.X, b.Y]).toEqual(["Button2", 16, 16]);
		expect(designer.SelectedName).toBe("Button2");
		expect(designer.Dirty).toBe(true);
		expect(change).toHaveBeenCalledTimes(2);
	});

	it("new widgets go into: the given container, else the selected container, else the selected widget's container, else the canvas", () => {
		const designer = new DesignerController();
		const window = designer.Add(WidgetType.Window);
		designer.Add(WidgetType.Label); // the window is selected: inside it
		designer.Add(WidgetType.Label); // a label is selected: next to it, in the window
		const group = designer.Add(WidgetType.GroupBox, { Parent: "Root" });
		designer.Add(WidgetType.CheckBox, { Parent: window.Name });
		designer.Add(WidgetType.Button, { Parent: "Label1" }); // not a container: falls back to the selected rules
		designer.Select(null);
		designer.Add(WidgetType.Image);
		// CheckBox1 (in the window) was selected when Button1 was added: it lands next to it.
		expect(names(designer)).toEqual(["Root", "  Window1", "    Label1", "    Label2", "    CheckBox1", "    Button1", "  GroupBox1", "  Image1"]);
		expect(group.Name).toBe("GroupBox1");
	});

	it("Select, Find and ParentOf; selecting an unknown name changes nothing", () => {
		const designer = new DesignerController();
		const label = designer.Add(WidgetType.Label);
		const selection = vi.fn();
		designer.Events.On("selection-change", selection);
		designer.Select("Nope");
		designer.Select("Root");
		designer.Select("Root");
		expect(designer.Selected?.Name).toBe("Root");
		expect(designer.Find(label.Name)).toBe(label);
		expect(designer.ParentOf(label.Name)?.Name).toBe("Root");
		expect(designer.ParentOf("Root")).toBeNull();
		expect(selection.mock.calls).toEqual([["Root"]]);
		designer.Select(null);
		expect(designer.Selected).toBeNull();
	});

	it("Delete removes a widget (not the canvas) and selects its parent", () => {
		const designer = new DesignerController();
		const window = designer.Add(WidgetType.Window);
		designer.Add(WidgetType.Button);
		designer.Delete();
		expect(names(designer)).toEqual(["Root", "  Window1"]);
		expect(designer.SelectedName).toBe(window.Name);
		designer.Delete("Root");
		designer.Delete("Nope");
		expect(names(designer)).toEqual(["Root", "  Window1"]);
		designer.Select(null);
		designer.Delete();
		expect(names(designer)).toEqual(["Root", "  Window1"]);
	});

	it("Duplicate copies a widget with its children under new names, a grid step down and right", () => {
		const designer = new DesignerController();
		const group = designer.Add(WidgetType.GroupBox, { X: 40, Y: 40 });
		designer.Add(WidgetType.Button);
		designer.Select(group.Name);
		const copy = designer.Duplicate()!;
		expect([copy.Name, copy.X, copy.Y]).toEqual(["GroupBox2", 48, 48]);
		expect(names(designer)).toEqual(["Root", "  GroupBox1", "    Button1", "  GroupBox2", "    Button2"]);
		expect(designer.Duplicate("Root")).toBeNull();
		designer.Select(null);
		expect(designer.Duplicate()).toBeNull();
	});
});

describe("DesignerController: moving and sizing", () => {
	it("MoveTo / ResizeTo snap to the grid, keep inside the parent's origin and above a minimum size", () => {
		const designer = new DesignerController();
		const button = designer.Add(WidgetType.Button);
		designer.MoveTo(button.Name, 37, -20);
		designer.ResizeTo(button.Name, 101, 3);
		expect([button.X, button.Y, button.Width, button.Height]).toEqual([40, 0, 104, 8]);
		designer.Snap = false;
		designer.MoveTo(button.Name, 37.4, 21.6);
		designer.ResizeTo(button.Name, 2, 2);
		expect([button.X, button.Y, button.Width, button.Height]).toEqual([37, 22, 8, 8]);
		designer.MoveTo("Nope", 1, 1);
		designer.ResizeTo("Nope", 1, 1);
		designer.MoveTo("Root", 50, 50);
		expect(designer.Layout.Root.X).toBe(0);
	});

	it("a drag is one undo step: BeginGesture records once, the moves in between don't", () => {
		const designer = new DesignerController();
		const button = designer.Add(WidgetType.Button);
		designer.BeginGesture();
		for (let i = 1; i <= 5; i++) designer.MoveTo(button.Name, 16 + i * 8, 16);
		designer.EndGesture();
		expect(button.X).toBe(56);
		designer.Undo();
		expect(designer.Find("Button1")!.X).toBe(16);
		designer.Undo();
		expect(designer.Find("Button1")).toBeUndefined();
	});

	it("arrow keys nudge the selection by a pixel, by a grid step with Shift", () => {
		const designer = new DesignerController();
		const button = designer.Add(WidgetType.Button, { X: 16, Y: 16 });
		designer.Snap = false;
		designer.KeyDown("ArrowRight");
		designer.KeyDown("ArrowDown", { Shift: true });
		designer.KeyDown("ArrowLeft");
		designer.KeyDown("ArrowUp");
		expect([button.X, button.Y]).toEqual([16, 23]);
	});

	it("BringForward / SendBackward change the drawing order among siblings", () => {
		const designer = new DesignerController();
		designer.Add(WidgetType.Label, { Parent: "Root" });
		designer.Add(WidgetType.Image, { Parent: "Root" });
		designer.Add(WidgetType.Button, { Parent: "Root" });
		designer.SendBackward("Button1");
		designer.SendBackward("Button1");
		designer.SendBackward("Button1"); // already at the back
		expect(names(designer)).toEqual(["Root", "  Button1", "  Label1", "  Image1"]);
		designer.BringForward("Button1");
		designer.BringForward("Image1"); // already at the front
		designer.BringForward("Root");
		expect(names(designer)).toEqual(["Root", "  Label1", "  Button1", "  Image1"]);
	});

	it("Reparent moves a widget into another container, but never into itself, its own children or a non-container", () => {
		const designer = new DesignerController();
		const window = designer.Add(WidgetType.Window, { Parent: "Root" });
		designer.Add(WidgetType.GroupBox, { Parent: window.Name });
		designer.Add(WidgetType.Button, { Parent: "Root" });
		expect(designer.Reparent("Button1", "GroupBox1")).toBe(true);
		expect(designer.Reparent("Window1", "GroupBox1")).toBe(false);
		expect(designer.Reparent("Window1", "Window1")).toBe(false);
		expect(designer.Reparent("GroupBox1", "Button1")).toBe(false);
		expect(designer.Reparent("Root", "Window1")).toBe(false);
		expect(designer.Reparent("Nope", "Root")).toBe(false);
		expect(names(designer)).toEqual(["Root", "  Window1", "    GroupBox1", "      Button1"]);
	});
});

describe("DesignerController: properties", () => {
	it("Rename accepts unique identifiers only (scripts use the names)", () => {
		const designer = new DesignerController();
		designer.Add(WidgetType.Button);
		designer.Add(WidgetType.Label);
		expect(designer.Rename("Button1", "PlayButton")).toBe(true);
		expect(designer.Rename("PlayButton", "Label1")).toBe(false);
		expect(designer.Rename("PlayButton", "2fast")).toBe(false);
		expect(designer.Rename("PlayButton", "has space")).toBe(false);
		expect(designer.Rename("PlayButton", "PlayButton")).toBe(true);
		expect(designer.Rename("Nope", "X")).toBe(false);
		expect(designer.SelectedName).toBe("Label1");
		designer.Select("PlayButton");
		designer.Rename("PlayButton", "Go");
		expect(designer.SelectedName).toBe("Go");
	});

	it("SetProp checks the property exists and has the right kind of value", () => {
		const designer = new DesignerController();
		const button = designer.Add(WidgetType.Button);
		expect(designer.SetProp(button.Name, "Text", "Play")).toBe(true);
		expect(designer.SetProp(button.Name, "Enabled", false)).toBe(true);
		expect(designer.SetProp(button.Name, "Enabled", "no")).toBe(false);
		expect(designer.SetProp(designer.Add(WidgetType.Spinner, { Parent: "Root" }).Name, "Max", Number.NaN)).toBe(false); // not a usable number
		expect(designer.SetProp(button.Name, "Color", "red")).toBe(false);
		expect(designer.SetProp("Nope", "Text", "x")).toBe(false);
		expect(button.Props).toMatchObject({ Text: "Play", Enabled: false });
	});

	it("layout name and script are part of the layout", () => {
		const designer = new DesignerController();
		designer.SetLayoutName("Main menu");
		designer.SetScript("MainMenu");
		expect(designer.Layout).toMatchObject({ Name: "Main menu", Script: "MainMenu" });
	});
});

describe("DesignerController: files, undo, modes", () => {
	it("Export writes the layout and clears Dirty; Import replaces it, or reports why it can't", () => {
		const designer = new DesignerController();
		designer.Add(WidgetType.Button);
		const text = designer.Export();
		expect(designer.Dirty).toBe(false);
		expect(text).toBe(SerializeLayout(designer.Layout));

		const other = new DesignerController();
		expect(other.Import(text)).toBeNull();
		expect(names(other)).toEqual(["Root", "  Button1"]);
		expect(other.Dirty).toBe(false);
		expect(other.Import("garbage")).toMatch(/Not a UI layout/);
		expect(names(other)).toEqual(["Root", "  Button1"]);
	});

	it("New and Load start over: no selection, no history", () => {
		const designer = new DesignerController();
		designer.Add(WidgetType.Button);
		designer.New("Settings");
		expect([designer.Layout.Name, designer.SelectedName, designer.CanUndo, designer.Dirty]).toEqual(["Settings", null, false, false]);
		const layout = NewLayout("HUD");
		designer.Load(layout);
		expect(designer.Layout).not.toBe(layout); // a copy: editing doesn't touch the caller's object
		expect(designer.Layout.Name).toBe("HUD");
		expect(new DesignerController(layout).Layout.Name).toBe("HUD");
		designer.New();
		expect(designer.Layout.Name).toBe("Untitled");
	});

	it("Undo / Redo walk the history and keep the selection when the widget still exists; a new change clears Redo", () => {
		const designer = new DesignerController();
		designer.Add(WidgetType.Button);
		designer.SetProp("Button1", "Text", "Go");
		designer.Undo();
		expect(designer.Find("Button1")!.Props["Text"]).toBe("Button");
		expect(designer.SelectedName).toBe("Button1");
		expect(designer.CanRedo).toBe(true);
		designer.Redo();
		expect(designer.Find("Button1")!.Props["Text"]).toBe("Go");
		designer.Undo();
		designer.Undo();
		expect(designer.SelectedName).toBeNull();
		designer.Undo(); // nothing left
		designer.Redo();
		designer.Add(WidgetType.Label);
		expect(designer.CanRedo).toBe(false);
		designer.Redo();
		expect(names(designer)).toEqual(["Root", "  Button1", "  Label1"]);
	});

	it("keeps at most 100 undo steps", () => {
		const designer = new DesignerController();
		const button = designer.Add(WidgetType.Button);
		for (let i = 0; i < 150; i++) designer.MoveTo(button.Name, i * 8, 0);
		let steps = 0;
		while (designer.CanUndo) {
			designer.Undo();
			steps++;
		}
		expect(steps).toBe(100);
	});

	it("keyboard: Delete, Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z, Ctrl+D, Escape selects the parent", () => {
		const designer = new DesignerController();
		designer.Add(WidgetType.Window);
		designer.Add(WidgetType.Button);
		designer.KeyDown("KeyD", { Ctrl: true });
		expect(designer.SelectedName).toBe("Button2");
		designer.KeyDown("Delete");
		designer.KeyDown("KeyZ", { Ctrl: true });
		expect(designer.Find("Button2")).toBeDefined();
		designer.KeyDown("KeyY", { Ctrl: true });
		expect(designer.Find("Button2")).toBeUndefined();
		designer.KeyDown("KeyZ", { Ctrl: true });
		designer.KeyDown("KeyZ", { Ctrl: true, Shift: true });
		expect(designer.Find("Button2")).toBeUndefined();
		designer.Select("Button1");
		designer.KeyDown("Escape");
		expect(designer.SelectedName).toBe("Window1");
		designer.KeyDown("KeyQ");
		designer.Select(null);
		designer.KeyDown("ArrowLeft");
		designer.KeyDown("Escape");
		expect(designer.SelectedName).toBeNull();
	});

	it("Preview / Design mode switch, reported once per change; keys are ignored while previewing", () => {
		const designer = new DesignerController();
		designer.Add(WidgetType.Button);
		const modes: DesignerMode[] = [];
		designer.Events.On("mode-change", (mode) => modes.push(mode));
		designer.SetMode(DesignerMode.Preview);
		designer.SetMode(DesignerMode.Preview);
		designer.KeyDown("Delete");
		expect(designer.Find("Button1")).toBeDefined();
		designer.SetMode(DesignerMode.Design);
		expect(modes).toEqual([DesignerMode.Preview, DesignerMode.Design]);
	});
});

describe("DesignerController: edge keys", () => {
	it("Ctrl with another key does nothing; Escape on the canvas clears the selection; Mode starts in Design", () => {
		const designer = new DesignerController();
		designer.Add(WidgetType.Button);
		designer.KeyDown("KeyQ", { Ctrl: true });
		expect(designer.Find("Button1")).toBeDefined();
		designer.Select("Root");
		designer.KeyDown("Escape");
		expect(designer.SelectedName).toBeNull();
		expect(designer.Mode).toBe(DesignerMode.Design);
	});
});

describe("DesignerController: edit sessions", () => {
	it("everything changed between BeginEdit and EndEdit is one undo step; a session with no change adds none", () => {
		const designer = new DesignerController();
		designer.Add(WidgetType.Button);
		designer.BeginEdit();
		designer.EndEdit();
		designer.BeginEdit();
		designer.SetProp("Button1", "Text", "P");
		designer.SetProp("Button1", "Text", "Pl");
		designer.SetProp("Button1", "Text", "Play");
		designer.EndEdit();
		designer.Undo();
		expect(designer.Find("Button1")!.Props["Text"]).toBe("Button");
		designer.Undo();
		expect(designer.Find("Button1")).toBeUndefined();
		expect(designer.CanUndo).toBe(false);
	});
});
