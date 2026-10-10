// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { ButtonController, ComboBoxController, LabelController, ListViewController, TextBoxController, UiDocument, UiManager } from "@cse/ui";
import type { ProjectRow, ProjectsApi, TemplateRow } from "./Api";
import { ThemeChoices, type ThemeChoice } from "./Themes";

export const BrowserId = "ProjectBrowser";
export const NewProjectId = "NewProject";
const AllGenres = "All genres";

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
		});
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
	}

	private UpdateButtons(browser: UiDocument): void {
		const project = this._projects[this._picked];
		browser.Controller<ButtonController>("OpenButton").SetEnabled(project?.Exists === true);
		browser.Controller<ButtonController>("RemoveButton").SetEnabled(project !== undefined);
	}

	private Status(text: string): void {
		this._manager.Get(BrowserId)!.Controller<LabelController>("Status").Label = text;
	}

	private async Open(): Promise<void> {
		const project = this._projects[this._picked]!;
		await this._api.OpenInDesigner(project.File);
		this.Status(`Opening ${project.Name} in the UI Designer.`);
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
		this.ShowTemplates(dialog, AllGenres);
	}

	private ShowTemplates(dialog: UiDocument, genre: string): void {
		this._shown = this._templates.filter((t) => genre === AllGenres || t.Genre === genre);
		const list = dialog.Controller<List>("Templates");
		list.SetItems(this._shown.map((t) => ({ text: t.Title })));
		this._template = -1;
		if (this._shown.length > 0) list.Select([0]);
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
