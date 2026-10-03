// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";
import type { KeyModifiers } from "./TabsController";

export const enum SelectionMode {
	/** Rows can be focused but not selected. */
	None = 0,
	Single,
	/** Every click toggles a row (LBS_MULTIPLESEL). */
	Multiple,
	/** Explorer-style: click selects, Ctrl toggles, Shift selects a range (LBS_EXTENDEDSEL). */
	Extended,
}

export const enum SortDirection {
	Ascending = 0,
	Descending,
}

export interface ListViewOptions<T> extends ControlOptions {
	Items: T[];
	SelectionMode?: SelectionMode;
}

export type ListViewEvents<T> = {
	"selection-change": [indices: number[]];
	activate: [index: number, item: T];
	sort: [column: string, direction: SortDirection];
};

/** Rows with Explorer's selection rules, keyboard navigation and column sorting. */
export class ListViewController<T> extends ControlBase<ListViewEvents<T>> {
	public SelectionMode: SelectionMode;
	public PageSize = 10;

	private _items: T[];
	private _selected = new Set<number>();
	private _focusedIndex = -1;
	private _anchor = -1;
	private _sortColumn: string | null = null;
	private _sortDirection = SortDirection.Ascending;

	public constructor(options: ListViewOptions<T>) {
		super(options);
		this._items = options.Items;
		this.SelectionMode = options.SelectionMode ?? SelectionMode.Extended;
	}

	public get Items(): readonly T[] { return this._items; }
	public get SelectedIndices(): ReadonlySet<number> { return this._selected; }
	public get SelectedItems(): T[] { return [...this._selected].sort((a, b) => a - b).map((i) => this._items[i]!); }
	public get FocusedIndex(): number { return this._focusedIndex; }
	public get SortColumn(): string | null { return this._sortColumn; }
	public get SortDirection(): SortDirection { return this._sortDirection; }

	private get IsMulti(): boolean {
		return this.SelectionMode === SelectionMode.Multiple || this.SelectionMode === SelectionMode.Extended;
	}

	public SetItems(items: T[]): void {
		this._items = items;
		this._focusedIndex = -1;
		this._anchor = -1;
		this.SetSelection(new Set());
	}

	//#region mouse

	public Click(index: number, modifiers: KeyModifiers = {}): void {
		if (!this.Enabled || index < 0 || index >= this._items.length) return;
		this._focusedIndex = index;

		switch (this.SelectionMode) {
			case SelectionMode.Single:
				this.SelectOnly(index);
				break;
			case SelectionMode.Multiple:
				this.ToggleIndex(index);
				break;
			case SelectionMode.Extended:
				if (modifiers.Shift) this.SelectRangeTo(index, modifiers.Ctrl ?? false);
				else if (modifiers.Ctrl) this.ToggleIndex(index);
				else this.SelectOnly(index);
				break;
		}
	}

	public DoubleClick(index: number): void {
		this.Click(index);
		if (this._focusedIndex === index) this.Emit("activate", index, this._items[index]!);
	}

	//#endregion

	//#region keyboard

	public KeyDown(code: string, modifiers: KeyModifiers = {}): void {
		if (!this.Enabled || this._items.length === 0) return;

		if (code === "KeyA" && modifiers.Ctrl) this.SelectAll();
		else if (code === "Enter" && this._focusedIndex >= 0) this.Emit("activate", this._focusedIndex, this._items[this._focusedIndex]!);
		else if (code === "Space" && this._focusedIndex >= 0) {
			if (modifiers.Ctrl || this.SelectionMode === SelectionMode.Multiple) this.ToggleIndex(this._focusedIndex);
			else this.Click(this._focusedIndex);
		} else {
			const target = this.NavigationTarget(code);
			if (target !== null) this.MoveFocus(target, modifiers);
		}
	}

	private NavigationTarget(code: string): number | null {
		const last = this._items.length - 1;
		const from = Math.max(0, this._focusedIndex);
		switch (code) {
			case "ArrowDown": return this._focusedIndex < 0 ? 0 : Math.min(last, from + 1);
			case "ArrowUp": return Math.max(0, from - 1);
			case "Home": return 0;
			case "End": return last;
			case "PageDown": return Math.min(last, from + this.PageSize);
			case "PageUp": return Math.max(0, from - this.PageSize);
			default: return null;
		}
	}

	private MoveFocus(target: number, modifiers: KeyModifiers): void {
		this._focusedIndex = target;
		if (modifiers.Ctrl || this.SelectionMode === SelectionMode.None || this.SelectionMode === SelectionMode.Multiple) return;
		if (modifiers.Shift && this.IsMulti) this.SelectRangeTo(target, false);
		else this.SelectOnly(target);
	}

	//#endregion

	//#region selection

	public SelectAll(): void {
		if (!this.IsMulti) return;
		this.SetSelection(new Set(this._items.map((_, i) => i)));
	}

	public ClearSelection(): void {
		this.SetSelection(new Set());
	}

	private SelectOnly(index: number): void {
		this._anchor = index;
		this.SetSelection(new Set([index]));
	}

	private ToggleIndex(index: number): void {
		this._anchor = index;
		const next = new Set(this._selected);
		if (next.has(index)) next.delete(index);
		else next.add(index);
		this.SetSelection(next);
	}

	private SelectRangeTo(index: number, add: boolean): void {
		if (this._anchor < 0) this._anchor = index;
		const [from, to] = [Math.min(this._anchor, index), Math.max(this._anchor, index)];
		const next = add ? new Set(this._selected) : new Set<number>();
		for (let i = from; i <= to; i++) next.add(i);
		this.SetSelection(next);
	}

	private SetSelection(next: Set<number>): void {
		const same = next.size === this._selected.size && [...next].every((i) => this._selected.has(i));
		if (same) return;
		this._selected = next;
		this.Emit("selection-change", [...next].sort((a, b) => a - b));
	}

	//#endregion

	/** Sorts by a column; the same column again reverses the order. Selection, focus and anchor follow their items. */
	public SortBy(column: string, compare: (a: T, b: T) => number): void {
		this._sortDirection = column === this._sortColumn && this._sortDirection === SortDirection.Ascending ? SortDirection.Descending : SortDirection.Ascending;
		this._sortColumn = column;

		const selectedItems = new Set(this.SelectedItems);
		const focusedItem = this._items[this._focusedIndex];
		const anchorItem = this._items[this._anchor];
		const sign = this._sortDirection === SortDirection.Ascending ? 1 : -1;
		this._items = [...this._items].sort((a, b) => sign * compare(a, b));

		this._selected = new Set(this._items.flatMap((item, i) => (selectedItems.has(item) ? [i] : [])));
		this._focusedIndex = focusedItem === undefined ? -1 : this._items.indexOf(focusedItem);
		this._anchor = anchorItem === undefined ? -1 : this._items.indexOf(anchorItem);
		this.Emit("sort", column, this._sortDirection);
	}
}
