// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { UiManager, type ButtonController, type ComboBoxController, type LabelController, type ListViewController, type TextBoxController } from "@cse/ui";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import BrowserText from "../Content/ProjectBrowser.ui.json?raw";
import NewProjectText from "../Content/NewProject.ui.json?raw";
import { MemoryProjectsApi, type ProjectRow, type TemplateRow } from "../Source/Api";
import { BrowserId, NewProjectId, ProjectBrowser } from "../Source/ProjectBrowser";
import { ThemeChoices } from "../Source/Themes";

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 0)); await nextTick(); };

const Templates: TemplateRow[] = [
	{ Name: "Blank", Title: "Blank", Description: "A ball and a floor.", Genre: "Blank" },
	{ Name: "FirstPerson", Title: "First Person", Description: "A character room.", Genre: "FirstPerson" },
	{ Name: "CoinHunt", Title: "Coin Hunt", Description: "Collect the coins.", Genre: "Collectathon" },
	{ Name: "Arena", Title: "Arena", Description: "Another first person game.", Genre: "FirstPerson" },
];
const Project = (Name: string, Exists = true, Template = "Blank"): ProjectRow => ({ Name, File: `/games/${Name}/${Name}.cseproject`, Template, Genre: "Blank", LastOpened: "", Exists });

async function Make(projects: ProjectRow[] = [Project("Starfall"), Project("Lost", false)]) {
	const documents: Record<string, string> = { [BrowserId]: BrowserText, [NewProjectId]: NewProjectText };
	const manager = new UiManager({ Manifest: { FileVersion: 1, Documents: Object.keys(documents).map((id) => ({ Id: id, Path: id, Script: "" })) }, Load: async (path) => documents[path]! });
	const api = new MemoryProjectsApi(projects, Templates, "/home/anton/Games");
	const wear = vi.fn();
	const browser = new ProjectBrowser(manager, api, wear, 5);
	await browser.Start();
	const doc = (id: string) => manager.Get(id)!;
	const rows = (id: string, list: string) => doc(id).Controller<ListViewController<{ text: string; }>>(list).Items.map((i) => i.text);
	const pick = (id: string, list: string, index: number) => doc(id).Controller<ListViewController<{ text: string; }>>(list).Select([index]);
	const press = async (id: string, button: string) => { doc(id).Controller<ButtonController>(button).PerformClick(); await settle(); };
	const enabled = (id: string, button: string) => doc(id).Controller<ButtonController>(button).Enabled;
	const label = (id: string, name: string) => doc(id).Controller<LabelController>(name).Label;
	const type = async (id: string, box: string, text: string) => { doc(id).Controller<TextBoxController>(box).SetValue(text); await settle(); };
	return { manager, api, wear, browser, doc, rows, pick, press, enabled, label, type };
}

describe("the project browser", () => {
	it("lists the projects the tools know (a missing one is marked); Open and Remove wait for a pick", async () => {
		const { rows, enabled } = await Make();
		expect(rows(BrowserId, "Projects")).toEqual([
			"Starfall - Blank (Blank) - /games/Starfall/Starfall.cseproject",
			"Lost - Blank (Blank) - /games/Lost/Lost.cseproject [missing]",
		]);
		expect([enabled(BrowserId, "OpenButton"), enabled(BrowserId, "RemoveButton")]).toEqual([false, false]);
	});

	it("a project made without a template says so", async () => {
		const { rows } = await Make([Project("Handmade", true, "")]);
		expect(rows(BrowserId, "Projects")).toEqual(["Handmade - no template (Blank) - /games/Handmade/Handmade.cseproject"]);
	});

	it("opens a project in the UI Designer; a missing one can only be removed from the list (its files are kept)", async () => {
		const { api, pick, press, enabled, label, rows } = await Make();
		pick(BrowserId, "Projects", 0);
		expect(enabled(BrowserId, "OpenButton")).toBe(true);
		await press(BrowserId, "OpenButton");
		expect(api.Opened).toEqual(["/games/Starfall/Starfall.cseproject"]);
		expect(label(BrowserId, "Status")).toBe("Opening Starfall in the UI Designer.");
		pick(BrowserId, "Projects", 1);
		expect([enabled(BrowserId, "OpenButton"), enabled(BrowserId, "RemoveButton")]).toEqual([false, true]);
		await press(BrowserId, "RemoveButton");
		expect(rows(BrowserId, "Projects")).toHaveLength(1);
		expect(label(BrowserId, "Status")).toBe("Lost is no longer listed (its files are kept).");
	});

	it("wears every theme of the toolkit: the classic ones and Tailwind light and dark; it starts on the given one", async () => {
		const { doc, wear } = await Make();
		const theme = doc(BrowserId).Controller<ComboBoxController<number>>("Theme");
		expect(theme.Options.map((o) => o.Label)).toEqual(ThemeChoices.map((c) => c.Label));
		expect(ThemeChoices.length).toBe(14);
		expect(theme.SelectedIndex).toBe(5);
		theme.Choose(13);
		expect(wear).toHaveBeenLastCalledWith(ThemeChoices[13]);
		expect(ThemeChoices[13]!.Tailwind.Dark).toBe(true);
	});
});

describe("the project browser: a new project", () => {
	async function Dialog() {
		const made = await Make();
		await made.press(BrowserId, "NewButton");
		return made;
	}

	it("offers the genres of the templates, then the templates of the chosen genre, each with its description; the default folder", async () => {
		const { doc, rows, pick, label } = await Dialog();
		const genre = doc(NewProjectId).Controller<ComboBoxController<number>>("Genre");
		expect(genre.Options.map((o) => o.Label)).toEqual(["All genres", "Blank", "FirstPerson", "Collectathon"]);
		expect(rows(NewProjectId, "Templates")).toEqual(["Blank", "First Person", "Coin Hunt", "Arena"]);
		expect(label(NewProjectId, "Description")).toBe("A ball and a floor.");
		genre.Choose(2);
		await settle();
		expect(rows(NewProjectId, "Templates")).toEqual(["First Person", "Arena"]);
		pick(NewProjectId, "Templates", 1);
		expect(label(NewProjectId, "Description")).toBe("Another first person game.");
		expect(doc(NewProjectId).Controller<TextBoxController>("Location").Value).toBe("/home/anton/Games");
	});

	it("says what stands in the way, as the player types: a name, a valid one, a free one, a folder", async () => {
		const { type, label, enabled } = await Dialog();
		await settle();
		expect([label(NewProjectId, "Problem"), enabled(NewProjectId, "CreateButton")]).toEqual(["Name the project.", false]);
		await type(NewProjectId, "Name", "2Fast");
		expect(label(NewProjectId, "Problem")).toBe('"2Fast" must start with a letter and hold only letters, digits and _');
		await type(NewProjectId, "Name", "Starfall");
		expect(label(NewProjectId, "Problem")).toBe("There is a project called Starfall already");
		await type(NewProjectId, "Name", "Moonrise");
		expect([label(NewProjectId, "Problem"), enabled(NewProjectId, "CreateButton")]).toEqual(["", true]);
		await type(NewProjectId, "Location", "");
		expect(label(NewProjectId, "Problem")).toBe("Choose where it goes.");
	});

	it("Browse... takes the folder chosen in the system's dialog (cancelled: the folder stays)", async () => {
		const { api, press, doc } = await Dialog();
		await press(NewProjectId, "BrowseButton");
		expect(doc(NewProjectId).Controller<TextBoxController>("Location").Value).toBe("/home/anton/Games");
		api.NextFolder = "/mnt/fast";
		await press(NewProjectId, "BrowseButton");
		expect(doc(NewProjectId).Controller<TextBoxController>("Location").Value).toBe("/mnt/fast");
	});

	it("Create makes the project from the template, closes, lists and picks it; a failure stays in the dialog, said", async () => {
		const { api, manager, type, press, rows, label, doc } = await Dialog();
		await type(NewProjectId, "Name", "Moonrise");
		const create = vi.spyOn(api, "Create");
		await press(NewProjectId, "CreateButton");
		expect(create).toHaveBeenCalledWith({ Template: "Blank", Name: "Moonrise", Location: "/home/anton/Games" });
		expect(manager.IsShown(NewProjectId)).toBe(false);
		expect(rows(BrowserId, "Projects")[0]).toBe("Moonrise - Blank (Blank) - /home/anton/Games/Moonrise/Moonrise.cseproject");
		expect(doc(BrowserId).Controller<ListViewController<{ text: string; }>>("Projects").SelectedIndices).toEqual(new Set([0]));
		expect(label(BrowserId, "Status")).toBe("Created Moonrise: the engine and the tools know it now.");

		await press(BrowserId, "NewButton");
		await type(NewProjectId, "Name", "Comet");
		create.mockClear();
		doc(NewProjectId).Controller<TextBoxController>("Name").SetValue("bad name"); // changed, and Create pressed before the check could disable it
		await press(NewProjectId, "CreateButton");
		expect(create).not.toHaveBeenCalled();
		expect(label(NewProjectId, "Problem")).toContain("must start with a letter");
		await type(NewProjectId, "Name", "Comet");
		create.mockRejectedValueOnce(new Error("/home/anton/Games/Comet already exists"));
		await press(NewProjectId, "CreateButton");
		expect([manager.IsShown(NewProjectId), label(NewProjectId, "Problem")]).toEqual([true, "/home/anton/Games/Comet already exists"]);
		await press(NewProjectId, "CancelButton");
		expect(manager.IsShown(NewProjectId)).toBe(false);
	});

	it("with no template to pick (a genre without one), it says so", async () => {
		const { browser, manager, api, label } = await Make();
		vi.spyOn(api, "Templates").mockResolvedValue([]);
		manager.Get(BrowserId)!.Controller<ButtonController>("NewButton").PerformClick();
		await settle();
		expect(label(NewProjectId, "Problem")).toBe("Pick a template.");
		expect(browser).toBeDefined();
	});
});

describe("the in-memory host (a plain browser, tests)", () => {
	it("creates, refuses a bad name or an unknown template, removes", async () => {
		const api = new MemoryProjectsApi([], Templates);
		await expect(api.Create({ Template: "Nope", Name: "Ok", Location: "/x" })).rejects.toThrow('There is no template "Nope"');
		await expect(api.Create({ Template: "Blank", Name: "no way", Location: "/x" })).rejects.toThrow("must start with a letter");
		await api.Create({ Template: "CoinHunt", Name: "Gold", Location: "/x" });
		expect((await api.List()).map((p) => [p.Name, p.Genre])).toEqual([["Gold", "Collectathon"]]);
		await api.Remove("/nowhere");
		await api.Remove("/x/Gold/Gold.cseproject");
		expect(await api.List()).toEqual([]);
		expect([await new MemoryProjectsApi().DefaultLocation(), await new MemoryProjectsApi().PickFolder()]).toEqual(["/projects", null]);
	});
});

describe("the page", () => {
	it("starts on the desktop app's API when the preload put one there, else on projects in memory; it wears the chosen theme", async () => {
		document.body.innerHTML = '<div id="projects"></div>';
		const { StartProjectBrowser } = await import("../Source/Main");
		await settle();
		expect(document.querySelector('[data-ui="ProjectBrowser"]')).not.toBeNull(); // the module started itself on #projects
		const host = new MemoryProjectsApi([Project("FromApp")], Templates);
		window.cse = { projects: host };
		const element = document.createElement("div");
		document.body.appendChild(element);
		const { Manager } = StartProjectBrowser(element);
		await settle();
		expect(element.textContent).toContain("FromApp");
		expect(element.querySelector(".win-family--luna")).not.toBeNull(); // Windows XP to start with
		Manager.Get(BrowserId)!.Controller<ComboBoxController<number>>("Theme").Choose(13);
		await settle();
		expect(element.querySelector(".win-kit--tailwind")).not.toBeNull(); // Tailwind (dark) worn
		delete window.cse;
		window.cse = {}; // a preload without projects: the memory
		const other = document.createElement("div");
		StartProjectBrowser(other);
		delete window.cse;
	});

	it("a page without the #projects element starts nothing by itself", async () => {
		document.body.innerHTML = "";
		vi.resetModules();
		await import("../Source/Main");
		await settle();
		expect(document.querySelector('[data-ui="ProjectBrowser"]')).toBeNull();
	});
});
