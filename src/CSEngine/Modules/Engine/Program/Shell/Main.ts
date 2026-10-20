// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FileLog, FilesInArguments, SingleInstance } from "@cse/desktop-shell";
import { ProgramChannels, type IpcAnswer } from "./Channels";

/**
 * The main process of a program made from the Program template (S6-14): one window on the program's page, one
 * instance (a second launch hands its files to the first), the system's dialogs, and the files the user picked -
 * nothing else of the disk reaches the page. CSE_PROGRAM_URL loads the dev server instead of the built page.
 * --cse-smoke <seconds>: quit with 0 once the page has loaded and run that long (1 if it didn't);
 * --cse-profile <folder>: settings and logs there.
 */

declare const __CSE_PROGRAM_NAME__: string;

const Argument = (name: string): string | null => {
	const at = process.argv.indexOf(name);
	return at < 0 ? null : process.argv[at + 1] ?? "";
};

const profile = Argument("--cse-profile");
if (profile) app.setPath("userData", resolve(profile));
const log = FileLog(app.getPath("userData"));
/** The files the page may read and write: those it was started with, given by a second launch, or picked in a dialog. */
const allowed = new Set<string>();
let window: BrowserWindow | null = null;

const Allow = (files: string[]): string[] => {
	for (const file of files) allowed.add(resolve(file));
	return files;
};

function Answer<T>(work: () => T | Promise<T>): Promise<IpcAnswer<T>> {
	return Promise.resolve().then(work).then((value) => ({ ok: true as const, value }), (error: Error) => ({ ok: false as const, error: error.message }));
}

function Checked(path: string): string {
	const file = resolve(path);
	if (!allowed.has(file)) throw new Error(`${path} was not picked by the user: a program reaches only the files it is given`);
	return file;
}

/** The command line after the program: in a packaged program argv[0] is the program, in development argv[1] is its folder. */
const Args = (): string[] => process.argv.slice(app.isPackaged ? 1 : 2);

function Register(): void {
	const handle = (channel: string, work: (event: IpcMainInvokeEvent, ...args: never[]) => unknown): void => {
		ipcMain.handle(channel, (event, ...args) => Answer(() => work(event, ...(args as never[]))));
	};
	handle(ProgramChannels.Args, () => Args());
	handle(ProgramChannels.StartFiles, () => Allow(FilesInArguments([process.argv[0]!, ...Args()], process.cwd())));
	handle(ProgramChannels.OpenDialog, async (_event, options: { Title?: string; Filters?: { Name: string; Extensions: string[]; }[]; Multiple?: boolean; Folder?: boolean; }) => {
		const properties: ("openFile" | "openDirectory" | "multiSelections")[] = [options?.Folder ? "openDirectory" : "openFile"];
		if (options?.Multiple) properties.push("multiSelections");
		const result = await dialog.showOpenDialog(window!, { ...(options?.Title ? { title: options.Title } : {}), filters: (options?.Filters ?? []).map((f) => ({ name: f.Name, extensions: f.Extensions })), properties });
		return result.canceled ? [] : Allow(result.filePaths);
	});
	handle(ProgramChannels.SaveDialog, async (_event, options: { Title?: string; Filters?: { Name: string; Extensions: string[]; }[]; DefaultPath?: string; }) => {
		const result = await dialog.showSaveDialog(window!, { ...(options?.Title ? { title: options.Title } : {}), ...(options?.DefaultPath ? { defaultPath: options.DefaultPath } : {}), filters: (options?.Filters ?? []).map((f) => ({ name: f.Name, extensions: f.Extensions })) });
		return result.canceled || !result.filePath ? null : Allow([result.filePath])[0]!;
	});
	handle(ProgramChannels.ReadText, (_event, path: string) => readFileSync(Checked(path), "utf8"));
	handle(ProgramChannels.WriteText, (_event, path: string, text: string) => {
		const file = Checked(path);
		mkdirSync(dirname(file), { recursive: true });
		// Next to it, then over it: a crash mid-write leaves the old file whole.
		const temporary = `${file}.${process.pid}.tmp`;
		writeFileSync(temporary, text);
		renameSync(temporary, file);
	});
	handle(ProgramChannels.SetTitle, (_event, title: string) => window?.setTitle(title));
	handle(ProgramChannels.Quit, (_event, code: number) => {
		log(`exit ${code ?? 0}`);
		app.exit(code ?? 0);
	});
}

function Open(): void {
	window = new BrowserWindow({
		title: __CSE_PROGRAM_NAME__, width: 960, height: 640, show: true, autoHideMenuBar: true,
		webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false },
	});
	const smoke = Argument("--cse-smoke");
	if (smoke !== null) {
		// Loaded is not enough: the page marks itself ready once main(args) ran and its form is shown.
		window.webContents.once("did-finish-load", () => setTimeout(() => {
			void window!.webContents.executeJavaScript("document.documentElement.dataset.cseReady ?? ''").then((ready: string) => {
				log(ready === "1" ? "smoke: ok" : "smoke: the page did not start the program");
				app.exit(ready === "1" ? 0 : 1);
			});
		}, Number(smoke || 10) * 1000));
		window.webContents.once("did-fail-load", (_event, code, reason) => {
			log(`smoke: load failed ${code} ${reason}`);
			app.exit(1);
		});
	}
	// What the page reports as an error goes into the log too.
	window.webContents.on("console-message", (event) => {
		if (event.level === "error") log(`page: ${event.message}`);
	});
	window.webContents.on("render-process-gone", (_event, details) => {
		log(`page gone: ${details.reason}`);
		if (details.reason !== "clean-exit") window?.reload();
	});
	void window.loadURL(process.env["CSE_PROGRAM_URL"] ?? pathToFileURL(join(__dirname, "index.html")).href);
	log(`started ${app.getVersion()}`);
}

if (SingleInstance(app, (files) => {
	if (!window) return;
	if (window.isMinimized()) window.restore();
	window.focus();
	if (files.length > 0) window.webContents.send(ProgramChannels.OpenFiles, Allow(files));
})) {
	Register();
	app.on("window-all-closed", () => app.quit());
	void app.whenReady().then(Open);
}
