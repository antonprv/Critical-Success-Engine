// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { CopyName, type FileEntry, type ProjectFileSystem } from "./FileSystem";
import { IsWithin, Join, NameOf, NameProblem, ParentOf, Rebase } from "./Paths";
import { DefaultSolution, MainProjectId, ParseSolution, SerializeSolution, ViewMode, type PlaceRef, type SolutionData } from "./SolutionFile";
import { AncestorsOf, BuildTree, FileId, FindNode, FolderId, NaturalPlace, NodeKind, type SolutionNode } from "./Tree";

/** What a tool tells the solution about its files besides the disk (see TreeInput). */
export interface SolutionDescription {
	Expected?: string[];
	Nesting?: Record<string, string>;
}

export interface SolutionOptions {
	Files: ProjectFileSystem;
	/** The .uisolution, as a path inside the project ("Game.uisolution"). */
	SolutionPath: string;
	/** The project's name: the main visual project of a new .uisolution. */
	ProjectName: string;
	/** The name of the project's folder: the root of Folder View. */
	FolderName: string;
	/** The files the tool's manifests list, and which files nest under which; asked again on every refresh. */
	Describe?: (entries: readonly FileEntry[], files: ProjectFileSystem) => Promise<SolutionDescription>;
}

/** A step on the disk and the step that takes it back. */
interface DiskStep {
	Do: () => Promise<void>;
	Undo: () => Promise<void>;
}

interface HistoryEntry {
	Label: string;
	Steps: DiskStep[];
	Before: SolutionData;
	After: SolutionData;
}

const Clone = (data: SolutionData): SolutionData => structuredClone(data);

/** Raised for what the user asked that can't be done (the tools show the message as it is). */
export class SolutionError extends Error {}

/**
 * Solution Explorer's model of one project: the files on disk and the .uisolution, the tree of each mode, and the
 * operations of both (as Visual Studio does them):
 *
 * - **Folder View** (`ViewMode.Files`) works on the disk: a new folder, a rename, a move, a copy or a delete is a real one.
 * - **Solution view** (`ViewMode.Solution`) works on the presentation: new folders are virtual ones (a real one when
 *   asked for, inside a project bound to a folder), moving changes only where an item is shown, items can be hidden;
 *   renaming or deleting a file is still a real one.
 *
 * Every change but a delete on disk can be undone; the .uisolution is written after each one. Changes made outside
 * (another program) come in through the file system's watcher: what disappeared and is still known (a manifest lists
 * it, the solution placed it) shows as missing instead of vanishing.
 */
export class SolutionModel {
	private _data: SolutionData;
	private _entries: FileEntry[] = [];
	private _description: SolutionDescription = {};
	private _written: string | null = null;
	private _trees: Partial<Record<ViewMode, SolutionNode>> = {};
	private readonly _undo: HistoryEntry[] = [];
	private readonly _redo: HistoryEntry[] = [];
	private readonly _listeners = new Set<() => void>();
	private _queue: Promise<unknown> = Promise.resolve();
	private readonly _unwatch: () => void;

	private constructor(private readonly _options: SolutionOptions, data: SolutionData) {
		this._data = data;
		this._unwatch = _options.Files.Watch(() => void this.Refresh().catch(() => { /* the next change refreshes again */ }));
	}

	/** Opens the project's solution (a project without a .uisolution gets the default one, written on the first change). */
	public static async Open(options: SolutionOptions): Promise<SolutionModel> {
		const text = await options.Files.ReadText(options.SolutionPath);
		const model = new SolutionModel(options, text === null ? DefaultSolution(options.ProjectName) : ParseSolution(text, options.ProjectName));
		model._written = text;
		await model.Refresh();
		return model;
	}

	public get Data(): Readonly<SolutionData> { return this._data; }
	public get Entries(): readonly FileEntry[] { return this._entries; }
	public get Mode(): ViewMode { return this._data.Mode; }
	public get CanUndo(): boolean { return this._undo.length > 0; }
	public get CanRedo(): boolean { return this._redo.length > 0; }
	/** What Undo and Redo would take back or do again ("Rename", "New Folder"...). */
	public get UndoLabel(): string | null { return this._undo.at(-1)?.Label ?? null; }
	public get RedoLabel(): string | null { return this._redo.at(-1)?.Label ?? null; }

	/** The tree of the current mode. */
	public get Tree(): SolutionNode {
		return this.TreeOf(this._data.Mode);
	}

	public TreeOf(mode: ViewMode): SolutionNode {
		return this._trees[mode] ??= BuildTree({ Data: this._data, Entries: this._entries, FolderName: this._options.FolderName, ...this._description }, mode);
	}

	/** Calls `listener` after every change of the tree or the solution; returns the way to stop. */
	public OnChanged(listener: () => void): () => void {
		this._listeners.add(listener);
		return () => this._listeners.delete(listener);
	}

	/** Stops watching the disk. */
	public Dispose(): void {
		this._unwatch();
		this._listeners.clear();
	}

	/** Lists the disk again, takes in a .uisolution changed outside, asks the tool for its files. */
	public Refresh(): Promise<void> {
		return this.Run(async () => {
			await this.Reload();
			this.Changed();
		});
	}

	//#region the presentation (no undo, as in Visual Studio)

	public SetMode(mode: ViewMode): Promise<void> {
		return this.Run(() => this.Keep((data) => { data.Mode = mode; }));
	}

	public SetShowHidden(show: boolean): Promise<void> {
		return this.Run(() => this.Keep((data) => { data.ShowHidden = show; }));
	}

	/** Remembers a node of the current mode as expanded or collapsed. */
	public SetExpanded(id: string, expanded: boolean): Promise<void> {
		return this.Run(() => this.Keep((data) => {
			const list = data.Expanded[data.Mode];
			const index = list.indexOf(id);
			if (expanded && index < 0) list.push(id);
			if (!expanded && index >= 0) list.splice(index, 1);
		}));
	}

	/** "Collapse All": only the top level stays open. */
	public CollapseAll(): Promise<void> {
		return this.Run(() => this.Keep((data) => { data.Expanded[data.Mode] = data.Mode === ViewMode.Solution ? [`p:${MainProjectId}`] : []; }));
	}

	/**
	 * The node of a real file or folder in the current mode, its ancestors expanded (the tools' "Sync with Active
	 * Document"); null when the mode doesn't show it (hidden, or not there).
	 */
	public Reveal(path: string): Promise<string | null> {
		return this.Run(async () => {
			const tree = this.Tree;
			const id = FindNode(tree, FileId(path)) ? FileId(path) : FindNode(tree, FolderId(path)) ? FolderId(path) : null;
			if (id === null) return null;
			await this.Keep((data) => {
				const list = data.Expanded[data.Mode];
				for (const ancestor of AncestorsOf(tree, id)!) if (!list.includes(ancestor)) list.push(ancestor);
			});
			return id;
		});
	}

	//#endregion

	//#region operations

	/**
	 * "New Folder": in Folder View, a real folder; in the solution view, a virtual one ("New Solution Folder"), or a
	 * real one with `real` (inside a project bound to a folder, or a real folder). Returns the new node's id.
	 */
	public CreateFolder(parentId: string, name: string, real = this._data.Mode === ViewMode.Files): Promise<string> {
		return this.Run(async () => {
			const parent = this.Container(parentId);
			if (real) {
				const folder = this.RealFolderOf(parent);
				if (folder === null) throw new SolutionError(`${parent.Label} is not a folder on disk`);
				const path = this.FreePath(folder, name);
				await this.Transact("New Folder", [{ Do: () => this._options.Files.CreateFolder(path), Undo: () => this._options.Files.Delete(path) }]);
				return FolderId(path);
			}
			if (name.trim() === "") throw new SolutionError("A name can't be empty");
			const id = this.NewId("folder", this._data.VirtualFolders.map((f) => f.Id));
			await this.Transact("New Solution Folder", [], (data) => { data.VirtualFolders.push({ Id: id, Name: name.trim(), Parent: parent.Id as PlaceRef }); });
			return `v:${id}`;
		});
	}

	/** A visual project (a sub-project when `parentId` is a project), optionally bound to a real folder. Returns its id. */
	public CreateProject(name: string, parentId = "s", folder: string | null = null): Promise<string> {
		return this.Run(async () => {
			if (this._data.Mode !== ViewMode.Solution) throw new SolutionError("Projects are made in the solution view");
			const parent = this.Container(parentId);
			if (parent.Kind === NodeKind.Folder || name.trim() === "") throw new SolutionError(name.trim() === "" ? "A name can't be empty" : "A project goes under the solution, a project or a virtual folder");
			if (folder !== null && (folder === "" || !this._entries.some((entry) => entry.Folder && entry.Path === folder))) throw new SolutionError(`There is no folder ${folder} to bind the project to`);
			if (folder !== null && this._data.Projects.some((project) => project.Folder === folder)) throw new SolutionError(`${folder} belongs to a project already`);
			const id = this.NewId("project", this._data.Projects.map((p) => p.Id));
			await this.Transact("New Project", [], (data) => { data.Projects.push({ Id: id, Name: name.trim(), Folder: folder, Parent: parent.Id as PlaceRef }); });
			return `p:${id}`;
		});
	}

	/** F2. A file or folder is renamed on disk (in both modes); a project, a virtual folder or the solution in the .uisolution. */
	public Rename(id: string, name: string): Promise<string> {
		return this.Run(async () => {
			const node = this.Node(id);
			if (node.Path === null) {
				if (name.trim() === "") throw new SolutionError("A name can't be empty");
				await this.Transact("Rename", [], (data) => {
					const projectId = node.Kind === NodeKind.Solution ? MainProjectId : id.slice(2);
					const named = node.Kind === NodeKind.VirtualFolder ? data.VirtualFolders.find((f) => f.Id === projectId) : data.Projects.find((p) => p.Id === projectId);
					named!.Name = name.trim();
				});
				return id;
			}
			if (node.Missing) throw new SolutionError(`${node.Label} is not on disk`);
			const from = node.Path;
			if (from === "") throw new SolutionError("The project's folder can't be renamed here");
			const to = this.FreePath(ParentOf(from), name, from);
			if (to === from) return id;
			await this.Transact("Rename", [this.MoveStep(from, to)], (data) => Retarget(data, from, to));
			return node.Kind === NodeKind.File ? FileId(to) : FolderId(to);
		});
	}

	/**
	 * Drag and drop. In Folder View it moves the files on disk into the target's folder; in the solution view it only
	 * changes where items are shown (a project's or virtual folder's place, an item's placement).
	 */
	public Move(ids: readonly string[], targetId: string): Promise<void> {
		return this.Run(async () => {
			const target = this.Container(targetId);
			const tree = this.Tree;
			const above = new Set([target.Id, ...AncestorsOf(tree, target.Id)!]);
			const nodes = ids.map((id) => this.Node(id));
			for (const node of nodes) {
				if (node.Kind === NodeKind.Solution || node.Id === `p:${MainProjectId}` || node.Path === "") throw new SolutionError(`${node.Label} can't be moved`);
				if (above.has(node.Id)) throw new SolutionError(`${node.Label} can't go into itself`);
				if (node.Kind === NodeKind.Project && target.Kind === NodeKind.Folder) throw new SolutionError("A project goes under the solution, a project or a virtual folder");
			}
			if (this._data.Mode === ViewMode.Files) {
				const moves = nodes.filter((node) => ParentOf(node.Path!) !== target.Path).map((node) => [node.Path!, this.FreePath(target.Path!, NameOf(node.Path!))] as const);
				await this.Transact("Move", moves.map(([from, to]) => this.MoveStep(from, to)), (data) => { for (const [from, to] of moves) Retarget(data, from, to); });
				return;
			}
			await this.Transact("Move", [], (data) => {
				for (const node of nodes) {
					const place = target.Id as PlaceRef;
					if (node.Kind === NodeKind.Project) data.Projects.find((p) => `p:${p.Id}` === node.Id)!.Parent = place;
					else if (node.Kind === NodeKind.VirtualFolder) data.VirtualFolders.find((f) => `v:${f.Id}` === node.Id)!.Parent = place;
					else if (NaturalPlace(data, node.Path!) === place) delete data.Placements[node.Path!];
					else data.Placements[node.Path!] = place;
				}
			});
		});
	}

	/**
	 * Copy and paste of files and folders: copies on disk into the target's folder ("Name - Copy" when the name is
	 * taken). Pasted into a place with no folder (a virtual folder), the copy goes next to the original and is shown there.
	 */
	public Copy(ids: readonly string[], targetId: string): Promise<string[]> {
		return this.Run(async () => {
			const target = this.Container(targetId);
			const folder = this.RealFolderOf(target);
			const nodes = ids.map((id) => this.Node(id));
			const taken = new Set(this._entries.map((entry) => entry.Path.toLowerCase()));
			const copies: [from: string, to: string, folder: boolean][] = [];
			for (const node of nodes) {
				if (node.Path === null || node.Path === "" || node.Missing) throw new SolutionError(`${node.Label} can't be copied`);
				const into = folder ?? ParentOf(node.Path);
				if (node.Kind === NodeKind.Folder && IsWithin(into, node.Path)) throw new SolutionError(`${node.Label} can't go into itself`);
				const to = Join(into, CopyName(NameOf(node.Path), (name) => taken.has(Join(into, name).toLowerCase())));
				const plain = Join(into, NameOf(node.Path));
				const path = taken.has(plain.toLowerCase()) ? to : plain;
				taken.add(path.toLowerCase());
				copies.push([node.Path, path, node.Kind === NodeKind.Folder]);
			}
			const steps = copies.map(([from, to]): DiskStep => ({ Do: () => this._options.Files.Copy(from, to), Undo: () => this._options.Files.Delete(to) }));
			await this.Transact("Copy", steps, (data) => {
				if (folder === null) for (const [, to] of copies) data.Placements[to] = target.Id as PlaceRef;
			});
			return copies.map(([, to, isFolder]) => (isFolder ? FolderId(to) : FileId(to)));
		});
	}

	/**
	 * Del. Files and folders are deleted on disk (the tool asks first; it can't be undone, so the history is cleared);
	 * a virtual folder or a project is removed from the solution and what was in it moves up a level.
	 */
	public Delete(ids: readonly string[]): Promise<void> {
		return this.Run(async () => {
			const nodes = ids.map((id) => this.Node(id));
			for (const node of nodes) {
				if (node.Kind === NodeKind.Solution || node.Id === `p:${MainProjectId}` || node.Path === "") throw new SolutionError(`${node.Label} can't be deleted`);
			}
			const real = nodes.filter((node) => node.Path !== null && !node.Missing).map((node) => node.Path!);
			const before = Clone(this._data);
			for (const path of real) await this._options.Files.Delete(path);
			const data = this._data;
			for (const node of nodes) {
				if (node.Path !== null) Forget(data, node.Path);
				else Dissolve(data, node.Id as PlaceRef);
			}
			if (real.length > 0) {
				this._undo.length = 0;
				this._redo.length = 0;
			} else this.Remember({ Label: "Delete", Steps: [], Before: before, After: Clone(data) });
			await this.Save();
			await this.Reload();
			this.Changed();
		});
	}

	/** Hides files and folders in the solution view (Visual Studio's "Exclude From Project", but nothing is lost). */
	public Hide(ids: readonly string[]): Promise<void> {
		return this.Run(async () => {
			const paths = ids.map((id) => this.RealPath(id));
			await this.Transact("Hide", [], (data) => { for (const path of paths) if (!data.Hidden.includes(path)) data.Hidden.push(path); });
		});
	}

	/** Shows again what Hide hid (the hidden names of HiddenPatterns stay hidden). */
	public Unhide(ids: readonly string[]): Promise<void> {
		return this.Run(async () => {
			const paths = new Set(ids.map((id) => this.RealPath(id)));
			await this.Transact("Unhide", [], (data) => { data.Hidden = data.Hidden.filter((path) => !paths.has(path)); });
		});
	}

	public Undo(): Promise<void> {
		return this.Run(async () => {
			const entry = this._undo.pop();
			if (!entry) return;
			for (const step of [...entry.Steps].reverse()) await step.Undo();
			this._data = Clone(entry.Before);
			this._redo.push(entry);
			await this.Settle();
		});
	}

	public Redo(): Promise<void> {
		return this.Run(async () => {
			const entry = this._redo.pop();
			if (!entry) return;
			for (const step of entry.Steps) await step.Do();
			this._data = Clone(entry.After);
			this._undo.push(entry);
			await this.Settle();
		});
	}

	//#endregion

	/** Runs the steps on disk (taking back the ones done when one fails), changes the .uisolution, remembers it for Undo. */
	private async Transact(label: string, steps: DiskStep[], change?: (data: SolutionData) => void): Promise<void> {
		const before = Clone(this._data);
		const done: DiskStep[] = [];
		try {
			for (const step of steps) {
				await step.Do();
				done.push(step);
			}
		} catch (error) {
			for (const step of done.reverse()) await step.Undo().catch(() => { /* the first error is the one to report */ });
			await this.Reload();
			this.Changed();
			throw error;
		}
		change?.(this._data);
		this.Remember({ Label: label, Steps: steps, Before: before, After: Clone(this._data) });
		await this.Settle();
	}

	private Remember(entry: HistoryEntry): void {
		this._undo.push(entry);
		this._redo.length = 0;
	}

	/** After a change: write the .uisolution, list the disk, tell the listeners. */
	private async Settle(): Promise<void> {
		await this.Save();
		await this.Reload();
		this.Changed();
	}

	/** A change of the presentation: written, shown, not in the history. */
	private async Keep(change: (data: SolutionData) => void): Promise<void> {
		change(this._data);
		await this.Save();
		this.Changed();
	}

	private async Save(): Promise<void> {
		const text = SerializeSolution(this._data);
		if (text === this._written) return;
		await this._options.Files.WriteText(this._options.SolutionPath, text);
		this._written = text;
	}

	private async Reload(): Promise<void> {
		const files = this._options.Files;
		this._entries = await files.List();
		const text = await files.ReadText(this._options.SolutionPath);
		// Changed by hand or by another tool: theirs wins; one that doesn't parse is ignored until it's fixed.
		if (text !== null && text !== this._written) {
			try {
				this._data = ParseSolution(text, this._options.ProjectName);
				this._written = text;
			} catch { /* keep ours */ }
		}
		this._description = (await this._options.Describe?.(this._entries, files)) ?? {};
		this._trees = {};
	}

	private Changed(): void {
		this._trees = {};
		for (const listener of this._listeners) listener();
	}

	/** One operation at a time: each waits for the one before, whatever happened to it. */
	private Run<T>(work: () => Promise<T>): Promise<T> {
		const result = this._queue.then(work, work);
		this._queue = result.catch(() => undefined);
		return result;
	}

	private Node(id: string): SolutionNode {
		const node = FindNode(this.Tree, id);
		if (!node) throw new SolutionError(`There is no ${id} in the tree`);
		return node;
	}

	/** Where things dropped on the node go: the node, or the folder of a file. */
	private Container(id: string): SolutionNode {
		const node = this.Node(id);
		if (node.Kind !== NodeKind.File) return node;
		const tree = this.Tree;
		const ancestors = AncestorsOf(tree, id)!;
		// A nested file's parent is a file too: up to the first that isn't.
		for (let index = ancestors.length - 1; ; index--) {
			const parent = FindNode(tree, ancestors[index]!)!;
			if (parent.Kind !== NodeKind.File) return parent;
		}
	}

	/** The real folder a place stands for: a folder, or a project bound to one (null: a virtual place). */
	private RealFolderOf(node: SolutionNode): string | null {
		if (node.Kind === NodeKind.Folder) return node.Path;
		if (node.Kind === NodeKind.Project) return this._data.Projects.find((project) => `p:${project.Id}` === node.Id)!.Folder;
		return null;
	}

	private RealPath(id: string): string {
		const node = this.Node(id);
		if (node.Path === null || node.Path === "") throw new SolutionError(`${node.Label} is not a file or a folder`);
		return node.Path;
	}

	/** `name` in `folder`, if it is a good name and not taken there (`self`: the item being renamed, which may change case). */
	private FreePath(folder: string, name: string, self?: string): string {
		const problem = NameProblem(name);
		if (problem) throw new SolutionError(problem);
		const path = Join(folder, name);
		const lower = path.toLowerCase();
		if (path !== self && this._entries.some((entry) => entry.Path.toLowerCase() === lower && entry.Path !== self)) throw new SolutionError(`${name} exists already`);
		return path;
	}

	private MoveStep(from: string, to: string): DiskStep {
		return { Do: () => this._options.Files.Move(from, to), Undo: () => this._options.Files.Move(to, from) };
	}

	private NewId(stem: string, taken: string[]): string {
		for (let n = 1; ; n++) if (!taken.includes(`${stem}${n}`)) return `${stem}${n}`;
	}
}

/** Everything in the .uisolution that names `from` (or something inside it) names `to` instead. */
function Retarget(data: SolutionData, from: string, to: string): void {
	const place = (ref: PlaceRef): PlaceRef => (ref.startsWith("d:") ? `d:${Rebase(ref.slice(2), from, to)}` : ref);
	const id = (value: string): string => (value.startsWith("d:") || value.startsWith("f:") ? `${value.slice(0, 2)}${Rebase(value.slice(2), from, to)}` : value);
	data.Placements = Object.fromEntries(Object.entries(data.Placements).map(([path, ref]) => [Rebase(path, from, to), place(ref)]));
	data.Hidden = data.Hidden.map((path) => Rebase(path, from, to));
	for (const project of data.Projects) {
		if (project.Folder !== null && project.Folder !== "") project.Folder = Rebase(project.Folder, from, to);
		project.Parent = place(project.Parent);
	}
	for (const folder of data.VirtualFolders) folder.Parent = place(folder.Parent);
	data.Expanded[ViewMode.Files] = data.Expanded[ViewMode.Files].map(id);
	data.Expanded[ViewMode.Solution] = data.Expanded[ViewMode.Solution].map(id);
}

/** A deleted file or folder: nothing in the .uisolution keeps it (a sub-project bound to it stays, empty). */
function Forget(data: SolutionData, path: string): void {
	data.Placements = Object.fromEntries(Object.entries(data.Placements).filter(([placed, ref]) => !IsWithin(placed, path) && !(ref.startsWith("d:") && IsWithin(ref.slice(2), path))));
	data.Hidden = data.Hidden.filter((hidden) => !IsWithin(hidden, path));
}

/** A removed virtual folder or project: what was in it goes to its parent; a project's own files go back to the main project. */
function Dissolve(data: SolutionData, place: PlaceRef): void {
	const virtual = data.VirtualFolders.find((folder) => `v:${folder.Id}` === place);
	const project = data.Projects.find((p) => `p:${p.Id}` === place);
	const up = (virtual ?? project)!.Parent;
	data.VirtualFolders = data.VirtualFolders.filter((folder) => folder !== virtual);
	data.Projects = data.Projects.filter((p) => p !== project);
	for (const folder of data.VirtualFolders) if (folder.Parent === place) folder.Parent = up;
	for (const p of data.Projects) if (p.Parent === place) p.Parent = up;
	for (const [path, ref] of Object.entries(data.Placements)) {
		if (ref !== place) continue;
		if (NaturalPlace(data, path) === up) delete data.Placements[path];
		else data.Placements[path] = up;
	}
}
