// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { CheckState, type CheckBoxController } from "../Controls/CheckBoxController";
import { ComboBoxController } from "../Controls/ComboBoxController";
import { RadioGroupController } from "../Controls/RadioGroupController";
import { StatusBarController } from "../Controls/StatusBarController";
import { TextBoxController } from "../Controls/TextBoxController";
import { WindowController } from "../Controls/WindowController";
import type { ControlBase } from "../Core/ControlBase";
import { watch } from "vue";
import { GetQuasarServices } from "../Quasar/QuasarServices";
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
	/** A variable gets a value (text, with {Name} put in, read as the variable's kind). */
	SetVariable = "set-variable",
	/** A number variable grows (or shrinks) by an amount. */
	AddToVariable = "add-to-variable",
	/** A notification (Quasar's Notify): text, and its type (positive, negative, warning, info, ongoing). */
	Notify = "notify",
	/** The page-wide loading screen (Quasar's Loading), with a message. */
	ShowLoading = "show-loading",
	HideLoading = "hide-loading",
	/** The page full screen, or back. */
	ToggleFullscreen = "toggle-fullscreen",
	/** Another screen of the app (a document by its manifest Id): this one goes, that one comes. */
	Navigate = "navigate",
	/** Back to the screen before. */
	GoBack = "go-back",
	/** Text to the clipboard. */
	CopyToClipboard = "copy-to-clipboard",
}

//#region variables

/** The event of a variable node: runs at the start and whenever the variable changes, when its test holds. */
export const VariableEvent = "variable";

export type GraphValue = string | number | boolean;

export const enum VariableKind {
	Number = "number",
	Text = "text",
	Boolean = "boolean",
}

export const VariableKinds: readonly VariableKind[] = [VariableKind.Number, VariableKind.Text, VariableKind.Boolean];

/**
 * A value of the document the graph reads, tests and changes. The game sets it (a component's parameter, through
 * GameUi.SetVariable), the graph or a script sets it, or it follows a widget's value (Widget).
 */
export interface GraphVariable {
	Name: string;
	Kind: VariableKind;
	Default: GraphValue;
	/** The widget whose value the variable follows: a check box's checked, a text box's or slider's value, a label's text. */
	Widget?: string;
}

/** The test of a variable event, between the variable and its Value param. */
export const enum Compare {
	Any = "any",
	Equal = "==",
	NotEqual = "!=",
	Greater = ">",
	Less = "<",
	GreaterOrEqual = ">=",
	LessOrEqual = "<=",
}

export const Compares: readonly Compare[] = [Compare.Any, Compare.Equal, Compare.NotEqual, Compare.Greater, Compare.Less, Compare.GreaterOrEqual, Compare.LessOrEqual];

/** A value read as a kind: "3" as 3 (not a number: 0), "true" / 1 as true. */
export function Coerce(kind: VariableKind | undefined, value: GraphValue): GraphValue {
	switch (kind) {
		case VariableKind.Number: {
			const number = Number(value);
			return Number.isFinite(number) ? number : 0;
		}
		case VariableKind.Boolean: return value === true || value === "true" || value === 1;
		case VariableKind.Text: return String(value);
		default: return value;
	}
}

/** Text with each {Name} of a known variable replaced by its value. */
export function Interpolate(text: string, variables: Readonly<Record<string, GraphValue>>): string {
	return text.replace(/\{([A-Za-z_][\w]*)\}/g, (whole, name: string) => (name in variables ? String(variables[name]) : whole));
}

/** Whether a variable's value passes a test against another (both read as the variable's kind). */
export function Test(value: GraphValue, compare: Compare, other: GraphValue): boolean {
	switch (compare) {
		case Compare.Equal: return value === other;
		case Compare.NotEqual: return value !== other;
		case Compare.Greater: return value > other;
		case Compare.Less: return value < other;
		case Compare.GreaterOrEqual: return value >= other;
		case Compare.LessOrEqual: return value <= other;
		default: return true;
	}
}

//#endregion

/** For change events of check boxes: run only when it became checked / unchecked. */
export const enum CheckCondition {
	Always = "always",
	Checked = "checked",
	Unchecked = "unchecked",
}

/**
 * For change events of combo boxes and radio buttons: run only when this option became the active one. The condition is
 * stored as "option:<index>" (the index survives renaming the option); no condition (or "always") runs on any choice.
 */
export const ChoiceCondition = (index: number): string => `option:${index}`;

/** The option index a "When" param names, or null when it names none. */
export function ChoiceIndex(when: GraphParam | undefined): number | null {
	const match = typeof when === "string" ? /^option:(\d+)$/.exec(when) : null;
	return match ? Number(match[1]) : null;
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
	/** The document's variables (absent: none). */
	Variables?: GraphVariable[];
}

export interface ActionInfo {
	Label: string;
	/** Parameter name and what it holds. */
	Params: { Key: string; Label: string; Kind: "widget" | "text" | "boolean" | "result" | "variable"; }[];
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
	[ActionType.CloseForm]: { Label: "Close document", Params: [{ Key: "Result", Label: "Result", Kind: "result" }] },
	[ActionType.SetVariable]: { Label: "Set variable", Params: [{ Key: "Variable", Label: "Variable", Kind: "variable" }, { Key: "Value", Label: "Value", Kind: "text" }] },
	[ActionType.AddToVariable]: { Label: "Add to variable", Params: [{ Key: "Variable", Label: "Variable", Kind: "variable" }, { Key: "Amount", Label: "Amount", Kind: "text" }] },
	[ActionType.Notify]: { Label: "Notify", Params: [{ Key: "Text", Label: "Text", Kind: "text" }, { Key: "Type", Label: "Type (positive, negative, warning, info)", Kind: "text" }] },
	[ActionType.ShowLoading]: { Label: "Show loading screen", Params: [{ Key: "Text", Label: "Message", Kind: "text" }] },
	[ActionType.HideLoading]: { Label: "Hide loading screen", Params: [] },
	[ActionType.ToggleFullscreen]: { Label: "Full screen on / off", Params: [] },
	[ActionType.Navigate]: { Label: "Go to screen", Params: [{ Key: "Document", Label: "Document (manifest Id)", Kind: "text" }] },
	[ActionType.GoBack]: { Label: "Go back", Params: [] },
	[ActionType.CopyToClipboard]: { Label: "Copy to clipboard", Params: [{ Key: "Text", Label: "Text", Kind: "text" }] },
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
	/** A notification; a type Quasar knows colours it (positive, negative, warning, info, ongoing). */
	Notify: (text: string, type = ""): void => { void GetQuasarServices().Notify(type ? { message: text, type } : text); },
	ShowLoading: (text = ""): void => { void GetQuasarServices().ShowLoading(text ? { message: text } : {}); },
	HideLoading: (): void => { void GetQuasarServices().HideLoading(); },
	ToggleFullscreen: (): void => { void GetQuasarServices().ToggleFullscreen(); },
	Navigate: (document: UiDocument, id: string): void => {
		if (!document.Navigator) throw new Error("This UI has no screens to go to: show it with a UiManager");
		void document.Navigator.Navigate(id);
	},
	GoBack: (document: UiDocument): void => {
		if (!document.Navigator) throw new Error("This UI has no screens to go back to: show it with a UiManager");
		void document.Navigator.Back();
	},
	/** Text to the clipboard (Quasar's copyToClipboard: the browser's API, else the old way). */
	CopyToClipboard: (text: string): void => { void import("quasar/src/utils/copy-to-clipboard/copy-to-clipboard.js").then(({ default: copy }) => (copy as (text: string) => Promise<void>)(text)).catch(() => undefined); },
	/** Text has {Name} put in first; the value is read as the variable's kind. */
	SetVariable: (document: UiDocument, name: string, value: GraphValue): void =>
		document.SetVariable(name, typeof value === "string" ? Interpolate(value, document.Variables) : value),
	AddToVariable: (document: UiDocument, name: string, amount: GraphValue): void => {
		const by = Number(typeof amount === "string" ? Interpolate(amount, document.Variables) : amount);
		document.SetVariable(name, Number(document.Variables[name] ?? 0) + (Number.isFinite(by) ? by : 0));
	},
};

function Execute(document: UiDocument, node: GraphNode): void {
	const p = node.Params;
	// Text params show variables: "Score: {Score}".
	const text = (key: string): string => Interpolate(p[key] as string, document.Variables);
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
		case ActionType.SetVariable: Actions.SetVariable(document, p["Variable"] as string, p["Value"] as string); break;
		case ActionType.AddToVariable: Actions.AddToVariable(document, p["Variable"] as string, p["Amount"] as string); break;
		case ActionType.Notify: Actions.Notify(text("Text"), text("Type")); break;
		case ActionType.ShowLoading: Actions.ShowLoading(text("Text")); break;
		case ActionType.HideLoading: Actions.HideLoading(); break;
		case ActionType.ToggleFullscreen: Actions.ToggleFullscreen(); break;
		case ActionType.Navigate: Actions.Navigate(document, text("Document")); break;
		case ActionType.GoBack: Actions.GoBack(document); break;
		case ActionType.CopyToClipboard: Actions.CopyToClipboard(text("Text")); break;
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

function Passes(node: GraphNode, args: unknown[], controller: unknown): boolean {
	if (node.Type === "dialog-result") {
		const want = node.Params["When"];
		return want === undefined || want === "" || want === "any" || want === args[0];
	}

	const option = node.Type === "change" ? ChoiceIndex(node.Params["When"]) : null;
	if (option !== null) {
		// A combo box reports the new index; radio buttons the new value, which is looked up among their options.
		if (controller instanceof ComboBoxController) return args[0] === option;
		if (controller instanceof RadioGroupController) return controller.Options.findIndex((o) => o.Value === args[0]) === option;
		return false;
	}
	if (node.Params["When"] === CheckCondition.Checked) return args[0] === CheckState.Checked;
	if (node.Params["When"] === CheckCondition.Unchecked) return args[0] === CheckState.Unchecked;
	return true;
}

/** Runs a layout's graph in its document: each event node subscribes, its action chain executes in order. */
export class GraphRunner {
	private readonly _subscriptions: (() => void)[] = [];

	public constructor(document: UiDocument, graph: UiGraph) {
		for (const node of graph.Nodes) {
			if (node.Kind === GraphNodeKind.Event && node.Type === VariableEvent) {
				this.WatchVariable(document, graph, node);
				continue;
			}
			const widget = node.Params["Widget"] as string;
			if (node.Kind !== GraphNodeKind.Event || !document.Find(widget)?.Controller) continue;
			const actions = Chain(graph, node.Id);
			const controller = document.Find(widget)?.Controller;
			this._subscriptions.push(document.On(widget, node.Type, (...args) => {
				if (Passes(node, args, controller)) for (const action of actions) Execute(document, action);
			}));
		}
	}

	/** Runs the chain now and on every change of the variable, when the test holds (Vue, synchronously: no frame to wait). */
	private WatchVariable(document: UiDocument, graph: UiGraph, node: GraphNode): void {
		const name = node.Params["Variable"] as string;
		const compare = (node.Params["Compare"] as Compare | undefined) ?? Compare.Any;
		const kind = graph.Variables?.find((variable) => variable.Name === name)?.Kind;
		const actions = Chain(graph, node.Id);
		this._subscriptions.push(watch(() => document.Variables[name], (value) => {
			if (value === undefined) return;
			const other = Coerce(kind, Interpolate(String(node.Params["Value"] ?? ""), document.Variables));
			if (Test(value, compare, other)) for (const action of actions) Execute(document, action);
		}, { immediate: true, flush: "sync" }));
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

function ReadVariables(raw: unknown[]): GraphVariable[] {
	const out: GraphVariable[] = [];
	for (const item of raw) {
		if (!IsObject(item) || typeof item["Name"] !== "string" || item["Name"] === "" || !VariableKinds.includes(item["Kind"] as VariableKind)) continue;
		if (out.some((variable) => variable.Name === item["Name"])) continue;
		const kind = item["Kind"] as VariableKind;
		const value = item["Default"];
		const variable: GraphVariable = { Name: item["Name"], Kind: kind, Default: Coerce(kind, typeof value === "number" || typeof value === "string" || typeof value === "boolean" ? value : "") };
		if (typeof item["Widget"] === "string") variable.Widget = item["Widget"];
		out.push(variable);
	}
	return out;
}

/** Reads a graph from a layout file, keeping what is valid: unknown nodes, bad params and dangling links are dropped. */
export function ParseGraph(raw: unknown): UiGraph {
	const record = IsObject(raw) ? raw : {};
	const nodes = (Array.isArray(record["Nodes"]) ? record["Nodes"] : []).map(ReadNode).filter((n): n is GraphNode => n !== null);
	const ids = new Set(nodes.map((n) => n.Id));
	const links = (Array.isArray(record["Links"]) ? record["Links"] : []).filter((l): l is GraphLink =>
		IsObject(l) && typeof l["From"] === "string" && typeof l["To"] === "string" && ids.has(l["From"]) && ids.has(l["To"]));
	const graph: UiGraph = { Nodes: nodes, Links: links.map((l) => ({ From: l.From, To: l.To })) };
	if (Array.isArray(record["Variables"])) graph.Variables = ReadVariables(record["Variables"]);
	return graph;
}

//#endregion
