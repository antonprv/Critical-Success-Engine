// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface DataGridColumn {
	Key: string;
	Label: string;
	/** Pixels (the view's default when absent). */
	Width?: number;
	/** Cells of this column can be edited in place (F2, Enter, a double click, typing). */
	Editable?: boolean;
	/** Edited in a box that takes several lines (Ctrl+Enter or Shift+Enter is a new line there). */
	Multiline?: boolean;
}

/** A row: its id (stays the same while sorting and filtering), its cells' text, its marks. */
export interface DataGridRow {
	Id: string;
	Cells: Record<string, string>;
	Error?: boolean;
	Warning?: boolean;
	Modified?: boolean;
}

export const enum SortOrder {
	None = "none",
	Ascending = "ascending",
	Descending = "descending",
}

export interface DataGridOptions extends ControlOptions {
	Columns?: DataGridColumn[];
	Rows?: DataGridRow[];
	RowHeight?: number;
	/** A last, empty row that adds a row when a cell of it is edited (Visual Studio's resource editor has one). */
	AllowAdd?: boolean;
}

/** The id of the row that adds a row. */
export const NewRowId = "$new";

export type DataGridEvents = {
	"selection-change": [ids: string[]];
	/** A cell got a new text. */
	"cell-edit": [id: string, key: string, value: string];
	/** A cell of the new row was edited: a row with that cell. */
	"row-add": [key: string, value: string];
	/** Del on selected rows. */
	"delete-rows": [ids: string[]];
	/** Ctrl+C: the selected rows as tab-separated text (Excel reads it). */
	copy: [text: string, ids: string[]];
	/** Ctrl+V: tab-separated text pasted at a cell (the focused one). */
	paste: [text: string, id: string, key: string];
	/** Enter on a cell that can't be edited, a double click on it. */
	activate: [id: string];
	"sort-change": [key: string | null, order: SortOrder];
	/** Ctrl+Z and Ctrl+Y (Ctrl+Shift+Z). */
	undo: [];
	redo: [];
};

const Compare = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Tab-separated text: rows by newline, cells by tab; a cell with a tab, a newline or a quote is quoted (as Excel). */
export function ToTsv(rows: readonly (readonly string[])[]): string {
	const cell = (text: string): string => (/[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text);
	return rows.map((row) => row.map(cell).join("\t")).join("\n");
}

/** Reads tab-separated text back (what ToTsv writes, and what Excel copies). */
export function ParseTsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	const source = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
	for (let at = 0; at < source.length; at++) {
		const character = source[at]!;
		if (quoted) {
			if (character === "\"" && source[at + 1] === "\"") {
				cell += "\"";
				at++;
			} else if (character === "\"") quoted = false;
			else cell += character;
		} else if (character === "\"" && cell === "") quoted = true;
		else if (character === "\t") {
			row.push(cell);
			cell = "";
		} else if (character === "\n") {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = "";
		} else cell += character;
	}
	row.push(cell);
	rows.push(row);
	return rows;
}

/**
 * A grid of rows and columns, as Visual Studio's resource editor: cells edited in place, several rows selected (Ctrl,
 * Shift), the keys of a spreadsheet, sorting by a column, a search filter and a filter of the tool's own (untranslated,
 * errors...), copy and paste of blocks (tab-separated, as Excel), and only the rows on screen drawn. It only draws and
 * reports: what an edit does to the data is up to whoever listens.
 */
export class DataGridController extends ControlBase<DataGridEvents> {
	public Columns: DataGridColumn[];
	public Rows: DataGridRow[];
	public readonly RowHeight: number;
	public readonly AllowAdd: boolean;
	/** The search box's text: rows with a cell that holds it. */
	public Filter = "";
	/** The tool's own filter (null: every row). */
	public RowFilter: ((row: DataGridRow) => boolean) | null = null;
	public SortKey: string | null = null;
	public SortOrder = SortOrder.None;
	/** The cell being edited, and the text in its box. */
	public Editing: { Id: string; Key: string; } | null = null;
	public Draft = "";
	public ScrollTop = 0;
	public ViewportHeight = 0;

	private _selected: string[] = [];
	private _anchor: string | null = null;
	private _focus: { Id: string; Key: string; } | null = null;

	public constructor(options: DataGridOptions = {}) {
		super(options);
		this.Columns = options.Columns ?? [];
		this.Rows = options.Rows ?? [];
		this.RowHeight = options.RowHeight ?? 24;
		this.AllowAdd = options.AllowAdd ?? false;
	}

	public get Selected(): readonly string[] { return this._selected; }
	/** The cell the keys move from. */
	public get FocusCell(): { Id: string; Key: string; } | null { return this._focus; }

	public IsSelected(id: string): boolean {
		return this._selected.includes(id);
	}

	/** New rows (the data changed): what is gone leaves the selection, the focus and the edit. */
	public SetRows(rows: DataGridRow[]): void {
		this.Rows = rows;
		const ids = new Set(rows.map((row) => row.Id));
		const kept = this._selected.filter((id) => ids.has(id));
		if (kept.length !== this._selected.length) this.SetSelection(kept);
		if (this._focus && this._focus.Id !== NewRowId && !ids.has(this._focus.Id)) this._focus = null;
		if (this.Editing && this.Editing.Id !== NewRowId && !ids.has(this.Editing.Id)) this.Editing = null;
	}

	public SetFilter(text: string): void {
		this.Filter = text;
		this.ScrollTop = 0;
	}

	public SetRowFilter(filter: ((row: DataGridRow) => boolean) | null): void {
		this.RowFilter = filter;
		this.ScrollTop = 0;
	}

	//#region rows on screen

	/** The rows shown, in the order shown: filtered, then sorted; the new row last. */
	public get VisibleRows(): DataGridRow[] {
		const needle = this.Filter.trim().toLowerCase();
		let rows = this.Rows.filter((row) => (this.RowFilter === null || this.RowFilter(row)) && (needle === "" || Object.values(row.Cells).some((text) => text.toLowerCase().includes(needle))));
		if (this.SortKey !== null && this.SortOrder !== SortOrder.None) {
			const key = this.SortKey, sign = this.SortOrder === SortOrder.Ascending ? 1 : -1;
			rows = [...rows].sort((a, b) => sign * Compare.compare(a.Cells[key] ?? "", b.Cells[key] ?? ""));
		}
		return this.AllowAdd ? [...rows, { Id: NewRowId, Cells: {} }] : rows;
	}

	public get Window(): { Start: number; Rows: DataGridRow[]; Total: number; } {
		const rows = this.VisibleRows;
		const overscan = 8;
		const start = FMath.Max(0, Math.floor(this.ScrollTop / this.RowHeight) - overscan);
		const count = Math.ceil(FMath.Max(this.ViewportHeight, this.RowHeight) / this.RowHeight) + overscan * 2;
		return { Start: start, Rows: rows.slice(start, start + count), Total: rows.length };
	}

	public Scroll(top: number, height: number): void {
		this.ScrollTop = FMath.Max(0, top);
		this.ViewportHeight = height;
	}

	public ScrollIntoView(id: string): void {
		const index = this.VisibleRows.findIndex((row) => row.Id === id);
		if (index < 0) return;
		const top = index * this.RowHeight;
		if (top < this.ScrollTop) this.ScrollTop = top;
		else if (top + this.RowHeight > this.ScrollTop + this.ViewportHeight) this.ScrollTop = FMath.Max(0, top + this.RowHeight - this.ViewportHeight);
	}

	/** Selects the row and shows it ("go to" from the error list). */
	public Reveal(id: string, key = this.Columns[0]?.Key ?? ""): void {
		this.Select(id);
		this._focus = { Id: id, Key: key };
		this.ScrollIntoView(id);
	}

	//#endregion

	/** A click on a column's header: ascending, then descending, then the data's own order. */
	public SortBy(key: string): void {
		if (this.SortKey !== key) {
			this.SortKey = key;
			this.SortOrder = SortOrder.Ascending;
		} else this.SortOrder = this.SortOrder === SortOrder.Ascending ? SortOrder.Descending : SortOrder.None;
		if (this.SortOrder === SortOrder.None) this.SortKey = null;
		this.Emit("sort-change", this.SortKey, this.SortOrder);
	}

	//#region selection

	/** A click on a cell: alone it selects the row; Ctrl adds or removes it; Shift selects the range from the anchor. */
	public Select(id: string, modifiers: { Ctrl?: boolean; Shift?: boolean; } = {}, key?: string): void {
		if (!this.Enabled) return;
		const rows = this.VisibleRows.map((row) => row.Id);
		if (!rows.includes(id)) return;
		this._focus = { Id: id, Key: key ?? this._focus?.Key ?? this.Columns[0]?.Key ?? "" };
		if (modifiers.Shift && this._anchor !== null && rows.includes(this._anchor)) {
			const from = rows.indexOf(this._anchor), to = rows.indexOf(id);
			const range = rows.slice(FMath.Min(from, to), FMath.Max(from, to) + 1).filter((r) => r !== NewRowId);
			this.SetSelection(modifiers.Ctrl ? [...new Set([...this._selected, ...range])] : range);
			return;
		}
		this._anchor = id;
		if (id === NewRowId) this.SetSelection([]);
		else if (modifiers.Ctrl) this.SetSelection(this.IsSelected(id) ? this._selected.filter((s) => s !== id) : [...this._selected, id]);
		else this.SetSelection([id]);
	}

	public SelectAll(): void {
		this.SetSelection(this.VisibleRows.map((row) => row.Id).filter((id) => id !== NewRowId));
	}

	private SetSelection(ids: string[]): void {
		if (ids.length === this._selected.length && ids.every((id, i) => id === this._selected[i])) return;
		this._selected = ids;
		this.Emit("selection-change", [...ids]);
	}

	//#endregion

	//#region editing

	/** F2, Enter, a double click: a box over the cell with its text (or `text`, when a key was typed into it). */
	public BeginEdit(id = this._focus?.Id, key = this._focus?.Key, text?: string): boolean {
		const column = this.Columns.find((c) => c.Key === key);
		const row = this.VisibleRows.find((r) => r.Id === id);
		if (!this.Enabled || !column?.Editable || !row) return false;
		this._focus = { Id: row.Id, Key: column.Key };
		this.Editing = { Id: row.Id, Key: column.Key };
		this.Draft = text ?? row.Cells[column.Key] ?? "";
		return true;
	}

	/** A double click: an editable cell is edited, any other cell opens its row ("activate"). */
	public DoubleClick(id: string, key: string): void {
		if (!this.BeginEdit(id, key) && this.Enabled) this.Emit("activate", id);
	}

	/** Enter, Tab, the box losing focus: the new text is reported (nothing when it didn't change). */
	public CommitEdit(): void {
		const editing = this.Editing;
		if (editing === null) return;
		this.Editing = null;
		if (editing.Id === NewRowId) {
			if (this.Draft !== "") this.Emit("row-add", editing.Key, this.Draft);
			return;
		}
		const row = this.Rows.find((r) => r.Id === editing.Id);
		if (row && (row.Cells[editing.Key] ?? "") !== this.Draft) this.Emit("cell-edit", editing.Id, editing.Key, this.Draft);
	}

	public CancelEdit(): void {
		this.Editing = null;
	}

	//#endregion

	/** The selected rows' cells, tab-separated, in the order shown. */
	public CopyText(): string {
		const rows = this.VisibleRows.filter((row) => this.IsSelected(row.Id));
		return ToTsv(rows.map((row) => this.Columns.map((column) => row.Cells[column.Key] ?? "")));
	}

	/** The keys of a spreadsheet; `key` is a printable character typed (it starts an edit with it). Returns whether it was one. */
	public KeyDown(code: string, modifiers: { Ctrl?: boolean; Shift?: boolean; } = {}, key = ""): boolean {
		if (!this.Enabled) return false;
		if (this.Editing !== null) {
			const column = this.Columns.find((c) => c.Key === this.Editing!.Key);
			const newline = column?.Multiline === true && (modifiers.Ctrl === true || modifiers.Shift === true);
			if ((code === "Enter" || code === "NumpadEnter") && !newline) {
				this.CommitEdit();
				this.Move(1, 0);
			} else if (code === "Tab") {
				this.CommitEdit();
				this.Move(0, modifiers.Shift ? -1 : 1);
			} else if (code === "Escape") this.CancelEdit();
			else return false;
			return true;
		}
		const rows = this.VisibleRows;
		if (rows.length === 0 || this.Columns.length === 0) return false;
		const page = FMath.Max(1, Math.floor(this.ViewportHeight / this.RowHeight) - 1);
		switch (code) {
			case "ArrowDown": this.Move(1, 0, modifiers.Shift); break;
			case "ArrowUp": this.Move(-1, 0, modifiers.Shift); break;
			case "ArrowRight": this.Move(0, 1); break;
			case "ArrowLeft": this.Move(0, -1); break;
			case "Tab": this.Move(0, modifiers.Shift ? -1 : 1); break;
			case "PageDown": this.Move(page, 0, modifiers.Shift); break;
			case "PageUp": this.Move(-page, 0, modifiers.Shift); break;
			case "Home": this.MoveTo(modifiers.Ctrl ? 0 : null, 0, modifiers.Shift); break;
			case "End": this.MoveTo(modifiers.Ctrl ? rows.length - 1 : null, this.Columns.length - 1, modifiers.Shift); break;
			case "F2": this.BeginEdit(); break;
			case "Enter": case "NumpadEnter": if (!this.BeginEdit() && this._focus) this.Emit("activate", this._focus.Id); break;
			case "Delete": if (this._selected.length > 0) this.Emit("delete-rows", [...this._selected]); break;
			case "KeyA": if (!modifiers.Ctrl) return this.TypeInto(key); this.SelectAll(); break;
			case "KeyC": if (!modifiers.Ctrl) return this.TypeInto(key); if (this._selected.length > 0) this.Emit("copy", this.CopyText(), [...this._selected]); break;
			case "KeyZ": if (!modifiers.Ctrl) return this.TypeInto(key); this.Emit(modifiers.Shift ? "redo" : "undo"); break;
			case "KeyY": if (!modifiers.Ctrl) return this.TypeInto(key); this.Emit("redo"); break;
			default: return this.TypeInto(key, modifiers.Ctrl === true);
		}
		if (this._focus) this.ScrollIntoView(this._focus.Id);
		return true;
	}

	/** Ctrl+V's text (the view reads the clipboard): pasted at the focused cell. */
	public Paste(text: string): void {
		if (!this.Enabled || this._focus === null) return;
		this.Emit("paste", text, this._focus.Id, this._focus.Key);
	}

	/** A printable key on a cell starts editing it with that character (as a spreadsheet does). */
	private TypeInto(key: string, ctrl = false): boolean {
		if (ctrl || key.length !== 1) return false;
		return this.BeginEdit(undefined, undefined, key);
	}

	/** Moves the focus by rows and columns (Shift: the selection grows from the anchor). */
	private Move(rows: number, columns: number, shift = false): void {
		const visible = this.VisibleRows;
		const row = FMath.Max(0, visible.findIndex((r) => r.Id === this._focus?.Id));
		const column = FMath.Max(0, this.Columns.findIndex((c) => c.Key === this._focus?.Key));
		this.MoveTo(FMath.Clamp(this._focus ? row + rows : 0, 0, visible.length - 1), FMath.Clamp(column + columns, 0, this.Columns.length - 1), shift);
	}

	/** Moves the focus to a row (null: the row it is on) and column. */
	private MoveTo(row: number | null, column: number, shift = false): void {
		const visible = this.VisibleRows;
		const current = this._focus ? FMath.Max(0, visible.findIndex((r) => r.Id === this._focus!.Id)) : 0;
		this.Select(visible[row ?? current]!.Id, { Shift: shift }, this.Columns[column]!.Key);
	}
}
