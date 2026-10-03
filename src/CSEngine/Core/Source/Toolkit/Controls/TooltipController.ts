// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface TooltipOptions extends ControlOptions {
	Text?: string;
	/** How long the pointer has to rest before the tip shows (TTDT_INITIAL). */
	Delay?: number;
	/** How long the tip stays up while the pointer rests (TTDT_AUTOPOP). */
	AutoPopDelay?: number;
}

export type TooltipEvents = { show: []; hide: []; };

export class TooltipController extends ControlBase<TooltipEvents> {
	public Text: string;
	public Delay: number;
	public AutoPopDelay: number;

	private _shown = false;
	private _timer: ReturnType<typeof setTimeout> | undefined;

	public constructor(options: TooltipOptions = {}) {
		super(options);
		this.Text = options.Text ?? "";
		this.Delay = options.Delay ?? 500;
		this.AutoPopDelay = options.AutoPopDelay ?? 5000;
	}

	public get Shown(): boolean { return this._shown; }

	public PointerEnter(): void {
		if (!this.Enabled) return;
		clearTimeout(this._timer);
		this._timer = setTimeout(() => this.Show(), this.Delay);
	}

	public PointerLeave(): void {
		this.Hide();
	}

	/** Clicking the tool hides its tip, as in Windows. */
	public PointerDown(): void {
		this.Hide();
	}

	private Show(): void {
		this._shown = true;
		this.Emit("show");
		this._timer = setTimeout(() => this.Hide(), this.AutoPopDelay);
	}

	private Hide(): void {
		clearTimeout(this._timer);
		if (!this._shown) return;
		this._shown = false;
		this.Emit("hide");
	}
}
