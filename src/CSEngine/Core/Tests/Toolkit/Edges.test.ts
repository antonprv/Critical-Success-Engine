// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { ControlBase } from "../../Source/Toolkit/Core/ControlBase";
import { ListViewController, SelectionMode } from "../../Source/Toolkit/Controls/ListViewController";
import { MenuController } from "../../Source/Toolkit/Controls/MenuController";
import { TreeViewController } from "../../Source/Toolkit/Controls/TreeViewController";
import { WindowController, WindowState } from "../../Source/Toolkit/Controls/WindowController";
import { WindowManager } from "../../Source/Toolkit/Controls/WindowManager";

describe("list view edges", () => {
	const items = ["a", "b", "c", "d"];

	it("SelectedItems are in row order; double-clicking outside the list activates nothing", () => {
		const list = new ListViewController({ Items: [...items] });
		list.Click(3);
		list.Click(1, { Ctrl: true });
		expect(list.SelectedItems).toEqual(["b", "d"]);
		const activate = vi.fn();
		list.Events.On("activate", activate);
		list.DoubleClick(99);
		expect(activate).not.toHaveBeenCalled();
	});

	it("Ctrl+arrows move only the focus; in Multiple and None modes arrows never select", () => {
		const extended = new ListViewController({ Items: [...items] });
		extended.Click(0);
		extended.KeyDown("ArrowDown", { Ctrl: true });
		expect([extended.FocusedIndex, [...extended.SelectedIndices]]).toEqual([1, [0]]);

		for (const mode of [SelectionMode.Multiple, SelectionMode.None]) {
			const list = new ListViewController({ Items: [...items], SelectionMode: mode });
			list.KeyDown("ArrowDown");
			list.KeyDown("ArrowDown");
			expect([list.FocusedIndex, list.SelectedIndices.size]).toEqual([1, 0]);
		}
	});

	it("Shift+click with no anchor yet selects just that row; Enter/Space with no focus do nothing", () => {
		const list = new ListViewController({ Items: [...items] });
		const activate = vi.fn();
		list.Events.On("activate", activate);
		list.KeyDown("Enter");
		list.KeyDown("Space");
		list.Click(2, { Shift: true });
		expect([...list.SelectedIndices]).toEqual([2]);
		expect(activate).not.toHaveBeenCalled();
	});

	it("sorting a list with nothing focused keeps nothing focused", () => {
		const list = new ListViewController({ Items: [...items] });
		list.SortBy("name", (a, b) => b.localeCompare(a));
		expect([list.FocusedIndex, list.Items[0]]).toEqual([-1, "d"]);
	});
});

describe("menu edges", () => {
	const menu = () => new MenuController({ Items: [
		{ Id: "file", Label: "&File", Items: [{ Id: "empty", Label: "&Empty", Items: [{ Id: "x", Label: "x", Disabled: true }] }, { Id: "a", Label: "&A" }] },
		{ Id: "plain", Label: "Plain" },
	] });

	it("a disabled menu ignores keys; Alt with an unknown mnemonic opens nothing", () => {
		const off = menu();
		off.SetEnabled(false);
		off.KeyDown("KeyF", { Alt: true });
		expect(off.OpenPath).toEqual([]);
		const on = menu();
		on.KeyDown("KeyZ", { Alt: true });
		on.KeyDown("Digit1", { Alt: true });
		expect(on.OpenPath).toEqual([]);
	});

	it("Enter with nothing highlighted and non-letter keys do nothing; Up from nothing highlights the last item", () => {
		const m = menu();
		m.Open("file");
		m.KeyDown("Enter");
		m.KeyDown("Digit1");
		expect(m.OpenPath).toEqual(["file"]);
		m.KeyDown("ArrowUp");
		expect(m.HighlightedId).toBe("a");
	});

	it("a submenu with nothing selectable opens with nothing highlighted; items without a submenu can't be opened as menus", () => {
		const m = menu();
		m.Open("file");
		m.Invoke("empty");
		expect([m.OpenPath, m.HighlightedId]).toEqual([["file", "empty"], null]);
		m.Open("plain");
		expect(m.OpenPath).toEqual(["file", "empty"]);
	});
});

describe("tree view edges", () => {
	const tree = () => new TreeViewController({ Nodes: [{ Id: "a", Label: "A", Children: [{ Id: "b", Label: "B" }] }] });

	it("Toggle collapses an open node; EnsureVisible of an unknown id does nothing; Right/Left/Enter need a selection", () => {
		const view = tree();
		const activate = vi.fn();
		view.Events.On("activate", activate);
		view.Toggle("a");
		view.Toggle("a");
		expect(view.IsExpanded("a")).toBe(false);
		view.EnsureVisible("nope");
		view.KeyDown("ArrowRight");
		view.KeyDown("ArrowLeft");
		view.KeyDown("Enter");
		expect([view.IsExpanded("a"), view.SelectedId]).toEqual([false, null]);
		expect(activate).not.toHaveBeenCalled();
	});
});

describe("window edges", () => {
	it("maximizing a minimized window keeps the normal bounds from before; same size and same activity are no-ops", () => {
		const window = new WindowController({ X: 10, Y: 10, Width: 200, Height: 100 });
		window.Minimize();
		window.Maximize({ Width: 800, Height: 600 });
		expect(window.State).toBe(WindowState.Maximized);
		window.Restore();
		expect([window.X, window.Y, window.Width, window.Height]).toEqual([10, 10, 200, 100]); // back where it was before minimizing

		const plain = new WindowController();
		const resize = vi.fn();
		const activate = vi.fn();
		plain.Events.On("resize", resize);
		plain.Events.On("activate", activate);
		plain.SetSize(320, 240);
		plain.SetActive(false);
		expect([resize.mock.calls.length, activate.mock.calls.length]).toEqual([0, 0]);
	});

	it("removing a window that is not the active one leaves the active window alone", () => {
		const manager = new WindowManager();
		const a = new WindowController(), b = new WindowController();
		manager.Add(a);
		manager.Add(b);
		manager.Remove(a);
		expect(manager.ActiveWindow).toBe(b);
	});
});

describe("control base edges", () => {
	class Probe extends ControlBase {}

	it("enabling again and repeating SetVisible are reported only when they change something", () => {
		const control = new Probe({ Enabled: false });
		const log: string[] = [];
		control.Events.On("enabled-change", (v) => log.push(`enabled ${v}`));
		control.Events.On("visible-change", (v) => log.push(`visible ${v}`));
		control.SetEnabled(true);
		control.SetVisible(true);
		expect(log).toEqual(["enabled true"]);
	});
});

describe("list view focus", () => {
	it("keyboard focus on the control and the focused row are separate states", () => {
		const list = new ListViewController({ Items: ["a", "b", "c"] });
		list.Focus();
		expect([list.Focused, list.FocusedIndex]).toEqual([true, -1]);
		list.Click(2);
		list.Blur();
		expect([list.Focused, list.FocusedIndex]).toEqual([false, 2]);
	});
});
