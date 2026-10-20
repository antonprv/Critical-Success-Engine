// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

/** A file type the packaged program opens (written into an installer; a portable program registers itself, S6-07). */
export interface PackagedFileType {
	/** Without the dot: "cstables". */
	Extension: string;
	Name: string;
	Description: string;
}

export interface PackageOptions {
	/** The program's folder: its package.json (whose "main" is the Electron entry) and everything it loads. */
	App: string;
	/** Where the executable goes (a project's Binaries/Windows/<Configuration>). */
	Output: string;
	/** The executable's and the window's name ("Moonrise" → Moonrise.exe). */
	Name: string;
	/** Reverse-domain id (com.criticalsuccess.moonrise): Windows groups the program's windows and settings by it. */
	Id: string;
	Version?: string;
	/** An .ico (Windows); the Electron icon without one. */
	Icon?: string;
	FileTypes?: readonly PackagedFileType[];
	/** portable: one .exe that runs from anywhere; dir: a folder with the .exe and its files. */
	Target?: "portable" | "dir";
}

/** The part of electron-builder's API used (tests replace it). */
export type Builder = (options: { projectDir: string; win: string[]; config: Record<string, unknown>; }) => Promise<string[]>;

/** The Electron version the program is packaged with: the one the tools run on. */
export function ElectronVersion(): string {
	const require = createRequire(__filename);
	return (JSON.parse(readFileSync(require.resolve("electron/package.json"), "utf8")) as { version: string; }).version;
}

/** The electron-builder configuration for a program (exported for the tests and the docs). */
export function BuilderConfig(options: PackageOptions): Record<string, unknown> {
	return {
		appId: options.Id,
		productName: options.Name,
		electronVersion: ElectronVersion(),
		directories: { output: options.Output },
		// The app is what the folder holds (a built site and its shell): nothing to install, no native modules to rebuild.
		npmRebuild: false,
		asar: true,
		// Chromium's locales but these two go: tens of megabytes less.
		electronLanguages: ["en-US", "ru"],
		extraMetadata: { version: options.Version ?? "1.0.0" },
		win: { ...(options.Icon ? { icon: options.Icon } : {}), signAndEditExecutable: true },
		portable: { artifactName: "${productName}.exe" },
		...(options.FileTypes?.length ? { fileAssociations: options.FileTypes.map((type) => ({ ext: type.Extension, name: type.Name, description: type.Description })) } : {}),
	};
}

async function DefaultBuilder(options: Parameters<Builder>[0]): Promise<string[]> {
	// Only when packaging: electron-builder is big, and the app may run where it isn't installed.
	const { build } = await import("electron-builder");
	return build(options as never);
}

/**
 * Packages a program into a Windows executable with electron-builder: Electron's runtime inside, so it runs on a
 * machine with no Node, browser or anything else. Returns the executable's path. electron-builder's working folders
 * (win-unpacked, its debug file) are removed, so the output holds only the program.
 */
export async function PackageApp(options: PackageOptions, builder: Builder = DefaultBuilder): Promise<string> {
	if (!existsSync(join(options.App, "package.json"))) throw new Error(`${options.App} has no package.json: nothing to package`);
	const target = options.Target ?? "portable";
	const artifacts = await builder({ projectDir: resolve(options.App), win: [target], config: BuilderConfig(options) });
	const unpacked = join(options.Output, "win-unpacked");
	if (target === "dir") return join(unpacked, `${options.Name}.exe`);
	rmSync(unpacked, { recursive: true, force: true });
	rmSync(join(options.Output, "builder-debug.yml"), { force: true });
	rmSync(join(options.Output, "builder-effective-config.yaml"), { force: true });
	const exe = artifacts.find((artifact) => artifact.toLowerCase().endsWith(".exe"));
	if (!exe) throw new Error(`electron-builder made no .exe (it made: ${artifacts.join(", ") || "nothing"})`);
	return exe;
}
