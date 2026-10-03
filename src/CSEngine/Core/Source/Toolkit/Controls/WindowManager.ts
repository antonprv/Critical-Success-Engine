// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { EventHub } from "../Core/EventHub";
import { WindowState, type WindowController } from "./WindowController";

export interface WindowManagerOptions {
	/** How far a cascaded window is placed from the one under it. */
	CascadeOffset?: number;
}

export type WindowManagerEvents = { "active-change": [window: WindowController | null]; };

/** The desktop's window stack: z-order, the one active window, and who becomes active when it goes away. */
export class WindowManager {
	public readonly Events = new EventHub<WindowManagerEvents>();

	private readonly _windows: WindowController[] = [];
	private readonly _taskOrder: WindowController[] = [];
	private readonly _unsubscribe = new Map<WindowController, () => void>();
	private readonly _cascadeOffset: number;
	private _active: WindowController | null = null;

	public constructor(options: WindowManagerOptions = {}) {
		this._cascadeOffset = options.CascadeOffset ?? 22;
	}

	/** Bottom to top. */
	public get Windows(): readonly WindowController[] { return this._windows; }
	public get ActiveWindow(): WindowController | null { return this._active; }

	/** In the order they were added: what a taskbar shows. */
	public get TaskOrder(): readonly WindowController[] { return this._taskOrder; }

	/** 1 for the bottom window and up; 0 for windows the manager doesn't know. */
	public ZIndexOf(window: WindowController): number {
		return this._windows.indexOf(window) + 1;
	}

	public Add(window: WindowController, options: { Cascade?: boolean; } = {}): void {
		const top = this._windows.at(-1);
		if (options.Cascade && top) window.MoveTo(top.X + this._cascadeOffset, top.Y + this._cascadeOffset);

		this._windows.push(window);
		this._taskOrder.push(window);
		const offClose = window.Events.On("close", () => this.Remove(window));
		const offState = window.Events.On("state-change", (state) => {
			if (state === WindowState.Minimized && window === this._active) this.ActivateTopmost();
		});
		this._unsubscribe.set(window, () => { offClose(); offState(); });
		this.Activate(window);
	}

	public Remove(window: WindowController): void {
		const index = this._windows.indexOf(window);
		if (index < 0) return;
		this._windows.splice(index, 1);
		this._taskOrder.splice(this._taskOrder.indexOf(window), 1);
		this._unsubscribe.get(window)!();
		this._unsubscribe.delete(window);
		if (window === this._active) this.ActivateTopmost();
	}

	/** Brings the window to the top and makes it the active one; a minimized window is restored first. */
	public Activate(window: WindowController): void {
		const index = this._windows.indexOf(window);
		if (index < 0) return;
		if (window.State === WindowState.Minimized) window.Restore();

		this._windows.splice(index, 1);
		this._windows.push(window);
		this.SetActive(window);
	}

	private ActivateTopmost(): void {
		const next = [...this._windows].reverse().find((w) => w.State !== WindowState.Minimized);
		if (next) this.Activate(next);
		else this.SetActive(null);
	}

	private SetActive(window: WindowController | null): void {
		if (window === this._active) return;
		this._active?.SetActive(false);
		this._active = window;
		window?.SetActive(true);
		this.Events.Emit("active-change", window);
	}
}
