// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export const enum MessageBoxButtons {
	Ok = 0,
	OkCancel,
	YesNo,
	YesNoCancel,
	RetryCancel,
	AbortRetryIgnore,
}

export const enum MessageBoxResult {
	Ok = 0,
	Cancel,
	Yes,
	No,
	Retry,
	Abort,
	Ignore,
}

export const enum MessageBoxIcon {
	None = 0,
	Information,
	Warning,
	Error,
	Question,
}

export interface MessageBoxOptions extends ControlOptions {
	Title?: string;
	Text?: string;
	Icon?: MessageBoxIcon;
	Buttons?: MessageBoxButtons;
	/** Index of the button Enter presses. */
	DefaultButton?: number;
}

export type MessageBoxEvents = { close: [result: MessageBoxResult]; };

const ResultSets: Record<MessageBoxButtons, MessageBoxResult[]> = {
	[MessageBoxButtons.Ok]: [MessageBoxResult.Ok],
	[MessageBoxButtons.OkCancel]: [MessageBoxResult.Ok, MessageBoxResult.Cancel],
	[MessageBoxButtons.YesNo]: [MessageBoxResult.Yes, MessageBoxResult.No],
	[MessageBoxButtons.YesNoCancel]: [MessageBoxResult.Yes, MessageBoxResult.No, MessageBoxResult.Cancel],
	[MessageBoxButtons.RetryCancel]: [MessageBoxResult.Retry, MessageBoxResult.Cancel],
	[MessageBoxButtons.AbortRetryIgnore]: [MessageBoxResult.Abort, MessageBoxResult.Retry, MessageBoxResult.Ignore],
};

const Labels: Record<MessageBoxResult, string> = {
	[MessageBoxResult.Ok]: "OK",
	[MessageBoxResult.Cancel]: "Cancel",
	[MessageBoxResult.Yes]: "Yes",
	[MessageBoxResult.No]: "No",
	[MessageBoxResult.Retry]: "Retry",
	[MessageBoxResult.Abort]: "Abort",
	[MessageBoxResult.Ignore]: "Ignore",
};

/** Modal MessageBox: one of the classic button sets, a result once a button is chosen. */
export class MessageBoxController extends ControlBase<MessageBoxEvents> {
	public Title: string;
	public Text: string;
	public Icon: MessageBoxIcon;
	public readonly Buttons: MessageBoxButtons;
	public readonly DefaultButton: number;

	private _result: MessageBoxResult | null = null;

	public constructor(options: MessageBoxOptions = {}) {
		super(options);
		this.Title = options.Title ?? "";
		this.Text = options.Text ?? "";
		this.Icon = options.Icon ?? MessageBoxIcon.None;
		this.Buttons = options.Buttons ?? MessageBoxButtons.Ok;
		const requested = options.DefaultButton ?? 0;
		this.DefaultButton = requested < this.Results.length ? requested : 0;
	}

	public static ResultsFor(buttons: MessageBoxButtons): MessageBoxResult[] {
		return [...ResultSets[buttons]];
	}

	public static Label(result: MessageBoxResult): string {
		return Labels[result];
	}

	public get Results(): MessageBoxResult[] { return ResultSets[this.Buttons]; }
	public get Result(): MessageBoxResult | null { return this._result; }
	public get Closed(): boolean { return this._result !== null; }

	public Choose(result: MessageBoxResult): void {
		if (this.Closed || !this.Results.includes(result)) return;
		this._result = result;
		this.Emit("close", result);
	}

	/** Enter presses the default button. Escape is Cancel, or OK on a box with only OK; Yes/No boxes ignore it. */
	public KeyDown(code: string): void {
		if (code === "Enter") this.Choose(this.Results[this.DefaultButton]!);
		else if (code === "Escape") this.Choose(this.Buttons === MessageBoxButtons.Ok ? MessageBoxResult.Ok : MessageBoxResult.Cancel);
	}
}
