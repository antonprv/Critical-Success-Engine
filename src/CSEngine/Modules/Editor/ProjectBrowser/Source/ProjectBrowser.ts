// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import type { ButtonController, ComboBoxController, LabelController, ListViewController, TextBoxController, UiDocument, UiManager } from "@cse/ui";
import type { BuildConfiguration, BuildPlatform, ProjectRow, ProjectsApi, RunMode, TemplateRow } from "./Api";
import { ThemeChoices, type ThemeChoice } from "./Themes";

export const BrowserId = "ProjectBrowser";
export const NewProjectId = "NewProject";
const AllGenres = "All genres";

/** The run combo's choices, in order: dev runs at once, the build modes need that platform's build of the project. */
const RunChoices: readonly { Mode: RunMode; Label: string; }[] = [
	{ Mode: "dev", Label: "dev" },
	{ Mode: "web:dev", Label: "Web - Dev" },
	{ Mode: "web:prod", Label: "Web - Prod" },
	{ Mode: "desktop:dev", Label: "Desktop - Dev" },
	{ Mode: "desktop:prod", Label: "Desktop - Prod" },
];
/** The build combo's choices: where the build goes is Binaries/<Platform>/<Configuration> next to the project. */
const BuildChoices: readonly { Platform: BuildPlatform; Configuration: BuildConfiguration; Label: string; }[] = [
	{ Platform: "Web", Configuration: "Dev", Label: "Web - Dev" },
	{ Platform: "Web", Configuration: "Prod", Label: "Web - Prod" },
	{ Platform: "Desktop", Configuration: "Dev", Label: "Desktop - Dev" },
	{ Platform: "Desktop", Configuration: "Prod", Label: "Desktop - Prod" },
];

type List = ListViewController<{ text: string; }>;
type Combo = ComboBoxController<number>;

/**
 * The project browser (its UI documents: ProjectBrowser and NewProject): the projects the engine and the tools know,
 * a new one from a template (by genre, as Unreal's), opening one in the UI Designer, forgetting one; and the toolkit's
 * themes. It talks to its host through a ProjectsApi.
 */
export class ProjectBrowser {
	private _projects: ProjectRow[] = [];
	private _picked = -1;
	private _templates: TemplateRow[] = [];
	private _shown: TemplateRow[] = [];
	private _template = -1;
	private _availability: Record<RunMode, boolean> | null = null;
	private _building = false;

	/** theme: the index (in ThemeChoices) of the theme the tools start in. */
	public constructor(private readonly _manager: UiManager, private readonly _api: ProjectsApi, private readonly _wear: (theme: ThemeChoice) => void, private readonly _theme = 0) {}

	public async Start(): Promise<void> {
		const browser = await this._manager.Show(BrowserId);
		const theme = browser.Controller<Combo>("Theme");
		theme.Options.splice(0, theme.Options.length, ...ThemeChoices.map((choice, i) => ({ Value: i, Label: choice.Label })));
		theme.Choose(this._theme);
		browser.On("Theme", "change", (index) => this._wear(ThemeChoices[index as number]!));
		browser.On("Projects", "selection-change", (indices) => {
			this._picked = (indices as number[])[0] ?? -1;
			this.UpdateButtons(browser);
			void this.ReadAvailability();
		});
		browser.Controller<Combo>("RunMode").Options.splice(0, 0, ...RunChoices.map((choice, i) => ({ Value: i, Label: choice.Label, Disabled: true })));
		browser.Controller<Combo>("BuildMode").Options.splice(0, 0, ...BuildChoices.map((choice, i) => ({ Value: i, Label: choice.Label })));
		browser.On("RunMode", "change", () => this.UpdateButtons(browser));
		browser.On("BuildMode", "change", () => this.UpdateButtons(browser));
		browser.On("RunButton", "click", () => void this.Run());
		browser.On("BuildButton", "click", () => void this.Build());
		browser.On("NewButton", "click", () => void this.OpenNewProject());
		browser.On("OpenButton", "click", () => void this.Open());
		browser.On("RemoveButton", "click", () => void this.Remove());
		await this.Refresh();
	}

	/** Reads the projects again (and picks the one with this file). */
	public async Refresh(pick?: string): Promise<void> {
		const browser = this._manager.Get(BrowserId)!;
		this._projects = await this._api.List();
		const list = browser.Controller<List>("Projects");
		list.SetItems(this._projects.map((p) => ({ text: `${p.Name} - ${p.Template || "no template"} (${p.Genre}) - ${p.File}${p.Exists ? "" : " [missing]"}` })));
		const index = this._projects.findIndex((p) => p.File === pick);
		this._picked = index;
		if (index >= 0) list.Select([index]);
		this.UpdateButtons(browser);
		await this.ReadAvailability();
	}

	private UpdateButtons(browser: UiDocument): void {
		const project = this._projects[this._picked];
		browser.Controller<ButtonController>("OpenButton").SetEnabled(project?.Exists === true);
		browser.Controller<ButtonController>("RemoveButton").SetEnabled(project !== undefined);
		// Run waits for a project and for a mode that can run (the build modes only when their files exist); Build for a project and a target.
		const run = browser.Controller<Combo>("RunMode").SelectedOption;
		browser.Controller<ButtonController>("RunButton").SetEnabled(project?.Exists === true && run !== null && run.Disabled !== true && !this._building);
		browser.Controller<ButtonController>("BuildButton").SetEnabled(project?.Exists === true && browser.Controller<Combo>("BuildMode").SelectedOption !== null && !this._building);
	}

	/** Asks which run modes the picked project has (its build files) and greys out the ones it has not. */
	private async ReadAvailability(): Promise<void> {
		const browser = this._manager.Get(BrowserId)!;
		const project = this._projects[this._picked];
		const availability = project?.Exists ? await this._api.RunModes(project.File) : null;
		if (this._projects[this._picked] !== project) return;
		this._availability = availability;
		const combo = browser.Controller<Combo>("RunMode");
		combo.Options.splice(0, combo.Options.length, ...RunChoices.map((choice, i) => ({ Value: i, Label: choice.Label, Disabled: !(availability?.[choice.Mode] ?? false) })));
		this.UpdateButtons(browser);
	}

	private Status(text: string): void {
		this._manager.Get(BrowserId)!.Controller<LabelController>("Status").Label = text;
	}

	private async Open(): Promise<void> {
		const project = this._projects[this._picked]!;
		await this._api.OpenInDesigner(project.File);
		this.Status(`Opening ${project.Name} in the UI Designer.`);
	}

	private async Run(): Promise<void> {
		const browser = this._manager.Get(BrowserId)!;
		const project = this._projects[this._picked]!;
		const choice = RunChoices[browser.Controller<Combo>("RunMode").SelectedIndex]!;
		this.Status(choice.Mode === "dev" ? `Starting the dev server of ${project.Name}...` : `Opening the ${choice.Label} build of ${project.Name}...`);
		try {
			await this._api.Run(project.File, choice.Mode);
			this.Status(`${project.Name} runs in the browser (${choice.Label}).`);
		} catch (error) {
			this.Status(`${project.Name} did not run: ${(error as Error).message}`);
		}
	}

	private async Build(): Promise<void> {
		const browser = this._manager.Get(BrowserId)!;
		const project = this._projects[this._picked]!;
		const choice = BuildChoices[browser.Controller<Combo>("BuildMode").SelectedIndex]!;
		this._building = true;
		this.UpdateButtons(browser);
		this.Status(`Building ${project.Name} (${choice.Label})...`);
		try {
			const { Directory } = await this._api.Build(project.File, choice.Platform, choice.Configuration);
			this.Status(`Built ${project.Name} (${choice.Label}): ${Directory}`);
		} catch (error) {
			this.Status(`The build of ${project.Name} failed: ${(error as Error).message}`);
		} finally {
			this._building = false;
			await this.ReadAvailability();
		}
	}

	private async Remove(): Promise<void> {
		const project = this._projects[this._picked]!;
		await this._api.Remove(project.File);
		await this.Refresh();
		this.Status(`${project.Name} is no longer listed (its files are kept).`);
	}

	//#region new project

	private async OpenNewProject(): Promise<void> {
		const dialog = await this._manager.Show(NewProjectId);
		this._templates = await this._api.Templates();
		const genres = [AllGenres, ...new Set(this._templates.map((t) => t.Genre))];
		const genre = dialog.Controller<Combo>("Genre");
		genre.Options.splice(0, genre.Options.length, ...genres.map((label, i) => ({ Value: i, Label: label })));
		dialog.On("Genre", "change", (index) => this.ShowTemplates(dialog, genres[index as number]!));
		dialog.On("Templates", "selection-change", (indices) => {
			this._template = (indices as number[])[0] ?? -1;
			dialog.Controller<LabelController>("Description").Label = this._shown[this._template]?.Description ?? "";
			void this.Check(dialog);
		});
		dialog.On("Name", "change", () => void this.Check(dialog));
		dialog.On("Location", "change", () => void this.Check(dialog));
		dialog.On("BrowseButton", "click", () => void this.Browse(dialog));
		dialog.On("CreateButton", "click", () => void this.Create(dialog));
		dialog.On("CancelButton", "click", () => this._manager.Hide(NewProjectId));
		dialog.Controller<TextBoxController>("Location").SetValue(await this._api.DefaultLocation());
		this._template = -1;
		this.ShowTemplates(dialog, AllGenres);
	}

	/** Lists the templates of a genre; the one already picked stays picked when the genre still has it (else the first). */
	private ShowTemplates(dialog: UiDocument, genre: string, keep: string | undefined = this._shown[this._template]?.Name): void {
		this._shown = this._templates.filter((t) => genre === AllGenres || t.Genre === genre);
		const list = dialog.Controller<List>("Templates");
		list.SetItems(this._shown.map((t) => ({ text: t.Title })));
		this._template = -1;
		if (this._shown.length > 0) list.Select([FMath.Max(0, this._shown.findIndex((t) => t.Name === keep))]);
		else void this.Check(dialog);
	}

	/** Says what stands in the way of creating, and enables Create when nothing does. */
	private async Check(dialog: UiDocument): Promise<boolean> {
		const name = dialog.Controller<TextBoxController>("Name").Value;
		const location = dialog.Controller<TextBoxController>("Location").Value;
		const problem = !this._shown[this._template] ? "Pick a template."
			: name === "" ? "Name the project."
			: location === "" ? "Choose where it goes."
			: await this._api.NameProblem(name);
		dialog.Controller<LabelController>("Problem").Label = problem ?? "";
		dialog.Controller<ButtonController>("CreateButton").SetEnabled(problem === null);
		return problem === null;
	}

	private async Browse(dialog: UiDocument): Promise<void> {
		const folder = await this._api.PickFolder();
		if (folder === null) return;
		dialog.Controller<TextBoxController>("Location").SetValue(folder);
		await this.Check(dialog);
	}

	private async Create(dialog: UiDocument): Promise<void> {
		if (!await this.Check(dialog)) return;
		const name = dialog.Controller<TextBoxController>("Name").Value;
		try {
			const { File } = await this._api.Create({ Template: this._shown[this._template]!.Name, Name: name, Location: dialog.Controller<TextBoxController>("Location").Value });
			this._manager.Hide(NewProjectId);
			await this.Refresh(File);
			this.Status(`Created ${name}: the engine and the tools know it now.`);
		} catch (error) {
			dialog.Controller<LabelController>("Problem").Label = (error as Error).message;
		}
	}

	//#endregion
}
