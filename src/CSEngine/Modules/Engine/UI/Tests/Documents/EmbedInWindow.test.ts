// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import type { ComboBoxController } from "../../Source/Controls/ComboBoxController";
import { CreateNode, IsEmbeddedInWindow, NewLayout, ParseLayout, SerializeLayout, WidgetType } from "../../Source/Documents/Layout";
import { UiDocument } from "../../Source/Documents/UiDocument";
import WinLayoutView from "../../Source/Documents/WinLayoutView.vue";

function Form(embedInWindow?: false) {
	const layout = NewLayout("Form");
	const combo = CreateNode(WidgetType.ComboBox, "Theme", 0, 0);
	if (embedInWindow === false) combo.EmbedInWindow = false;
	layout.Root.Children!.push(combo, CreateNode(WidgetType.ComboBox, "Genre", 0, 40));
	return layout;
}

afterEach(() => { document.body.innerHTML = ""; });

describe("Embed in window bounds: a flag every widget has, on by default", () => {
	it("a widget is embedded unless its file says false", () => {
		const layout = Form(false);
		expect(layout.Root.Children!.map(IsEmbeddedInWindow)).toEqual([false, true]);
	});

	it("only false is saved and read back; true and values of the wrong kind fall back to the default", () => {
		const read = ParseLayout(SerializeLayout(Form(false)));
		expect(read.Root.Children!.map((node) => node.EmbedInWindow)).toEqual([false, undefined]);
		expect(SerializeLayout(Form())).not.toContain("EmbedInWindow");

		const raw = JSON.parse(SerializeLayout(Form(false))) as { Root: { Children: { EmbedInWindow: unknown; }[]; }; };
		for (const value of [true, "no", 0, null]) {
			raw.Root.Children[0]!.EmbedInWindow = value;
			expect(ParseLayout(JSON.stringify(raw)).Root.Children![0]).not.toHaveProperty("EmbedInWindow");
		}
	});

	it("every widget type can carry it, not only combo boxes", () => {
		const layout = Form();
		const label = CreateNode(WidgetType.Label, "Caption", 0, 80);
		label.EmbedInWindow = false;
		layout.Root.Children!.push(label);
		expect(ParseLayout(SerializeLayout(layout)).Root.Children!.map((node) => node.EmbedInWindow)).toEqual([undefined, undefined, false]);
	});

	it("the combo box widget floats its list out of the layout only when its node says so", async () => {
		const document_ = new UiDocument(Form(false));
		mount(WinLayoutView, { props: { document: document_ }, attachTo: document.body });
		for (const name of ["Theme", "Genre"]) document_.Controller<ComboBoxController<string>>(name).Toggle();
		await flushPromises();

		const floating = [...document.querySelectorAll(".win-combobox__list--floating")];
		expect(floating).toHaveLength(1);
		expect(floating[0]!.closest(".win-popup-host")).not.toBeNull();
		expect(document.querySelector('[data-name="Theme"] [role=listbox]')).toBeNull();
		expect(document.querySelector('[data-name="Genre"] [role=listbox]')).not.toBeNull();
	});
});
