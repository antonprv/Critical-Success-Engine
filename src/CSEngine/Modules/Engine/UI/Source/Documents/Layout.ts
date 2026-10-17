// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ValidateSkin, type Skin } from "../Skins/Skin";
import { AnchorModes, type AnchorMode } from "./Anchors";
import { ParseGraph, type UiGraph } from "./Graph";
import { CloneJson, IsJson } from "./Json";
import type { ChildTemplate } from "../Quasar/QuasarTypes";
import { BuiltInWidgets, IsValidProp, WidgetType, type PropValue, type WidgetRegistry } from "./Widgets";

export { GroupOf, IsEmbeddedInWindow, PropKind, ToolkitGroup, WidgetType } from "./Widgets";
export type { PropDefinition, PropValue, WidgetDefinition } from "./Widgets";

/** One widget in a layout: its name (what scripts use), type, rectangle relative to its parent, and properties. */
export interface LayoutNode {
	Name: string;
	/** A WidgetType, or the type of a custom widget registered in the WidgetRegistry. */
	Type: string;
	X: number;
	Y: number;
	Width: number;
	Height: number;
	Props: Record<string, PropValue>;
	Children?: LayoutNode[];
	/** How X/Width are pinned to the parent (Start when absent); see Anchors.ts. */
	AnchorX?: AnchorMode;
	/** How Y/Height are pinned to the parent (Start when absent). */
	AnchorY?: AnchorMode;
	/** The right margin of a horizontally stretched widget. */
	Right?: number;
	/** The bottom margin of a vertically stretched widget. */
	Bottom?: number;
	/** Clicks go through the widget itself to what is under it (a crosshair over the game); absent: it takes them. */
	ClickThrough?: boolean;
	/** false: the widget's pop-up (a combo box list) floats above everything and may leave its window, as in WinForms; absent: it stays inside the window bounds. */
	EmbedInWindow?: false;
	/** The slot of its parent it goes into (a parent with Slots: Quasar's); the default slot when absent. */
	Slot?: string;
	/** The text of its default slot while it holds no widgets (Quasar's widgets: a card section's line). */
	Content?: string;
	/**
	 * Directives on the widget, by Vue's syntax without "v-": "ripple", "touch-swipe:mouse.left", "close-popup"; the
	 * value is the directive's (handler directives raise an event of their name on the widget instead).
	 */
	Directives?: Record<string, PropValue>;
	/**
	 * Props that follow a document variable (data binding): "label" shows the variable; "model-value" (the widget's value)
	 * goes both ways - the variable sets it, and what the user enters sets the variable.
	 */
	Bindings?: Record<string, string>;
}

/** A UI asset: what the designer saves and the runtime loads (UMG's Widget Blueprint). */
export interface UiLayout {
	Format: 1;
	Name: string;
	/** Name of the UiScript that brings this UI to life; "" for none. */
	Script: string;
	Root: LayoutNode;
	/** The look of this UI on top of the theme (sprites, colours, fonts per part and state); none = the theme as is. */
	Skin?: Skin;
	/** Node scripting: events and the actions they trigger (see Graph.ts). */
	Graph?: UiGraph;
	/** false: the document takes every click, covering the game (a pause menu); absent: its empty places let clicks through. */
	ClickThrough?: boolean;
	/** Keyboard shortcuts while the document is shown: "Ctrl+S" presses the widget named (its click event, as a click). */
	Hotkeys?: Record<string, string>;
}

/** Whether a document's empty places let clicks through to what is under it (the game). */
export function IsClickThrough(layout: UiLayout): boolean {
	return layout.ClickThrough !== false;
}

/** A node of a registered type with its default size and props. */
export function CreateNode(type: string, name: string, x: number, y: number, widgets: WidgetRegistry = BuiltInWidgets): LayoutNode {
	const definition = widgets.Get(type)!;
	const props: Record<string, PropValue> = {};
	for (const prop of definition.Props) props[prop.Key] = CloneJson(prop.Default);
	const node: LayoutNode = { Name: name, Type: type, X: x, Y: y, Width: definition.Size[0], Height: definition.Size[1], Props: props };
	if (definition.Container) node.Children = (definition.Children ?? []).map((child, index) => FromTemplate(child, `${name}_${index + 1}`, widgets));
	return node;
}

/** A widget a container starts with, named after it ("Tabs1_2"), its own children after it in turn. */
function FromTemplate(template: ChildTemplate, name: string, widgets: WidgetRegistry): LayoutNode {
	const node = CreateNode(template.Type, name, 0, 0, widgets);
	if (template.Props) Object.assign(node.Props, CloneJson(template.Props));
	if (template.Content !== undefined) node.Content = template.Content;
	if (template.Slot !== undefined) node.Slot = template.Slot;
	if (template.Children) node.Children = template.Children.map((child, index) => FromTemplate(child, `${name}_${index + 1}`, widgets));
	return node;
}

export function NewLayout(name: string): UiLayout {
	return { Format: 1, Name: name, Script: "", Root: CreateNode(WidgetType.Canvas, "Root", 0, 0) };
}

export function SerializeLayout(layout: UiLayout): string {
	return JSON.stringify(layout, null, 2);
}

//#region hotkeys

const Modifiers = ["Ctrl", "Alt", "Shift", "Meta"] as const;

/** Keys a shortcut can end with besides a single character (KeyboardEvent.key's names). */
const NamedKeys = new Set(["Enter", "Escape", "Tab", "Backspace", "Delete", "Insert", "Home", "End", "PageUp", "PageDown", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ContextMenu", ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`)]);

/**
 * A shortcut in its one written form ("Ctrl+Shift+S", "F5", "Escape"): modifiers in a fixed order, then the key as
 * KeyboardEvent.key names it (a letter in capitals); null when it isn't one.
 */
export function ParseHotkey(text: string): string | null {
	const parts = text.split("+").map((part) => part.trim()).filter(Boolean);
	const key = parts.pop();
	if (!key) return null;
	const named = (part: string): (typeof Modifiers)[number] | undefined => Modifiers.find((modifier) => modifier.toLowerCase() === part.toLowerCase() || (modifier === "Ctrl" && part.toLowerCase() === "control"));
	const modifiers = parts.map(named);
	if (modifiers.some((modifier) => modifier === undefined) || named(key)) return null;
	const name = key.length === 1 ? key.toUpperCase() : [...NamedKeys].find((known) => known.toLowerCase() === key.toLowerCase());
	if (!name) return null;
	return [...Modifiers.filter((modifier) => modifiers.includes(modifier)), name].join("+");
}

/** The shortcut a key press makes, in ParseHotkey's form. */
export function HotkeyOf(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): string {
	const pressed = { Ctrl: event.ctrlKey, Alt: event.altKey, Shift: event.shiftKey, Meta: event.metaKey };
	const key = event.key === " " ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
	return [...Modifiers.filter((modifier) => pressed[modifier]), key].join("+");
}

//#endregion

//#region parsing

class LayoutError extends Error {
	public constructor(reason: string) {
		super(`Not a UI layout: ${reason}`);
	}
}

const IsObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function ParseNode(raw: unknown, names: Set<string>, widgets: WidgetRegistry): LayoutNode {
	if (!IsObject(raw) || typeof raw["Name"] !== "string") throw new LayoutError("a widget has no name");
	const name = raw["Name"];
	const definition = widgets.Get(raw["Type"] as string);
	if (!definition) throw new LayoutError(`"${name}" has an unknown type`);
	if (names.has(name)) throw new LayoutError(`two widgets are called "${name}"`);
	names.add(name);
	for (const key of ["X", "Y", "Width", "Height"]) {
		if (typeof raw[key] !== "number") throw new LayoutError(`"${name}" has no valid ${key}`);
	}

	// Known props of the right kind are kept; anything else falls back to the default (old files keep loading).
	const rawProps = IsObject(raw["Props"]) ? raw["Props"] : {};
	const node = CreateNode(definition.Type, name, raw["X"] as number, raw["Y"] as number, widgets);
	node.Width = raw["Width"] as number;
	node.Height = raw["Height"] as number;
	if (definition.OpenProps) {
		// An open widget holds what the file says (its starters only seed new ones): any prop that is JSON.
		node.Props = {};
		for (const [key, value] of Object.entries(rawProps)) if (IsJson(value)) node.Props[key] = value;
	}
	for (const prop of definition.Props) {
		if (IsValidProp(prop, rawProps[prop.Key])) node.Props[prop.Key] = rawProps[prop.Key] as PropValue;
	}
	if (typeof raw["Slot"] === "string" && raw["Slot"] !== "") node.Slot = raw["Slot"];
	if (typeof raw["Content"] === "string") node.Content = raw["Content"];
	if (IsObject(raw["Bindings"])) {
		const bindings = Object.entries(raw["Bindings"]).filter(([key, variable]) => key !== "" && typeof variable === "string" && variable !== "");
		if (bindings.length) node.Bindings = Object.fromEntries(bindings) as Record<string, string>;
	}
	if (IsObject(raw["Directives"])) {
		const directives = Object.entries(raw["Directives"]).filter(([key, value]) => /^[a-z][a-z-]*(:[\w-]+)?(\.[\w-]+)*$/.test(key) && IsJson(value));
		if (directives.length) node.Directives = Object.fromEntries(directives) as Record<string, PropValue>;
	}

	// Anchors: a known mode and finite margins are kept; anything else falls back to the default (Start, no margin).
	for (const key of ["AnchorX", "AnchorY"] as const) {
		if (AnchorModes.includes(raw[key] as AnchorMode)) node[key] = raw[key] as AnchorMode;
	}
	for (const key of ["Right", "Bottom"] as const) {
		if (typeof raw[key] === "number" && Number.isFinite(raw[key])) node[key] = raw[key] as number;
	}
	if (typeof raw["ClickThrough"] === "boolean") node.ClickThrough = raw["ClickThrough"];
	if (raw["EmbedInWindow"] === false) node.EmbedInWindow = false;

	if (raw["Children"] !== undefined && !definition.Container) throw new LayoutError(`"${name}" can't hold widgets`);
	if (definition.Container) node.Children = (Array.isArray(raw["Children"]) ? raw["Children"] : []).map((child) => ParseNode(child, names, widgets));
	return node;
}

/** Reads a layout file; its widget types must be in `widgets`. Throws "Not a UI layout: ..." with the reason when it isn't one. */
export function ParseLayout(text: string, widgets: WidgetRegistry = BuiltInWidgets): UiLayout {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new LayoutError("not JSON");
	}
	if (!IsObject(raw) || raw["Format"] !== 1 || typeof raw["Name"] !== "string") throw new LayoutError("missing Format 1 or Name");
	const root = ParseNode(raw["Root"], new Set(), widgets);
	if (root.Type !== WidgetType.Canvas) throw new LayoutError("the root must be a canvas");
	const layout: UiLayout = { Format: 1, Name: raw["Name"], Script: typeof raw["Script"] === "string" ? raw["Script"] : "", Root: root };
	if (raw["Graph"] !== undefined) layout.Graph = ParseGraph(raw["Graph"]);
	if (typeof raw["ClickThrough"] === "boolean") layout.ClickThrough = raw["ClickThrough"];
	if (IsObject(raw["Hotkeys"])) {
		const hotkeys = Object.entries(raw["Hotkeys"]).filter(([keys, widget]) => ParseHotkey(keys) !== null && typeof widget === "string");
		if (hotkeys.length) layout.Hotkeys = Object.fromEntries(hotkeys.map(([keys, widget]) => [ParseHotkey(keys)!, widget as string]));
	}
	if (raw["Skin"] !== undefined) {
		try {
			layout.Skin = ValidateSkin(raw["Skin"]);
		} catch (error) {
			throw new LayoutError((error as Error).message);
		}
	}
	return layout;
}

//#endregion
