// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { EventHub } from "@cse/core/events";
import type { SettingsStorage } from "@cse/core/Engine/Storage/SettingsStorage";
import { UiScript, type UiDocument, type UiManager, type UiManifest, type UiScriptRegistry } from "@cse/ui";
import type { ProgramNative } from "./Native";

/**
 * A program made from the Program template (S6-14): an application with no engine, as a Windows Forms one. Its
 * Program.ts has `main(args)`, which runs its main form:
 *
 * ```ts
 * export function main(args: string[]): void {
 *     Application.Run(MainForm, "MainForm");   // the form's class, and its UI document's Id
 * }
 * ```
 *
 * A form is the code behind a UI document (a UiScript: OnConstruct, OnLoad, OnShown, OnClosing, OnClosed...) with the
 * program's services. Closing the main form ends the program.
 */

export type ApplicationEvents = {
	/** The program starts: main(args) is about to run. */
	startup: [args: string[]];
	/** The program ends, with its exit code: settings are written after this. */
	exit: [code: number];
};

/** What the page that hosts a program gives it (App/Main.ts in the desktop app, the tests). */
export interface ProgramHost {
	/** The program's documents (the manager's manifest: a form's class goes into its entry). */
	Manifest: UiManifest;
	Manager: UiManager;
	Scripts: UiScriptRegistry;
	Native: ProgramNative;
	Settings: SettingsStorage;
}

/** A form class: a UiScript with no constructor arguments. */
export type FormClass = new () => Form;

export class ProgramApplication {
	public readonly Events = new EventHub<ApplicationEvents>();
	private _host: ProgramHost | null = null;
	private _args: string[] = [];
	private _main: string | null = null;
	private _exited = false;

	/** The command line after the program (main's args). */
	public get Args(): readonly string[] { return this._args; }
	/** The Id of the main form's document (null before Run). */
	public get MainForm(): string | null { return this._main; }
	public get Host(): ProgramHost {
		if (!this._host) throw new Error("The program has not started: Application.Start comes first (the program's page does it)");
		return this._host;
	}

	/** The page starts the program: the services, then main(args). */
	public async Start(host: ProgramHost, main: (args: string[]) => void | Promise<void>): Promise<void> {
		this._host = host;
		this._exited = false;
		this._main = null;
		this._args = await host.Native.Args();
		await host.Settings.Open();
		this.Events.Emit("startup", this._args);
		await main(this._args);
	}

	/** Shows the main form: its document, with `form` as the code behind it. When it closes, the program ends. */
	public async Run(form: FormClass, documentId: string): Promise<UiDocument> {
		const document = await this.ShowForm(form, documentId);
		this._main = documentId;
		document.Events.On("closed", () => void this.Exit());
		return document;
	}

	/** Shows another form (a tool window, a dialog that isn't modal). */
	public async ShowForm(form: FormClass, documentId: string): Promise<UiDocument> {
		const host = this.Host;
		const entry = host.Manifest.Documents.find((d) => d.Id === documentId);
		if (!entry) throw new Error(`The program has no UI document "${documentId}" (its Content/UI/Ui.manifest.json lists: ${host.Manifest.Documents.map((d) => d.Id).join(", ")})`);
		const name = `Form:${documentId}`;
		if (!host.Scripts.Names.includes(name)) host.Scripts.Register(name, form);
		entry.Script = name;
		return host.Manager.Show(documentId);
	}

	/** Ends the program: the exit event, the settings written, the window closed. */
	public async Exit(code = 0): Promise<void> {
		if (this._exited) return;
		this._exited = true;
		const host = this.Host;
		this.Events.Emit("exit", code);
		await host.Settings.Flush();
		await host.Native.Quit(code);
	}
}

/** The one application of the page. */
export const Application = new ProgramApplication();

/** A program's form: the code behind one of its UI documents, with the program's services. */
export class Form extends UiScript {
	protected get Application(): ProgramApplication { return Application; }
	/** The program's settings (kept between runs). */
	protected get Settings(): SettingsStorage { return Application.Host.Settings; }
	/** The system's dialogs and the files they pick. */
	protected get Native(): ProgramNative { return Application.Host.Native; }
}
