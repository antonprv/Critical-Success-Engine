// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { CloneJson, IsJson } from "../../Source/Documents/Json";
import { CreateNode, GroupOf, NewLayout, ParseLayout, PropKind, SerializeLayout, ToolkitGroup, WidgetType } from "../../Source/Documents/Layout";
import { BuiltInWidgets, IsValidProp } from "../../Source/Documents/Widgets";
import { QuasarComponentTable } from "../../Source/Quasar/QuasarTable.generated";
import { PaletteOrder, QuasarGroups } from "../../Source/Quasar/QuasarWidgets";

describe("JSON in layouts", () => {
	it("tells plain JSON from anything else", () => {
		expect(IsJson({ a: [1, "x", true, null, { b: 2 }] })).toBe(true);
		expect(IsJson(Number.NaN)).toBe(false);
		expect(IsJson(() => 1)).toBe(false);
		expect(IsJson(new Date())).toBe(false);
		expect(IsJson(undefined)).toBe(false);
		let deep: unknown = 1;
		for (let i = 0; i < 70; i++) deep = [deep];
		expect(IsJson(deep)).toBe(false);
		const value = { a: [1] };
		expect(CloneJson(value)).toEqual(value);
		expect(CloneJson(value)).not.toBe(value);
		expect(CloneJson("text")).toBe("text");
		expect(CloneJson(null)).toBeNull();
	});

	it("checks the JSON and rules kinds", () => {
		expect(IsValidProp({ Key: "rows", Label: "Rows", Kind: PropKind.Json, Default: [] }, [{ a: 1 }])).toBe(true);
		expect(IsValidProp({ Key: "rows", Label: "Rows", Kind: PropKind.Json, Default: [] }, () => 1)).toBe(false);
		expect(IsValidProp({ Key: "rules", Label: "Rules", Kind: PropKind.Rules, Default: [] }, ["email"])).toBe(true);
		expect(IsValidProp({ Key: "rules", Label: "Rules", Kind: PropKind.Rules, Default: [] }, "email")).toBe(false);
	});
});

describe("Quasar widgets in layout files", () => {
	it("are every Quasar component, grouped in the palette after the toolkit's own", () => {
		for (const row of QuasarComponentTable) {
			const definition = BuiltInWidgets.Get(row.Type)!;
			expect(definition.OpenProps, row.Name).toBe(true);
			expect(GroupOf(definition)).toBe(`Quasar: ${row.Group}`);
		}
		expect(GroupOf(BuiltInWidgets.Get(WidgetType.Button)!)).toBe(ToolkitGroup);
		// every group has its place in the palette, after the toolkit's own
		expect(new Set(QuasarComponentTable.map((row) => row.Group))).toEqual(new Set(QuasarGroups));
		expect(PaletteOrder(ToolkitGroup)).toBe(0);
		expect(PaletteOrder("Quasar: Layout")).toBe(1);
		expect(PaletteOrder("Quasar: Behaviour")).toBe(QuasarGroups.length);
		expect(BuiltInWidgets.Get("q-btn-dropdown")!.Label).toBe("Btn dropdown");
		expect(BuiltInWidgets.Get("q-input")!.Events).toContain("change");
		expect(BuiltInWidgets.Get("q-input")!.Events).not.toContain("update:model-value");
		expect(BuiltInWidgets.Get("q-btn")!.Events).toEqual(["click"]);
		expect(BuiltInWidgets.Get("q-ajax-bar")!.Container).toBe(false);
	});

	it("containers start with their own widgets, named after them", () => {
		const tabs = CreateNode("q-tabs", "Tabs1", 0, 0);
		expect(tabs.Children!.map((tab) => [tab.Name, tab.Type, tab.Props["label"]])).toEqual([["Tabs1_1", "q-tab", "One"], ["Tabs1_2", "q-tab", "Two"], ["Tabs1_3", "q-tab", "Three"]]);
		const list = CreateNode("q-list", "List1", 0, 0);
		expect(list.Children![0]!.Children![0]).toMatchObject({ Name: "List1_1_1", Type: "q-item-section", Content: "First item" });
		const layout = CreateNode("q-layout", "App", 0, 0);
		expect(layout.Children!.map((child) => child.Type)).toEqual(["q-header", "q-page-container"]);
		// a template's props are copies
		expect(CreateNode("q-tabs", "Other", 0, 0).Children![0]!.Props).not.toBe(tabs.Children![0]!.Props);
		// a slot a template names is kept
		const banner = BuiltInWidgets.Extend();
		banner.Register({ ...BuiltInWidgets.Get("q-banner")!, Type: "q-banner-x", Children: [{ Type: "q-btn", Slot: "action" }] });
		expect(CreateNode("q-banner-x", "B", 0, 0, banner).Children![0]!.Slot).toBe("action");
	});

	it("start with their starter props (copies), and keep whatever JSON props a file gives them, slots, text and directives", () => {
		const table = CreateNode("q-table", "Data", 0, 0);
		expect((table.Props["rows"] as unknown[]).length).toBe(3);
		const again = CreateNode("q-table", "Data2", 0, 0);
		expect(again.Props["rows"]).not.toBe(table.Props["rows"]);

		const layout = NewLayout("Quasar");
		const card = { ...CreateNode("q-card", "Card", 0, 0), Props: { flat: true, bordered: true }, Directives: { ripple: { color: "red" }, "touch-swipe:mouse.left": true } };
		card.Children = [{ ...CreateNode("q-btn", "Go", 0, 0), Slot: "default", Content: "Go" }];
		layout.Root.Children!.push(card);
		const parsed = ParseLayout(SerializeLayout(layout));
		expect(parsed.Root.Children![0]).toEqual(card);

		const raw = JSON.parse(SerializeLayout(layout));
		raw.Root.Children[0].Props = { label: "x", bad: { fn: "ok" } };
		raw.Root.Children[0].Directives = { "Bad Key": true, "close-popup": true };
		raw.Root.Children[0].Children[0].Slot = "";
		raw.Root.Children[0].Children[0].Content = 3;
		const loose = ParseLayout(JSON.stringify(raw)).Root.Children![0]!;
		expect(loose.Props).toEqual({ label: "x", bad: { fn: "ok" } }); // no starters added back
		expect(loose.Directives).toEqual({ "close-popup": true });
		expect(loose.Children![0]!.Slot).toBeUndefined();
		expect(loose.Children![0]!.Content).toBeUndefined();
		raw.Root.Children[0].Directives = { "Bad Key": true };
		expect(ParseLayout(JSON.stringify(raw)).Root.Children![0]!.Directives).toBeUndefined();
	});
});
