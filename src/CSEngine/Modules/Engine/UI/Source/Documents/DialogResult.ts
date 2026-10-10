// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** How a form or dialog was closed (WinForms' DialogResult). The value is what layout files store. */
export const enum DialogResult {
	None = "None",
	OK = "OK",
	Cancel = "Cancel",
	Yes = "Yes",
	No = "No",
	Abort = "Abort",
	Retry = "Retry",
	Ignore = "Ignore",
}

export const DialogResults: readonly DialogResult[] = [
	DialogResult.None, DialogResult.OK, DialogResult.Cancel, DialogResult.Yes, DialogResult.No, DialogResult.Abort, DialogResult.Retry, DialogResult.Ignore,
];
