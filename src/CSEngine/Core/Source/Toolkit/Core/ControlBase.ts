// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { EventHub, type EventMap } from "./EventHub";

export interface ControlOptions {
	Enabled?: boolean;
	Visible?: boolean;
}

export type ControlEvents = {
	"enabled-change": [enabled: boolean];
	"visible-change": [visible: boolean];
	"focus-change": [focused: boolean];
	"hover-change": [hovered: boolean];
};

/**
 * State and events every control shares. Controllers hold all of a control's state as plain fields and flags, so
 * code can read and change it directly; the Vue components only draw it and forward DOM input.
 */
export abstract class ControlBase<E extends EventMap = ControlEvents> {
	public readonly Events = new EventHub<E & ControlEvents>();

	private _enabled: boolean;
	private _visible: boolean;
	private _focused = false;
	private _hovered = false;

	public constructor(options: ControlOptions = {}) {
		this._enabled = options.Enabled ?? true;
		this._visible = options.Visible ?? true;
	}

	public get Enabled(): boolean { return this._enabled; }
	public get Visible(): boolean { return this._visible; }
	public get Focused(): boolean { return this._focused; }
	public get Hovered(): boolean { return this._hovered; }

	public SetEnabled(enabled: boolean): void {
		if (this._enabled === enabled) return;
		this._enabled = enabled;
		if (!enabled) {
			this.Blur();
			this.HoverLeave();
			this.OnDisabled();
		}
		this.EmitControl("enabled-change", enabled);
	}

	public SetVisible(visible: boolean): void {
		if (this._visible === visible) return;
		this._visible = visible;
		this.EmitControl("visible-change", visible);
	}

	public Focus(): void {
		if (!this._enabled || this._focused) return;
		this._focused = true;
		this.EmitControl("focus-change", true);
	}

	public Blur(): void {
		if (!this._focused) return;
		this._focused = false;
		this.OnBlur();
		this.EmitControl("focus-change", false);
	}

	public HoverEnter(): void {
		if (!this._enabled || this._hovered) return;
		this._hovered = true;
		this.EmitControl("hover-change", true);
	}

	public HoverLeave(): void {
		if (!this._hovered) return;
		this._hovered = false;
		this.EmitControl("hover-change", false);
	}

	/** Emits one of the subclass's own events. */
	protected Emit<K extends keyof E>(event: K, ...args: E[K]): void {
		(this.Events as unknown as EventHub<E>).Emit(event, ...args);
	}

	private EmitControl<K extends keyof ControlEvents>(event: K, ...args: ControlEvents[K]): void {
		(this.Events as unknown as EventHub<ControlEvents>).Emit(event, ...args);
	}

	/** Subclass hooks: let go of transient state (a pressed button) when focus is lost or the control is disabled. */
	protected OnBlur(): void { /* hook */ }
	protected OnDisabled(): void { /* hook */ }
}
