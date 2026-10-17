// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { createApp, h, reactive } from "vue";
import { RememberedTheme, RememberTheme, UiManager, WinThemeProvider, WinUiHost } from "@cse/ui";
import BrowserText from "../Content/ProjectBrowser.ui.json?raw";
import NewProjectText from "../Content/NewProject.ui.json?raw";
import { MemoryProjectsApi, type ProjectsApi } from "./Api";
import { BrowserId, NewProjectId, ProjectBrowser } from "./ProjectBrowser";
import { ThemeChoices, type ThemeChoice } from "./Themes";

/** The project browser's page: in the desktop app its API is the app's (preload); in a plain browser, projects in memory. */
export function StartProjectBrowser(mount: HTMLElement, api: ProjectsApi = window.cse?.projects ?? new MemoryProjectsApi()): { Browser: ProjectBrowser; Manager: UiManager; } {
	const documents: Record<string, string> = { [BrowserId]: BrowserText, [NewProjectId]: NewProjectText };
	const manager = new UiManager({
		Manifest: { FileVersion: 1, Documents: Object.keys(documents).map((id) => ({ Id: id, Path: id, Script: "" })) },
		Load: async (path) => documents[path]!,
	});
	// the theme it was left in last time, else Windows XP
	const remembered = RememberedTheme("ProjectBrowser");
	const kept = ThemeChoices.findIndex((choice) => choice.Kit === remembered?.Kit && choice.Theme === remembered.Theme && choice.Tailwind.Dark === remembered.Tailwind.Dark);
	const start = kept >= 0 ? kept : ThemeChoices.findIndex((choice) => choice.Label.startsWith("Windows XP"));
	const theme = reactive<ThemeChoice>({ ...ThemeChoices[start]! });
	createApp({
		render: () => h(WinThemeProvider, { theme: theme.Theme, kit: theme.Kit, tailwind: theme.Tailwind, class: "project-browser" }, () => h(WinUiHost, { manager })),
	}).mount(mount);
	const browser = new ProjectBrowser(manager, api, (choice) => {
		Object.assign(theme, choice);
		RememberTheme("ProjectBrowser", { Kit: choice.Kit, Theme: choice.Theme, Tailwind: choice.Tailwind });
	}, start);
	void browser.Start();
	return { Browser: browser, Manager: manager };
}

const mount = document.getElementById("projects");
if (mount) StartProjectBrowser(mount);
