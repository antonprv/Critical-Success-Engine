// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { CreateNode, IsClickThrough, NewLayout, ParseLayout, SerializeLayout, WidgetType } from "../../Source/Documents/Layout";
import { UiDocument } from "../../Source/Documents/UiDocument";
import WinLayoutView from "../../Source/Documents/WinLayoutView.vue";

function Menu() {
	const layout = NewLayout("Menu");
	const crosshair = CreateNode(WidgetType.Label, "Crosshair", 0, 0);
	crosshair.ClickThrough = true;
	layout.Root.Children!.push(crosshair, CreateNode(WidgetType.Button, "Resume", 0, 40));
	return layout;
}

describe("click pass-through: what is set in the document decides who gets the mouse", () => {
	it("a document lets clicks through its empty places unless it says otherwise; a widget doesn't unless it says so", () => {
		const layout = Menu();
		expect(IsClickThrough(layout)).toBe(true);
		layout.ClickThrough = false;
		expect(IsClickThrough(layout)).toBe(false);
	});

	it("both flags are saved and read back; values of the wrong kind are dropped", () => {
		const layout = Menu();
		layout.ClickThrough = false;
		const read = ParseLayout(SerializeLayout(layout));
		expect(read.ClickThrough).toBe(false);
		expect(read.Root.Children!.map((n) => n.ClickThrough)).toEqual([true, undefined]);
		const raw = JSON.parse(SerializeLayout(layout)) as { ClickThrough: unknown; Root: { Children: { ClickThrough: unknown; }[]; }; };
		raw.ClickThrough = "no";
		raw.Root.Children[0]!.ClickThrough = 1;
		const loose = ParseLayout(JSON.stringify(raw));
		expect([loose.ClickThrough, loose.Root.Children![0]!.ClickThrough]).toEqual([undefined, undefined]);
	});

	it("the view marks the document and the widgets, so the layer over the game knows who takes the mouse", () => {
		const layout = Menu();
		const view = (l = layout) => mount(WinLayoutView, { props: { document: new UiDocument(l) } });
		const passing = view();
		expect(passing.get(".win-layout").classes()).toContain("win-layout--click-through");
		expect(passing.get('[data-name="Crosshair"]').classes()).toContain("win-layout__node--click-through");
		expect(passing.get('[data-name="Resume"]').classes()).not.toContain("win-layout__node--click-through");
		layout.ClickThrough = false;
		expect(view().get(".win-layout").classes()).not.toContain("win-layout--click-through");
	});
});
