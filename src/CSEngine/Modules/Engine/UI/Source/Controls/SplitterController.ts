// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface SplitterOptions extends ControlOptions {
	/** The size of the panel the splitter resizes, in pixels. */
	Size: number;
	Min?: number;
	Max?: number;
	/** How far an arrow key moves it. */
	Step?: number;
	/** The panel is on the far side (right or bottom): moving the splitter towards it shrinks it. */
	Reverse?: boolean;
}

export type SplitterEvents = { resize: [size: number]; "drag-start": []; "drag-end": []; };

/** A sash between two panels: drag it, or use the arrow keys; a double click goes back to the first size. */
export class SplitterController extends ControlBase<SplitterEvents> {
	public readonly Min: number;
	public readonly Max: number;
	public Step: number;
	public readonly Reverse: boolean;
	private readonly _initial: number;

	private _size: number;
	private _drag: { Pointer: number; Size: number; } | null = null;

	public constructor(options: SplitterOptions) {
		super(options);
		this.Min = options.Min ?? 0;
		this.Max = options.Max ?? Infinity;
		this.Step = options.Step ?? 10;
		this.Reverse = options.Reverse ?? false;
		this._initial = options.Size;
		this._size = options.Size;
	}

	public get Size(): number { return this._size; }
	public get Dragging(): boolean { return this._drag !== null; }

	public SetSize(size: number): void {
		const next = Math.min(this.Max, Math.max(this.Min, size));
		if (next === this._size) return;
		this._size = next;
		this.Emit("resize", next);
	}

	public Reset(): void {
		this.SetSize(this._initial);
	}

	public BeginDrag(pointer: number): void {
		if (!this.Enabled) return;
		this._drag = { Pointer: pointer, Size: this._size };
		this.Emit("drag-start");
	}

	public DragTo(pointer: number): void {
		if (!this._drag) return;
		this.SetSize(this._drag.Size + this.Direction * (pointer - this._drag.Pointer));
	}

	public EndDrag(): void {
		if (!this._drag) return;
		this._drag = null;
		this.Emit("drag-end");
	}

	public KeyDown(code: string): void {
		if (!this.Enabled) return;
		switch (code) {
			case "ArrowRight": case "ArrowDown": this.SetSize(this._size + this.Direction * this.Step); break;
			case "ArrowLeft": case "ArrowUp": this.SetSize(this._size - this.Direction * this.Step); break;
			case "Home": this.SetSize(this.Min); break;
			case "End": this.SetSize(this.Max); break;
		}
	}

	private get Direction(): 1 | -1 {
		return this.Reverse ? -1 : 1;
	}
}
