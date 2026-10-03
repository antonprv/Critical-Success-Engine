// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface ComboOption<T> {
	Value: T;
	Label: string;
}

export interface ComboBoxOptions<T> extends ControlOptions {
	Options: ComboOption<T>[];
	SelectedIndex?: number;
}

export type ComboBoxEvents<T> = { change: [index: number, value: T]; "open-change": [open: boolean]; };

/** Drop-down list (CBS_DROPDOWNLIST) with the Windows keyboard: arrows, Alt+arrows, F4, Enter, Escape, type-ahead. */
export class ComboBoxController<T> extends ControlBase<ComboBoxEvents<T>> {
	public readonly Options: ComboOption<T>[];

	private _selectedIndex: number;
	private _highlightedIndex = -1;
	private _open = false;

	public constructor(options: ComboBoxOptions<T>) {
		super(options);
		this.Options = options.Options;
		this._selectedIndex = options.SelectedIndex ?? -1;
	}

	public get SelectedIndex(): number { return this._selectedIndex; }
	public get SelectedOption(): ComboOption<T> | null { return this.Options[this._selectedIndex] ?? null; }
	public get HighlightedIndex(): number { return this._highlightedIndex; }
	public get Open(): boolean { return this._open; }

	public Toggle(): void {
		if (!this.Enabled) return;
		if (this._open) this.Close();
		else this.OpenList();
	}

	public Close(): void {
		if (!this._open) return;
		this._open = false;
		this.Emit("open-change", false);
	}

	/** Picks an item of the open list: selects it and closes the list. */
	public Choose(index: number): void {
		if (!this.Enabled || !this.Options[index]) return;
		this.SelectIndex(index);
		this.Close();
	}

	/** The item under the pointer in the open list. */
	public Highlight(index: number): void {
		if (this.Options[index]) this._highlightedIndex = index;
	}

	public KeyDown(code: string, modifiers: { Alt?: boolean; } = {}): void {
		if (!this.Enabled || this.Options.length === 0) return;
		if (code === "F4" || (modifiers.Alt && (code === "ArrowDown" || code === "ArrowUp"))) {
			this.Toggle();
			return;
		}

		const current = this._open ? this._highlightedIndex : this._selectedIndex;
		const target = this.Target(code, current);
		if (target !== null) {
			if (this._open) this._highlightedIndex = target;
			else this.SelectIndex(target);
		} else if (this._open && code === "Enter") {
			this.Choose(this._highlightedIndex);
		} else if (code === "Escape") {
			this.Close();
		}
	}

	private Target(code: string, current: number): number | null {
		const last = this.Options.length - 1;
		switch (code) {
			case "ArrowDown": return Math.min(current + 1, last);
			case "ArrowUp": return Math.max(current - 1, 0);
			case "Home": return 0;
			case "End": return last;
		}
		return code.startsWith("Key") ? this.TypeAhead(code.slice(3).toLowerCase(), current) : null;
	}

	/** The next item after `current` whose label starts with the letter, going round; null when none does. */
	private TypeAhead(letter: string, current: number): number | null {
		const count = this.Options.length;
		for (let step = 1; step <= count; step++) {
			const index = (current + step + count) % count;
			if (this.Options[index]!.Label.toLowerCase().startsWith(letter)) return index;
		}
		return null;
	}

	private OpenList(): void {
		this._open = true;
		this._highlightedIndex = this._selectedIndex >= 0 ? this._selectedIndex : Math.min(0, this.Options.length - 1);
		this.Emit("open-change", true);
	}

	private SelectIndex(index: number): void {
		if (index === this._selectedIndex) return;
		this._selectedIndex = index;
		this.Emit("change", index, this.Options[index]!.Value);
	}
}
