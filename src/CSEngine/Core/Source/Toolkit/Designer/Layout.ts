// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ValidateSkin, type Skin } from "../Skins/Skin";
import { BuiltInWidgets, IsValidProp, WidgetType, type PropValue, type WidgetRegistry } from "./Widgets";

export { PropKind, WidgetType } from "./Widgets";
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
}

/** A node of a registered type with its default size and props. */
export function CreateNode(type: string, name: string, x: number, y: number, widgets: WidgetRegistry = BuiltInWidgets): LayoutNode {
	const definition = widgets.Get(type)!;
	const props: Record<string, PropValue> = {};
	for (const prop of definition.Props) props[prop.Key] = Array.isArray(prop.Default) ? [...prop.Default] : prop.Default;
	const node: LayoutNode = { Name: name, Type: type, X: x, Y: y, Width: definition.Size[0], Height: definition.Size[1], Props: props };
	if (definition.Container) node.Children = [];
	return node;
}

export function NewLayout(name: string): UiLayout {
	return { Format: 1, Name: name, Script: "", Root: CreateNode(WidgetType.Canvas, "Root", 0, 0) };
}

export function SerializeLayout(layout: UiLayout): string {
	return JSON.stringify(layout, null, 2);
}

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
	for (const prop of definition.Props) {
		if (IsValidProp(prop, rawProps[prop.Key])) node.Props[prop.Key] = rawProps[prop.Key] as PropValue;
	}

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
