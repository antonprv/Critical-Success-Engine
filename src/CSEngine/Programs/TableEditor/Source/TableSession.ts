// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	Access, Accesses, Compile, GenerateTypeScript, IsKey, ParseTableName, PluralCategories, ReadTables, Severity, ShortKeys, TableDocument, TableExtension, TableFileName,
	type Diagnostic, type PluralCategory,
} from "@cse/cstables";
import type { ProjectFileSystem } from "@cse/solution";
import { ParseTsv, type DataGridRow } from "@cse/ui";

/**
 * The table editor's work on one project (S6-17), as Visual Studio's resource editor: the project's tables, the open
 * ones (a tab each), their rows (Name, Value, Comment; a plural key's forms as Key[form]), edits that keep the rest of
 * the file as it was, paste of blocks from a spreadsheet, undo and redo per table, the checks of every table, saving
 * with the code generated again (the "custom tool"), and changes made outside picked up.
 */

export const Columns = ["Name", "Value", "Comment"] as const;
export type Column = typeof Columns[number];

/** Where a project's tables are, and where their code goes (as the build has them). */
export const Resources = "Resources";
export const Generated = "Source/Generated";

/** A row's id: the key, and the plural form when it is one ("Coins[few]"). */
export const RowId = (key: string, form: PluralCategory | null): string => (form === null ? key : `${key}[${form}]`);

function SplitId(id: string): { Key: string; Form: PluralCategory | null; } {
	const match = /^([^[]+)\[([a-z]+)\]$/.exec(id);
	return match ? { Key: match[1]!, Form: match[2] as PluralCategory } : { Key: id, Form: null };
}

/** Raised for what the user asked that can't be done (the editor shows the message). */
export class TableError extends Error {}

/** One open table: its document, what was last read or saved, its undo and redo. */
export class OpenTable {
	public Document: TableDocument;
	/** The text on disk when it was opened or last saved. */
	public Saved: string;
	/** Changed on disk while it had unsaved edits: the editor asks which one wins. */
	public Conflict = false;
	private readonly _undo: string[] = [];
	private readonly _redo: string[] = [];

	public constructor(public readonly Path: string, text: string) {
		this.Document = TableDocument.Parse(text, Path);
		this.Saved = text;
	}

	public get Text(): string { return this.Document.Serialize(); }
	public get Dirty(): boolean { return this.Text !== this.Saved; }
	public get CanUndo(): boolean { return this._undo.length > 0; }
	public get CanRedo(): boolean { return this._redo.length > 0; }
	/** The table and language its name says ("UiNames", "en"). */
	public get Name(): { Table: string; Language: string | null; } { return ParseTableName(this.Path.slice(this.Path.lastIndexOf("/") + 1))!; }

	/** Runs an edit, keeping the text before it for Undo; an edit that changes nothing leaves no step. */
	public Change(edit: (document: TableDocument) => void): void {
		const before = this.Text;
		edit(this.Document);
		if (this.Text === before) return;
		this._undo.push(before);
		this._redo.length = 0;
	}

	public Undo(): void {
		const text = this._undo.pop();
		if (text === undefined) return;
		this._redo.push(this.Text);
		this.Document = TableDocument.Parse(text, this.Path);
	}

	public Redo(): void {
		const text = this._redo.pop();
		if (text === undefined) return;
		this._undo.push(this.Text);
		this.Document = TableDocument.Parse(text, this.Path);
	}

	/** Takes the text on disk (changed outside): the edits are dropped, the history too. */
	public Reload(text: string): void {
		this.Document = TableDocument.Parse(text, this.Path);
		this.Saved = text;
		this.Conflict = false;
		this._undo.length = 0;
		this._redo.length = 0;
	}
}

export interface SessionOptions {
	Files: ProjectFileSystem;
	/** The base language (the tables without a language in their name). */
	BaseLanguage?: string;
}

export class TableSession {
	public readonly Open: OpenTable[] = [];
	public Current: OpenTable | null = null;
	/** Every table of the project (paths from its folder), as last listed. */
	public Tables: string[] = [];
	private readonly _files: ProjectFileSystem;
	private readonly _base: string;
	private readonly _texts = new Map<string, string>();

	public constructor(options: SessionOptions) {
		this._files = options.Files;
		this._base = options.BaseLanguage ?? "ru";
	}

	/** Lists the project's tables again and reads the ones not open (for the checks and the code). */
	public async Refresh(): Promise<void> {
		const entries = await this._files.List();
		this.Tables = entries.filter((entry) => !entry.Folder && entry.Path.toLowerCase().endsWith(TableExtension)).map((entry) => entry.Path).sort();
		this._texts.clear();
		for (const path of this.Tables) {
			const open = this.Find(path);
			if (open) {
				const disk = await this._files.ReadText(path);
				// Changed outside: taken when nothing here would be lost, else the editor asks.
				if (disk !== null && disk !== open.Saved) {
					if (open.Dirty) open.Conflict = true;
					else open.Reload(disk);
				}
				continue;
			}
			this._texts.set(path, (await this._files.ReadText(path)) ?? "");
		}
	}

	public Find(path: string): OpenTable | undefined {
		return this.Open.find((table) => table.Path === path);
	}

	/** Opens a table in a tab of its own (or goes to its tab) and makes it the current one. */
	public async OpenTable(path: string): Promise<OpenTable> {
		let table = this.Find(path);
		if (!table) {
			const text = await this._files.ReadText(path);
			if (text === null) throw new TableError(`There is no ${path}`);
			table = new OpenTable(path, text);
			this.Open.push(table);
		}
		this.Current = table;
		return table;
	}

	/** Closes a tab (the editor asks first when it has unsaved edits); the next one becomes current. */
	public Close(path: string): void {
		const index = this.Open.findIndex((table) => table.Path === path);
		if (index < 0) return;
		// What is on disk counts again for the checks (unsaved edits are dropped).
		this._texts.set(path, this.Open[index]!.Saved);
		this.Open.splice(index, 1);
		if (this.Current?.Path === path) this.Current = this.Open[Math.min(index, this.Open.length - 1)] ?? null;
	}

	//#region rows

	/** The current table's rows: one a key, one a plural form; errors and warnings marked by the checks. */
	public Rows(diagnostics: readonly Diagnostic[] = this.Check()): DataGridRow[] {
		const table = this.Current;
		if (!table) return [];
		const marks = this.Marks(table, diagnostics);
		const savedKeys = new Set(TableDocument.Parse(table.Saved).Entries.map((entry) => `${RowId(entry.Key, entry.Plural)}=${entry.Value}`));
		return table.Document.Entries.map((entry) => {
			const id = RowId(entry.Key, entry.Plural);
			const mark = marks.get(entry.Key);
			return {
				Id: id,
				Cells: { Name: id, Value: entry.Value, Comment: table.Document.Comment(entry.Key) ?? "" },
				...(mark === Severity.Error ? { Error: true } : mark === Severity.Warning ? { Warning: true } : {}),
				...(savedKeys.has(`${id}=${entry.Value}`) ? {} : { Modified: true }),
			};
		});
	}

	/** The worst problem of each key of a table. */
	private Marks(table: OpenTable, diagnostics: readonly Diagnostic[]): Map<string, Severity> {
		const lines = new Map(TableDocument.Parse(table.Text).Entries.map((entry) => [entry.Line, entry.Key]));
		const marks = new Map<string, Severity>();
		for (const diagnostic of diagnostics) {
			if (diagnostic.File !== table.Path) continue;
			const key = lines.get(diagnostic.Line);
			if (key === undefined || marks.get(key) === Severity.Error) continue;
			marks.set(key, diagnostic.Severity);
		}
		return marks;
	}

	/** A cell edited in the grid: a new name (the key renamed, every form), value or comment. */
	public Edit(id: string, column: Column, value: string): void {
		const table = this.Required();
		const { Key, Form } = SplitId(id);
		table.Change((document) => {
			if (column === "Value") document.Set(Key, value, Form);
			else if (column === "Comment") document.SetComment(Key, value === "" ? null : value);
			else {
				const name = SplitId(value.trim()).Key;
				if (name === Key) return;
				if (!IsKey(name)) throw new TableError(`"${name}" is not a key: a letter or _, then letters, digits or _`);
				if (document.Keys.includes(name)) throw new TableError(`There is a key called ${name} already`);
				document.Rename(Key, name);
			}
		});
	}

	/** The last row of the grid edited: a new key with that cell (a name made up when the value came first). */
	public Add(column: Column, value: string): string {
		const table = this.Required();
		const keys = table.Document.Keys;
		const name = column === "Name" ? value.trim() : this.FreeName(keys);
		if (!IsKey(name)) throw new TableError(`"${name}" is not a key: a letter or _, then letters, digits or _`);
		if (keys.includes(name)) throw new TableError(`There is a key called ${name} already`);
		table.Change((document) => {
			document.Set(name, column === "Value" ? value : "");
			if (column === "Comment") document.SetComment(name, value);
		});
		return name;
	}

	/** Del on rows: their keys go (a plural form's row takes the whole key). */
	public Delete(ids: readonly string[]): void {
		const keys = new Set(ids.map((id) => SplitId(id).Key));
		this.Required().Change((document) => {
			for (const key of keys) document.Remove(key);
		});
	}

	/**
	 * A block pasted from a spreadsheet at a cell: its columns go into the grid's from that one on, its rows into the
	 * rows from that one down; rows past the end are new keys (their name from the block, else made up). One step to undo.
	 */
	public Paste(text: string, id: string, column: Column, order: readonly string[]): void {
		const table = this.Required();
		const block = ParseTsv(text);
		const first = Columns.indexOf(column);
		const start = Math.max(0, order.indexOf(id));
		table.Change((document) => {
			for (const [index, cells] of block.entries()) {
				const existing = order[start + index];
				const values: Partial<Record<Column, string>> = {};
				cells.forEach((cell, at) => {
					const target = Columns[first + at];
					if (target) values[target] = cell;
				});
				let key: string;
				let form: PluralCategory | null = null;
				if (existing !== undefined) ({ Key: key, Form: form } = SplitId(existing));
				else {
					key = values.Name !== undefined && IsKey(SplitId(values.Name).Key) && !document.Keys.includes(SplitId(values.Name).Key) ? SplitId(values.Name).Key : this.FreeName(document.Keys);
					document.Set(key, "");
				}
				if (values.Name !== undefined && existing !== undefined) {
					const name = SplitId(values.Name.trim()).Key;
					if (name !== key && IsKey(name) && !document.Keys.includes(name)) {
						document.Rename(key, name);
						key = name;
					}
				}
				if (values.Value !== undefined) document.Set(key, values.Value, form);
				if (values.Comment !== undefined) document.SetComment(key, values.Comment === "" ? null : values.Comment);
			}
		});
	}

	public Undo(): void {
		this.Required().Undo();
	}

	public Redo(): void {
		this.Required().Redo();
	}

	/** The table's access (the Access Modifier of Visual Studio's resource editor). */
	public get Access(): Access {
		return this.Current?.Document.Access ?? Access.Public;
	}

	public SetAccess(access: Access): void {
		if (!Accesses.includes(access)) throw new TableError(`${access} is not an access (${Accesses.join(", ")})`);
		this.Required().Change((document) => document.SetDirective("access", access === Access.Public ? null : access));
	}

	//#endregion

	//#region the project's tables

	/** Every table's text as it is now: the open ones with their edits. */
	public Sources(): { File: string; Text: string; }[] {
		return this.Tables.map((path) => ({ File: path, Text: this.Find(path)?.Text ?? this._texts.get(path)! }))
			.concat(this.Open.filter((table) => !this.Tables.includes(table.Path)).map((table) => ({ File: table.Path, Text: table.Text })));
	}

	/** The checks of every table (duplicates, missing translations, arguments...), as the build does them. */
	public Check(): Diagnostic[] {
		return ReadTables(this.Sources(), this._base).Diagnostics;
	}

	/**
	 * Saves a table (all of them when none is named) and generates the code again (Source/Generated/CSTables*.ts), when
	 * the tables have no errors. Returns the problems found.
	 */
	public async Save(path?: string): Promise<Diagnostic[]> {
		const tables = path === undefined ? this.Open.filter((table) => table.Dirty) : [this.Find(path)!].filter(Boolean);
		for (const table of tables) {
			const text = table.Text;
			await this._files.WriteText(table.Path, text);
			table.Saved = text;
			table.Conflict = false;
		}
		const read = ReadTables(this.Sources(), this._base);
		if (read.Diagnostics.some((d) => d.Severity === Severity.Error) || read.Groups.length === 0) return read.Diagnostics;
		const compiled = Compile(read);
		for (const [name, text] of Object.entries(GenerateTypeScript(compiled, ShortKeys(compiled)).Files)) {
			const file = `${Generated}/${name}`;
			if ((await this._files.ReadText(file)) !== text) await this._files.WriteText(file, text);
		}
		return read.Diagnostics;
	}

	/** A new table in Resources (the base language): its file, empty. */
	public async NewTable(name: string, folder = Resources): Promise<string> {
		if (!IsKey(name)) throw new TableError(`"${name}" is not a table name: a letter or _, then letters, digits or _`);
		return this.NewFile(`${folder}/${TableFileName(name, null)}`);
	}

	/** A new language of a table: a file next to its base one. */
	public async NewLanguage(table: string, language: string): Promise<string> {
		const base = this.Tables.find((path) => { const name = ParseTableName(path.slice(path.lastIndexOf("/") + 1)); return name?.Table === table && name.Language === null; });
		if (!base) throw new TableError(`There is no table ${table}`);
		if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language)) throw new TableError(`"${language}" is not a language code ("en", "pt-BR"...)`);
		return this.NewFile(`${base.slice(0, base.lastIndexOf("/") + 1)}${TableFileName(table, language)}`);
	}

	/** The tables of the project, by table then language (the base one first): what the file panel groups. */
	public Groups(): { Table: string; Files: { Path: string; Language: string | null; }[]; }[] {
		const groups = new Map<string, { Path: string; Language: string | null; }[]>();
		for (const path of this.Tables) {
			const name = ParseTableName(path.slice(path.lastIndexOf("/") + 1))!;
			groups.set(name.Table, [...(groups.get(name.Table) ?? []), { Path: path, Language: name.Language }]);
		}
		return [...groups].map(([Table, Files]) => ({ Table, Files: Files.sort((a, b) => (a.Language ?? "").localeCompare(b.Language ?? "")) }));
	}

	//#endregion

	private async NewFile(path: string): Promise<string> {
		if (this.Tables.includes(path) || (await this._files.ReadText(path)) !== null) throw new TableError(`${path} exists already`);
		await this._files.WriteText(path, "");
		await this.Refresh();
		return path;
	}

	private Required(): OpenTable {
		if (!this.Current) throw new TableError("No table is open");
		return this.Current;
	}

	private FreeName(keys: readonly string[]): string {
		for (let n = 1; ; n++) if (!keys.includes(`Key${n}`)) return `Key${n}`;
	}
}

/** The plural forms there are (for the editor's "add a form" menu). */
export const Forms: readonly PluralCategory[] = PluralCategories;
