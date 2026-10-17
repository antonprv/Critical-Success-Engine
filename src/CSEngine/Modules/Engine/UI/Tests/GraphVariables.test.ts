// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import type { CheckBoxController } from "../Source/Controls/CheckBoxController";
import type { LabelController } from "../Source/Controls/LabelController";
import type { SliderController } from "../Source/Controls/SliderController";
import type { TextBoxController } from "../Source/Controls/TextBoxController";
import { ActionType, Compare, GraphNodeKind, Interpolate, ParseGraph, VariableEvent, VariableKind, type GraphNode, type UiGraph } from "../Source/Documents/Graph";
import { CreateNode, NewLayout, type UiLayout } from "../Source/Documents/Layout";
import { UiDocument } from "../Source/Documents/UiDocument";
import { UiScript, UiScriptRegistry } from "../Source/Documents/UiScript";
import { WidgetType } from "../Source/Documents/Widgets";

/** A HUD: a score label, a warning label, a "god mode" check box, a volume slider, a name box. */
function Hud(graph: UiGraph): UiLayout {
	const layout = NewLayout("Hud");
	layout.Root.Children!.push(
		CreateNode(WidgetType.Label, "Score", 0, 0),
		CreateNode(WidgetType.Label, "Warning", 0, 30),
		CreateNode(WidgetType.CheckBox, "God", 0, 60),
		CreateNode(WidgetType.Slider, "Volume", 0, 90),
		CreateNode(WidgetType.TextBox, "PlayerName", 0, 120),
	);
	layout.Graph = graph;
	return layout;
}

const When = (Id: string, Variable: string, compare = Compare.Any, Value = ""): GraphNode =>
	({ Id, Kind: GraphNodeKind.Event, Type: VariableEvent, X: 0, Y: 0, Params: { Variable, Compare: compare, Value } });
const Do = (Id: string, Type: ActionType, Params: Record<string, string | boolean>): GraphNode => ({ Id, Kind: GraphNodeKind.Action, Type, X: 0, Y: 0, Params });
const Label = (document: UiDocument, name: string) => document.Controller<LabelController>(name).Label;

describe("graph variables: values of the document the graph can read, test and change", () => {
	it("start at their defaults; text params put a variable's value in place of {Name} (unknown names stay)", () => {
		const document = new UiDocument(Hud({
			Variables: [{ Name: "Score", Kind: VariableKind.Number, Default: 0 }, { Name: "Player", Kind: VariableKind.Text, Default: "Ann" }],
			Nodes: [When("e", "Score"), Do("a", ActionType.SetText, { Widget: "Score", Text: "{Player}: {Score} {Lives}" })],
			Links: [{ From: "e", To: "a" }],
		}));
		expect(document.Variables).toEqual({ Score: 0, Player: "Ann" });
		expect(Label(document, "Score")).toBe("Ann: 0 {Lives}"); // a variable event runs once at the start: the label shows the value at once
		document.SetVariable("Score", 12);
		expect(Label(document, "Score")).toBe("Ann: 12 {Lives}"); // reactive: at once, no frame to wait
		expect(Interpolate("{a}{b}", { a: 1 })).toBe("1{b}");
	});

	it("a variable event runs when its test holds: any change, ==, !=, >, <, >=, <=", () => {
		const tests = [Compare.Any, Compare.Equal, Compare.NotEqual, Compare.Greater, Compare.Less, Compare.GreaterOrEqual, Compare.LessOrEqual];
		// each test counts its runs in a variable of its own
		const graph: UiGraph = { Variables: [{ Name: "Health", Kind: VariableKind.Number, Default: 100 }], Nodes: [], Links: [] };
		tests.forEach((compare, i) => {
			graph.Variables!.push({ Name: `Runs${i}`, Kind: VariableKind.Number, Default: 0 });
			graph.Nodes.push(When(`e${i}`, "Health", compare, "50"), Do(`a${i}`, ActionType.AddToVariable, { Variable: `Runs${i}`, Amount: "1" }));
			graph.Links.push({ From: `e${i}`, To: `a${i}` });
		});
		const document = new UiDocument(Hud(graph));
		const Ran = (): Compare[] => {
			const ran = tests.filter((_, i) => document.Variables[`Runs${i}`] === 1);
			tests.forEach((_, i) => { document.Variables[`Runs${i}`] = 0; });
			return ran;
		};
		expect(Ran()).toEqual([Compare.Any, Compare.NotEqual, Compare.Greater, Compare.GreaterOrEqual]); // at the start: 100
		document.SetVariable("Health", 50);
		expect(Ran()).toEqual([Compare.Any, Compare.Equal, Compare.GreaterOrEqual, Compare.LessOrEqual]);
		document.SetVariable("Health", 20);
		expect(Ran()).toEqual([Compare.Any, Compare.NotEqual, Compare.Less, Compare.LessOrEqual]);
		document.SetVariable("Health", 20); // no change: nothing runs
		expect(Ran()).toEqual([]);
	});

	it("Set variable and Add to variable: values are read as the variable's kind; text and booleans compare as such", () => {
		const document = new UiDocument(Hud({
			Variables: [
				{ Name: "Score", Kind: VariableKind.Number, Default: 1 },
				{ Name: "Best", Kind: VariableKind.Number, Default: 0 },
				{ Name: "Mode", Kind: VariableKind.Text, Default: "" },
				{ Name: "Paused", Kind: VariableKind.Boolean, Default: false },
			],
			Nodes: [
				When("e1", "Score", Compare.Greater, "{Best}"), Do("a1", ActionType.SetVariable, { Variable: "Best", Value: "{Score}" }),
				When("e2", "Mode", Compare.Equal, "hard"), Do("a2", ActionType.SetText, { Widget: "Warning", Text: "Hard!" }),
				When("e3", "Paused", Compare.Equal, "true"), Do("a3", ActionType.AddToVariable, { Variable: "Score", Amount: "-1" }),
			],
			Links: [{ From: "e1", To: "a1" }, { From: "e2", To: "a2" }, { From: "e3", To: "a3" }],
		}));
		expect(document.Variables["Best"]).toBe(1); // ran at the start: 1 > 0
		document.SetVariable("Score", 7);
		expect(document.Variables["Best"]).toBe(7);
		document.SetVariable("Score", "3"); // text into a number variable: read as a number
		expect([document.Variables["Score"], document.Variables["Best"]]).toEqual([3, 7]);
		document.SetVariable("Mode", "hard");
		expect(Label(document, "Warning")).toBe("Hard!");
		document.SetVariable("Paused", "true");
		expect([document.Variables["Paused"], document.Variables["Score"]]).toEqual([true, 2]);
		document.SetVariable("Paused", 0);
		expect(document.Variables["Paused"]).toBe(false);
		document.SetVariable("Score", "not a number");
		expect(document.Variables["Score"]).toBe(0);
		document.SetVariable("Free", "anything"); // not declared: kept as it is (text can still show it)
		expect(document.Variables["Free"]).toBe("anything");
	});

	it("a variable can follow a widget's value: a check box's checked, a slider's or a text box's value", () => {
		const document = new UiDocument(Hud({
			Variables: [
				{ Name: "GodMode", Kind: VariableKind.Boolean, Default: false, Widget: "God" },
				{ Name: "Volume", Kind: VariableKind.Number, Default: 0, Widget: "Volume" },
				{ Name: "Name", Kind: VariableKind.Text, Default: "", Widget: "PlayerName" },
				{ Name: "Lost", Kind: VariableKind.Text, Default: "x", Widget: "Gone" }, // no such widget: an ordinary variable
				{ Name: "LabelText", Kind: VariableKind.Text, Default: "", Widget: "Score" }, // a widget without a value: its text
			],
			Nodes: [When("e", "GodMode", Compare.Equal, "true"), Do("a", ActionType.SetText, { Widget: "Warning", Text: "God mode, {Name} at {Volume}" })],
			Links: [{ From: "e", To: "a" }],
		}));
		document.Controller<SliderController>("Volume").SetValue(30);
		document.Controller<TextBoxController>("PlayerName").SetValue("Bo");
		document.Controller<CheckBoxController>("God").Toggle();
		expect(Label(document, "Warning")).toBe("God mode, Bo at 30");
		expect(document.Variables["Lost"]).toBe("x");
		document.Controller<LabelController>("Score").Label = "hi";
		expect(document.Variables["LabelText"]).toBe("hi");
		document.Dispose();
		document.Controller<SliderController>("Volume").SetValue(60);
		expect(document.Variables["Volume"]).toBe(30); // disposed: stops following
	});

	it("initial values (the game's, set before the document showed) win over the defaults", () => {
		const document = new UiDocument(Hud({ Variables: [{ Name: "Score", Kind: VariableKind.Number, Default: 0 }], Nodes: [], Links: [] }), { Variables: { Score: 40 } });
		expect(document.Variables["Score"]).toBe(40);
		expect(new UiDocument(NewLayout("Plain")).Variables).toEqual({});
	});

	it("scripts have the same: Variable, SetVariable, AddToVariable, OnVariable (now and on change), Format", () => {
		const log: unknown[] = [];
		class Script extends UiScript {
			public override OnConstruct(): void {
				this.OnVariable("Score", (value) => log.push(value));
				this.SetVariable("Score", 5);
				this.AddToVariable("Score", 2);
				log.push(this.Variable("Score"), this.Format("={Score}"));
			}
		}
		const layout = Hud({ Variables: [{ Name: "Score", Kind: VariableKind.Number, Default: 1 }], Nodes: [], Links: [] });
		layout.Script = "Script";
		const document = new UiDocument(layout, { Scripts: new UiScriptRegistry().Register("Script", Script) });
		expect(log).toEqual([1, 5, 7, 7, "=7"]);
		document.Dispose();
		document.SetVariable("Score", 9);
		expect(log).toHaveLength(5); // the script's watches end with it
	});
});

describe("graph variables: the edges", () => {
	it("an event on a variable nobody set waits for it; Add to an unset variable starts from 0; a bad amount adds nothing", () => {
		const document = new UiDocument(Hud({
			Nodes: [When("e", "Later"), Do("a", ActionType.AddToVariable, { Variable: "Count", Amount: "{Step}" })],
			Links: [{ From: "e", To: "a" }],
		}), { Variables: { Step: 2 } }); // an initial value of an undeclared variable is kept too
		expect(document.Variables).toEqual({ Step: 2 });
		document.SetVariable("Later", "now");
		expect(document.Variables["Count"]).toBe(2);
		document.SetVariable("Step", "x");
		document.SetVariable("Later", "again");
		expect(document.Variables["Count"]).toBe(2);
	});

	it("a variable follows a combo box's index; a widget with neither value nor text gives empty text", () => {
		const layout = Hud({
			Variables: [{ Name: "Choice", Kind: VariableKind.Number, Default: -5, Widget: "Mode" }, { Name: "Bar", Kind: VariableKind.Text, Default: "x", Widget: "Status" }],
			Nodes: [], Links: [],
		});
		layout.Root.Children!.push(CreateNode(WidgetType.ComboBox, "Mode", 0, 150), CreateNode(WidgetType.StatusBar, "Status", 0, 180));
		const document = new UiDocument(layout);
		expect(document.Variables).toEqual({ Choice: 0, Bar: "" });
	});

	it("a script declares variables (once: a declared one stays), reads text as a variable's kind and tests values", () => {
		const log: unknown[] = [];
		class Script extends UiScript {
			public override OnConstruct(): void {
				this.DeclareVariable("Volume", "number", 5, "Volume");
				this.DeclareVariable("Volume", "text", "loud"); // declared already: left alone
				this.DeclareVariable("Limit", "number", 50);
				log.push(this.Variable("Volume"), this.Read("Limit", "{Volume}0"), this.Read("Free", "{Limit}!"));
				log.push(this.Test(60, ">", this.Read("Limit", "{Limit}")), this.Test(1, "any", 2), this.Test("a", "==", "b"));
			}
		}
		const layout = Hud({ Nodes: [], Links: [] });
		layout.Script = "Script";
		const document = new UiDocument(layout, { Scripts: new UiScriptRegistry().Register("Script", Script) });
		expect(log).toEqual([50, 500, "50!", true, true, false]); // the slider starts at 50: the variable follows it, not its default
		expect([document.KindOf("Volume"), document.KindOf("Free")]).toEqual([VariableKind.Number, undefined]);
	});

	it("a script's OnVariable waits for a variable nobody set", () => {
		const log: unknown[] = [];
		class Script extends UiScript {
			public override OnConstruct(): void { this.OnVariable("Later", (value) => log.push(value)); }
		}
		const layout = NewLayout("Plain");
		layout.Script = "Script";
		const document = new UiDocument(layout, { Scripts: new UiScriptRegistry().Register("Script", Script) });
		expect(log).toEqual([]);
		document.SetVariable("Later", true);
		expect(log).toEqual([true]);
	});
});

describe("graph variables in files", () => {
	it("are read back, keeping the valid ones (a name, a kind, a default of that kind; a duplicate name is dropped)", () => {
		const graph = ParseGraph({
			Nodes: [{ Id: "e", Kind: "event", Type: VariableEvent, X: 0, Y: 0, Params: { Variable: "Score", Compare: ">", Value: "3" } }],
			Links: [],
			Variables: [
				{ Name: "Score", Kind: "number", Default: 2 },
				{ Name: "Score", Kind: "text", Default: "" },
				{ Name: "Name", Kind: "text", Default: "Ann", Widget: "PlayerName" },
				{ Name: "On", Kind: "boolean", Default: "yes" },
				{ Name: "Odd", Kind: "text", Default: { not: "a value" } },
				{ Name: "", Kind: "number", Default: 0 },
				{ Name: "Bad", Kind: "color", Default: 0 },
				"junk",
			],
		});
		expect(graph.Variables).toEqual([
			{ Name: "Score", Kind: VariableKind.Number, Default: 2 },
			{ Name: "Name", Kind: VariableKind.Text, Default: "Ann", Widget: "PlayerName" },
			{ Name: "On", Kind: VariableKind.Boolean, Default: false },
			{ Name: "Odd", Kind: VariableKind.Text, Default: "" },
		]);
		expect(graph.Nodes[0]!.Params).toEqual({ Variable: "Score", Compare: ">", Value: "3" });
		expect(ParseGraph({ Nodes: [], Links: [] }).Variables).toBeUndefined();
	});
});
