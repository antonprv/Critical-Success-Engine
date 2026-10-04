// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { reactive } from "vue";
import { MessageBoxButtons, MessageBoxController, MessageBoxIcon, type MessageBoxResult } from "../Controls/MessageBoxController";
import { UseControl } from "../Core/UseControl";
import type { DialogResult } from "./DialogResult";
import type { UiLayout } from "./Layout";
import { UiDocument, type UiDocumentOptions } from "./UiDocument";

export { DialogResult, DialogResults } from "./DialogResult";

/** One modal on screen: a layout shown with ShowDialog, or a message box. */
export interface OpenDialog {
	Id: number;
	Document: UiDocument | null;
	MessageBox: MessageBoxController | null;
}

/**
 * Modal dialogs (WinForms' ShowDialog and MessageBox.Show): each call puts a modal on the WinDialogHost bound to this
 * service and resolves with the result once it closes. Dialogs opened from a dialog stack on top of it.
 */
export class DialogService {
	public readonly Open: OpenDialog[] = reactive([]);
	private _nextId = 1;

	public ShowDialog(layout: UiLayout, options: UiDocumentOptions = {}): Promise<DialogResult> {
		return new Promise((resolve) => {
			const document = new UiDocument(layout, { ...options, Dialogs: this });
			const entry = this.Push({ Document: document, MessageBox: null });
			document.Events.On("closed", (result) => {
				this.Remove(entry);
				document.Dispose();
				resolve(result);
			});
		});
	}

	public MessageBox(text: string, title = "", buttons = MessageBoxButtons.Ok, icon = MessageBoxIcon.None): Promise<MessageBoxResult> {
		return new Promise((resolve) => {
			const box = UseControl(new MessageBoxController({ Text: text, Title: title, Buttons: buttons, Icon: icon }));
			const entry = this.Push({ Document: null, MessageBox: box });
			box.Events.On("close", (result) => {
				this.Remove(entry);
				resolve(result);
			});
		});
	}

	private Push(dialog: Omit<OpenDialog, "Id">): OpenDialog {
		const entry = { Id: this._nextId++, ...dialog };
		this.Open.push(entry);
		return entry;
	}

	private Remove(entry: OpenDialog): void {
		this.Open.splice(this.Open.findIndex((dialog) => dialog.Id === entry.Id), 1);
	}
}
