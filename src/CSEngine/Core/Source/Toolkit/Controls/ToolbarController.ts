// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface ToolbarButton {
	Id: string;
	Label: string;
	/** A button that stays down until clicked again (TBSTYLE_CHECK). */
	Toggle?: boolean;
	/** Toggle buttons sharing a group act like radio buttons (TBSTYLE_CHECKGROUP). */
	Group?: string;
	Pressed?: boolean;
	Disabled?: boolean;
}

export interface ToolbarOptions extends ControlOptions {
	Buttons: ToolbarButton[];
}

export type ToolbarEvents = { click: [id: string]; toggle: [id: string, pressed: boolean]; };

export class ToolbarController extends ControlBase<ToolbarEvents> {
	public readonly Buttons: ToolbarButton[];

	public constructor(options: ToolbarOptions) {
		super(options);
		this.Buttons = options.Buttons;
	}

	public IsPressed(id: string): boolean {
		return this.Find(id)?.Pressed === true;
	}

	public SetDisabled(id: string, disabled: boolean): void {
		const button = this.Find(id);
		if (button) button.Disabled = disabled;
	}

	public Click(id: string): void {
		const button = this.Find(id);
		if (!this.Enabled || !button || button.Disabled) return;
		if (button.Toggle) this.ToggleButton(button);
		this.Emit("click", id);
	}

	private ToggleButton(button: ToolbarButton): void {
		if (!button.Group) {
			this.SetPressed(button, !button.Pressed);
			return;
		}
		if (button.Pressed) return;
		for (const other of this.Buttons) {
			if (other.Group === button.Group && other.Pressed) this.SetPressed(other, false);
		}
		this.SetPressed(button, true);
	}

	private SetPressed(button: ToolbarButton, pressed: boolean): void {
		button.Pressed = pressed;
		this.Emit("toggle", button.Id, pressed);
	}

	private Find(id: string): ToolbarButton | undefined {
		return this.Buttons.find((b) => b.Id === id);
	}
}
