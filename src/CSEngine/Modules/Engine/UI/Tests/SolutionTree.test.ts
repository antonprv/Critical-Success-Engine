// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import WinSolutionTree from "../Source/Components/WinSolutionTree.vue";
import { SolutionIcon, SolutionTreeController, type SolutionTreeNode } from "../Source/Controls/SolutionTreeController";
import { UseControl } from "../Source/Core/UseControl";
import { BuiltInWidgets, CreateNode, WidgetType } from "../Source/index";

const File = (id: string, label: string, extra: Partial<SolutionTreeNode> = {}): SolutionTreeNode => ({ Id: id, Label: label, Kind: "File", Children: [], ...extra });
const Folder = (id: string, label: string, children: SolutionTreeNode[], kind = "Folder"): SolutionTreeNode => ({ Id: id, Label: label, Kind: kind, Children: children });

function Tree(): SolutionTreeNode[] {
	return [Folder("s", "Solution 'Game'", [
		Folder("p:main", "Game", [
			Folder("d:Content", "Content", [File("f:Content/Menu.ui.json", "Menu.ui.json", { Children: [File("f:Source/MenuGraph.ts", "MenuGraph.ts", { Nested: true })] }), File("f:Content/Hud.ui.json", "Hud.ui.json")]),
			Folder("v:1", "Scripts", [File("f:Main.ts", "Main.ts", { Modified: true })], "VirtualFolder"),
			File("f:Readme.md", "Readme.md", { Hidden: true }),
			File("f:Gone.ts", "Gone.ts", { Missing: true, Error: true }),
		], "Project"),
	], "Solution")];
}

const Ids = (tree: SolutionTreeController): string[] => tree.VisibleNodes.map((row) => row.Node.Id);

describe("SolutionTreeController", () => {
	it("shows the expanded nodes and expands, collapses, collapses all and reveals", () => {
		const tree = new SolutionTreeController({ Nodes: Tree(), Expanded: ["s"] });
		const changes = vi.fn();
		tree.Events.On("expand-change", changes);
		expect(Ids(tree)).toEqual(["s", "p:main"]);
		tree.Toggle("p:main");
		tree.Expand("p:main");
		tree.Expand("f:Readme.md");
		tree.Expand("nope");
		expect(Ids(tree)).toEqual(["s", "p:main", "d:Content", "v:1", "f:Readme.md", "f:Gone.ts"]);
		tree.Toggle("p:main");
		tree.Collapse("p:main");
		expect(changes.mock.calls).toEqual([["p:main", true], ["p:main", false]]);
		tree.Reveal("f:Source/MenuGraph.ts");
		expect(tree.Selected).toEqual(["f:Source/MenuGraph.ts"]);
		expect(Ids(tree)).toContain("f:Source/MenuGraph.ts");
		tree.Reveal("nope");
		tree.CollapseAll();
		expect(Ids(tree)).toEqual(["s", "p:main"]);
		expect(new SolutionTreeController().Nodes).toEqual([]);
	});

	it("filters to the matching nodes and their ancestors, all open", () => {
		const tree = new SolutionTreeController({ Nodes: Tree() });
		tree.Scroll(100, 50);
		tree.SetFilter(" graph ");
		expect(tree.ScrollTop).toBe(0);
		expect(Ids(tree)).toEqual(["s", "p:main", "d:Content", "f:Content/Menu.ui.json", "f:Source/MenuGraph.ts"]);
		tree.SetFilter("");
		expect(Ids(tree)).toEqual(["s"]);
	});

	it("selects with Ctrl and Shift as Explorer does", () => {
		const tree = new SolutionTreeController({ Nodes: Tree(), Expanded: ["s", "p:main", "d:Content"] });
		const selection = vi.fn();
		tree.Events.On("selection-change", selection);
		tree.Select("d:Content");
		tree.Select("d:Content");
		tree.Select("f:Content/Hud.ui.json", { Shift: true });
		expect(tree.Selected).toEqual(["d:Content", "f:Content/Menu.ui.json", "f:Content/Hud.ui.json"]);
		tree.Select("f:Gone.ts", { Ctrl: true });
		tree.Select("f:Content/Menu.ui.json", { Ctrl: true });
		expect(tree.Selected).toEqual(["d:Content", "f:Content/Hud.ui.json", "f:Gone.ts"]);
		tree.Select("p:main", { Ctrl: true, Shift: true });
		expect(tree.Selected).toEqual(["d:Content", "f:Content/Hud.ui.json", "f:Gone.ts", "p:main", "f:Content/Menu.ui.json"]);
		tree.Collapse("d:Content");
		tree.Select("v:1", { Shift: true });
		tree.Select("f:Content/Hud.ui.json", { Shift: true });
		expect(tree.Selected).toEqual(["f:Content/Hud.ui.json"]);
		tree.SelectAll();
		expect(tree.Selected.length).toBe(Ids(tree).length);
		tree.ClearSelection();
		expect(tree.Selected).toEqual([]);
		tree.Select("nope");
		tree.SetEnabled(false);
		tree.Select("s");
		expect(tree.Selected).toEqual([]);
		expect(selection).toHaveBeenCalled();
		expect(tree.IsSelected("s")).toBe(false);
	});

	it("keeps expansion and drops what is gone when the nodes change", () => {
		const tree = new SolutionTreeController({ Nodes: Tree(), Expanded: ["s", "p:main"] });
		tree.Select("f:Gone.ts");
		tree.Select("f:Readme.md", { Ctrl: true });
		tree.BeginRename("f:Gone.ts");
		const next = Tree();
		next[0]!.Children[0]!.Children = next[0]!.Children[0]!.Children.filter((n) => n.Id !== "f:Gone.ts");
		tree.SetNodes(next);
		expect(tree.Selected).toEqual(["f:Readme.md"]);
		expect(tree.Renaming).toBeNull();
		expect(tree.FocusId).toBe("f:Readme.md");
		tree.SetNodes(next);
		tree.SetNodes([]);
		expect(tree.FocusId).toBeNull();
	});

	it("opens folders and activates files on a double click, and asks for a context menu", () => {
		const tree = new SolutionTreeController({ Nodes: Tree(), Expanded: ["s"] });
		const activate = vi.fn();
		const menu = vi.fn();
		tree.Events.On("activate", activate);
		tree.Events.On("context-menu", menu);
		tree.DoubleClick("p:main");
		expect(tree.IsExpanded("p:main")).toBe(true);
		tree.DoubleClick("f:Readme.md");
		tree.DoubleClick("f:Content/Menu.ui.json");
		tree.DoubleClick("nope");
		expect(activate.mock.calls).toEqual([["f:Readme.md"], ["f:Content/Menu.ui.json"]]);
		tree.ContextMenu("f:Gone.ts", 10, 20);
		tree.ContextMenu("f:Gone.ts", 1, 2);
		tree.ContextMenu(null, 3, 4);
		expect(tree.Selected).toEqual(["f:Gone.ts"]);
		expect(menu.mock.calls).toEqual([["f:Gone.ts", 10, 20], ["f:Gone.ts", 1, 2], [null, 3, 4]]);
		tree.SetEnabled(false);
		tree.ContextMenu(null, 0, 0);
		expect(menu).toHaveBeenCalledTimes(3);
	});

	it("renames in place: Enter commits a new name, Escape or the same name doesn't", () => {
		const tree = new SolutionTreeController({ Nodes: Tree(), Expanded: ["s", "p:main"] });
		const rename = vi.fn();
		tree.Events.On("rename", rename);
		tree.BeginRename();
		expect(tree.Renaming).toBeNull();
		tree.Select("f:Readme.md");
		expect(tree.KeyDown("F2")).toBe(true);
		expect(tree.Draft).toBe("Readme.md");
		tree.Draft = " About.md ";
		expect(tree.KeyDown("KeyA")).toBe(false);
		expect(tree.KeyDown("Enter")).toBe(true);
		tree.BeginRename("f:Readme.md");
		expect(tree.KeyDown("Escape")).toBe(true);
		tree.BeginRename("f:Readme.md");
		tree.CommitRename();
		tree.BeginRename("f:Readme.md");
		tree.Draft = " ";
		tree.CommitRename();
		tree.CommitRename();
		tree.CancelRename();
		tree.BeginRename("f:Readme.md");
		tree.KeyDown("NumpadEnter");
		expect(rename.mock.calls).toEqual([["f:Readme.md", "About.md"]]);
		tree.SetEnabled(false);
		tree.BeginRename("f:Readme.md");
		expect(tree.Renaming).toBeNull();
	});

	it("drags the selection onto another node, never into itself", () => {
		const tree = new SolutionTreeController({ Nodes: Tree(), Expanded: ["s", "p:main", "d:Content"] });
		const move = vi.fn();
		const copy = vi.fn();
		tree.Events.On("move", move);
		tree.Events.On("drop-copy", copy);
		expect(tree.DragOver("v:1")).toBe(false);
		tree.Select("f:Content/Hud.ui.json");
		tree.Select("f:Content/Menu.ui.json", { Ctrl: true });
		tree.BeginDrag("f:Content/Hud.ui.json");
		expect(tree.Dragging).toEqual(["f:Content/Hud.ui.json", "f:Content/Menu.ui.json"]);
		expect(tree.DragOver("f:Source/MenuGraph.ts")).toBe(false);
		expect(tree.DragOver("f:Content/Hud.ui.json")).toBe(false);
		expect(tree.DragOver("nope")).toBe(false);
		expect(tree.DragOver("v:1")).toBe(true);
		tree.Drop();
		expect(move).toHaveBeenCalledWith(["f:Content/Hud.ui.json", "f:Content/Menu.ui.json"], "v:1");
		tree.BeginDrag("f:Readme.md");
		expect(tree.Dragging).toEqual(["f:Readme.md"]);
		tree.DragOver("d:Content");
		tree.Drop(true);
		expect(copy).toHaveBeenCalledWith(["f:Readme.md"], "d:Content");
		tree.BeginDrag("f:Readme.md");
		tree.DragOver(null);
		tree.Drop();
		expect(move).toHaveBeenCalledTimes(1);
		tree.SetEnabled(false);
		tree.BeginDrag("f:Readme.md");
		expect(tree.Dragging).toEqual([]);
	});

	it("moves with the keys, and sends delete, copy, cut, paste and activate", () => {
		const tree = new SolutionTreeController({ Nodes: Tree(), Expanded: ["s", "p:main"], RowHeight: 20 });
		tree.Scroll(0, 60);
		const events = vi.fn();
		for (const name of ["delete", "copy", "cut", "paste", "activate", "context-menu", "undo", "redo"] as const) tree.Events.On(name, (...args: unknown[]) => events(name, ...args));
		expect(tree.KeyDown("Delete")).toBe(true);
		expect(tree.KeyDown("KeyC", { Ctrl: true })).toBe(true);
		expect(tree.KeyDown("KeyX", { Ctrl: true })).toBe(true);
		expect(tree.KeyDown("KeyV", { Ctrl: true })).toBe(true);
		expect(events).not.toHaveBeenCalled();
		expect(tree.KeyDown("ArrowUp")).toBe(true);
		expect(tree.FocusId).toBe("s");
		tree.ClearSelection();
		tree.KeyDown("ArrowDown");
		tree.KeyDown("ArrowDown");
		expect(tree.FocusId).toBe("d:Content");
		tree.KeyDown("ArrowRight");
		expect(tree.IsExpanded("d:Content")).toBe(true);
		tree.KeyDown("ArrowRight");
		expect(tree.FocusId).toBe("f:Content/Menu.ui.json");
		tree.KeyDown("ArrowDown");
		tree.KeyDown("ArrowRight");
		expect(tree.FocusId).toBe("f:Content/Hud.ui.json");
		tree.KeyDown("ArrowLeft");
		expect(tree.FocusId).toBe("d:Content");
		tree.KeyDown("ArrowLeft");
		expect(tree.IsExpanded("d:Content")).toBe(false);
		tree.KeyDown("End");
		expect(tree.FocusId).toBe("f:Gone.ts");
		expect(tree.ScrollTop).toBe(5 * 20 + 20 - 60);
		tree.KeyDown("Home");
		expect(tree.ScrollTop).toBe(0);
		tree.KeyDown("PageDown");
		expect(tree.FocusId).toBe("d:Content");
		tree.KeyDown("ArrowUp");
		expect(tree.FocusId).toBe("p:main");
		tree.KeyDown("PageUp");
		tree.KeyDown("ArrowDown", { Shift: true });
		expect(tree.Selected).toEqual(["s", "p:main"]);
		tree.KeyDown("Delete");
		tree.KeyDown("KeyC", { Ctrl: true });
		tree.KeyDown("KeyX", { Ctrl: true });
		tree.KeyDown("KeyV", { Ctrl: true });
		tree.KeyDown("Enter");
		tree.KeyDown("NumpadEnter");
		tree.KeyDown("ContextMenu");
		tree.KeyDown("KeyZ", { Ctrl: true });
		tree.KeyDown("KeyZ", { Ctrl: true, Shift: true });
		tree.KeyDown("KeyY", { Ctrl: true });
		expect(events.mock.calls.map((call) => call[0])).toEqual(["delete", "copy", "cut", "paste", "activate", "activate", "context-menu", "undo", "redo", "redo"]);
		expect(tree.KeyDown("KeyA", { Ctrl: true })).toBe(true);
		for (const key of ["KeyA", "KeyC", "KeyX", "KeyV", "KeyZ", "KeyY", "KeyQ"]) expect(tree.KeyDown(key), key).toBe(false);
		tree.SetEnabled(false);
		expect(tree.KeyDown("ArrowDown")).toBe(false);
		expect(new SolutionTreeController().KeyDown("ArrowDown")).toBe(false);
		// Nothing focused yet: Enter has nothing to open, left and right nothing to move.
		const fresh = new SolutionTreeController({ Nodes: Tree() });
		for (const key of ["Enter", "ArrowRight", "ArrowLeft", "F2"]) fresh.KeyDown(key);
		expect(fresh.FocusId).toBeNull();
		fresh.KeyDown("ArrowUp");
		expect(fresh.FocusId).toBe("s");
		expect(new SolutionTreeController({ Nodes: Tree() }).KeyDown("ArrowDown")).toBe(true);
	});

	it("draws only the rows in the viewport", () => {
		const nodes = Array.from({ length: 1000 }, (_, i) => File(`f:${i}`, `File${i}`));
		const tree = new SolutionTreeController({ Nodes: nodes, RowHeight: 10 });
		expect(tree.Window.Rows.length).toBe(1 + 16);
		tree.Scroll(500, 100);
		const window = tree.Window;
		expect(window.Start).toBe(42);
		expect(window.Rows.length).toBe(10 + 16);
		expect(window.Total).toBe(1000);
		tree.Scroll(-5, 100);
		expect(tree.ScrollTop).toBe(0);
		tree.ScrollIntoView("f:500");
		expect(tree.ScrollTop).toBe(500 * 10 + 10 - 100);
		tree.ScrollIntoView("f:10");
		expect(tree.ScrollTop).toBe(100);
		tree.ScrollIntoView("f:12");
		expect(tree.ScrollTop).toBe(100);
		tree.ScrollIntoView("nope");
	});

	it("picks icons by kind and extension", () => {
		expect(SolutionIcon(File("f", "Menu.ui.json"))).toBe("file-ui-json");
		expect(SolutionIcon(File("f", "Main.TS"))).toBe("file-ts");
		expect(SolutionIcon(File("f", "LICENSE"))).toBe("file");
		expect(SolutionIcon(File("f", ".gitignore"))).toBe("file");
		expect(SolutionIcon(Folder("v", "V", [], "VirtualFolder"))).toBe("virtualfolder");
	});
});

describe("WinSolutionTree", () => {
	function Mount(options: ConstructorParameters<typeof SolutionTreeController>[0] = {}) {
		const controller = UseControl(new SolutionTreeController({ Nodes: Tree(), Expanded: ["s", "p:main", "d:Content", "f:Content/Menu.ui.json"], ...options }));
		const wrapper = mount(WinSolutionTree, { props: { controller }, attachTo: document.body });
		return { controller, wrapper, row: (id: string) => wrapper.get(`[data-id="${id}"]`) };
	}

	it("draws rows with their kind, depth, flags and state", async () => {
		const { wrapper, row, controller } = Mount();
		expect(wrapper.findAll(".win-solution__row").length).toBe(9);
		expect(row("f:Source/MenuGraph.ts").classes()).toContain("win-solution__row--nested");
		expect(row("f:Readme.md").classes()).toContain("win-solution__row--hidden");
		expect(row("f:Gone.ts").classes()).toEqual(expect.arrayContaining(["win-solution__row--missing", "win-solution__row--error"]));
		expect(row("d:Content").attributes("aria-level")).toBe("3");
		expect(row("d:Content").attributes("aria-expanded")).toBe("true");
		expect(row("f:Readme.md").attributes("aria-expanded")).toBeUndefined();
		expect(row("v:1").find(".win-solution__icon--virtualfolder").exists()).toBe(true);
		await row("v:1").find(".win-tree__expander").trigger("click");
		expect(row("f:Main.ts").classes()).toContain("win-solution__row--modified");
		expect(controller.IsExpanded("v:1")).toBe(true);
		await row("v:1").find(".win-tree__expander").trigger("dblclick");
		expect(controller.IsExpanded("v:1")).toBe(true);
		controller.SetEnabled(false);
		await nextTick();
		expect(wrapper.classes()).toContain("win-solution--disabled");
		wrapper.unmount();
	});

	it("selects on click with the keys held, opens on a double click, forwards the events", async () => {
		const { wrapper, row, controller } = Mount();
		await row("d:Content").trigger("click");
		await row("f:Readme.md").trigger("click", { shiftKey: true });
		expect(controller.Selected.length).toBe(6);
		await row("f:Gone.ts").trigger("click", { metaKey: true });
		expect(controller.IsSelected("f:Gone.ts")).toBe(true);
		expect(row("d:Content").classes()).toContain("win-tree__item--selected");
		await row("f:Readme.md").trigger("dblclick");
		expect(wrapper.emitted("activate")).toEqual([["f:Readme.md"]]);
		await wrapper.trigger("keydown", { code: "Delete" });
		expect(wrapper.emitted("delete")).toBeTruthy();
		const unhandled = new KeyboardEvent("keydown", { code: "KeyQ", cancelable: true });
		wrapper.element.dispatchEvent(unhandled);
		expect(unhandled.defaultPrevented).toBe(false);
		await row("f:Gone.ts").trigger("contextmenu", { clientX: 5, clientY: 6 });
		await wrapper.get(".win-solution__space").trigger("contextmenu");
		await wrapper.trigger("contextmenu");
		expect(wrapper.emitted("context-menu")).toEqual([["f:Gone.ts", 5, 6], [null, 0, 0], [null, 0, 0]]);
		wrapper.unmount();
	});

	it("renames in a box over the label, the name selected up to the extension", async () => {
		const { wrapper, row, controller } = Mount();
		controller.BeginRename("f:Readme.md");
		await nextTick();
		await nextTick();
		const input = row("f:Readme.md").get("input").element as HTMLInputElement;
		expect(document.activeElement).toBe(input);
		expect([input.selectionStart, input.selectionEnd]).toEqual([0, "Readme".length]);
		await row("f:Readme.md").get("input").trigger("click");
		await row("f:Readme.md").get("input").trigger("dblclick");
		await row("f:Readme.md").get("input").setValue("About.md");
		await row("f:Readme.md").get("input").trigger("keydown", { code: "Enter" });
		expect(wrapper.emitted("rename")).toEqual([["f:Readme.md", "About.md"]]);
		expect(document.activeElement).toBe(wrapper.element);
		controller.BeginRename("d:Content");
		await nextTick();
		await nextTick();
		const folder = row("d:Content").get("input").element as HTMLInputElement;
		expect([folder.selectionStart, folder.selectionEnd]).toEqual([0, "Content".length]);
		await row("d:Content").get("input").trigger("blur");
		expect(controller.Renaming).toBeNull();
		controller.BeginRename("p:main");
		await nextTick();
		await nextTick();
		expect((row("p:main").get("input").element as HTMLInputElement).selectionEnd).toBe(4);
		// A node that has no row on screen (inside a closed folder): no box to focus.
		controller.BeginRename("f:Main.ts");
		await nextTick();
		await nextTick();
		expect(wrapper.find("input").exists()).toBe(false);
		wrapper.unmount();
	});

	it("drags rows onto rows, with Ctrl copying", async () => {
		const { wrapper, row } = Mount();
		const data = { setData: vi.fn(), dropEffect: "" };
		await row("f:Readme.md").trigger("dragstart", { dataTransfer: data });
		expect(data.setData).toHaveBeenCalledWith("text/plain", "f:Readme.md");
		const over = new Event("dragover", { cancelable: true, bubbles: true }) as DragEvent;
		Object.assign(over, { dataTransfer: data, ctrlKey: true });
		row("v:1").element.dispatchEvent(over);
		expect(over.defaultPrevented).toBe(true);
		expect(data.dropEffect).toBe("copy");
		const self = new Event("dragover", { cancelable: true, bubbles: true });
		row("f:Readme.md").element.dispatchEvent(self);
		expect(self.defaultPrevented).toBe(false);
		await row("v:1").trigger("dragover", { dataTransfer: data });
		expect(data.dropEffect).toBe("move");
		await row("v:1").trigger("dragover");
		expect(row("v:1").classes()).toContain("win-solution__row--drop");
		await row("v:1").trigger("drop", { ctrlKey: true });
		expect(wrapper.emitted("drop-copy")).toEqual([[["f:Readme.md"], "v:1"]]);
		await row("f:Readme.md").trigger("dragstart");
		await row("d:Content").trigger("dragover");
		await row("d:Content").trigger("dragleave");
		await row("d:Content").trigger("drop");
		await row("f:Readme.md").trigger("dragend");
		expect(wrapper.emitted("move")).toBeUndefined();
		wrapper.unmount();
	});

	it("scrolls with the view and follows the controller's scrolling", async () => {
		const nodes = Array.from({ length: 500 }, (_, i) => File(`f:${i}`, `File${i}`));
		const controller = UseControl(new SolutionTreeController({ Nodes: nodes, RowHeight: 10 }));
		const wrapper = mount(WinSolutionTree, { props: { controller }, attachTo: document.body });
		const element = wrapper.element as HTMLElement;
		Object.defineProperty(element, "clientHeight", { value: 100 });
		element.scrollTop = 300;
		await wrapper.trigger("scroll");
		expect(controller.ScrollTop).toBe(300);
		expect(wrapper.get(".win-solution__space").attributes("style")).toContain("height: 5000px");
		expect(wrapper.get(".win-solution__rows").attributes("style")).toContain("translateY(220px)");
		controller.ScrollIntoView("f:450");
		await nextTick();
		expect(element.scrollTop).toBe(4510 - 100);
		wrapper.unmount();
	});
});

describe("the solution tree widget", () => {
	it("is in the designer's palette with a sample project, and makes a live controller", () => {
		expect(BuiltInWidgets.Palette).toContain(WidgetType.SolutionTree);
		const node = CreateNode(WidgetType.SolutionTree, "Files", 0, 0);
		const definition = BuiltInWidgets.Get(WidgetType.SolutionTree)!;
		const controller = definition.CreateController!(node) as SolutionTreeController;
		expect(controller.VisibleNodes.map((row) => row.Node.Label)).toEqual(["Solution 'Game' (1 project)", "Game", "Content", "Main.ts"]);
		expect(controller.RowHeight).toBe(22);
	});
});
