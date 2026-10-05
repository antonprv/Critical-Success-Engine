// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { EventHub } from "../Core/EventHub";
import { EmptySkin, PartInfo, type PartStyle, type Skin, type SkinPart, type SkinState } from "../Skins/Skin";
import type { KeyModifiers } from "../Controls/TabsController";
import { AnchorMode, Reanchor } from "./Anchors";
import { CreateNode, NewLayout, ParseLayout, SerializeLayout, type LayoutNode, type PropValue, type UiLayout } from "./Layout";
import { BuiltInWidgets, IsValidProp, type WidgetRegistry } from "./Widgets";

export const enum DesignerMode {
	Design = "design",
	Preview = "preview",
}

export type DragHandle = "move" | "right" | "bottom" | "corner";

/** One axis of a drag: `move` shifts the widget, `grow` moves its far edge. Offsets are relative to the anchor. */
function DragAxis(mode: AnchorMode | undefined, offset: number, size: number, far: number | undefined, move: number, grow: number): { offset: number; size: number; far?: number; } {
	switch (mode) {
		case AnchorMode.End: return { offset: offset - move - grow, size: size + grow };
		case AnchorMode.Center: return { offset: offset + move + grow / 2, size: size + grow };
		case AnchorMode.Stretch: return { offset: offset + move, size, far: (far ?? 0) - move - grow };
		default: return { offset: offset + move, size: size + grow };
	}
}

export interface HierarchyEntry {
	Node: LayoutNode;
	Depth: number;
	Parent: LayoutNode | null;
}

export interface AddOptions {
	/** Container to add into; ignored when it isn't one. */
	Parent?: string;
	X?: number;
	Y?: number;
}

export type DesignerEvents = {
	change: [];
	"selection-change": [name: string | null];
	"mode-change": [mode: DesignerMode];
};

const MaxUndo = 100;
const NudgeDirections: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const Identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;


/** The UI designer's document and every editing operation on it. No DOM: the Vue editor only draws this and forwards input. */
export class DesignerController {
	public readonly Events = new EventHub<DesignerEvents>();
	public Grid = 8;
	public Snap = true;

	private _layout!: UiLayout;
	private _selected: string | null = null;
	private _mode = DesignerMode.Design;
	private _dirty = false;
	private _undo: string[] = [];
	private _redo: string[] = [];
	private _gesture = false;
	private _editPending = false;

	/** `widgets`: the widget types this designer offers and understands (built-ins plus your own). */
	public constructor(layout?: UiLayout, public readonly Widgets: WidgetRegistry = BuiltInWidgets) {
		this.Load(layout ?? NewLayout("Untitled"));
	}

	public get Layout(): UiLayout { return this._layout; }
	public get SelectedName(): string | null { return this._selected; }
	public get Selected(): LayoutNode | null { return this._selected === null ? null : this.Find(this._selected)!; }
	public get Mode(): DesignerMode { return this._mode; }
	/** Changed since the last New, Load, Import or Export. */
	public get Dirty(): boolean { return this._dirty; }
	public get CanUndo(): boolean { return this._undo.length > 0; }
	public get CanRedo(): boolean { return this._redo.length > 0; }

	/** Every widget, depth first: what the hierarchy panel shows. */
	public get Hierarchy(): HierarchyEntry[] {
		const out: HierarchyEntry[] = [];
		const walk = (node: LayoutNode, depth: number, parent: LayoutNode | null): void => {
			out.push({ Node: node, Depth: depth, Parent: parent });
			for (const child of node.Children ?? []) walk(child, depth + 1, node);
		};
		walk(this._layout.Root, 0, null);
		return out;
	}

	public Find(name: string): LayoutNode | undefined {
		return this.Hierarchy.find((entry) => entry.Node.Name === name)?.Node;
	}

	public ParentOf(name: string): LayoutNode | null {
		return this.Hierarchy.find((entry) => entry.Node.Name === name)?.Parent ?? null;
	}

	//#region files

	public New(name = "Untitled"): void {
		this.Load(NewLayout(name));
	}

	/** Starts editing a copy of the layout, with no selection and no history. */
	public Load(layout: UiLayout): void {
		this._layout = JSON.parse(SerializeLayout(layout)) as UiLayout;
		this._undo = [];
		this._redo = [];
		this._dirty = false;
		this._selected = null;
		this.Events.Emit("selection-change", null);
		this.Events.Emit("change");
	}

	public Export(): string {
		this._dirty = false;
		return SerializeLayout(this._layout);
	}

	/** Loads a layout file; returns null, or why the file was refused (the current layout stays). */
	public Import(text: string): string | null {
		try {
			this.Load(ParseLayout(text, this.Widgets));
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	}

	//#endregion

	//#region selection and structure

	public Select(name: string | null): void {
		if (name === this._selected || (name !== null && !this.Find(name))) return;
		this._selected = name;
		this.Events.Emit("selection-change", name);
	}

	/** Adds a widget and selects it. It goes into the given container, else the selected container, else next to the selected widget, else onto the canvas. */
	public Add(type: string, options: AddOptions = {}): LayoutNode {
		const parent = this.ContainerFor(options.Parent);
		const node = CreateNode(type, this.UniqueName(this.NamePrefix(type), this.UsedNames()), this.SnapValue(options.X ?? 16), this.SnapValue(options.Y ?? 16), this.Widgets);
		this.Mutate(() => parent.Children!.push(node));
		this.Select(node.Name);
		return node;
	}

	public Delete(name = this._selected): void {
		const parent = name === null ? null : this.ParentOf(name);
		if (!parent) return;
		this.Mutate(() => parent.Children!.splice(parent.Children!.findIndex((child) => child.Name === name), 1));
		this.Select(parent.Name);
	}

	/** Copies a widget and its children under new names, one grid step down and right, and selects the copy. */
	public Duplicate(name = this._selected): LayoutNode | null {
		const parent = name === null ? null : this.ParentOf(name);
		if (!parent) return null;

		const copy = JSON.parse(JSON.stringify(this.Find(name!))) as LayoutNode;
		const used = this.UsedNames();
		const rename = (node: LayoutNode): void => {
			node.Name = this.UniqueName(this.NamePrefix(node.Type), used);
			node.Children?.forEach(rename);
		};
		rename(copy);
		copy.X += this.Grid;
		copy.Y += this.Grid;
		this.Mutate(() => parent.Children!.splice(parent.Children!.findIndex((child) => child.Name === name) + 1, 0, copy));
		this.Select(copy.Name);
		return copy;
	}

	public BringForward(name: string): void {
		this.Reorder(name, 1);
	}

	public SendBackward(name: string): void {
		this.Reorder(name, -1);
	}

	/** Moves a widget into another container (not into itself or its own children). */
	public Reparent(name: string, target: string): boolean {
		const node = this.Find(name);
		const parent = this.ParentOf(name);
		const container = this.Find(target);
		if (!node || !parent || !container?.Children || this.Contains(node, target)) return false;
		this.Mutate(() => {
			parent.Children!.splice(parent.Children!.indexOf(node), 1);
			container.Children!.push(node);
		});
		return true;
	}

	//#endregion

	//#region geometry

	public MoveTo(name: string, x: number, y: number): void {
		const node = this.Find(name);
		if (!node || node === this._layout.Root) return;
		this.Mutate(() => {
			node.X = Math.max(0, this.SnapValue(x));
			node.Y = Math.max(0, this.SnapValue(y));
		});
	}

	public ResizeTo(name: string, width: number, height: number): void {
		const node = this.Find(name);
		if (!node) return;
		this.Mutate(() => {
			node.Width = Math.max(this.Grid, this.SnapValue(width));
			node.Height = Math.max(this.Grid, this.SnapValue(height));
		});
	}

	/**
	 * A mouse drag from `start` (the widget as it was when the drag began) by dx/dy, for whatever anchors it has: a right-
	 * anchored widget's margin shrinks as it moves right, a stretched one moves both edges. Results snap to the grid.
	 */
	public DragTo(name: string, start: LayoutNode, dx: number, dy: number, handle: DragHandle): void {
		const node = this.Find(name);
		if (!node || node === this._layout.Root) return;
		const moveX = handle === "move", moveY = handle === "move";
		const sizeX = handle === "right" || handle === "corner", sizeY = handle === "bottom" || handle === "corner";
		const x = DragAxis(start.AnchorX, start.X, start.Width, start.Right, moveX ? dx : 0, sizeX ? dx : 0);
		const y = DragAxis(start.AnchorY, start.Y, start.Height, start.Bottom, moveY ? dy : 0, sizeY ? dy : 0);
		// Only what the drag changes snaps to the grid: a move keeps an off-grid size, a resize an off-grid position.
		const snap = (value: number, before: number | undefined): number => (value === before ? value : this.SnapValue(value));
		this.Mutate(() => {
			node.X = snap(x.offset, start.X);
			node.Y = snap(y.offset, start.Y);
			node.Width = Math.max(this.Grid, snap(x.size, start.Width));
			node.Height = Math.max(this.Grid, snap(y.size, start.Height));
			if (x.far !== undefined) node.Right = snap(x.far, start.Right);
			if (y.far !== undefined) node.Bottom = snap(y.far, start.Bottom);
		});
	}

	/** The far margin (Right or Bottom) of a stretched widget. */
	public SetFarMargin(name: string, field: "Right" | "Bottom", value: number): void {
		const node = this.Find(name);
		if (!node) return;
		this.Mutate(() => { node[field] = this.SnapValue(value); });
	}

	/** New anchors for a widget, keeping it where it is inside a parent of the given (measured) size. */
	public SetAnchors(name: string, anchorX: AnchorMode, anchorY: AnchorMode, parentWidth: number, parentHeight: number): void {
		const parent = this.ParentOf(name);
		if (!parent) return;
		const index = parent.Children!.findIndex((child) => child.Name === name);
		this.Mutate(() => { parent.Children![index] = Reanchor(parent.Children![index]!, anchorX, anchorY, parentWidth, parentHeight); });
	}

	/** Starts a mouse drag: one undo step for the whole drag, however many moves it makes. */
	public BeginGesture(): void {
		this.Record();
		this._gesture = true;
	}

	public EndGesture(): void {
		this._gesture = false;
	}

	/** Starts editing a field: its changes, however many, become one undo step, recorded at the first real change. */
	public BeginEdit(): void {
		this._editPending = true;
	}

	public EndEdit(): void {
		this._editPending = false;
		this._gesture = false;
	}

	//#endregion

	//#region properties

	/** Names are what scripts use: identifiers, unique in the layout. */
	public Rename(name: string, newName: string): boolean {
		const node = this.Find(name);
		if (!node || !Identifier.test(newName) || (newName !== name && this.Find(newName))) return false;
		this.Mutate(() => { node.Name = newName; });
		if (this._selected === name) this._selected = newName;
		return true;
	}

	public SetProp(name: string, key: string, value: PropValue): boolean {
		const node = this.Find(name);
		const definition = node ? this.Widgets.Get(node.Type)!.Props.find((prop) => prop.Key === key) : undefined;
		if (!node || !definition || !IsValidProp(definition, value)) return false;
		this.Mutate(() => { node.Props[key] = value; });
		return true;
	}

	public SetLayoutName(name: string): void {
		this.Mutate(() => { this._layout.Name = name; });
	}

	public SetScript(script: string): void {
		this.Mutate(() => { this._layout.Script = script; });
	}

	/** Replaces the layout's skin with a copy of the given one (a preset stays untouched), or removes it. */
	public SetSkin(skin: Skin | null): void {
		this.Mutate(() => {
			if (skin) this._layout.Skin = JSON.parse(JSON.stringify(skin)) as Skin;
			else delete this._layout.Skin;
		});
	}

	/** Sets (or, with undefined, removes) one field of a part's style in one state; false for states the part doesn't have. */
	public SetSkinStyle<K extends keyof PartStyle>(part: SkinPart, state: SkinState, field: K, value: PartStyle[K] | undefined): boolean {
		if (!PartInfo[part].States[state]) return false;
		this.Mutate(() => {
			const skin = this._layout.Skin ??= EmptySkin();
			const style = (skin.Parts[part] ??= {})[state] ??= {};
			if (value === undefined) delete style[field];
			else style[field] = value;
			this.PruneSkin(part, state);
		});
		return true;
	}

	public ClearSkinState(part: SkinPart, state: SkinState): void {
		if (!this._layout.Skin?.Parts[part]?.[state]) return;
		this.Mutate(() => {
			delete this._layout.Skin!.Parts[part]![state];
			this.PruneSkin(part, state);
		});
	}

	/** Empty states and parts are dropped, so the skin file only holds what was really styled. */
	private PruneSkin(part: SkinPart, state: SkinState): void {
		const parts = this._layout.Skin!.Parts;
		if (parts[part]![state] && Object.keys(parts[part]![state]!).length === 0) delete parts[part]![state];
		if (Object.keys(parts[part]!).length === 0) delete parts[part];
	}

	//#endregion

	//#region history, mode, keys

	public Undo(): void {
		this.Travel(this._undo, this._redo);
	}

	public Redo(): void {
		this.Travel(this._redo, this._undo);
	}

	public SetMode(mode: DesignerMode): void {
		if (mode === this._mode) return;
		this._mode = mode;
		this.Events.Emit("mode-change", mode);
	}

	public KeyDown(code: string, modifiers: KeyModifiers = {}): void {
		if (this._mode === DesignerMode.Preview) return;
		const selected = this.Selected;
		if (modifiers.Ctrl) {
			if (code === "KeyZ") this[modifiers.Shift ? "Redo" : "Undo"]();
			else if (code === "KeyY") this.Redo();
			else if (code === "KeyD") this.Duplicate();
			return;
		}
		if (code === "Delete") this.Delete();
		else if (code === "Escape") this.Select(selected ? this.ParentOf(selected.Name)?.Name ?? null : null);
		else if (selected && code in NudgeDirections) this.Nudge(selected, NudgeDirections[code]!, modifiers.Shift ? this.Grid : 1);
	}

	//#endregion

	//#region internals

	private Nudge(node: LayoutNode, [dx, dy]: [number, number], step: number): void {
		this.Mutate(() => {
			node.X = Math.max(0, node.X + dx * step);
			node.Y = Math.max(0, node.Y + dy * step);
		});
	}

	private Reorder(name: string, delta: 1 | -1): void {
		const parent = this.ParentOf(name);
		if (!parent) return;
		const children = parent.Children!;
		const index = children.findIndex((child) => child.Name === name);
		const target = index + delta;
		if (target < 0 || target >= children.length) return;
		this.Mutate(() => children.splice(target, 0, ...children.splice(index, 1)));
	}

	private ContainerFor(requested: string | undefined): LayoutNode {
		const asked = requested === undefined ? undefined : this.Find(requested);
		if (asked?.Children) return asked;
		const selected = this.Selected;
		if (selected?.Children) return selected;
		return (selected && this.ParentOf(selected.Name)) ?? this._layout.Root;
	}

	/** "Group box" -> "GroupBox": the start of generated widget names. */
	private NamePrefix(type: string): string {
		return this.Widgets.Get(type)!.Label.split(" ").map((word) => word[0]!.toUpperCase() + word.slice(1)).join("");
	}

	private Contains(node: LayoutNode, name: string): boolean {
		return node.Name === name || (node.Children ?? []).some((child) => this.Contains(child, name));
	}

	private UsedNames(): Set<string> {
		return new Set(this.Hierarchy.map((entry) => entry.Node.Name));
	}

	private UniqueName(prefix: string, used: Set<string>): string {
		let n = 1;
		while (used.has(`${prefix}${n}`)) n++;
		used.add(`${prefix}${n}`);
		return `${prefix}${n}`;
	}

	private SnapValue(value: number): number {
		return this.Snap ? Math.round(value / this.Grid) * this.Grid : Math.round(value);
	}

	private Mutate(change: () => void): void {
		this.Record();
		change();
		this._dirty = true;
		this.Events.Emit("change");
	}

	private Record(): void {
		if (this._gesture) return;
		if (this._editPending) {
			this._editPending = false;
			this._gesture = true;
		}
		this._undo.push(SerializeLayout(this._layout));
		if (this._undo.length > MaxUndo) this._undo.shift();
		this._redo = [];
	}

	private Travel(from: string[], to: string[]): void {
		const snapshot = from.pop();
		if (snapshot === undefined) return;
		to.push(SerializeLayout(this._layout));
		this._layout = JSON.parse(snapshot) as UiLayout;
		this._dirty = true;
		if (this._selected !== null && !this.Find(this._selected)) this.Select(null);
		this.Events.Emit("change");
	}

	//#endregion
}
