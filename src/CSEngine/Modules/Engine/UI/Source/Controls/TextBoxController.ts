// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";
import type { KeyModifiers } from "./TabsController";

export interface TextBoxOptions extends ControlOptions {
	Value?: string;
	MaxLength?: number;
	ReadOnly?: boolean;
	/** Draws the text as bullets (ES_PASSWORD). */
	Password?: boolean;
	/** Grey hint shown while empty (the "cue banner" of XP and later). */
	Placeholder?: string;
	Multiline?: boolean;
}

export type TextBoxEvents = { change: [value: string, previous: string]; select: [start: number, end: number]; };

/** Edit control. User input respects ReadOnly and MaxLength; SetValue from code only MaxLength. */
export class TextBoxController extends ControlBase<TextBoxEvents> {
	public readonly MaxLength: number;
	public ReadOnly: boolean;
	public Password: boolean;
	public Placeholder: string;
	public Multiline: boolean;

	private _value: string;
	private _selectionStart = 0;
	private _selectionEnd = 0;

	public constructor(options: TextBoxOptions = {}) {
		super(options);
		this.MaxLength = options.MaxLength ?? Infinity;
		this.ReadOnly = options.ReadOnly ?? false;
		this.Password = options.Password ?? false;
		this.Placeholder = options.Placeholder ?? "";
		this.Multiline = options.Multiline ?? false;
		this._value = (options.Value ?? "").slice(0, this.MaxLength);
	}

	public get Value(): string { return this._value; }
	public get SelectionStart(): number { return this._selectionStart; }
	public get SelectionEnd(): number { return this._selectionEnd; }
	public get SelectedText(): string { return this._value.slice(this._selectionStart, this._selectionEnd); }

	public SetValue(value: string): void {
		const next = value.slice(0, this.MaxLength);
		if (next === this._value) return;
		const previous = this._value;
		this._value = next;
		this.Emit("change", next, previous);
	}

	/** What the user typed: the whole new text of the box. The caret goes to its end. */
	public Input(text: string): void {
		if (!this.Enabled || this.ReadOnly) return;
		this.SetValue(text);
		this.Select(this._value.length, this._value.length);
	}

	public Select(start: number, end: number): void {
		const length = this._value.length;
		const from = Math.min(length, Math.max(0, start));
		const to = Math.min(length, Math.max(from, end));
		if (from === this._selectionStart && to === this._selectionEnd) return;
		this._selectionStart = from;
		this._selectionEnd = to;
		this.Emit("select", from, to);
	}

	public SelectAll(): void {
		this.Select(0, this._value.length);
	}

	public KeyDown(code: string, modifiers: KeyModifiers = {}): void {
		if (code === "KeyA" && modifiers.Ctrl) this.SelectAll();
	}
}
