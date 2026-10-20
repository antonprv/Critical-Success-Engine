// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import { ControlBase, type ControlOptions } from "../Core/ControlBase";

/**
 * A node of a solution tree. The kinds of Solution Explorer (Solution, Project, VirtualFolder, Folder, File) pick the
 * icon; a file's icon also follows its extension. The flags draw as Visual Studio draws them: hidden ones greyed,
 * missing ones with a warning, nested ones under their file, modified and erroneous ones marked.
 */
export interface SolutionTreeNode {
	Id: string;
	Label: string;
	Kind: string;
	Hidden?: boolean;
	Missing?: boolean;
	Nested?: boolean;
	Modified?: boolean;
	Error?: boolean;
	Children: SolutionTreeNode[];
}

export interface VisibleSolutionNode {
	Node: SolutionTreeNode;
	Depth: number;
	Parent: SolutionTreeNode | null;
	Expandable: boolean;
}

export interface SolutionTreeOptions extends ControlOptions {
	/** The top level (one solution node, or a folder's items). */
	Nodes?: SolutionTreeNode[];
	/** Expanded at start. */
	Expanded?: Iterable<string>;
	/** Pixels a row takes (the view's rows are this tall, so only the visible ones are drawn). */
	RowHeight?: number;
}

/** The keys held with a click or a key. */
export interface Modifiers {
	Ctrl?: boolean;
	Shift?: boolean;
}

export type SolutionTreeEvents = {
	"expand-change": [id: string, expanded: boolean];
	"selection-change": [ids: string[]];
	/** Double click or Enter: open it. */
	activate: [id: string];
	/** F2 then Enter (or focus leaving the box) with a new name. */
	rename: [id: string, name: string];
	/** Del. */
	delete: [ids: string[]];
	copy: [ids: string[]];
	cut: [ids: string[]];
	/** Ctrl+V onto the focused node. */
	paste: [targetId: string];
	/** Dragged onto a node (with Ctrl: copied). */
	move: [ids: string[], targetId: string];
	"drop-copy": [ids: string[], targetId: string];
	/** Ctrl+Z and Ctrl+Y (Ctrl+Shift+Z). */
	undo: [];
	redo: [];
	/** Right click or the menu key; null: on empty space. */
	"context-menu": [id: string | null, x: number, y: number];
};

/**
 * Solution Explorer's tree: the nodes, which are expanded, a multiple selection (Ctrl and Shift as in Explorer),
 * renaming in place, a search filter, drag and drop, and the window of rows on screen for big trees. It only draws and
 * reports: what the commands do to files is up to whoever listens (the solution model of a tool).
 */
export class SolutionTreeController extends ControlBase<SolutionTreeEvents> {
	public Nodes: SolutionTreeNode[];
	public readonly RowHeight: number;
	/** The search box's text: only matching nodes and their ancestors are shown, all expanded. */
	public Filter = "";
	/** The node being renamed, and the text in its box. */
	public Renaming: string | null = null;
	public Draft = "";
	/** What is being dragged, and the node it is over. */
	public Dragging: string[] = [];
	public DropTarget: string | null = null;
	/** Scroll offset and height of the view, in pixels (the view keeps them up to date). */
	public ScrollTop = 0;
	public ViewportHeight = 0;

	private readonly _expanded: Set<string>;
	private _selected: string[] = [];
	private _anchor: string | null = null;
	private _focus: string | null = null;

	public constructor(options: SolutionTreeOptions = {}) {
		super(options);
		this.Nodes = options.Nodes ?? [];
		this._expanded = new Set(options.Expanded ?? []);
		this.RowHeight = options.RowHeight ?? 22;
	}

	public get Selected(): readonly string[] { return this._selected; }
	/** The node the keys move from (the last one clicked or reached). */
	public get FocusId(): string | null { return this._focus; }

	public IsSelected(id: string): boolean {
		return this._selected.includes(id);
	}

	public IsExpanded(id: string): boolean {
		return this.Filter.trim() !== "" || this._expanded.has(id);
	}

	/** New nodes (the model changed): expansion is kept, what is gone leaves the selection. */
	public SetNodes(nodes: SolutionTreeNode[]): void {
		this.Nodes = nodes;
		const kept = this._selected.filter((id) => this.Find(id));
		if (kept.length !== this._selected.length) this.SetSelection(kept);
		if (this._focus !== null && !this.Find(this._focus)) this._focus = kept.at(-1) ?? null;
		if (this.Renaming !== null && !this.Find(this.Renaming)) this.Renaming = null;
	}

	public SetFilter(text: string): void {
		this.Filter = text;
		this.ScrollTop = 0;
	}

	//#region rows

	/** Every row on screen, top to bottom (the filter applied). */
	public get VisibleNodes(): VisibleSolutionNode[] {
		const needle = this.Filter.trim().toLowerCase();
		const matches = (node: SolutionTreeNode): boolean => node.Label.toLowerCase().includes(needle) || node.Children.some(matches);
		const out: VisibleSolutionNode[] = [];
		const walk = (nodes: SolutionTreeNode[], depth: number, parent: SolutionTreeNode | null): void => {
			for (const node of nodes) {
				if (needle !== "" && !matches(node)) continue;
				out.push({ Node: node, Depth: depth, Parent: parent, Expandable: node.Children.length > 0 });
				if (node.Children.length > 0 && this.IsExpanded(node.Id)) walk(node.Children, depth + 1, node);
			}
		};
		walk(this.Nodes, 0, null);
		return out;
	}

	/** The rows the view draws: those in the viewport and a few around it. */
	public get Window(): { Start: number; Rows: VisibleSolutionNode[]; Total: number; } {
		const rows = this.VisibleNodes;
		const overscan = 8;
		const start = FMath.Max(0, Math.floor(this.ScrollTop / this.RowHeight) - overscan);
		const count = Math.ceil(FMath.Max(this.ViewportHeight, this.RowHeight) / this.RowHeight) + overscan * 2;
		return { Start: start, Rows: rows.slice(start, start + count), Total: rows.length };
	}

	public Scroll(top: number, height: number): void {
		this.ScrollTop = FMath.Max(0, top);
		this.ViewportHeight = height;
	}

	/** Scrolls so the node's row is in the viewport. */
	public ScrollIntoView(id: string): void {
		const index = this.VisibleNodes.findIndex((row) => row.Node.Id === id);
		if (index < 0) return;
		const top = index * this.RowHeight;
		if (top < this.ScrollTop) this.ScrollTop = top;
		else if (top + this.RowHeight > this.ScrollTop + this.ViewportHeight) this.ScrollTop = FMath.Max(0, top + this.RowHeight - this.ViewportHeight);
	}

	//#endregion

	//#region expanding

	public Expand(id: string): void {
		const node = this.Find(id);
		if (!node || node.Children.length === 0 || this._expanded.has(id)) return;
		this._expanded.add(id);
		this.Emit("expand-change", id, true);
	}

	public Collapse(id: string): void {
		if (!this._expanded.delete(id)) return;
		this.Emit("expand-change", id, false);
	}

	public Toggle(id: string): void {
		if (this._expanded.has(id)) this.Collapse(id);
		else this.Expand(id);
	}

	/** "Collapse All": every node closes but the top level's. */
	public CollapseAll(): void {
		const top = new Set(this.Nodes.map((node) => node.Id));
		for (const id of [...this._expanded]) if (!top.has(id)) this.Collapse(id);
	}

	/** Opens every ancestor of the node, selects it and scrolls to it ("Sync with Active Document"). */
	public Reveal(id: string): void {
		const path = this.PathTo(id, this.Nodes);
		if (!path) return;
		for (const ancestor of path) this.Expand(ancestor.Id);
		this.Select(id);
		this.ScrollIntoView(id);
	}

	//#endregion

	//#region selection

	/** A click: alone it selects the node; with Ctrl it adds or removes it; with Shift it selects the range from the anchor. */
	public Select(id: string, modifiers: Modifiers = {}): void {
		if (!this.Enabled || !this.Find(id)) return;
		if (modifiers.Shift && this._anchor !== null) {
			const rows = this.VisibleNodes.map((row) => row.Node.Id);
			const from = rows.indexOf(this._anchor), to = rows.indexOf(id);
			if (from >= 0 && to >= 0) {
				const range = rows.slice(FMath.Min(from, to), FMath.Max(from, to) + 1);
				this.SetSelection(modifiers.Ctrl ? [...new Set([...this._selected, ...range])] : range);
				this._focus = id;
				return;
			}
		}
		if (modifiers.Ctrl) this.SetSelection(this.IsSelected(id) ? this._selected.filter((s) => s !== id) : [...this._selected, id]);
		else this.SetSelection([id]);
		this._anchor = id;
		this._focus = id;
	}

	public SelectAll(): void {
		this.SetSelection(this.VisibleNodes.map((row) => row.Node.Id));
	}

	public ClearSelection(): void {
		this.SetSelection([]);
	}

	private SetSelection(ids: string[]): void {
		if (ids.length === this._selected.length && ids.every((id, i) => id === this._selected[i])) return;
		this._selected = ids;
		this.Emit("selection-change", [...ids]);
	}

	public DoubleClick(id: string): void {
		if (!this.Find(id)) return;
		this.Select(id);
		const node = this.Find(id)!;
		// As in Explorer: a folder opens or closes, a file opens.
		if (node.Children.length > 0 && node.Kind !== "File") this.Toggle(id);
		else this.Emit("activate", id);
	}

	public ContextMenu(id: string | null, x: number, y: number): void {
		if (!this.Enabled) return;
		if (id !== null && !this.IsSelected(id)) this.Select(id);
		this.Emit("context-menu", id, x, y);
	}

	//#endregion

	//#region renaming

	/** F2: a box over the label, holding the name (a file's name selected up to its extension by the view). */
	public BeginRename(id = this._focus): void {
		const node = id === null ? undefined : this.Find(id);
		if (!this.Enabled || !node) return;
		this.Renaming = node.Id;
		this.Draft = node.Label;
	}

	public CommitRename(): void {
		if (this.Renaming === null) return;
		const id = this.Renaming, name = this.Draft.trim();
		const before = this.Find(id)!.Label;
		this.Renaming = null;
		if (name !== "" && name !== before) this.Emit("rename", id, name);
	}

	public CancelRename(): void {
		this.Renaming = null;
	}

	//#endregion

	//#region drag and drop

	/** Starts dragging the selection (or the node, when it isn't selected). */
	public BeginDrag(id: string): void {
		if (!this.Enabled) return;
		if (!this.IsSelected(id)) this.Select(id);
		this.Dragging = [...this._selected];
	}

	/** Over a node: it becomes the drop target, unless it is one of the dragged ones or inside one. */
	public DragOver(id: string | null): boolean {
		this.DropTarget = id !== null && this.CanDrop(id) ? id : null;
		return this.DropTarget !== null;
	}

	public Drop(copy = false): void {
		const target = this.DropTarget, ids = this.Dragging;
		this.EndDrag();
		if (target === null || ids.length === 0) return;
		this.Emit(copy ? "drop-copy" : "move", ids, target);
	}

	public EndDrag(): void {
		this.Dragging = [];
		this.DropTarget = null;
	}

	private CanDrop(id: string): boolean {
		if (this.Dragging.length === 0 || !this.Find(id)) return false;
		const path = this.PathTo(id, this.Nodes)!.map((node) => node.Id);
		return !this.Dragging.some((dragged) => dragged === id || path.includes(dragged));
	}

	//#endregion

	/** The keys of Solution Explorer. Returns whether the key was one (the view then stops the browser's own handling). */
	public KeyDown(code: string, modifiers: Modifiers = {}): boolean {
		if (!this.Enabled) return false;
		if (this.Renaming !== null) {
			if (code === "Enter" || code === "NumpadEnter") this.CommitRename();
			else if (code === "Escape") this.CancelRename();
			else return false;
			return true;
		}
		const rows = this.VisibleNodes;
		if (rows.length === 0) return false;
		const index = rows.findIndex((row) => row.Node.Id === this._focus);
		const current = rows[index];
		const go = (to: number): void => this.Select(rows[FMath.Clamp(to, 0, rows.length - 1)]!.Node.Id, { Shift: modifiers.Shift === true });
		const page = FMath.Max(1, Math.floor(this.ViewportHeight / this.RowHeight) - 1);
		switch (code) {
			case "ArrowDown": go(index < 0 ? 0 : index + 1); break;
			case "ArrowUp": go(index < 0 ? 0 : index - 1); break;
			case "PageDown": go(index + page); break;
			case "PageUp": go(index - page); break;
			case "Home": go(0); break;
			case "End": go(rows.length - 1); break;
			case "ArrowRight":
				if (current?.Expandable && !this.IsExpanded(current.Node.Id)) this.Expand(current.Node.Id);
				else if (current?.Expandable) go(index + 1);
				break;
			case "ArrowLeft":
				if (current?.Expandable && this.IsExpanded(current.Node.Id)) this.Collapse(current.Node.Id);
				else if (current?.Parent) this.Select(current.Parent.Id);
				break;
			case "Enter": case "NumpadEnter": if (current) this.Emit("activate", current.Node.Id); break;
			case "F2": this.BeginRename(); break;
			case "Delete": if (this._selected.length > 0) this.Emit("delete", [...this._selected]); break;
			case "ContextMenu": this.ContextMenu(this._focus, 0, 0); break;
			case "KeyA": if (!modifiers.Ctrl) return false; this.SelectAll(); break;
			case "KeyC": if (!modifiers.Ctrl) return false; if (this._selected.length > 0) this.Emit("copy", [...this._selected]); break;
			case "KeyX": if (!modifiers.Ctrl) return false; if (this._selected.length > 0) this.Emit("cut", [...this._selected]); break;
			case "KeyV": if (!modifiers.Ctrl) return false; if (this._focus !== null) this.Emit("paste", this._focus); break;
			case "KeyZ": if (!modifiers.Ctrl) return false; this.Emit(modifiers.Shift ? "redo" : "undo"); break;
			case "KeyY": if (!modifiers.Ctrl) return false; this.Emit("redo"); break;
			default: return false;
		}
		if (this._focus !== null) this.ScrollIntoView(this._focus);
		return true;
	}

	public Find(id: string, nodes: SolutionTreeNode[] = this.Nodes): SolutionTreeNode | undefined {
		for (const node of nodes) {
			if (node.Id === id) return node;
			const found = this.Find(id, node.Children);
			if (found) return found;
		}
		return undefined;
	}

	/** The ancestors of a node, top first; null when it isn't in the tree. */
	private PathTo(id: string, nodes: SolutionTreeNode[]): SolutionTreeNode[] | null {
		for (const node of nodes) {
			if (node.Id === id) return [];
			const below = this.PathTo(id, node.Children);
			if (below) return [node, ...below];
		}
		return null;
	}
}

/** The icon class of a node: its kind, and for files the extension ("file-ts", "file-ui-json"). */
export function SolutionIcon(node: SolutionTreeNode): string {
	if (node.Kind !== "File") return node.Kind.toLowerCase();
	const name = node.Label.toLowerCase();
	const dot = name.indexOf(".", 1);
	return dot < 0 ? "file" : `file-${name.slice(dot + 1).replace(/\./g, "-")}`;
}
