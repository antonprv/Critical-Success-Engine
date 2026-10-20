// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { RegistryPath } from "../../../../Core/BuildTools/Projects.ts";
import { DesignerService } from "./DesignerService";
import { RegisterDesignerIpc, RegisterProjectIpc, RegisterSolutionIpc } from "./Ipc";
import { ProjectRunner } from "./ProjectRunner";
import { ProjectsService } from "./ProjectsService";
import { SolutionService } from "./SolutionService";

/**
 * The desktop app's main process: the editor's programs in windows of the operating system. It starts on the project
 * browser; a project opens in the UI Designer's own window. Where things are is found from this built file
 * (Binaries/Programs/Desktop/main.cjs) and can be overridden for development and tests:
 * CSE_PROJECT_BROWSER_URL, CSE_UI_DESIGNER_URL (dev servers), CSE_TEMPLATES_DIR, CSE_PROJECTS_REGISTRY.
 * Started with --ui-designer, it opens the UI designer on its own (it asks which project the UI is for).
 */
const Binaries = join(__dirname, "../..");
const Page = (variable: string, built: string): string => process.env[variable] ?? pathToFileURL(join(Binaries, built)).href;

function Window(title: string, url: string): BrowserWindow {
	const window = new BrowserWindow({
		title, width: 900, height: 620, show: true,
		webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false },
	});
	window.setMenuBarVisibility(false);
	void window.loadURL(url);
	return window;
}

/** The UI designer in a window of its own: on a project, or (none given) asking which one. */
function OpenDesigner(file: string | null): void {
	const url = new URL(Page("CSE_UI_DESIGNER_URL", "Modules/Editor/UIDesigner/index.html"));
	if (file !== null) url.searchParams.set("project", file);
	Window("UI Designer", url.href);
}

export function StartDesktop(): void {
	const service = new ProjectsService({
		Registry: RegistryPath(),
		TemplatesDirectory: process.env["CSE_TEMPLATES_DIR"] ?? join(Binaries, "../../Templates"),
	});
	let browser: BrowserWindow | null = null;
	// Running and building projects: the Core (the engine's Vite project) builds whichever .cseproject it is told to.
	const runner = new ProjectRunner({
		CoreDirectory: process.env["CSE_CORE_DIR"] ?? join(Binaries, "../Core"),
		Open: (url) => shell.openExternal(url),
	});
	// Solution Explorer's files (S6-20): deletes go to the recycle bin.
	const solution = new SolutionService({ Trash: (path) => shell.trashItem(path) });
	app.on("before-quit", () => {
		runner.Dispose();
		solution.Dispose();
	});
	RegisterProjectIpc(ipcMain, service, {
		PickFolder: async () => {
			const result = await dialog.showOpenDialog(browser!, { properties: ["openDirectory", "createDirectory"] });
			return result.canceled ? null : result.filePaths[0] ?? null;
		},
		OpenInDesigner: async (file) => {
			OpenDesigner(file);
		},
	}, runner);
	RegisterDesignerIpc(ipcMain, new DesignerService());
	RegisterSolutionIpc(ipcMain, solution);
	app.on("window-all-closed", () => app.quit());
	void app.whenReady().then(() => {
		if (process.argv.includes("--ui-designer")) OpenDesigner(null);
		else browser = Window("Critical Success Engine - Projects", Page("CSE_PROJECT_BROWSER_URL", "Modules/Editor/ProjectBrowser/index.html"));
	});
}

StartDesktop();
