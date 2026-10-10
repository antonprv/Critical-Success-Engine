// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import type { ButtonController } from "@cse/ui";
import type { CheckBoxController } from "@cse/ui";
import type { StatusBarController } from "@cse/ui";
import type { TextBoxController } from "@cse/ui";
import type { WindowController } from "@cse/ui";
import { DialogService } from "@cse/ui";
import { ActionType, CheckCondition, GraphNodeKind, type UiGraph } from "@cse/ui";
import { GenerateGraphScript } from "../Source/GraphCodegen";
import { CreateNode, NewLayout, WidgetType, type UiLayout } from "@cse/ui";
import { UiDocument } from "@cse/ui";
import { UiScript, UiScriptRegistry } from "@cse/ui";

/** A main screen with a button that opens a settings window, a check box that disables a text box, and a status bar. */
function Screen(graph: UiGraph): UiLayout {
	const layout = NewLayout("Main screen");
	const settings = { ...CreateNode(WidgetType.Window, "Settings", 300, 20), Props: { ...CreateNode(WidgetType.Window, "x", 0, 0).Props, Title: "Settings", Visible: false } };
	layout.Root.Children!.push(
		{ ...CreateNode(WidgetType.Button, "OpenSettings", 10, 10), Props: { ...CreateNode(WidgetType.Button, "x", 0, 0).Props, Text: "Settings..." } },
		CreateNode(WidgetType.CheckBox, "Offline", 10, 40),
		CreateNode(WidgetType.TextBox, "Server", 10, 70),
		CreateNode(WidgetType.StatusBar, "Status", 0, 470),
		settings,
	);
	layout.Graph = graph;
	return layout;
}

const Event = (Id: string, Widget: string, EventName: string, extra: Record<string, string> = {}) => ({ Id, Kind: GraphNodeKind.Event, Type: EventName, X: 0, Y: 0, Params: { Widget, ...extra } });
const Action = (Id: string, Type: ActionType, Params: Record<string, string | boolean>) => ({ Id, Kind: GraphNodeKind.Action, Type, X: 0, Y: 0, Params });

const Example: UiGraph = {
	Nodes: [
		Event("e1", "OpenSettings", "click"),
		Action("a1", ActionType.Show, { Widget: "Settings" }),
		Action("a2", ActionType.SetText, { Widget: "Status", Text: "Settings opened" }),
		Event("e2", "Offline", "change", { When: CheckCondition.Checked }),
		Action("a3", ActionType.Disable, { Widget: "Server" }),
		Event("e3", "Offline", "change", { When: CheckCondition.Unchecked }),
		Action("a4", ActionType.Enable, { Widget: "Server" }),
	],
	Links: [{ From: "e1", To: "a1" }, { From: "a1", To: "a2" }, { From: "e2", To: "a3" }, { From: "e3", To: "a4" }],
};

describe("code generation", () => {
	it("turns the graph into a UiScript class that does the same, with readable names", () => {
		const code = GenerateGraphScript(Screen(Example));
		expect(code).toContain("export class MainScreenNodes extends UiScript {");
		expect(code).toContain('this.On("OpenSettings", "click", () => {');
		expect(code).toContain('this.Show("Settings");');
		expect(code).toContain('this.SetText("Status", "Settings opened");');
		expect(code).toContain('this.On("Offline", "change", (state) => {');
		expect(code).toContain("if (state === CheckState.Checked) {");
		expect(code).toContain('this.Disable("Server");');
		expect(code).toContain("if (state === CheckState.Unchecked) {");
		expect(code.indexOf('this.Show("Settings")')).toBeLessThan(code.indexOf('this.SetText("Status"'));
		expect(code).not.toMatch(/—/);
	});

	it("covers every action and escapes text", () => {
		const graph: UiGraph = {
			Nodes: [
				Event("e", "OpenSettings", "enter"),
				Action("1", ActionType.Hide, { Widget: "A" }), Action("2", ActionType.ToggleVisible, { Widget: "B" }),
				Action("3", ActionType.Enable, { Widget: "C" }), Action("4", ActionType.EnabledFollowsCheck, { Widget: "D", Check: "Offline", Invert: false }),
				Action("5", ActionType.EnabledFollowsCheck, { Widget: "E", Check: "Offline", Invert: true }),
				Action("6", ActionType.Focus, { Widget: "F" }), Action("7", ActionType.MessageBox, { Text: 'Say "hi"\\n', Title: "T" }),
				Action("8", ActionType.CloseForm, { Result: "Cancel" }), Action("9", ActionType.SetText, { Widget: "G", Text: "x" }),
			],
			Links: ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((to, i, all) => ({ From: i === 0 ? "e" : all[i - 1]!, To: to })),
		};
		const layout = Screen(graph);
		layout.Name = "  ";
		const code = GenerateGraphScript(layout);
		expect(code).toContain("export class LayoutNodes extends UiScript {");
		for (const line of ['this.Hide("A");', 'this.ToggleVisible("B");', 'this.Enable("C");', 'this.EnabledFollowsCheck("D", "Offline", false);', 'this.EnabledFollowsCheck("E", "Offline", true);', 'this.Focus("F");', 'void this.MessageBox("Say \\"hi\\"\\\\n", "T");', 'this.Close(DialogResult.Cancel);', 'this.SetText("G", "x");']) {
			expect(code, line).toContain(line);
		}
		expect(GenerateGraphScript(NewLayout("Empty"))).toContain("public override OnConstruct(): void {\n\t}");
	});
});

describe("the generated code does what the graph does", () => {
	/** Compiles the generated TypeScript and loads its class, with "@cse/ui" resolved to the toolkit. */
	async function Compile(code: string): Promise<new () => UiScript> {
		const ts = await import("typescript");
		const { CheckState } = await import("@cse/ui");
		const { DialogResults } = await import("@cse/ui");
		// const enums are not values in TypeScript: hand the generated code plain objects with the same members.
		const checkStates = { Checked: CheckState.Checked, Unchecked: CheckState.Unchecked };
		const dialogResults = Object.fromEntries(DialogResults.map((result) => [result, result]));
		const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
		const exports: Record<string, unknown> = {};
		const require = (id: string) => { expect(id).toBe("@cse/ui"); return { CheckState: checkStates, DialogResult: dialogResults, UiScript }; };
		new Function("exports", "require", js)(exports, require);
		return Object.values(exports)[0] as new () => UiScript;
	}

	it("the example: the button opens the window and writes the status, the check box disables the text box", async () => {
		const layout = Screen(Example);
		const Script = await Compile(GenerateGraphScript(layout));
		delete layout.Graph;
		layout.Script = "Generated";
		const document = new UiDocument(layout, { Scripts: new UiScriptRegistry().Register("Generated", Script) });
		document.Controller<ButtonController>("OpenSettings").PerformClick();
		expect(document.Controller<WindowController>("Settings").Visible).toBe(true);
		expect(document.Controller<StatusBarController>("Status").Panels[0]!.Text).toBe("Settings opened");
		document.Controller<CheckBoxController>("Offline").Toggle();
		expect(document.Controller<TextBoxController>("Server").Enabled).toBe(false);
		document.Controller<CheckBoxController>("Offline").Toggle();
		expect(document.Controller<TextBoxController>("Server").Enabled).toBe(true);
	});

	it("every action, compiled, matches the graph runner", async () => {
		const graph: UiGraph = {
			Nodes: [
				Event("e", "OpenSettings", "click"),
				Action("1", ActionType.Hide, { Widget: "OpenSettings" }), Action("2", ActionType.ToggleVisible, { Widget: "Server" }),
				Action("3", ActionType.Show, { Widget: "Settings" }), Action("4", ActionType.Disable, { Widget: "Status" }),
				Action("5", ActionType.Enable, { Widget: "Status" }), Action("6", ActionType.EnabledFollowsCheck, { Widget: "Server", Check: "Offline", Invert: false }),
				Action("7", ActionType.SetText, { Widget: "Settings", Text: "Options" }), Action("8", ActionType.Focus, { Widget: "Status" }),
				Action("9", ActionType.MessageBox, { Text: "Hi", Title: "T" }), Action("10", ActionType.CloseForm, { Result: "Retry" }),
			],
			Links: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((to, i, all) => ({ From: i === 0 ? "e" : all[i - 1]!, To: to })),
		};
		const State = (document: UiDocument, dialogs: DialogService) => [
			document.Controller<ButtonController>("OpenSettings").Visible, document.Controller<TextBoxController>("Server").Visible,
			document.Controller<WindowController>("Settings").Visible, document.Controller<StatusBarController>("Status").Enabled,
			document.Controller<TextBoxController>("Server").Enabled, document.Controller<WindowController>("Settings").Title,
			document.Controller<StatusBarController>("Status").Focused, dialogs.Open[0]?.MessageBox?.Text, document.Result,
		];
		const byGraph = new DialogService();
		const graphDocument = new UiDocument(Screen(graph), { Dialogs: byGraph });
		graphDocument.Controller<ButtonController>("OpenSettings").PerformClick();

		const layout = Screen(graph);
		const Script = await Compile(GenerateGraphScript(layout));
		delete layout.Graph;
		layout.Script = "Generated";
		const byCode = new DialogService();
		const codeDocument = new UiDocument(layout, { Scripts: new UiScriptRegistry().Register("Generated", Script), Dialogs: byCode });
		codeDocument.Controller<ButtonController>("OpenSettings").PerformClick();

		expect(State(codeDocument, byCode)).toEqual(State(graphDocument, byGraph));
		expect(State(codeDocument, byCode)).toEqual([false, false, true, true, false, "Options", true, "Hi", "Retry"]);
	});
});
