// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ControlBase, type ControlOptions } from "../Core/ControlBase";

export interface TreeNode {
	Id: string;
	Label: string;
	Children?: TreeNode[];
}

export interface VisibleTreeNode {
	Node: TreeNode;
	Depth: number;
	Parent: TreeNode | null;
}

export interface TreeViewOptions extends ControlOptions {
	Nodes: TreeNode[];
}

export type TreeViewEvents = {
	"expand-change": [node: TreeNode, expanded: boolean];
	"selection-change": [node: TreeNode];
	activate: [node: TreeNode];
};

/** Explorer's folder tree: expandable nodes, one selected, the classic tree keys. */
export class TreeViewController extends ControlBase<TreeViewEvents> {
	public readonly Nodes: TreeNode[];

	private readonly _expanded = new Set<string>();
	private _selectedId: string | null = null;

	public constructor(options: TreeViewOptions) {
		super(options);
		this.Nodes = options.Nodes;
	}

	public get SelectedId(): string | null { return this._selectedId; }

	public IsExpanded(id: string): boolean {
		return this._expanded.has(id);
	}

	/** The nodes on screen, top to bottom: every root, and the children of expanded nodes. */
	public get VisibleNodes(): VisibleTreeNode[] {
		const out: VisibleTreeNode[] = [];
		const walk = (nodes: TreeNode[], depth: number, parent: TreeNode | null): void => {
			for (const node of nodes) {
				out.push({ Node: node, Depth: depth, Parent: parent });
				if (node.Children && this._expanded.has(node.Id)) walk(node.Children, depth + 1, node);
			}
		};
		walk(this.Nodes, 0, null);
		return out;
	}

	public Find(id: string, nodes: TreeNode[] = this.Nodes): TreeNode | undefined {
		for (const node of nodes) {
			if (node.Id === id) return node;
			const found = node.Children ? this.Find(id, node.Children) : undefined;
			if (found) return found;
		}
		return undefined;
	}

	public Expand(id: string): void {
		const node = this.Find(id);
		if (!node?.Children || this._expanded.has(id)) return;
		this._expanded.add(id);
		this.Emit("expand-change", node, true);
	}

	public Collapse(id: string): void {
		if (!this._expanded.delete(id)) return;
		this.Emit("expand-change", this.Find(id)!, false);
	}

	public Toggle(id: string): void {
		if (this._expanded.has(id)) this.Collapse(id);
		else this.Expand(id);
	}

	/** Selects a node, expanding its ancestors so it is on screen (as TVM_SELECTITEM does). */
	public Select(id: string): void {
		if (!this.Enabled || id === this._selectedId) return;
		const node = this.Find(id);
		if (!node) return;
		this.EnsureVisible(id);
		this._selectedId = id;
		this.Emit("selection-change", node);
	}

	/** Expands every ancestor of the node. */
	public EnsureVisible(id: string): void {
		for (const ancestor of this.PathTo(id, this.Nodes) ?? []) this.Expand(ancestor.Id);
	}

	/** Ancestors of a node, root first; null when the id is not under `nodes`. */
	private PathTo(id: string, nodes: TreeNode[]): TreeNode[] | null {
		for (const node of nodes) {
			if (node.Id === id) return [];
			const below = node.Children ? this.PathTo(id, node.Children) : null;
			if (below) return [node, ...below];
		}
		return null;
	}

	public DoubleClick(id: string): void {
		const node = this.Find(id);
		if (!node) return;
		this.Select(id);
		this.Emit("activate", node);
	}

	public KeyDown(code: string): void {
		const visible = this.VisibleNodes;
		if (!this.Enabled || visible.length === 0) return;

		const index = visible.findIndex((v) => v.Node.Id === this._selectedId);
		const current = visible[index];
		switch (code) {
			case "ArrowDown": this.Select(visible[index < 0 ? 0 : Math.min(index + 1, visible.length - 1)]!.Node.Id); break;
			case "ArrowUp": this.Select(visible[Math.max(index - 1, 0)]!.Node.Id); break;
			case "Home": this.Select(visible[0]!.Node.Id); break;
			case "End": this.Select(visible.at(-1)!.Node.Id); break;
			case "ArrowRight": if (current) this.Right(current.Node); break;
			case "ArrowLeft": if (current) this.Left(current); break;
			case "Enter": if (current) this.Emit("activate", current.Node); break;
		}
	}

	/** Right: expand a closed node, or step into an open one. */
	private Right(node: TreeNode): void {
		if (!node.Children) return;
		if (!this._expanded.has(node.Id)) this.Expand(node.Id);
		else this.Select(node.Children[0]!.Id);
	}

	/** Left: collapse an open node, or climb to the parent. */
	private Left(visible: VisibleTreeNode): void {
		if (this._expanded.has(visible.Node.Id)) this.Collapse(visible.Node.Id);
		else if (visible.Parent) this.Select(visible.Parent.Id);
	}
}
