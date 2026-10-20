// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { createApp, h, reactive, type App } from "vue";
import { IndexedDbBackend, SettingsStorage, type StorageBackend } from "@cse/core/Engine/Storage/SettingsStorage";
import { UiManager, UiScriptRegistry, WinKit, WinThemeProvider, WinTheme, WinUiHost, type TailwindTheme, type UiManifest } from "@cse/ui";
import { Application } from "./Application";
import { NativeOf, type ProgramNative } from "./Native";

/** A program's look: the project's Ui.Theme (.cseproject); Quasar's own when it names none. */
export interface ProgramTheme {
	Kit: string;
	Theme: string;
	Tailwind?: TailwindTheme;
}

export interface ProgramPage {
	/** The program's name (the project's): its settings' database, the window's first title. */
	Name: string;
	Manifest: UiManifest;
	/** The documents' text, by their path in the manifest. */
	Documents: Readonly<Record<string, string>>;
	Main: (args: string[]) => void | Promise<void>;
	Theme?: ProgramTheme;
	/** The window's native side (the desktop app's preload by default). */
	Native?: ProgramNative;
	/** Where settings are kept (IndexedDB, one database per program, by default). */
	Storage?: StorageBackend;
}

export const DefaultProgramTheme: ProgramTheme = { Kit: WinKit.Quasar, Theme: WinTheme.XpBlue };

/** The page's look, which a program changes on the fly (SetTheme). */
const look = reactive<ProgramTheme>({ ...DefaultProgramTheme });

/** Changes the program's look without a restart (the template's theme switch). */
export function SetProgramTheme(theme: ProgramTheme): void {
	Object.assign(look, { Tailwind: undefined }, theme);
}

export function ProgramLook(): Readonly<ProgramTheme> {
	return look;
}

/**
 * Starts a program in a page: its documents in a UI manager drawn by WinUiHost in its theme, its settings, the
 * native side, then main(args). Returns the Vue app (the tests unmount it).
 */
export async function StartProgram(mount: Element, page: ProgramPage): Promise<App> {
	const scripts = new UiScriptRegistry();
	const manager = new UiManager({ Manifest: page.Manifest, Scripts: scripts, Load: async (path) => {
		const text = page.Documents[path];
		if (text === undefined) throw new Error(`${path} is not among the program's documents`);
		return text;
	} });
	SetProgramTheme(page.Theme ?? DefaultProgramTheme);
	const app = createApp({
		render: () => h(WinThemeProvider, { theme: look.Theme as WinTheme, kit: look.Kit as WinKit, tailwind: look.Tailwind ?? null, class: "cse-program" }, () => h(WinUiHost, { manager })),
	});
	app.mount(mount);
	const native = page.Native ?? NativeOf();
	await native.SetTitle(page.Name);
	const settings = new SettingsStorage(page.Storage ?? new IndexedDbBackend(`cse-program-${page.Name}`));
	await Application.Start({ Manifest: page.Manifest, Manager: manager, Scripts: scripts, Native: native, Settings: settings }, page.Main);
	return app;
}
