// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Access, Accesses, Severity, TableDocument, TableExtension, type Diagnostic } from "@cse/cstables";
import { Form, SetProgramTheme, type ProgramNative, type ProgramTheme } from "@cse/program";
import { BridgeFileSystem, SolutionModel, ViewMode, type FileEntry, type ProjectFileSystem, type SolutionNode } from "@cse/solution";
import {
	MessageBoxButtons, MessageBoxResult,
	type ComboBoxController, type DataGridController, type DataGridRow, type ListViewController, type SolutionTreeController, type StatusBarController, type TextBoxController,
} from "@cse/ui";
import { CSTables, CSTablesRuntime } from "./Generated/CSTables";
import { RowId, TableError, TableSession, type Column } from "./TableSession";

/** The grid's filters, as the editor's list offers them. */
export const enum RowFilter {
	All = 0,
	Untranslated = 1,
	Errors = 2,
	Changed = 3,
}

const Filters: Record<RowFilter, ((row: DataGridRow) => boolean) | null> = {
	[RowFilter.All]: null,
	[RowFilter.Untranslated]: (row) => (row.Cells["Value"] ?? "").trim() === "",
	[RowFilter.Errors]: (row) => row.Error === true || row.Warning === true,
	[RowFilter.Changed]: (row) => row.Modified === true,
};

export const Themes: { Label: string; Theme: ProgramTheme; }[] = [
	{ Label: "Quasar", Theme: { Kit: "quasar", Theme: "xp-blue" } },
	{ Label: "Quasar (dark)", Theme: { Kit: "quasar", Theme: "xp-blue", Tailwind: { Accent: "blue", Neutral: "gray", Dark: true, Radius: "sm" } } },
	{ Label: "Tailwind", Theme: { Kit: "tailwind", Theme: "xp-blue", Tailwind: { Accent: "indigo", Neutral: "zinc", Dark: false, Radius: "md" } } },
	{ Label: "Windows XP", Theme: { Kit: "classic", Theme: "xp-blue" } },
	{ Label: "Windows 7", Theme: { Kit: "classic", Theme: "win7-aero" } },
];

const IsTable = (path: string): boolean => path.toLowerCase().endsWith(TableExtension);
const Folder = (path: string): string => path.replace(/[\\/][^\\/]*$/, "");
const Relative = (root: string, path: string): string => path.slice(root.length).replace(/^[\\/]+/, "").replace(/\\/g, "/");

/** One file the editor was opened with, outside any project: its folder holds only it. */
export class LoneFile implements ProjectFileSystem {
	public constructor(private readonly _native: ProgramNative, private readonly _path: string, private readonly _name: string) {}
	public async List(): Promise<FileEntry[]> { return [{ Path: this._name, Folder: false }]; }
	public async ReadText(path: string): Promise<string | null> { return path === this._name ? this._native.ReadText(this._path) : null; }
	public async WriteText(path: string, text: string): Promise<void> {
		if (path !== this._name) throw new TableError("A table opened on its own has no project to write other files into");
		await this._native.WriteText(this._path, text);
	}

	public async CreateFolder(): Promise<void> { throw new TableError("A table opened on its own has no project"); }
	public async Move(): Promise<void> { throw new TableError("A table opened on its own has no project"); }
	public async Copy(): Promise<void> { throw new TableError("A table opened on its own has no project"); }
	public async Delete(): Promise<void> { throw new TableError("A table opened on its own has no project"); }
	public Watch(): () => void { return () => undefined; }
}

/**
 * The table editor's window (Content/UI/TableEditor.ui.json), as Visual Studio's resource editor with Solution
 * Explorer beside it: the project's files on the left (both modes, the .uisolution), the open tables in tabs and the
 * grid on the right, the problems below, the toolbar on top.
 */
export class TableEditorForm extends Form {
	public Session: TableSession | null = null;
	public Solution: SolutionModel | null = null;
	/** The project's folder (absolute), or the lone table's. */
	public Root: string | null = null;
	public Problems: Diagnostic[] = [];
	private _unwatch: () => void = () => undefined;

	public override OnConstruct(): void {
		const themes = this.Widget<ComboBoxController<number>>("ThemeBox");
		themes.Options.splice(0, themes.Options.length, ...Themes.map((t, index) => ({ Value: index, Label: t.Label })));
		const theme = this.Settings.Get("TableEditor.Theme", 0);
		themes.Choose(theme);
		SetProgramTheme(Themes[theme]?.Theme ?? Themes[0]!.Theme);
		const languages = this.Widget<ComboBoxController<string>>("LanguageBox");
		languages.Options.splice(0, languages.Options.length, ...CSTablesRuntime.Languages.map((code) => ({ Value: code, Label: code })));
		languages.Choose(CSTablesRuntime.Languages.indexOf(CSTablesRuntime.Language));
		const access = this.Widget<ComboBoxController<Access>>("AccessBox");
		access.Options.splice(0, access.Options.length, ...Accesses.map((a) => ({ Value: a, Label: a })));
		this.On("ThemeBox", "change", (index) => {
			SetProgramTheme(Themes[index as number]!.Theme);
			this.Settings.Set("TableEditor.Theme", index as number);
		});
		this.On("LanguageBox", "change", (code) => void CSTablesRuntime.SetLanguage(code as string).then(() => {
			this.Settings.Set("TableEditor.Language", code as string);
			this.ShowTexts();
		}));
		this.On("OpenProjectButton", "click", () => void this.Guard(() => this.PickProject()));
		this.On("SaveButton", "click", () => void this.Guard(() => this.Save()));
		this.On("UndoButton", "click", () => this.Step(() => this.Session!.Undo()));
		this.On("RedoButton", "click", () => this.Step(() => this.Session!.Redo()));
		this.On("AccessBox", "change", (value) => this.Step(() => this.Session!.SetAccess(value as Access)));
		this.On("FilterBox", "change", (value) => this.Grid.SetRowFilter(Filters[value as RowFilter]));
		this.On("SearchBox", "change", (text) => this.Grid.SetFilter(String(text)));
		this.On("TabsBox", "change", (path) => void this.Guard(() => this.OpenTable(path as string)));
		this.On("CloseTabButton", "click", () => void this.Guard(() => this.CloseTab()));
		this.On("Files", "activate", (id) => {
			const path = String(id).slice(2);
			if (String(id).startsWith("f:") && IsTable(path)) void this.Guard(() => this.OpenTable(path));
		});
		this.On("Files", "expand-change", (id, open) => void this.Solution?.SetExpanded(id as string, open as boolean));
		this.On("Files", "rename", (id, name) => void this.Guard(async () => { await this.Solution!.Rename(id as string, name as string); }));
		this.On("Files", "move", (ids, target) => void this.Guard(() => this.Solution!.Move(ids as string[], target as string)));
		this.On("Grid", "cell-edit", (id, key, value) => this.Step(() => this.Session!.Edit(id as string, key as Column, value as string)));
		this.On("Grid", "row-add", (key, value) => this.Step(() => this.Session!.Add(key as Column, value as string)));
		this.On("Grid", "delete-rows", (ids) => this.Step(() => this.Session!.Delete(ids as string[])));
		this.On("Grid", "paste", (text, id, key) => this.Step(() => this.Session!.Paste(text as string, id as string, key as Column, this.Grid.VisibleRows.map((row) => row.Id))));
		this.On("Grid", "undo", () => this.Step(() => this.Session!.Undo()));
		this.On("Grid", "redo", () => this.Step(() => this.Session!.Redo()));
		this.On("Problems", "activate", (index) => void this.Guard(() => this.GoTo(this.Problems[index as number]!)));
		this.ShowTexts();
		this.Update();
	}

	public override OnShown(): void {
		void this.Guard(async () => {
			const files = (await this.Native.StartFiles()).filter(IsTable);
			if (files[0] !== undefined) await this.OpenFile(files[0]);
		});
		this.Native.OnOpenFiles((files) => {
			const table = files.find(IsTable);
			if (table !== undefined) void this.Guard(() => this.OpenFile(table));
		});
	}

	public override OnClosed(): void {
		this._unwatch();
	}

	private get Grid(): DataGridController { return this.Widget<DataGridController>("Grid"); }

	//#region opening

	/** "Open project...": a folder picked in the system's dialog. */
	public async PickProject(): Promise<void> {
		const [folder] = await this.Native.OpenDialog({ Folder: true, Title: CSTables.Editor.OpenProject });
		if (folder !== undefined) await this.OpenProject(folder);
	}

	/** A project's folder (granted): its files, its tables, its Solution Explorer. */
	public async OpenProject(folder: string): Promise<void> {
		this._unwatch();
		const files = new BridgeFileSystem(this.Native.Files, folder);
		await this.Start(folder, files, folder.split(/[\\/]/).pop()!);
		this._unwatch = files.Watch(() => void this.Guard(() => this.OnDiskChanged()));
		this.Status(CSTables.Editor.Opened({ path: folder }));
	}

	/**
	 * A table double-clicked in the system's file manager (or given by a second launch): its project is found up its
	 * folders and opened with it, the table in a tab; with no project, the table alone.
	 */
	public async OpenFile(path: string): Promise<void> {
		const project = await this.Native.ProjectOf(path);
		if (project === null) {
			this._unwatch();
			const name = path.split(/[\\/]/).pop()!;
			await this.Start(Folder(path), new LoneFile(this.Native, path, name), name);
			await this.OpenTable(name);
			return;
		}
		if (this.Root !== project) await this.OpenProject(project);
		await this.OpenTable(Relative(project, path));
	}

	private async Start(root: string, files: ProjectFileSystem, name: string): Promise<void> {
		this.Root = root;
		this.Session = new TableSession({ Files: files });
		await this.Session.Refresh();
		this.Solution?.Dispose();
		this.Solution = await SolutionModel.Open({ Files: files, SolutionPath: `${name}.uisolution`, ProjectName: name, FolderName: name });
		this.Solution.OnChanged(() => this.ShowTree());
		this.ShowTree();
		this.Update();
	}

	public async OpenTable(path: string): Promise<void> {
		await this.Session!.OpenTable(path);
		this.Update();
		const id = await this.Solution?.Reveal(path);
		if (id) this.Widget<SolutionTreeController>("Files").Reveal(id);
	}

	/** Closes the current tab, asking first when it has unsaved edits. */
	public async CloseTab(): Promise<void> {
		const table = this.Session?.Current;
		if (!table) return;
		if (table.Dirty && await this.MessageBox(CSTables.Editor.UnsavedClose({ path: table.Path }), CSTables.Editor.Title, MessageBoxButtons.YesNo) !== MessageBoxResult.Yes) return;
		this.Session!.Close(table.Path);
		this.Update();
	}

	//#endregion

	/** Saves every changed table and generates the code again; the problems found are listed. */
	public async Save(): Promise<void> {
		if (!this.Session) return;
		await this.Session.Save();
		this.Update();
		const errors = this.Problems.filter((p) => p.Severity === Severity.Error).length;
		this.Status(errors === 0 && this.Problems.length === 0 ? CSTables.Editor.Saved({ path: this.Root ?? "" }) : CSTables.Editor.SavedProblems(this.Problems.length));
	}

	/** Changes on disk: the tables listed and read again; a table changed outside while edited here asks which wins. */
	public async OnDiskChanged(): Promise<void> {
		await this.Session!.Refresh();
		for (const table of this.Session!.Open.filter((t) => t.Conflict)) {
			const text = await this.Native.Files.ReadText(this.Root!, table.Path);
			if (text !== null && await this.MessageBox(CSTables.Editor.ChangedOutside({ path: table.Path }), CSTables.Editor.Title, MessageBoxButtons.YesNo) === MessageBoxResult.Yes) table.Reload(text);
			else table.Conflict = false;
		}
		this.Update();
	}

	/** Shows a problem: its table open, its row selected. */
	public async GoTo(problem: Diagnostic): Promise<void> {
		await this.OpenTable(problem.File);
		const entry = TableDocument.Parse(this.Session!.Current!.Text).Entries.find((e) => e.Line === problem.Line);
		if (entry) this.Grid.Reveal(RowId(entry.Key, entry.Plural));
	}

	//#region the view

	/** Every widget as the session is now: the grid, the tabs, the access, the problems, the buttons, the title. */
	public Update(): void {
		const session = this.Session;
		this.Problems = session?.Check() ?? [];
		this.Grid.SetRows(session?.Rows(this.Problems) ?? []);
		const tabs = this.Widget<ComboBoxController<string>>("TabsBox");
		tabs.Options.splice(0, tabs.Options.length, ...(session?.Open ?? []).map((t) => ({ Value: t.Path, Label: t.Dirty ? `${t.Path} *` : t.Path })));
		const current = session?.Current ?? null;
		if (current) tabs.Choose(session!.Open.indexOf(current));
		const access = this.Widget<ComboBoxController<Access>>("AccessBox");
		if (current) access.Choose(Accesses.indexOf(session!.Access));
		this.Widget<ListViewController<{ text: string; }>>("Problems").SetItems(this.Problems.map((p) => ({ text: `${p.Severity === Severity.Error ? "✖" : "⚠"} ${p.Code} ${p.File}${p.Line > 0 ? `(${p.Line})` : ""}: ${p.Message}` })));
		for (const name of ["SaveButton", "AccessBox", "CloseTabButton", "Grid"]) this.Widget<{ SetEnabled(enabled: boolean): void; }>(name).SetEnabled(current !== null);
		this.Widget<{ SetEnabled(enabled: boolean): void; }>("UndoButton").SetEnabled(current?.CanUndo === true);
		this.Widget<{ SetEnabled(enabled: boolean): void; }>("RedoButton").SetEnabled(current?.CanRedo === true);
		this.Widget<StatusBarController>("Status").SetText(1, current?.Dirty ? CSTables.Editor.Changed : "");
		void this.Native.SetTitle(current ? `${current.Path}${current.Dirty ? " *" : ""} - ${CSTables.Editor.Title}` : CSTables.Editor.Title);
	}

	private ShowTree(): void {
		const tree = this.Widget<SolutionTreeController>("Files");
		const root: SolutionNode | null = this.Solution ? this.Solution.Tree : null;
		tree.SetNodes(root ? [root] : []);
		if (this.Solution) for (const id of [root!.Id, ...this.Solution.Data.Expanded[this.Solution.Mode]]) tree.Expand(id);
	}

	/** The texts of the window in the current language. */
	private ShowTexts(): void {
		const e = CSTables.Editor;
		for (const [name, text] of [["OpenProjectButton", e.OpenProject], ["SaveButton", e.Save], ["UndoButton", e.Undo], ["RedoButton", e.Redo], ["AccessLabel", e.Access], ["CloseTabButton", e.Close], ["ProblemsLabel", e.Problems]] as const) this.SetText(name, text);
		const filters = this.Widget<ComboBoxController<RowFilter>>("FilterBox");
		const chosen = Math.max(0, filters.SelectedIndex);
		filters.Options.splice(0, filters.Options.length, ...[e.FilterAll, e.FilterUntranslated, e.FilterErrors, e.FilterChanged].map((label, index) => ({ Value: index as RowFilter, Label: label })));
		filters.Choose(chosen);
		if (!this.Session) this.Status(e.NoProject);
	}

	private Status(text: string): void {
		this.Widget<StatusBarController>("Status").SetText(0, text);
	}

	/** An edit of the session: done, the view updated with fresh checks; what can't be done is told in the status line. */
	private Step(edit: () => unknown): void {
		try {
			edit();
		} catch (error) {
			this.Status((error as Error).message);
		}
		this.Update();
	}

	/** Runs an operation, telling in the status line what went wrong. */
	private async Guard(work: () => Promise<void>): Promise<void> {
		try {
			await work();
		} catch (error) {
			this.Status((error as Error).message);
		}
	}

	//#endregion

	/** Folder View or the solution view of the file panel. */
	public async SetMode(mode: ViewMode): Promise<void> {
		await this.Solution?.SetMode(mode);
	}
}
