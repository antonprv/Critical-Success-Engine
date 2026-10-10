// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { ListViewController, SelectionMode, SortDirection } from "../Source/Controls/ListViewController";
import { MenuController, type MenuItem } from "../Source/Controls/MenuController";
import { SliderController } from "../Source/Controls/SliderController";
import { TreeViewController, type TreeNode } from "../Source/Controls/TreeViewController";

type File = { name: string; size: number; };
const files: File[] = [{ name: "b.txt", size: 30 }, { name: "a.txt", size: 10 }, { name: "c.txt", size: 20 }, { name: "d.txt", size: 40 }];
const List = (mode: SelectionMode) => new ListViewController<File>({ Items: [...files], SelectionMode: mode });
const selected = (list: ListViewController<File>) => [...list.SelectedIndices].sort();

describe("ListViewController selection", () => {
	it("single: a click selects one row and moves the focus", () => {
		const list = List(SelectionMode.Single);
		const change = vi.fn();
		list.Events.On("selection-change", change);
		list.Click(1);
		list.Click(2, { Ctrl: true });
		list.Click(2);
		expect(selected(list)).toEqual([2]);
		expect(list.FocusedIndex).toBe(2);
		expect(change).toHaveBeenCalledTimes(2);
		expect(list.SelectedItems).toEqual([files[2]]);
	});

	it("extended (Explorer): Ctrl toggles, Shift selects a range from the anchor, Ctrl+Shift adds the range", () => {
		const list = List(SelectionMode.Extended);
		list.Click(0);
		list.Click(2, { Ctrl: true });
		expect(selected(list)).toEqual([0, 2]);
		list.Click(2, { Ctrl: true });
		expect(selected(list)).toEqual([0]);
		list.Click(1);
		list.Click(3, { Shift: true });
		expect(selected(list)).toEqual([1, 2, 3]);
		list.Click(0, { Shift: true });
		expect(selected(list)).toEqual([0, 1]);
		list.Click(3, { Ctrl: true });
		list.Click(2, { Ctrl: true, Shift: true });
		expect(selected(list)).toEqual([0, 1, 2, 3]);
	});

	it("multiple: every click toggles; none: clicks only move the focus", () => {
		const multi = List(SelectionMode.Multiple);
		multi.Click(0);
		multi.Click(3);
		multi.Click(0);
		expect(selected(multi)).toEqual([3]);

		const none = List(SelectionMode.None);
		none.Click(1);
		expect(selected(none)).toEqual([]);
		expect(none.FocusedIndex).toBe(1);
	});

	it("keyboard: arrows, Home/End and PageUp/PageDown move; Shift extends; Space toggles; Ctrl+A selects all; Enter activates", () => {
		const list = List(SelectionMode.Extended);
		list.PageSize = 2;
		const activate = vi.fn();
		list.Events.On("activate", activate);

		list.KeyDown("ArrowDown");
		expect(list.FocusedIndex).toBe(0);
		list.KeyDown("ArrowDown");
		list.KeyDown("ArrowDown", { Shift: true });
		expect(selected(list)).toEqual([1, 2]);
		list.KeyDown("End");
		expect(selected(list)).toEqual([3]);
		list.KeyDown("Home", { Shift: true });
		expect(selected(list)).toEqual([0, 1, 2, 3]);
		list.KeyDown("PageDown");
		expect(list.FocusedIndex).toBe(2);
		list.KeyDown("PageUp");
		list.KeyDown("ArrowUp");
		expect(list.FocusedIndex).toBe(0);
		list.KeyDown("Space", { Ctrl: true });
		expect(selected(list)).toEqual([]);
		list.KeyDown("Space");
		expect(selected(list)).toEqual([0]);
		list.KeyDown("KeyA", { Ctrl: true });
		expect(selected(list)).toEqual([0, 1, 2, 3]);
		list.KeyDown("Enter");
		list.DoubleClick(3);
		expect(activate.mock.calls).toEqual([[0, files[0]], [3, files[3]]]);
		list.KeyDown("KeyZ");
		expect(list.FocusedIndex).toBe(3);
	});

	it("Ctrl+A only selects everything in multi-select modes; keys do nothing on an empty or disabled list", () => {
		const single = List(SelectionMode.Single);
		single.KeyDown("KeyA", { Ctrl: true });
		expect(selected(single)).toEqual([]);

		const empty = new ListViewController<File>({ Items: [] });
		empty.KeyDown("ArrowDown");
		empty.Click(0);
		expect(empty.FocusedIndex).toBe(-1);

		const off = new ListViewController<File>({ Items: [...files], Enabled: false });
		off.Click(1);
		off.KeyDown("ArrowDown");
		expect(selected(off as ListViewController<File>)).toEqual([]);
	});

	it("SelectAll / ClearSelection / SetItems", () => {
		const list = List(SelectionMode.Multiple);
		list.SelectAll();
		expect(selected(list)).toEqual([0, 1, 2, 3]);
		list.ClearSelection();
		list.ClearSelection();
		expect(selected(list)).toEqual([]);
		list.Click(2);
		list.SetItems(files.slice(0, 2));
		expect(selected(list)).toEqual([]);
		expect(list.FocusedIndex).toBe(-1);
		expect(new ListViewController<File>({ Items: [] }).SelectionMode).toBe(SelectionMode.Extended);
	});
});

describe("ListViewController sorting", () => {
	it("sorts by a column; clicking the same column again reverses; selection follows the items", () => {
		const list = List(SelectionMode.Extended);
		const sorts: [string, SortDirection][] = [];
		list.Events.On("sort", (column, direction) => sorts.push([column, direction]));
		list.Click(1); // a.txt

		list.SortBy("size", (a, b) => a.size - b.size);
		expect(list.Items.map((f) => f.name)).toEqual(["a.txt", "c.txt", "b.txt", "d.txt"]);
		expect(list.SelectedItems.map((f) => f.name)).toEqual(["a.txt"]);
		expect(list.FocusedIndex).toBe(0);

		list.SortBy("size", (a, b) => a.size - b.size);
		expect(list.Items.map((f) => f.name)).toEqual(["d.txt", "b.txt", "c.txt", "a.txt"]);
		list.SortBy("name", (a, b) => a.name.localeCompare(b.name));
		expect(list.Items.map((f) => f.name)).toEqual(["a.txt", "b.txt", "c.txt", "d.txt"]);
		expect(sorts).toEqual([["size", SortDirection.Ascending], ["size", SortDirection.Descending], ["name", SortDirection.Ascending]]);
		expect([list.SortColumn, list.SortDirection]).toEqual(["name", SortDirection.Ascending]);
	});
});

describe("MenuController", () => {
	const items = (): MenuItem[] => [
		{ Id: "file", Label: "&File", Items: [
			{ Id: "new", Label: "&New", Shortcut: "Ctrl+N" },
			{ Id: "open", Label: "&Open..." },
			{ Id: "sep", Separator: true, Label: "" },
			{ Id: "recent", Label: "&Recent", Items: [{ Id: "r1", Label: "1 notes.txt" }] },
			{ Id: "exit", Label: "E&xit", Disabled: true },
		] },
		{ Id: "view", Label: "&View", Items: [{ Id: "status", Label: "&Status Bar", Checkable: true, Checked: true }] },
		{ Id: "help", Label: "&Help", Items: [{ Id: "about", Label: "&About" }] },
	];

	it("opening a top menu, moving across the bar and choosing an item", () => {
		const menu = new MenuController({ Items: items() });
		const invoked = vi.fn();
		menu.Events.On("invoke", invoked);
		menu.Open("file");
		expect(menu.OpenPath).toEqual(["file"]);
		menu.KeyDown("ArrowRight");
		expect(menu.OpenPath).toEqual(["view"]);
		menu.KeyDown("ArrowLeft");
		menu.KeyDown("ArrowLeft");
		expect(menu.OpenPath).toEqual(["help"]);
		menu.Invoke("about");
		expect(invoked).toHaveBeenCalledWith(expect.objectContaining({ Id: "about" }));
		expect(menu.OpenPath).toEqual([]);
	});

	it("arrow keys skip separators and disabled items; Enter on a submenu opens it, Left closes it", () => {
		const menu = new MenuController({ Items: items() });
		menu.Open("file");
		menu.KeyDown("ArrowDown");
		expect(menu.HighlightedId).toBe("new");
		menu.KeyDown("ArrowDown");
		menu.KeyDown("ArrowDown");
		expect(menu.HighlightedId).toBe("recent");
		menu.KeyDown("ArrowDown");
		expect(menu.HighlightedId).toBe("new"); // exit is disabled: wraps to the top
		menu.KeyDown("ArrowUp");
		expect(menu.HighlightedId).toBe("recent");
		menu.KeyDown("Enter");
		expect(menu.OpenPath).toEqual(["file", "recent"]);
		expect(menu.HighlightedId).toBe("r1");
		menu.KeyDown("ArrowLeft");
		expect(menu.OpenPath).toEqual(["file"]);
		expect(menu.HighlightedId).toBe("recent");
		menu.KeyDown("ArrowRight"); // on a submenu item: opens it
		expect(menu.OpenPath).toEqual(["file", "recent"]);
		menu.KeyDown("Escape");
		expect(menu.OpenPath).toEqual(["file"]);
		menu.KeyDown("Escape");
		expect(menu.OpenPath).toEqual([]);
		menu.KeyDown("Escape");
	});

	it("mnemonics: the underlined letter picks the item; checkable items toggle when invoked", () => {
		const menu = new MenuController({ Items: items() });
		const toggled = vi.fn();
		menu.Events.On("check-change", toggled);
		menu.Open("view");
		menu.KeyDown("KeyS");
		expect(toggled).toHaveBeenCalledWith(expect.objectContaining({ Id: "status" }), false);
		expect(menu.Find("status")!.Checked).toBe(false);

		menu.Open("file");
		menu.KeyDown("KeyR"); // a submenu: opens it
		expect(menu.OpenPath).toEqual(["file", "recent"]);
		menu.KeyDown("KeyQ"); // no such mnemonic
		expect(menu.OpenPath).toEqual(["file", "recent"]);
	});

	it("disabled and unknown items can't be invoked or opened; Alt+mnemonic opens a top menu", () => {
		const menu = new MenuController({ Items: items() });
		const invoked = vi.fn();
		menu.Events.On("invoke", invoked);
		menu.Invoke("exit");
		menu.Invoke("nope");
		menu.Open("nope");
		expect(invoked).not.toHaveBeenCalled();
		expect(menu.OpenPath).toEqual([]);
		menu.KeyDown("KeyH", { Alt: true });
		expect(menu.OpenPath).toEqual(["help"]);
		menu.Close();
		menu.KeyDown("KeyH");
		menu.KeyDown("ArrowDown");
		expect(menu.OpenPath).toEqual([]);
		expect(MenuController.Mnemonic("E&xit")).toBe("x");
		expect(MenuController.Mnemonic("Plain")).toBeNull();
		expect(MenuController.StripMnemonic("&File")).toBe("File");
	});

	it("open-change reports the open path", () => {
		const menu = new MenuController({ Items: items() });
		const paths: string[][] = [];
		menu.Events.On("open-change", (path) => paths.push([...path]));
		menu.Open("file");
		menu.Close();
		menu.Close();
		expect(paths).toEqual([["file"], []]);
	});
});

describe("SliderController", () => {
	it("snaps to the step, clamps to the range and reports changes", () => {
		const slider = new SliderController({ Min: 0, Max: 10, Step: 2, Value: 4 });
		const change = vi.fn();
		slider.Events.On("change", change);
		slider.SetValue(5.1);
		expect(slider.Value).toBe(6);
		slider.SetValue(50);
		slider.SetValue(-3);
		slider.SetValue(0);
		expect(change.mock.calls).toEqual([[6], [10], [0]]);
		expect(slider.Fraction).toBe(0);
	});

	it("keys: arrows by a step, PageUp/PageDown by a page, Home/End to the ends", () => {
		const slider = new SliderController({ Min: 0, Max: 100, Step: 1, PageSize: 10, Value: 50 });
		slider.KeyDown("ArrowRight");
		slider.KeyDown("ArrowUp");
		expect(slider.Value).toBe(52);
		slider.KeyDown("ArrowLeft");
		slider.KeyDown("ArrowDown");
		slider.KeyDown("PageUp");
		expect(slider.Value).toBe(60);
		slider.KeyDown("PageDown");
		slider.KeyDown("End");
		expect(slider.Value).toBe(100);
		slider.KeyDown("Home");
		slider.KeyDown("KeyZ");
		expect(slider.Value).toBe(0);
	});

	it("SetFraction maps a thumb position; ticks are listed; disabled sliders ignore input", () => {
		const slider = new SliderController({ Min: 0, Max: 20, Step: 5, TickFrequency: 10 });
		slider.SetFraction(0.62);
		expect(slider.Value).toBe(10);
		expect(slider.Ticks).toEqual([0, 10, 20]);
		expect(new SliderController()).toMatchObject({ Min: 0, Max: 100, Step: 1, Value: 0 });
		expect(new SliderController({ Min: 3, Max: 3 }).Fraction).toBe(0);

		const off = new SliderController({ Enabled: false });
		off.KeyDown("End");
		off.SetFraction(1);
		expect(off.Value).toBe(0);
	});
});

describe("TreeViewController", () => {
	const tree = (): TreeNode[] => [
		{ Id: "pc", Label: "My Computer", Children: [
			{ Id: "c", Label: "Local Disk (C:)", Children: [{ Id: "win", Label: "WINDOWS" }, { Id: "prog", Label: "Program Files" }] },
			{ Id: "d", Label: "CD Drive (D:)" },
		] },
		{ Id: "net", Label: "My Network Places" },
	];

	it("expands and collapses nodes; only visible nodes are listed", () => {
		const view = new TreeViewController({ Nodes: tree() });
		const toggles: [string, boolean][] = [];
		view.Events.On("expand-change", (node, expanded) => toggles.push([node.Id, expanded]));
		expect(view.VisibleNodes.map((n) => n.Node.Id)).toEqual(["pc", "net"]);
		view.Expand("pc");
		view.Expand("c");
		expect(view.VisibleNodes.map((n) => [n.Node.Id, n.Depth])).toEqual([["pc", 0], ["c", 1], ["win", 2], ["prog", 2], ["d", 1], ["net", 0]]);
		view.Collapse("pc");
		view.Collapse("pc");
		view.Expand("net"); // a leaf: nothing to expand
		view.Toggle("pc");
		expect(toggles).toEqual([["pc", true], ["c", true], ["pc", false], ["pc", true]]);
		expect(view.IsExpanded("c")).toBe(true);
	});

	it("selection and the Windows tree keys: Up/Down through visible nodes, Right expands then descends, Left collapses then climbs", () => {
		const view = new TreeViewController({ Nodes: tree() });
		const selected: string[] = [];
		view.Events.On("selection-change", (node) => selected.push(node.Id));
		view.KeyDown("ArrowDown");
		expect(view.SelectedId).toBe("pc");
		view.KeyDown("ArrowRight");
		expect(view.IsExpanded("pc")).toBe(true);
		view.KeyDown("ArrowRight");
		expect(view.SelectedId).toBe("c");
		view.KeyDown("ArrowDown");
		expect(view.SelectedId).toBe("d");
		view.KeyDown("ArrowRight"); // leaf: nothing
		view.KeyDown("ArrowLeft"); // leaf: climb to the parent
		expect(view.SelectedId).toBe("pc");
		view.KeyDown("ArrowLeft"); // expanded: collapse
		expect(view.IsExpanded("pc")).toBe(false);
		view.KeyDown("ArrowLeft"); // root, collapsed: nothing
		view.KeyDown("End");
		expect(view.SelectedId).toBe("net");
		view.KeyDown("ArrowDown");
		view.KeyDown("Home");
		view.KeyDown("ArrowUp");
		expect(view.SelectedId).toBe("pc");
		view.KeyDown("KeyZ");
		expect(selected).toEqual(["pc", "c", "d", "pc", "net", "pc"]);
	});

	it("Select ignores unknown ids and repeats; Enter / double click activate; Find walks the whole tree", () => {
		const view = new TreeViewController({ Nodes: tree() });
		const activate = vi.fn();
		view.Events.On("activate", activate);
		view.Select("nope");
		view.Select("win");
		view.Select("win");
		expect(view.SelectedId).toBe("win");
		expect([view.IsExpanded("pc"), view.IsExpanded("c")]).toEqual([true, true]); // selecting reveals the node
		view.KeyDown("Enter");
		view.DoubleClick("d");
		view.DoubleClick("nope");
		expect(activate.mock.calls.map((c) => c[0].Id)).toEqual(["win", "d"]);
		expect(view.Find("prog")?.Label).toBe("Program Files");
		expect(view.Find("nope")).toBeUndefined();
	});

	it("does nothing when disabled or empty", () => {
		const off = new TreeViewController({ Nodes: tree(), Enabled: false });
		off.KeyDown("ArrowDown");
		off.Select("pc");
		expect(off.SelectedId).toBeNull();
		const empty = new TreeViewController({ Nodes: [] });
		empty.KeyDown("ArrowDown");
		expect(empty.SelectedId).toBeNull();
	});
});

describe("ListViewController.Select: a program picks rows", () => {
	it("selects the given rows (out-of-range ones are skipped) and says so; focus stays", () => {
		const list = new ListViewController<{ text: string; }>({ Items: [{ text: "a" }, { text: "b" }, { text: "c" }], SelectionMode: SelectionMode.Multiple });
		const seen: number[][] = [];
		list.Events.On("selection-change", (indices) => seen.push([...indices]));
		list.Select([2, 0, 9, -1]);
		expect([...list.SelectedIndices].sort()).toEqual([0, 2]);
		expect(seen.at(-1)!.sort()).toEqual([0, 2]);
		expect(list.FocusedIndex).toBe(-1);
	});
});
