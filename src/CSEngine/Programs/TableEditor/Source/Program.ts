// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The table editor's start (S6-17): the language the user chose (else the system's), then its one form.
import { Application } from "@cse/program";
import { CSTablesRuntime } from "./Generated/CSTables";
import { TableEditorForm } from "./TableEditorForm";

export async function main(): Promise<void> {
	const chosen = Application.Host.Settings.Get("TableEditor.Language", "");
	await CSTablesRuntime.SetLanguage(CSTablesRuntime.PickLanguage(chosen === "" ? [...navigator.languages] : [chosen]));
	await Application.Run(TableEditorForm, "TableEditor");
}
