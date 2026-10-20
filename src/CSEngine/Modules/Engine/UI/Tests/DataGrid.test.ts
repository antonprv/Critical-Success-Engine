// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import WinDataGrid from "../Source/Components/WinDataGrid.vue";
import { DataGridController, NewRowId, ParseTsv, SortOrder, ToTsv, type DataGridColumn, type DataGridRow } from "../Source/Controls/DataGridController";
import { UseControl } from "../Source/Core/UseControl";
import { BuiltInWidgets, CreateNode, WidgetType } from "../Source/index";

const Columns: DataGridColumn[] = [
	{ Key: "Name", Label: "Name", Editable: true },
	{ Key: "Value", Label: "Value", Editable: true, Multiline: true, Width: 300 },
	{ Key: "Comment", Label: "Comment" },
];
const Row = (id: string, value: string, extra: Partial<DataGridRow> = {}): DataGridRow => ({ Id: id, Cells: { Name: id, Value: value, Comment: `about ${id}` }, ...extra });
const Rows = (): DataGridRow[] => [Row("Title", "Меню"), Row("Greet", "Привет", { Error: true }), Row("Item10", "десять"), Row("Item2", "два", { Warning: true, Modified: true })];
const Ids = (grid: DataGridController): string[] => grid.VisibleRows.map((row) => row.Id);

describe("tab-separated text", () => {
	it("writes and reads cells as Excel does: quotes for tabs, newlines and quotes", () => {
		const rows = [["a", "b\tc"], ["line\nbreak", "say \"hi\""], ["", "end"]];
		const text = ToTsv(rows);
		expect(text).toBe("a\t\"b\tc\"\n\"line\nbreak\"\t\"say \"\"hi\"\"\"\n\tend");
		expect(ParseTsv(text)).toEqual(rows);
		expect(ParseTsv("x\ty\r\nz\tw\r\n")).toEqual([["x", "y"], ["z", "w"]]);
		expect(ParseTsv("a\"b")).toEqual([["a\"b"]]);
	});
});

describe("DataGridController", () => {
	it("filters by text and by the tool's filter, sorts by a column in three steps, adds the new row last", () => {
		const grid = new DataGridController({ Columns, Rows: Rows(), AllowAdd: true });
		const sorts = vi.fn();
		grid.Events.On("sort-change", sorts);
		expect(Ids(grid)).toEqual(["Title", "Greet", "Item10", "Item2", NewRowId]);
		grid.Scroll(50, 100);
		grid.SetFilter("ITEM");
		expect(grid.ScrollTop).toBe(0);
		expect(Ids(grid)).toEqual(["Item10", "Item2", NewRowId]);
		grid.SetFilter("");
		grid.SetRowFilter((row) => row.Error === true || row.Warning === true);
		expect(Ids(grid)).toEqual(["Greet", "Item2", NewRowId]);
		grid.SetRowFilter(null);
		grid.SortBy("Name");
		expect(Ids(grid).slice(0, 4)).toEqual(["Greet", "Item2", "Item10", "Title"]);
		grid.SortBy("Name");
		expect(Ids(grid).slice(0, 4)).toEqual(["Title", "Item10", "Item2", "Greet"]);
		grid.SortBy("Name");
		expect(grid.SortKey).toBeNull();
		expect(Ids(grid).slice(0, 4)).toEqual(["Title", "Greet", "Item10", "Item2"]);
		grid.SortBy("Value");
		grid.SortBy("Missing");
		expect(Ids(grid).slice(0, 4)).toEqual(["Title", "Greet", "Item10", "Item2"]);
		expect(sorts.mock.calls).toEqual([["Name", SortOrder.Ascending], ["Name", SortOrder.Descending], [null, SortOrder.None], ["Value", SortOrder.Ascending], ["Missing", SortOrder.Ascending]]);
		expect(new DataGridController().VisibleRows).toEqual([]);
	});

	it("selects with Ctrl and Shift, never the new row, and keeps only what is still there", () => {
		const grid = new DataGridController({ Columns, Rows: Rows(), AllowAdd: true });
		const selection = vi.fn();
		grid.Events.On("selection-change", selection);
		grid.Select("Title");
		grid.Select("Title");
		grid.Select("Item10", { Shift: true });
		expect(grid.Selected).toEqual(["Title", "Greet", "Item10"]);
		grid.Select("Greet", { Ctrl: true });
		expect(grid.Selected).toEqual(["Title", "Item10"]);
		grid.Select("Item2", { Ctrl: true });
		grid.Select(NewRowId, { Shift: true, Ctrl: true });
		expect(grid.Selected).toEqual(["Title", "Item10", "Item2"]);
		grid.Select(NewRowId);
		expect(grid.Selected).toEqual([]);
		grid.SelectAll();
		expect(grid.Selected).toEqual(["Title", "Greet", "Item10", "Item2"]);
		grid.Select("Nope");
		grid.SetRows(Rows().slice(1));
		expect(grid.Selected).toEqual(["Greet", "Item10", "Item2"]);
		grid.SetRows(Rows().slice(1));
		grid.Select("Greet", {}, "Comment");
		expect(grid.FocusCell).toEqual({ Id: "Greet", Key: "Comment" });
		grid.SetRows([]);
		expect(grid.FocusCell).toBeNull();
		grid.SetEnabled(false);
		grid.Select("Greet");
		expect(selection).toHaveBeenCalled();
	});

	it("edits a cell in place; the new row adds one; an unchanged or cancelled edit says nothing", () => {
		const grid = new DataGridController({ Columns, Rows: Rows(), AllowAdd: true });
		const edits = vi.fn();
		const adds = vi.fn();
		grid.Events.On("cell-edit", edits);
		grid.Events.On("row-add", adds);
		expect(grid.BeginEdit()).toBe(false);
		expect(grid.BeginEdit("Title", "Comment")).toBe(false);
		expect(grid.BeginEdit("Nope", "Name")).toBe(false);
		expect(grid.BeginEdit("Title", "Value")).toBe(true);
		expect(grid.Draft).toBe("Меню");
		grid.Draft = "Главное меню";
		grid.CommitEdit();
		grid.CommitEdit();
		grid.BeginEdit("Title", "Value");
		grid.CommitEdit();
		grid.BeginEdit("Title", "Value");
		grid.Draft = "x";
		grid.CancelEdit();
		grid.BeginEdit(NewRowId, "Name");
		grid.CommitEdit();
		grid.BeginEdit(NewRowId, "Name");
		grid.Draft = "Fresh";
		grid.CommitEdit();
		expect(edits.mock.calls).toEqual([["Title", "Value", "Главное меню"]]);
		expect(adds.mock.calls).toEqual([["Name", "Fresh"]]);
		grid.BeginEdit("Greet", "Value");
		grid.SetRows(Rows().filter((row) => row.Id !== "Greet"));
		expect(grid.Editing).toBeNull();
		grid.BeginEdit(NewRowId, "Name");
		grid.SetRows(Rows());
		expect(grid.Editing).not.toBeNull();
		// A row the data lost while it was edited: nothing to report.
		grid.Editing = { Id: "Gone", Key: "Value" };
		grid.CommitEdit();
		expect(edits).toHaveBeenCalledTimes(1);
		const activate = vi.fn();
		grid.Events.On("activate", activate);
		grid.DoubleClick("Title", "Comment");
		grid.DoubleClick("Title", "Name");
		expect(activate).toHaveBeenCalledWith("Title");
		expect(grid.Editing).toEqual({ Id: "Title", Key: "Name" });
		grid.SetEnabled(false);
		grid.DoubleClick("Title", "Comment");
		expect(activate).toHaveBeenCalledTimes(1);
		expect(grid.BeginEdit("Title", "Name")).toBe(false);
	});

	it("moves with the keys of a spreadsheet, edits with F2, Enter or a typed character, and sends the commands", () => {
		const grid = new DataGridController({ Columns, Rows: Rows(), RowHeight: 20 });
		grid.Scroll(0, 60);
		const events = vi.fn();
		for (const name of ["delete-rows", "copy", "activate", "undo", "redo"] as const) grid.Events.On(name, (...args: unknown[]) => events(name, ...args));
		expect(grid.KeyDown("ArrowDown")).toBe(true);
		expect(grid.FocusCell).toEqual({ Id: "Title", Key: "Name" });
		grid.KeyDown("ArrowDown");
		grid.KeyDown("ArrowRight");
		grid.KeyDown("ArrowRight");
		grid.KeyDown("ArrowRight");
		expect(grid.FocusCell).toEqual({ Id: "Greet", Key: "Comment" });
		grid.KeyDown("ArrowLeft");
		grid.KeyDown("Tab", { Shift: true });
		grid.KeyDown("Tab");
		expect(grid.FocusCell).toEqual({ Id: "Greet", Key: "Value" });
		grid.KeyDown("ArrowUp");
		grid.KeyDown("PageDown", { Shift: true });
		expect(grid.Selected).toEqual(["Title", "Greet", "Item10"]);
		grid.KeyDown("PageUp");
		grid.KeyDown("End", { Ctrl: true });
		expect(grid.FocusCell).toEqual({ Id: "Item2", Key: "Comment" });
		expect(grid.ScrollTop).toBe(3 * 20 + 20 - 60);
		grid.KeyDown("Home");
		expect(grid.FocusCell).toEqual({ Id: "Item2", Key: "Name" });
		grid.KeyDown("Home", { Ctrl: true });
		expect(grid.FocusCell).toEqual({ Id: "Title", Key: "Name" });
		grid.KeyDown("End");
		expect(grid.FocusCell).toEqual({ Id: "Title", Key: "Comment" });
		// Enter on a cell that can't be edited opens the row.
		grid.KeyDown("Enter");
		grid.KeyDown("NumpadEnter");
		grid.KeyDown("Home");
		grid.KeyDown("F2");
		expect(grid.Editing).toEqual({ Id: "Title", Key: "Name" });
		grid.KeyDown("Escape");
		grid.KeyDown("KeyX", {}, "x");
		expect(grid.Draft).toBe("x");
		grid.KeyDown("Tab");
		expect(grid.FocusCell).toEqual({ Id: "Title", Key: "Value" });
		grid.KeyDown("Enter");
		grid.KeyDown("Enter", { Shift: true });
		expect(grid.Editing).not.toBeNull();
		expect(grid.KeyDown("KeyQ")).toBe(false);
		grid.KeyDown("Tab", { Shift: true });
		grid.KeyDown("Enter");
		grid.KeyDown("Enter");
		expect(grid.FocusCell).toEqual({ Id: "Greet", Key: "Name" });
		grid.SelectAll();
		grid.KeyDown("Delete");
		grid.KeyDown("KeyC", { Ctrl: true });
		grid.KeyDown("KeyZ", { Ctrl: true });
		grid.KeyDown("KeyZ", { Ctrl: true, Shift: true });
		grid.KeyDown("KeyY", { Ctrl: true });
		expect(events.mock.calls.map((call) => call[0])).toEqual(["activate", "activate", "delete-rows", "copy", "undo", "redo", "redo"]);
		expect(events.mock.calls[3]![1]).toBe(ToTsv(Rows().map((row) => [row.Cells["Name"]!, row.Cells["Value"]!, row.Cells["Comment"]!])));
		expect(grid.KeyDown("KeyA", { Ctrl: true })).toBe(true);
		for (const key of ["KeyA", "KeyC", "KeyZ", "KeyY"]) expect(grid.KeyDown(key, {}, "")).toBe(false);
		expect(grid.KeyDown("KeyV", { Ctrl: true }, "v")).toBe(false);
		expect(grid.KeyDown("ArrowDown", {}, "long")).toBe(true);
		grid.SetEnabled(false);
		expect(grid.KeyDown("ArrowDown")).toBe(false);
		expect(new DataGridController({ Columns }).KeyDown("ArrowDown")).toBe(false);
		expect(new DataGridController({ Rows: Rows() }).KeyDown("ArrowDown")).toBe(false);
		// Nothing selected: Delete and Ctrl+C have nothing to send.
		const quiet = new DataGridController({ Columns, Rows: Rows() });
		const nothing = vi.fn();
		quiet.Events.On("delete-rows", nothing);
		quiet.Events.On("copy", nothing);
		quiet.KeyDown("Delete");
		quiet.KeyDown("KeyC", { Ctrl: true });
		quiet.KeyDown("Enter");
		expect(nothing).not.toHaveBeenCalled();
	});

	it("reads a cell a row doesn't have as empty", () => {
		const grid = new DataGridController({ Columns, Rows: [{ Id: "Bare", Cells: { Name: "Bare" } }] });
		const edits = vi.fn();
		grid.Events.On("cell-edit", edits);
		grid.SelectAll();
		expect(grid.CopyText()).toBe("Bare		");
		grid.BeginEdit("Bare", "Value");
		expect(grid.Draft).toBe("");
		grid.CommitEdit();
		grid.BeginEdit("Bare", "Value");
		grid.Draft = "now";
		grid.CommitEdit();
		expect(edits.mock.calls).toEqual([["Bare", "Value", "now"]]);
		grid.SortBy("Comment");
		expect(grid.VisibleRows.map((row) => row.Id)).toEqual(["Bare"]);
	});

	it("pastes at the focused cell, reveals a row, draws only the rows on screen", () => {
		const rows = Array.from({ length: 1000 }, (_, i) => Row(`Key${i}`, `${i}`));
		const grid = new DataGridController({ Columns, Rows: rows, RowHeight: 10 });
		const pastes = vi.fn();
		grid.Events.On("paste", pastes);
		grid.Paste("x");
		expect(pastes).not.toHaveBeenCalled();
		grid.Scroll(0, 100);
		grid.Reveal("Key500", "Value");
		expect(grid.FocusCell).toEqual({ Id: "Key500", Key: "Value" });
		expect(grid.ScrollTop).toBe(500 * 10 + 10 - 100);
		grid.Paste("a\tb");
		expect(pastes).toHaveBeenCalledWith("a\tb", "Key500", "Value");
		grid.Reveal("Key3");
		expect(grid.ScrollTop).toBe(30);
		grid.ScrollIntoView("Key5");
		grid.ScrollIntoView("Nope");
		expect(grid.Window.Start).toBe(0);
		grid.Scroll(5000, 100);
		expect(grid.Window.Start).toBe(492);
		expect(grid.Window.Rows.length).toBe(26);
		grid.Scroll(-1, 0);
		expect(grid.ScrollTop).toBe(0);
		new DataGridController({ Rows: rows }).Reveal("Key1");
		grid.SetEnabled(false);
		grid.Paste("x");
		expect(pastes).toHaveBeenCalledTimes(1);
	});
});

describe("WinDataGrid", () => {
	function Mount(options: ConstructorParameters<typeof DataGridController>[0] = {}) {
		const controller = UseControl(new DataGridController({ Columns, Rows: Rows(), AllowAdd: true, ...options }));
		const wrapper = mount(WinDataGrid, { props: { controller }, attachTo: document.body });
		return { controller, wrapper, row: (id: string) => wrapper.get(`[data-id="${id}"]`), cell: (id: string, key: string) => wrapper.get(`[data-id="${id}"] [data-key="${key}"]`) };
	}

	it("draws the header, the rows with their marks and the new row; sorts on a header click", async () => {
		const { wrapper, row, controller } = Mount();
		expect(wrapper.findAll(".win-datagrid__column").map((h) => h.text())).toEqual(["Name", "Value", "Comment"]);
		expect(wrapper.get(".win-datagrid__header").attributes("style")).toContain("200px 300px 200px 1fr");
		expect(row("Greet").classes()).toContain("win-datagrid__row--error");
		expect(row("Item2").classes()).toEqual(expect.arrayContaining(["win-datagrid__row--warning", "win-datagrid__row--modified"]));
		expect(row(NewRowId).classes()).toContain("win-datagrid__row--new");
		await wrapper.findAll(".win-datagrid__column")[0]!.trigger("click");
		expect(controller.SortKey).toBe("Name");
		expect(wrapper.findAll(".win-datagrid__column")[0]!.attributes("aria-sort")).toBe("ascending");
		expect(wrapper.findAll(".win-datagrid__column")[1]!.attributes("aria-sort")).toBe("none");
		controller.SetEnabled(false);
		await nextTick();
		expect(wrapper.classes()).toContain("win-datagrid--disabled");
		wrapper.unmount();
	});

	it("selects on click, edits on a double click in an input or a box of lines, commits on blur", async () => {
		const { wrapper, cell, controller } = Mount();
		await cell("Title", "Comment").trigger("click");
		await cell("Item10", "Comment").trigger("click", { shiftKey: true });
		expect(controller.Selected).toEqual(["Title", "Greet", "Item10"]);
		expect(cell("Item10", "Comment").classes()).toContain("win-datagrid__cell--focused");
		await cell("Title", "Name").trigger("dblclick");
		await nextTick();
		await nextTick();
		const input = cell("Title", "Name").get("input");
		expect(document.activeElement).toBe(input.element);
		await input.trigger("click");
		await input.trigger("dblclick");
		await input.setValue("Heading");
		await input.trigger("keydown", { code: "Enter" });
		expect(wrapper.emitted("cell-edit")).toEqual([["Title", "Name", "Heading"]]);
		expect(document.activeElement).toBe(wrapper.element);
		await cell("Title", "Value").trigger("dblclick");
		await nextTick();
		const lines = cell("Title", "Value").get("textarea");
		await lines.trigger("click");
		await lines.trigger("dblclick");
		await lines.setValue("two\nlines");
		await lines.trigger("blur");
		expect(wrapper.emitted("cell-edit")!.at(-1)).toEqual(["Title", "Value", "two\nlines"]);
		await cell("Title", "Comment").trigger("dblclick");
		expect(wrapper.emitted("activate")).toEqual([["Title"]]);
		// An edit of a row the view hasn't drawn: no box to focus.
		controller.Scroll(0, 0);
		controller.BeginEdit("Item2", "Name");
		controller.Rows = [];
		await nextTick();
		await nextTick();
		wrapper.unmount();
	});

	it("passes the keys on, leaves Ctrl+V to the paste event, copies and pastes through the clipboard", async () => {
		const { wrapper, controller } = Mount();
		controller.SelectAll();
		const down = new KeyboardEvent("keydown", { code: "ArrowDown", cancelable: true });
		wrapper.element.dispatchEvent(down);
		expect(down.defaultPrevented).toBe(true);
		const paste = new KeyboardEvent("keydown", { code: "KeyV", ctrlKey: true, cancelable: true });
		wrapper.element.dispatchEvent(paste);
		expect(paste.defaultPrevented).toBe(false);
		const other = new KeyboardEvent("keydown", { code: "F12", cancelable: true });
		wrapper.element.dispatchEvent(other);
		expect(other.defaultPrevented).toBe(false);
		const data = new Map<string, string>([["text/plain", "a\tb"]]);
		const clipboard = { getData: (type: string) => data.get(type) ?? "", setData: (type: string, value: string) => data.set(type, value) };
		const pasteEvent = Object.assign(new Event("paste", { cancelable: true }), { clipboardData: clipboard });
		wrapper.element.dispatchEvent(pasteEvent);
		expect(wrapper.emitted("paste")).toEqual([["a\tb", "Title", "Name"]]);
		const copyEvent = Object.assign(new Event("copy", { cancelable: true }), { clipboardData: clipboard });
		controller.SelectAll();
		wrapper.element.dispatchEvent(copyEvent);
		expect(copyEvent.defaultPrevented).toBe(true);
		expect(data.get("text/plain")).toBe(controller.CopyText());
		// No clipboard data, nothing selected, or an edit under way: left to the browser.
		wrapper.element.dispatchEvent(Object.assign(new Event("paste", { cancelable: true }), { clipboardData: null }));
		expect(wrapper.emitted("paste")!.at(-1)).toEqual(["", "Title", "Name"]);
		controller.BeginEdit("Title", "Name");
		const editing = Object.assign(new Event("paste", { cancelable: true }), { clipboardData: clipboard });
		wrapper.element.dispatchEvent(editing);
		expect(editing.defaultPrevented).toBe(false);
		wrapper.element.dispatchEvent(Object.assign(new Event("copy", { cancelable: true }), { clipboardData: clipboard }));
		controller.CancelEdit();
		controller.SetRows([]);
		const empty = Object.assign(new Event("copy", { cancelable: true }), { clipboardData: null });
		wrapper.element.dispatchEvent(empty);
		expect(empty.defaultPrevented).toBe(false);
		const metaCopy = new KeyboardEvent("keydown", { code: "KeyA", metaKey: true, cancelable: true });
		wrapper.element.dispatchEvent(metaCopy);
		wrapper.unmount();
	});

	it("scrolls with the view and follows the controller", async () => {
		const rows = Array.from({ length: 500 }, (_, i) => Row(`Key${i}`, `${i}`));
		const controller = UseControl(new DataGridController({ Columns, Rows: rows, RowHeight: 10 }));
		const wrapper = mount(WinDataGrid, { props: { controller }, attachTo: document.body });
		const element = wrapper.element as HTMLElement;
		Object.defineProperty(element, "clientHeight", { value: 100 });
		element.scrollTop = 300;
		await wrapper.trigger("scroll");
		expect(controller.ScrollTop).toBe(300);
		expect(wrapper.get(".win-datagrid__space").attributes("style")).toContain("height: 5000px");
		controller.ScrollIntoView("Key450");
		await nextTick();
		expect(element.scrollTop).toBe(4510 - 100);
		wrapper.unmount();
	});
});

describe("the data grid widget", () => {
	it("is in the designer's palette with the resource editor's columns", () => {
		const node = CreateNode(WidgetType.DataGrid, "Grid", 0, 0);
		const controller = BuiltInWidgets.Get(WidgetType.DataGrid)!.CreateController!(node) as DataGridController;
		expect(controller.Columns.map((column) => column.Key)).toEqual(["Name", "Value", "Comment"]);
		expect(controller.AllowAdd).toBe(true);
		expect(controller.RowHeight).toBe(24);
	});
});
