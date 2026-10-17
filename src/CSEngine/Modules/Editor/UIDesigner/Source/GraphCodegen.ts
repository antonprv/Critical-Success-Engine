// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ActionType, Chain, CheckCondition, ChoiceIndex, Coerce, Compare, GraphNodeKind, VariableEvent, WidgetType, type GraphNode, type GraphParam, type UiGraph, type UiLayout, type LayoutNode } from "@cse/ui";

/** Turns a layout's node graph into a UiScript class doing exactly what the graph does (editor tooling). */


const Str = (value: GraphParam | number | undefined): string => JSON.stringify(value);
/** A text param: as it is, or formatted when it shows variables ({Name}). */
const Text = (value: GraphParam | undefined): string => (typeof value === "string" && value.includes("{") ? `this.Format(${Str(value)})` : Str(value));
const KindOf = (graph: UiGraph, name: GraphParam | undefined) => graph.Variables?.find((variable) => variable.Name === name)?.Kind;

/** A value for a variable: read as its kind here, unless it shows variables (then the script reads it when it runs). */
function Value(graph: UiGraph, name: GraphParam | undefined, text: GraphParam | undefined): string {
	const value = String(text ?? "");
	return value.includes("{") ? Str(value) : Str(Coerce(KindOf(graph, name), value));
}

/** An amount to add: a number here, unless it shows variables. */
function Amount(text: GraphParam | undefined): string {
	const value = String(text ?? "");
	if (value.includes("{")) return Str(value);
	const number = Number(value);
	return String(Number.isFinite(number) ? number : 0);
}

function Statement(graph: UiGraph, node: GraphNode): string {
	const p = node.Params;
	switch (node.Type as ActionType) {
		case ActionType.EnabledFollowsCheck: return `this.EnabledFollowsCheck(${Str(p["Widget"])}, ${Str(p["Check"])}, ${p["Invert"] === true});`;
		case ActionType.SetText: return `this.SetText(${Str(p["Widget"])}, ${Text(p["Text"])});`;
		case ActionType.MessageBox: return `void this.MessageBox(${Text(p["Text"])}, ${Text(p["Title"])});`;
		case ActionType.SetVariable: return `this.SetVariable(${Str(p["Variable"])}, ${Value(graph, p["Variable"], p["Value"])});`;
		case ActionType.AddToVariable: return `this.AddToVariable(${Str(p["Variable"])}, ${Amount(p["Amount"])});`;
		case ActionType.CloseForm: return `this.Close(DialogResult.${p["Result"] as string});`;
		case ActionType.Notify: return `this.Notify(${Text(p["Text"])}, ${Text(p["Type"])});`;
		case ActionType.ShowLoading: return `this.ShowLoading(${Text(p["Text"])});`;
		case ActionType.HideLoading: return "this.HideLoading();";
		case ActionType.ToggleFullscreen: return "this.ToggleFullscreen();";
		case ActionType.Navigate: return `this.Navigate(${Text(p["Document"])});`;
		case ActionType.GoBack: return "this.GoBack();";
		case ActionType.CopyToClipboard: return `this.CopyToClipboard(${Text(p["Text"])});`;
		default: return `this.${ActionMethods[node.Type as ActionType]}(${Str(p["Widget"])});`;
	}
}

const ActionMethods: Partial<Record<ActionType, string>> = {
	[ActionType.Show]: "Show", [ActionType.Hide]: "Hide", [ActionType.ToggleVisible]: "ToggleVisible",
	[ActionType.Enable]: "Enable", [ActionType.Disable]: "Disable", [ActionType.Focus]: "Focus",
};

function FindNode(node: LayoutNode, name: string): LayoutNode | undefined {
	if (node.Name === name) return node;
	for (const child of node.Children ?? []) {
		const found = FindNode(child, name);
		if (found) return found;
	}
	return undefined;
}

/** A variable event: OnVariable, with the event's test (none for any change). */
function VariableHandler(graph: UiGraph, node: GraphNode, body: string[]): string {
	const name = node.Params["Variable"];
	const compare = (node.Params["Compare"] as Compare | undefined) ?? Compare.Any;
	const text = String(node.Params["Value"] ?? "");
	const other = text.includes("{") ? `this.Read(${Str(name)}, ${Str(text)})` : Str(Coerce(KindOf(graph, name), text));
	const lines = compare === Compare.Any
		? body.map((l) => `\t\t\t${l}`)
		: [`\t\t\tif (this.Test(value, ${Str(compare)}, ${other})) {`, ...body.map((l) => `\t\t\t\t${l}`), "\t\t\t}"];
	return [`\t\tthis.OnVariable(${Str(name)}, (${compare === Compare.Any ? "" : "value"}) => {`, ...lines, "\t\t});"].join("\n");
}

/** "Main screen" -> "MainScreenNodes". */
export function GraphClassName(layout: UiLayout): string {
	const words = layout.Name.split(/[^A-Za-z0-9]+/).filter((w) => w !== "");
	const base = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join("");
	return `${/^[A-Za-z]/.test(base) ? base : `Layout${base}`}Nodes`;
}

/** The layout's node graph as a TypeScript UiScript class doing exactly what the graph does. */
export function GenerateGraphScript(layout: UiLayout): string {
	const graph = layout.Graph ?? { Nodes: [], Links: [] };
	// The variables first: the handlers below may read them at once.
	const handlers: string[] = (graph.Variables ?? []).map((variable) =>
		`\t\tthis.DeclareVariable(${[variable.Name, variable.Kind, variable.Default, ...(variable.Widget ? [variable.Widget] : [])].map(Str).join(", ")});`);
	for (const node of graph.Nodes.filter((n) => n.Kind === GraphNodeKind.Event)) {
		const body = Chain(graph, node.Id).map((action) => Statement(graph, action));
		if (node.Type === VariableEvent) {
			handlers.push(VariableHandler(graph, node, body));
			continue;
		}
		const when = node.Params["When"];
		const widget = FindNode(layout.Root, node.Params["Widget"] as string);
		const option = node.Type === "change" ? ChoiceIndex(when) : null;
		// The handler's own argument and the test it makes: a check box's state, a combo box's index, a radio button's value.
		let argument = "", test = "";
		if (when === CheckCondition.Checked || when === CheckCondition.Unchecked) {
			argument = "state";
			test = `state === CheckState.${when === CheckCondition.Checked ? "Checked" : "Unchecked"}`;
		} else if (option !== null && widget?.Type === WidgetType.ComboBox) {
			argument = "index";
			test = `index === ${option}`;
		} else if (option !== null && widget?.Type === WidgetType.RadioGroup) {
			argument = "value";
			test = `value === ${Str((widget.Props["Options"] as string[])[option])}`;
		}
		const lines = test !== ""
			? [`\t\t\tif (${test}) {`, ...body.map((l) => `\t\t\t\t${l}`), "\t\t\t}"]
			: body.map((l) => `\t\t\t${l}`);
		handlers.push([`\t\tthis.On(${Str(node.Params["Widget"])}, ${Str(node.Type)}, (${argument}) => {`, ...lines, "\t\t});"].join("\n"));
	}
	return [
		`// Generated from the node graph of the layout "${layout.Name}". It is rewritten on every change of the graph:`,
		"// put your own code in other files.",
		'import { CheckState, DialogResult, UiScript } from "@cse/ui";',
		"",
		`export class ${GraphClassName(layout)} extends UiScript {`,
		"\tpublic override OnConstruct(): void {",
		...(handlers.length > 0 ? [handlers.join("\n")] : []),
		"\t}",
		"}",
		"",
	].join("\n");
}

