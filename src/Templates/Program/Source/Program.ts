// The start of TemplateProject, a program (no engine): main(args) runs its main
// form, as Program.cs does in Windows Forms. The form's window is the UI
// document Content/UI/MainForm.ui.json (edit it in the UI Designer); the code
// behind it is MainForm.

import { Application } from "@cse/program";
import { CSTablesRuntime } from "./Generated/CSTables";
import { MainForm } from "./MainForm";

export async function main( args: string[] ): Promise<void> {
	// The language the user chose last time, else the system's, else Russian.
	const language = Application.Host.Settings.Get( "Program.Language", "" );
	const preferred = typeof language === "string" && language !== ""
		? [language]
		: [...navigator.languages];

	await CSTablesRuntime.SetLanguage(
		CSTablesRuntime.PickLanguage( preferred ),
	);
	if ( args.length > 0 ) {
		console.info( `Started with: ${ args.join( " " ) }` );
	}
	await Application.Run( MainForm, "MainForm" );
}
