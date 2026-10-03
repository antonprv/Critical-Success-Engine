// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";
import { CancelableEvent } from "../Core/EventHub";

export interface TabInfo {
	Id: string;
	Label: string;
	Disabled?: boolean;
}

export interface TabsOptions extends ControlOptions {
	Tabs: TabInfo[];
	SelectedId?: string;
}

export interface KeyModifiers {
	Ctrl?: boolean;
	Shift?: boolean;
}

/** Cancel() keeps the current tab (e.g. a property page with invalid input). */
export class TabSelectingEvent extends CancelableEvent {
	public constructor(public readonly To: string, public readonly From: string | null) {
		super();
	}
}

export type TabsEvents = { selecting: [event: TabSelectingEvent]; change: [id: string, previous: string | null]; };

export class TabsController extends ControlBase<TabsEvents> {
	public Tabs: TabInfo[];

	private _selectedId: string | null;

	public constructor(options: TabsOptions) {
		super(options);
		this.Tabs = options.Tabs;
		this._selectedId = options.SelectedId ?? this.Tabs.find((t) => !t.Disabled)?.Id ?? null;
	}

	public get SelectedId(): string | null { return this._selectedId; }

	public Select(id: string): void {
		if (!this.Enabled || id === this._selectedId) return;
		const tab = this.Tabs.find((t) => t.Id === id);
		if (!tab || tab.Disabled) return;

		const selecting = new TabSelectingEvent(id, this._selectedId);
		this.Emit("selecting", selecting);
		if (selecting.Canceled) return;

		const previous = this._selectedId;
		this._selectedId = id;
		this.Emit("change", id, previous);
	}

	public KeyDown(code: string, modifiers: KeyModifiers = {}): void {
		const enabled = this.Tabs.filter((t) => !t.Disabled);
		if (!this.Enabled || enabled.length === 0) return;

		const index = enabled.findIndex((t) => t.Id === this._selectedId);
		const at = (i: number): string => enabled[(i + enabled.length) % enabled.length]!.Id;
		if (code === "ArrowRight" || (code === "Tab" && modifiers.Ctrl && !modifiers.Shift)) this.Select(at(index + 1));
		else if (code === "ArrowLeft" || (code === "Tab" && modifiers.Ctrl && modifiers.Shift)) this.Select(at(index - 1));
		else if (code === "Home") this.Select(at(0));
		else if (code === "End") this.Select(at(enabled.length - 1));
	}
}
