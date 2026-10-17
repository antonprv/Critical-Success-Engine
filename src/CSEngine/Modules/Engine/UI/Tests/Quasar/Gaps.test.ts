// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import WinToast from "../../Source/Components/WinToast.vue";
import { ToastController } from "../../Source/Controls/ToastController";
import { NewLayout, ParseLayout, SerializeLayout, WidgetType } from "../../Source/Documents/Layout";
import { UiDocument } from "../../Source/Documents/UiDocument";
import WinLayoutView from "../../Source/Documents/WinLayoutView.vue";
import { ValidateSkin } from "../../Source/Skins/Skin";
import { QuasarComponentTable, QuasarDirectiveTable, QuasarLanguageTable } from "../../Source/Quasar/QuasarTable.generated";

describe("every module of the Quasar table", () => {
	it("loads: each component and directive is the one its row names", async () => {
		for (const row of QuasarComponentTable) {
			const { default: component } = await row.Load();
			expect((component as { name?: string; }).name, row.Name).toBe(row.Name);
		}
		for (const [code, load] of Object.entries(QuasarLanguageTable)) {
			const { default: pack } = await load();
			// a few files are old names of another pack ("kur-CKB" is "ckb")
			expect((pack as { isoName: string; }).isoName.length, code).toBeGreaterThan(1);
		}
		for (const row of QuasarDirectiveTable) {
			const { default: directive } = await row.Load();
			expect((directive as { name?: string; }).name, row.Name).toBe(row.Attr.slice(2));
		}
	}, 60_000);
});

describe("corners of layouts", () => {
	it("a Quasar widget's prop nested deeper than JSON allows is dropped", () => {
		let deep: unknown = 1;
		for (let i = 0; i < 70; i++) deep = [deep];
		const layout = NewLayout("Deep");
		const text = SerializeLayout(layout).replace('"Children": []', `"Children": [{ "Name": "Card", "Type": "q-card", "X": 0, "Y": 0, "Width": 10, "Height": 10, "Props": { "deep": ${JSON.stringify(deep)}, "flat": true } }]`);
		expect(ParseLayout(text).Root.Children![0]!.Props).toEqual({ flat: true });
	});

	it("a canvas with no props of its own draws nothing behind its widgets; each fill draws its own", () => {
		const layout = NewLayout("Fills");
		layout.Root.Props = {};
		const plain = mount(WinLayoutView, { props: { document: new UiDocument(layout) } });
		expect(plain.find(".win-fill").exists()).toBe(false);
		for (const [fill, expected] of [["solid", "rgb(0, 0, 0)"], ["gradient", "linear-gradient(180deg, #000000, #004e98)"], ["skin", "var(--skin-desktop, none)"]] as const) {
			const filled = NewLayout(fill);
			filled.Root.Props = { Fill: fill, Blur: 3 };
			const wrapper = mount(WinLayoutView, { props: { document: new UiDocument(filled) } });
			const style = (wrapper.get(".win-fill").element as HTMLElement).style;
			expect(style.background, fill).toContain(expected.split("(")[0]);
			wrapper.unmount();
		}
		expect(WidgetType.Canvas).toBe("canvas");
	});

	it("a skin keeps its numbers only when they are numbers", () => {
		expect(ValidateSkin({ Id: "s", Name: "S", Parts: {}, DesktopOpacity: "high", DesktopBlur: 2 })).toEqual({ Id: "s", Name: "S", Parts: {}, DesktopBlur: 2 });
	});

	it("a toast shows each of its lines", async () => {
		const toast = new ToastController();
		const wrapper = mount(WinToast, { props: { controller: toast } });
		(wrapper.vm as unknown as { controller: ToastController; }).controller.SetItems(["Saved", "Loaded"]);
		await nextTick();
		await flushPromises();
		expect(wrapper.findAll(".win-toast").map((item) => item.text())).toEqual(["Saved", "Loaded"]);
	});
});
