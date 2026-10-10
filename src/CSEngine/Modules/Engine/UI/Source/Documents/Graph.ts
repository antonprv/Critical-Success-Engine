// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { CheckState, type CheckBoxController } from "../Controls/CheckBoxController";
import type { ControlBase } from "../Core/ControlBase";
import { StatusBarController } from "../Controls/StatusBarController";
import { TextBoxController } from "../Controls/TextBoxController";
import { WindowController } from "../Controls/WindowController";
import type { DialogResult } from "./DialogResult";
import type { UiDocument } from "./UiDocument";

/** Node scripting: "when this happens, do that", stored in the layout and turned into a UiScript class on demand. */

export const enum GraphNodeKind {
	Event = "event",
	Action = "action",
}

export const enum ActionType {
	Show = "show",
	Hide = "hide",
	ToggleVisible = "toggle-visible",
	Enable = "enable",
	Disable = "disable",
	/** The widget is enabled while a check box is checked (or, inverted, while it isn't). */
	EnabledFollowsCheck = "enabled-follows-check",
	SetText = "set-text",
	Focus = "focus",
	MessageBox = "message-box",
	CloseForm = "close-form",
}

/** For change events of check boxes: run only when it became checked / unchecked. */
export const enum CheckCondition {
	Always = "always",
	Checked = "checked",
	Unchecked = "unchecked",
}

export type GraphParam = string | boolean;

export interface GraphNode {
	Id: string;
	Kind: GraphNodeKind;
	/** The event name (click, change...) or the ActionType. */
	Type: string;
	X: number;
	Y: number;
	/** Event: Widget, When. Action: its parameters (Widget, Text, Check, Invert, Result, Title). */
	Params: Record<string, GraphParam>;
}

export interface GraphLink { From: string; To: string; }

export interface UiGraph {
	Nodes: GraphNode[];
	Links: GraphLink[];
}

export interface ActionInfo {
	Label: string;
	/** Parameter name and what it holds. */
	Params: { Key: string; Label: string; Kind: "widget" | "text" | "boolean" | "result"; }[];
}

const WidgetParam = { Key: "Widget", Label: "Widget", Kind: "widget" } as const;

export const ActionInfos: Record<ActionType, ActionInfo> = {
	[ActionType.Show]: { Label: "Show", Params: [WidgetParam] },
	[ActionType.Hide]: { Label: "Hide", Params: [WidgetParam] },
	[ActionType.ToggleVisible]: { Label: "Show / hide", Params: [WidgetParam] },
	[ActionType.Enable]: { Label: "Enable", Params: [WidgetParam] },
	[ActionType.Disable]: { Label: "Disable", Params: [WidgetParam] },
	[ActionType.EnabledFollowsCheck]: { Label: "Enabled follows check box", Params: [WidgetParam, { Key: "Check", Label: "Check box", Kind: "widget" }, { Key: "Invert", Label: "Inverted", Kind: "boolean" }] },
	[ActionType.SetText]: { Label: "Set text", Params: [WidgetParam, { Key: "Text", Label: "Text", Kind: "text" }] },
	[ActionType.Focus]: { Label: "Focus", Params: [WidgetParam] },
	[ActionType.MessageBox]: { Label: "Message box", Params: [{ Key: "Text", Label: "Text", Kind: "text" }, { Key: "Title", Label: "Title", Kind: "text" }] },
	[ActionType.CloseForm]: { Label: "Close form", Params: [{ Key: "Result", Label: "Result", Kind: "result" }] },
};

export const ActionTypes = Object.keys(ActionInfos) as ActionType[];

//#region actions: shared by the graph runner and UiScript's helpers, so both behave the same

type Control = ControlBase<Record<string, unknown[]>>;

export const Actions = {
	Show: (document: UiDocument, widget: string): void => document.Controller<Control>(widget).SetVisible(true),
	Hide: (document: UiDocument, widget: string): void => document.Controller<Control>(widget).SetVisible(false),
	ToggleVisible: (document: UiDocument, widget: string): void => {
		const control = document.Controller<Control>(widget);
		control.SetVisible(!control.Visible);
	},
	Enable: (document: UiDocument, widget: string): void => document.Controller<Control>(widget).SetEnabled(true),
	Disable: (document: UiDocument, widget: string): void => document.Controller<Control>(widget).SetEnabled(false),
	EnabledFollowsCheck: (document: UiDocument, widget: string, check: string, invert: boolean): void =>
		document.Controller<Control>(widget).SetEnabled(document.Controller<CheckBoxController>(check).Checked !== invert),
	/** The text a widget shows: a text box's value, a window's title, a status bar's first panel, any other label. */
	SetText: (document: UiDocument, widget: string, text: string): void => {
		const control = document.Controller<object>(widget);
		if (control instanceof TextBoxController) control.SetValue(text);
		else if (control instanceof StatusBarController) control.SetText(0, text);
		else if (control instanceof WindowController) control.Title = text;
		else (control as { Label: string; }).Label = text;
	},
	Focus: (document: UiDocument, widget: string): void => document.Controller<Control>(widget).Focus(),
	MessageBox: (document: UiDocument, text: string, title: string): void => {
		if (!document.Dialogs) throw new Error("This UI has no dialog service: create its UiDocument with { Dialogs }");
		void document.Dialogs.MessageBox(text, title);
	},
	CloseForm: (document: UiDocument, result: DialogResult): void => { document.Close(result); },
};

function Execute(document: UiDocument, node: GraphNode): void {
	const p = node.Params;
	const text = (key: string): string => p[key] as string;
	switch (node.Type as ActionType) {
		case ActionType.Show: Actions.Show(document, text("Widget")); break;
		case ActionType.Hide: Actions.Hide(document, text("Widget")); break;
		case ActionType.ToggleVisible: Actions.ToggleVisible(document, text("Widget")); break;
		case ActionType.Enable: Actions.Enable(document, text("Widget")); break;
		case ActionType.Disable: Actions.Disable(document, text("Widget")); break;
		case ActionType.EnabledFollowsCheck: Actions.EnabledFollowsCheck(document, text("Widget"), text("Check"), p["Invert"] === true); break;
		case ActionType.SetText: Actions.SetText(document, text("Widget"), text("Text")); break;
		case ActionType.Focus: Actions.Focus(document, text("Widget")); break;
		case ActionType.MessageBox: Actions.MessageBox(document, text("Text"), text("Title")); break;
		case ActionType.CloseForm: Actions.CloseForm(document, text("Result") as DialogResult); break;
	}
}

//#endregion

/** The actions an event (or action) leads to, in link order, each once (what runs, and what code generation writes). */
export function Chain(graph: UiGraph, from: string, visited = new Set<string>([from])): GraphNode[] {
	const out: GraphNode[] = [];
	for (const link of graph.Links) {
		if (link.From !== from || visited.has(link.To)) continue;
		const node = graph.Nodes.find((n) => n.Id === link.To);
		if (!node) continue;
		visited.add(node.Id);
		out.push(node, ...Chain(graph, node.Id, visited));
	}
	return out;
}

function Passes(node: GraphNode, args: unknown[]): boolean {
	if (node.Params["When"] === CheckCondition.Checked) return args[0] === CheckState.Checked;
	if (node.Params["When"] === CheckCondition.Unchecked) return args[0] === CheckState.Unchecked;
	return true;
}

/** Runs a layout's graph in its document: each event node subscribes, its action chain executes in order. */
export class GraphRunner {
	private readonly _subscriptions: (() => void)[] = [];

	public constructor(document: UiDocument, graph: UiGraph) {
		for (const node of graph.Nodes) {
			const widget = node.Params["Widget"] as string;
			if (node.Kind !== GraphNodeKind.Event || !document.Find(widget)?.Controller) continue;
			const actions = Chain(graph, node.Id);
			this._subscriptions.push(document.On(widget, node.Type, (...args) => {
				if (Passes(node, args)) for (const action of actions) Execute(document, action);
			}));
		}
	}

	public Dispose(): void {
		for (const off of this._subscriptions.splice(0)) off();
	}
}

//#region files

const IsObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const Kinds: string[] = [GraphNodeKind.Event, GraphNodeKind.Action];

function ReadNode(raw: unknown): GraphNode | null {
	if (!IsObject(raw) || typeof raw["Id"] !== "string" || !Kinds.includes(raw["Kind"] as string) || typeof raw["Type"] !== "string") return null;
	if (raw["Kind"] === GraphNodeKind.Action && !ActionTypes.includes(raw["Type"] as ActionType)) return null;
	if (typeof raw["X"] !== "number" || typeof raw["Y"] !== "number") return null;
	const params: Record<string, GraphParam> = {};
	for (const [key, value] of Object.entries(IsObject(raw["Params"]) ? raw["Params"] : {})) {
		if (typeof value === "string" || typeof value === "boolean") params[key] = value;
	}
	return { Id: raw["Id"], Kind: raw["Kind"] as GraphNodeKind, Type: raw["Type"], X: raw["X"], Y: raw["Y"], Params: params };
}

/** Reads a graph from a layout file, keeping what is valid: unknown nodes, bad params and dangling links are dropped. */
export function ParseGraph(raw: unknown): UiGraph {
	const record = IsObject(raw) ? raw : {};
	const nodes = (Array.isArray(record["Nodes"]) ? record["Nodes"] : []).map(ReadNode).filter((n): n is GraphNode => n !== null);
	const ids = new Set(nodes.map((n) => n.Id));
	const links = (Array.isArray(record["Links"]) ? record["Links"] : []).filter((l): l is GraphLink =>
		IsObject(l) && typeof l["From"] === "string" && typeof l["To"] === "string" && ids.has(l["From"]) && ids.has(l["To"]));
	return { Nodes: nodes, Links: links.map((l) => ({ From: l.From, To: l.To })) };
}

//#endregion
