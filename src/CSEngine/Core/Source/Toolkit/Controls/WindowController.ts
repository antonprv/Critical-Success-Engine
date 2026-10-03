// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";
import { CancelableEvent } from "../Core/EventHub";

export const enum WindowState {
	Normal = 0,
	Minimized,
	Maximized,
}

/** Which border is being dragged: bit flags, corners are two edges at once. */
export const enum ResizeEdge {
	Left = 1,
	Right = 2,
	Top = 4,
	Bottom = 8,
	TopLeft = 5,
	TopRight = 6,
	BottomLeft = 9,
	BottomRight = 10,
}

export interface WindowOptions extends ControlOptions {
	Title?: string;
	X?: number;
	Y?: number;
	Width?: number;
	Height?: number;
	MinWidth?: number;
	MinHeight?: number;
	Resizable?: boolean;
	Minimizable?: boolean;
	Maximizable?: boolean;
	Closable?: boolean;
}

export interface Area { Width: number; Height: number; }

export type WindowEvents = {
	move: [x: number, y: number];
	resize: [width: number, height: number];
	"state-change": [state: WindowState];
	closing: [event: CancelableEvent];
	close: [];
	activate: [];
	deactivate: [];
	"drag-start": [];
	"drag-end": [];
	"resize-start": [];
	"resize-end": [];
};

interface Bounds { X: number; Y: number; Width: number; Height: number; }

/** A top-level window: title bar buttons, moving by the title bar, resizing by the borders, closing with a veto. */
export class WindowController extends ControlBase<WindowEvents> {
	public Title: string;
	public readonly MinWidth: number;
	public readonly MinHeight: number;
	public Resizable: boolean;
	public Minimizable: boolean;
	public Maximizable: boolean;
	public Closable: boolean;

	private _x: number;
	private _y: number;
	private _width: number;
	private _height: number;
	private _state = WindowState.Normal;
	private _active = false;
	private _closed = false;
	private _normalBounds: Bounds | null = null;
	private _stateBeforeMinimize = WindowState.Normal;
	private _drag: { OffsetX: number; OffsetY: number; } | null = null;
	private _resize: { Edge: ResizeEdge; StartX: number; StartY: number; Start: Bounds; } | null = null;

	public constructor(options: WindowOptions = {}) {
		super(options);
		this.Title = options.Title ?? "";
		this._x = options.X ?? 0;
		this._y = options.Y ?? 0;
		this._width = options.Width ?? 320;
		this._height = options.Height ?? 240;
		this.MinWidth = options.MinWidth ?? 120;
		this.MinHeight = options.MinHeight ?? 60;
		this.Resizable = options.Resizable ?? true;
		this.Minimizable = options.Minimizable ?? true;
		this.Maximizable = options.Maximizable ?? true;
		this.Closable = options.Closable ?? true;
	}

	public get X(): number { return this._x; }
	public get Y(): number { return this._y; }
	public get Width(): number { return this._width; }
	public get Height(): number { return this._height; }
	public get State(): WindowState { return this._state; }
	public get Active(): boolean { return this._active; }
	public get Closed(): boolean { return this._closed; }
	public get Dragging(): boolean { return this._drag !== null; }
	public get Resizing(): boolean { return this._resize !== null; }

	//#region bounds

	public MoveTo(x: number, y: number): void {
		if (x === this._x && y === this._y) return;
		this._x = x;
		this._y = y;
		this.Emit("move", x, y);
	}

	public SetSize(width: number, height: number): void {
		const w = Math.max(this.MinWidth, width);
		const h = Math.max(this.MinHeight, height);
		if (w === this._width && h === this._height) return;
		this._width = w;
		this._height = h;
		this.Emit("resize", w, h);
	}

	private SetBounds(bounds: Bounds): void {
		this.MoveTo(bounds.X, bounds.Y);
		this.SetSize(bounds.Width, bounds.Height);
	}

	//#endregion

	//#region state

	public Minimize(): void {
		if (!this.Minimizable || this._state === WindowState.Minimized) return;
		this._stateBeforeMinimize = this._state;
		this.SetState(WindowState.Minimized);
	}

	/** Fills `area` (the desktop or the parent's client area). */
	public Maximize(area: Area): void {
		if (!this.Maximizable || this._state === WindowState.Maximized) return;
		// Bounds are "normal" when the window is normal, or minimized from normal (minimizing doesn't move it).
		const wasNormal = this._state === WindowState.Normal || this._stateBeforeMinimize === WindowState.Normal;
		if (wasNormal) this._normalBounds = { X: this._x, Y: this._y, Width: this._width, Height: this._height };
		this.SetBounds({ X: 0, Y: 0, Width: area.Width, Height: area.Height });
		this.SetState(WindowState.Maximized);
	}

	/** From minimized: back to what it was before. From maximized: back to the normal bounds. */
	public Restore(): void {
		if (this._state === WindowState.Minimized) {
			this.SetState(this._stateBeforeMinimize);
		} else if (this._state === WindowState.Maximized) {
			this.SetBounds(this._normalBounds!);
			this.SetState(WindowState.Normal);
		}
	}

	public ToggleMaximize(area: Area): void {
		if (this._state === WindowState.Maximized) this.Restore();
		else this.Maximize(area);
	}

	private SetState(state: WindowState): void {
		this._state = state;
		this.Emit("state-change", state);
	}

	/** Asks subscribers first ("closing" can be canceled); returns whether the window closed. */
	public RequestClose(): boolean {
		if (!this.Closable || this._closed) return false;
		const closing = new CancelableEvent();
		this.Emit("closing", closing);
		if (closing.Canceled) return false;
		this._closed = true;
		this.Emit("close");
		return true;
	}

	/** Set by the WindowManager. */
	public SetActive(active: boolean): void {
		if (this._active === active) return;
		this._active = active;
		this.Emit(active ? "activate" : "deactivate");
	}

	//#endregion

	//#region dragging the title bar

	public BeginDrag(pointerX: number, pointerY: number): void {
		if (this._state !== WindowState.Normal) return;
		this._drag = { OffsetX: pointerX - this._x, OffsetY: pointerY - this._y };
		this.Emit("drag-start");
	}

	public DragTo(pointerX: number, pointerY: number): void {
		if (!this._drag) return;
		this.MoveTo(pointerX - this._drag.OffsetX, pointerY - this._drag.OffsetY);
	}

	public EndDrag(): void {
		if (!this._drag) return;
		this._drag = null;
		this.Emit("drag-end");
	}

	//#endregion

	//#region resizing by a border

	public BeginResize(edge: ResizeEdge, pointerX: number, pointerY: number): void {
		if (!this.Resizable || this._state !== WindowState.Normal) return;
		this._resize = { Edge: edge, StartX: pointerX, StartY: pointerY, Start: { X: this._x, Y: this._y, Width: this._width, Height: this._height } };
		this.Emit("resize-start");
	}

	public ResizeTo(pointerX: number, pointerY: number): void {
		if (!this._resize) return;
		const { Edge, Start } = this._resize;
		const [x, width] = ResizeAxis(Start.X, Start.Width, pointerX - this._resize.StartX, this.MinWidth, (Edge & ResizeEdge.Left) !== 0, (Edge & ResizeEdge.Right) !== 0);
		const [y, height] = ResizeAxis(Start.Y, Start.Height, pointerY - this._resize.StartY, this.MinHeight, (Edge & ResizeEdge.Top) !== 0, (Edge & ResizeEdge.Bottom) !== 0);
		this.SetBounds({ X: x, Y: y, Width: width, Height: height });
	}

	public EndResize(): void {
		if (!this._resize) return;
		this._resize = null;
		this.Emit("resize-end");
	}

	//#endregion
}

/** One axis of a border drag: the near edge moves the origin, the far edge only the size; never below `min`. */
function ResizeAxis(start: number, size: number, delta: number, min: number, near: boolean, far: boolean): [number, number] {
	if (near) {
		const newSize = Math.max(min, size - delta);
		return [start + size - newSize, newSize];
	}
	return [start, far ? Math.max(min, size + delta) : size];
}
