// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface ScrollBarOptions extends ControlOptions {
	Min?: number;
	Max?: number;
	/** How much of the range is visible at once: the thumb's size, and how far a page click scrolls. */
	PageSize?: number;
	SmallChange?: number;
	Value?: number;
	Horizontal?: boolean;
}

export type ScrollBarEvents = { scroll: [value: number]; };

/** Scroll bar: arrows scroll a line, the track a page, the thumb is dragged; the thumb is proportional to the page. */
export class ScrollBarController extends ControlBase<ScrollBarEvents> {
	public readonly Min: number;
	public readonly Max: number;
	public readonly PageSize: number;
	public readonly SmallChange: number;
	public readonly Horizontal: boolean;

	private _value: number;

	public constructor(options: ScrollBarOptions = {}) {
		super(options);
		this.Min = options.Min ?? 0;
		this.Max = options.Max ?? 100;
		this.PageSize = options.PageSize ?? 10;
		this.SmallChange = options.SmallChange ?? 1;
		this.Horizontal = options.Horizontal ?? false;
		this._value = this.Clamp(options.Value ?? this.Min);
	}

	public get Value(): number { return this._value; }
	/** The largest value: the last page is fully visible there. */
	public get MaxValue(): number { return Math.max(this.Min, this.Max - this.PageSize); }
	/** Thumb length as a fraction of the track. */
	public get ThumbSize(): number { return Math.min(1, this.PageSize / (this.Max - this.Min)); }
	/** Where the thumb starts, as a fraction of the track. */
	public get ThumbPosition(): number { return (this._value - this.Min) / (this.Max - this.Min); }

	public SetValue(value: number): void {
		const next = this.Clamp(value);
		if (next === this._value) return;
		this._value = next;
		this.Emit("scroll", next);
	}

	public LineUp(): void { this.ScrollBy(-this.SmallChange); }
	public LineDown(): void { this.ScrollBy(this.SmallChange); }
	public PageUp(): void { this.ScrollBy(-this.PageSize); }
	public PageDown(): void { this.ScrollBy(this.PageSize); }

	/** The thumb dragged to `fraction` of the free track (0 = start, 1 = end). */
	public SetThumbPosition(fraction: number): void {
		if (!this.Enabled) return;
		this.SetValue(this.Min + fraction * (this.MaxValue - this.Min));
	}

	public KeyDown(code: string): void {
		if (!this.Enabled) return;
		switch (code) {
			case "ArrowDown": case "ArrowRight": this.LineDown(); break;
			case "ArrowUp": case "ArrowLeft": this.LineUp(); break;
			case "PageDown": this.PageDown(); break;
			case "PageUp": this.PageUp(); break;
			case "Home": this.SetValue(this.Min); break;
			case "End": this.SetValue(this.MaxValue); break;
		}
	}

	private ScrollBy(delta: number): void {
		if (this.Enabled) this.SetValue(this._value + delta);
	}

	private Clamp(value: number): number {
		return Math.min(this.MaxValue, Math.max(this.Min, value));
	}
}
