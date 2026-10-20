// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { FileEntry } from "./FileSystem";
import { CompareNames, IsWithin, MatchesPattern, NameOf, ParentOf } from "./Paths";
import { MainProjectId, ViewMode, type SolutionData, type VisualProject } from "./SolutionFile";

export const enum NodeKind {
	Solution = "Solution",
	Project = "Project",
	Folder = "Folder",
	VirtualFolder = "VirtualFolder",
	File = "File",
}

/**
 * A node of the tree Solution Explorer shows. Ids: `s` the solution, `p:<id>` a visual project, `v:<id>` a virtual
 * folder, `d:<path>` a real folder (`d:` the project's folder in Folder View), `f:<path>` a file. A real item has the
 * same id in both modes.
 */
export interface SolutionNode {
	Id: string;
	Label: string;
	Kind: NodeKind;
	/** The real path of a folder or a file; null for the solution, projects and virtual folders. */
	Path: string | null;
	/** Hidden in the solution view, shown because ShowHidden is on. */
	Hidden: boolean;
	/** Known (a manifest lists it, or the solution placed it) but not on disk. */
	Missing: boolean;
	/** Shown under the file it depends on (generated code under its UI document). */
	Nested: boolean;
	Children: SolutionNode[];
}

/** What the tree is built from besides the .uisolution. */
export interface TreeInput {
	Data: SolutionData;
	Entries: readonly FileEntry[];
	/** The name of the project's folder (the root of Folder View). */
	FolderName: string;
	/** Files the project's manifests list: shown, as missing, when they aren't on disk. */
	Expected?: readonly string[];
	/** Dependent files: child path → the path of the file it is shown under. */
	Nesting?: Readonly<Record<string, string>>;
}

const KindOrder: Record<NodeKind, number> = { [NodeKind.Solution]: 0, [NodeKind.Project]: 1, [NodeKind.VirtualFolder]: 2, [NodeKind.Folder]: 3, [NodeKind.File]: 4 };

function Node(id: string, label: string, kind: NodeKind, path: string | null): SolutionNode {
	return { Id: id, Label: label, Kind: kind, Path: path, Hidden: false, Missing: false, Nested: false, Children: [] };
}

/** Folders before files (projects, then virtual folders, then real folders), then by name as Explorer sorts. */
function Sort(node: SolutionNode): void {
	node.Children.sort((a, b) => KindOrder[a.Kind] - KindOrder[b.Kind] || CompareNames(a.Label, b.Label));
	for (const child of node.Children) Sort(child);
}

export const FileId = (path: string): string => `f:${path}`;
export const FolderId = (path: string): string => `d:${path}`;

/** Every real item, known items that are missing (files only: a missing parent folder is made for them), by path. */
function RealItems(input: TreeInput, extra: readonly string[]): Map<string, SolutionNode> {
	const items = new Map<string, SolutionNode>();
	for (const entry of input.Entries) {
		items.set(entry.Path, entry.Folder ? Node(FolderId(entry.Path), NameOf(entry.Path), NodeKind.Folder, entry.Path) : Node(FileId(entry.Path), NameOf(entry.Path), NodeKind.File, entry.Path));
	}
	for (const path of [...(input.Expected ?? []), ...extra]) {
		if (items.has(path) || path === "") continue;
		const missing = Node(FileId(path), NameOf(path), NodeKind.File, path);
		missing.Missing = true;
		items.set(path, missing);
		for (let folder = ParentOf(path); folder !== "" && !items.has(folder); folder = ParentOf(folder)) {
			const node = Node(FolderId(folder), NameOf(folder), NodeKind.Folder, folder);
			node.Missing = true;
			items.set(folder, node);
		}
	}
	return items;
}

/** Puts nested files under the file they depend on, when both are in the tree; returns the nested ones' paths. */
function NestedPaths(input: TreeInput, items: Map<string, SolutionNode>): Map<string, string> {
	const nested = new Map<string, string>();
	for (const [child, parent] of Object.entries(input.Nesting ?? {})) {
		const parentNode = items.get(parent);
		if (child === parent || !items.has(child) || parentNode?.Kind !== NodeKind.File || items.get(child)!.Kind !== NodeKind.File) continue;
		nested.set(child, parent);
	}
	// A chain (a → b → a) would hang off nothing: such files stay where they are.
	for (const child of [...nested.keys()]) {
		const seen = new Set<string>([child]);
		for (let at = nested.get(child); at !== undefined; at = nested.get(at)) {
			if (seen.has(at)) {
				nested.delete(child);
				break;
			}
			seen.add(at);
		}
	}
	return nested;
}

/** Builds the children lists from the parent of every node (each one a node, every chain ending at the root). */
function Assemble(root: SolutionNode, nodes: Map<string, SolutionNode>, parents: Map<string, string>): void {
	for (const [id, parent] of parents) nodes.get(parent)!.Children.push(nodes.get(id)!);
	Sort(root);
}

/** Folder View: the project's folder as it is on disk (with the files known but missing, and nested files). */
export function BuildFilesTree(input: TreeInput): SolutionNode {
	const root = Node(FolderId(""), input.FolderName, NodeKind.Folder, "");
	const items = RealItems(input, []);
	const nested = NestedPaths(input, items);
	const nodes = new Map<string, SolutionNode>([[root.Id, root]]);
	const parents = new Map<string, string>();
	for (const [path, node] of items) {
		nodes.set(node.Id, node);
		const over = nested.get(path);
		node.Nested = over !== undefined;
		parents.set(node.Id, over !== undefined ? FileId(over) : FolderId(ParentOf(path)));
	}
	Assemble(root, nodes, parents);
	return root;
}

/** Whether the solution view hides the path: by itself, by its name, or by a hidden folder above it. */
export function IsHidden(data: SolutionData, path: string): boolean {
	if (data.Hidden.some((hidden) => IsWithin(path, hidden) && hidden !== "")) return true;
	for (let at = path; at !== ""; at = ParentOf(at)) {
		const name = NameOf(at);
		if (data.HiddenPatterns.some((pattern) => MatchesPattern(name, pattern))) return true;
	}
	return false;
}

/** The project a real path belongs to: the one bound to the deepest folder above it (the main project holds "" ). */
export function OwnerOf(projects: readonly VisualProject[], path: string): VisualProject | null {
	let owner: VisualProject | null = null;
	for (const project of projects) {
		if (project.Folder === null || path === project.Folder || !IsWithin(path, project.Folder)) continue;
		if (owner === null || project.Folder.length > owner.Folder!.length) owner = project;
	}
	return owner;
}

/** The solution's label, as Visual Studio writes it. */
export function SolutionLabel(data: SolutionData): string {
	const main = data.Projects.find((project) => project.Id === MainProjectId)!;
	const count = data.Projects.length;
	return `Solution '${main.Name}' (${count} ${count === 1 ? "project" : "projects"})`;
}

/**
 * The solution view: the solution, its visual projects (each showing its bound folder), virtual folders, items where
 * the user moved them, without hidden ones (or greyed with ShowHidden). With a fresh .uisolution it is the project's
 * folder under one project node - the same as Folder View, less the hidden project files.
 */
export function BuildSolutionTree(input: TreeInput): SolutionNode {
	const { Data: data } = input;
	const root = Node("s", SolutionLabel(data), NodeKind.Solution, null);
	const nodes = new Map<string, SolutionNode>([[root.Id, root]]);
	const parents = new Map<string, string>();
	const projectFolders = new Set(data.Projects.flatMap((project) => (project.Folder === null || project.Folder === "" ? [] : [project.Folder])));
	for (const project of data.Projects) {
		nodes.set(`p:${project.Id}`, Node(`p:${project.Id}`, project.Name, NodeKind.Project, null));
		parents.set(`p:${project.Id}`, project.Id === MainProjectId ? root.Id : project.Parent);
	}
	for (const folder of data.VirtualFolders) {
		nodes.set(`v:${folder.Id}`, Node(`v:${folder.Id}`, folder.Name, NodeKind.VirtualFolder, null));
		parents.set(`v:${folder.Id}`, folder.Parent);
	}
	const items = RealItems(input, Object.keys(data.Placements));
	const nested = NestedPaths(input, items);
	for (const [path, node] of items) {
		// A sub-project's folder is the sub-project's node itself.
		if (projectFolders.has(path)) continue;
		const hidden = IsHidden(data, path);
		if (hidden && !data.ShowHidden) continue;
		node.Hidden = hidden;
		nodes.set(node.Id, node);
		const over = nested.get(path);
		node.Nested = over !== undefined;
		const natural = NaturalParent(input, path, over, root.Id);
		const placed = data.Placements[path];
		parents.set(node.Id, placed !== undefined && over === undefined ? placed : natural);
	}
	// A place that isn't there (a deleted virtual folder, a folder gone from disk, the hidden file a file nests under):
	// what was in it falls back to where it would be anyway; projects and virtual folders, to the solution.
	for (const [id, parent] of parents) {
		if (nodes.has(parent)) continue;
		const node = nodes.get(id)!;
		node.Nested = false;
		parents.set(id, node.Path === null ? root.Id : NaturalParent(input, node.Path, undefined, root.Id));
	}
	// Placements that would make a loop (a folder moved into itself): back where they belong. Every parent is a node now.
	const reaches = (id: string): boolean => {
		const seen = new Set<string>();
		for (let at = id; at !== root.Id; at = parents.get(at)!) {
			if (seen.has(at)) return false;
			seen.add(at);
		}
		return true;
	};
	// Projects and virtual folders first (in a loop of their own: to the solution), so real items can fall back to them.
	for (const real of [false, true]) {
		for (const [id] of parents) {
			const path = nodes.get(id)!.Path;
			if ((path !== null) !== real || reaches(id)) continue;
			parents.set(id, path === null ? root.Id : NaturalParent(input, path, undefined, root.Id));
		}
	}
	Assemble(root, nodes, parents);
	return root;
}

function NaturalParent(input: TreeInput, path: string, over: string | undefined, rootId: string): string {
	return over !== undefined ? FileId(over) : NaturalPlace(input.Data, path) ?? rootId;
}

/**
 * Where a real item is in the solution view when nobody moved it: its project, or its folder inside it. What no
 * project holds keeps its folders right under the solution (null: the solution itself).
 */
export function NaturalPlace(data: SolutionData, path: string): string | null {
	const owner = OwnerOf(data.Projects, path);
	const folder = ParentOf(path);
	if (owner === null) return folder === "" ? null : FolderId(folder);
	return folder === owner.Folder ? `p:${owner.Id}` : FolderId(folder);
}

export function BuildTree(input: TreeInput, mode: ViewMode): SolutionNode {
	return mode === ViewMode.Files ? BuildFilesTree(input) : BuildSolutionTree(input);
}

/** Every node of a tree, depth first. */
export function* Walk(node: SolutionNode): Generator<SolutionNode> {
	yield node;
	for (const child of node.Children) yield* Walk(child);
}

/** A node by id (null: not in the tree). */
export function FindNode(tree: SolutionNode, id: string): SolutionNode | null {
	for (const node of Walk(tree)) if (node.Id === id) return node;
	return null;
}

/** The ids from the root down to the node, the node excluded (null: not in the tree). */
export function AncestorsOf(tree: SolutionNode, id: string): string[] | null {
	if (tree.Id === id) return [];
	for (const child of tree.Children) {
		const below = AncestorsOf(child, id);
		if (below) return [tree.Id, ...below];
	}
	return null;
}

/**
 * The tree cut down to the nodes whose name holds `text` (case-insensitive), with their ancestors (the search box of
 * Solution Explorer); null when nothing matches. An empty text keeps everything.
 */
export function FilterTree(tree: SolutionNode, text: string): SolutionNode | null {
	const needle = text.trim().toLowerCase();
	if (needle === "") return tree;
	const keep = (node: SolutionNode): SolutionNode | null => {
		const children = node.Children.map(keep).filter((child): child is SolutionNode => child !== null);
		if (children.length === 0 && !node.Label.toLowerCase().includes(needle)) return null;
		return { ...node, Children: children };
	};
	return keep(tree) ?? null;
}
