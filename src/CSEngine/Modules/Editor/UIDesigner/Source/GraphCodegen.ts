// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ActionType, Chain, CheckCondition, ChoiceIndex, GraphNodeKind, WidgetType, type GraphNode, type GraphParam, type LayoutNode, type UiLayout } from "@cse/ui";

/** Turns a layout's node graph into a UiScript class doing exactly what the graph does (editor tooling). */


const Str = (value: GraphParam | undefined): string => JSON.stringify(value);

function Statement(node: GraphNode): string {
	const p = node.Params;
	switch (node.Type as ActionType) {
		case ActionType.EnabledFollowsCheck: return `this.EnabledFollowsCheck(${Str(p["Widget"])}, ${Str(p["Check"])}, ${p["Invert"] === true});`;
		case ActionType.SetText: return `this.SetText(${Str(p["Widget"])}, ${Str(p["Text"])});`;
		case ActionType.MessageBox: return `void this.MessageBox(${Str(p["Text"])}, ${Str(p["Title"])});`;
		case ActionType.CloseForm: return `this.Close(DialogResult.${p["Result"] as string});`;
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

/** "Main screen" -> "MainScreenNodes". */
export function GraphClassName(layout: UiLayout): string {
	const words = layout.Name.split(/[^A-Za-z0-9]+/).filter((w) => w !== "");
	const base = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join("");
	return `${/^[A-Za-z]/.test(base) ? base : `Layout${base}`}Nodes`;
}

/** The layout's node graph as a TypeScript UiScript class doing exactly what the graph does. */
export function GenerateGraphScript(layout: UiLayout): string {
	const graph = layout.Graph ?? { Nodes: [], Links: [] };
	const handlers: string[] = [];
	for (const node of graph.Nodes.filter((n) => n.Kind === GraphNodeKind.Event)) {
		const body = Chain(graph, node.Id).map((action) => Statement(action));
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

