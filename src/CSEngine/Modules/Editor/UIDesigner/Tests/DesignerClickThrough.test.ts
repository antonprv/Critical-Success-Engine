// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { NewLayout, WidgetType } from "@cse/ui";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { DesignerController } from "../Source/DesignerController";
import WinDesigner from "../Source/WinDesigner.vue";

describe("Click pass-through in the designer", () => {
	it("is set per widget and per document, undoably; files keep only what differs from the defaults", () => {
		const designer = new DesignerController(NewLayout("Pause menu"));
		designer.Add(WidgetType.Label);
		designer.SetClickThrough("Label1", true);
		designer.SetDocumentClickThrough(false);
		expect(designer.Find("Label1")!.ClickThrough).toBe(true);
		expect(designer.Layout.ClickThrough).toBe(false);
		designer.Undo();
		expect(designer.Layout.ClickThrough).toBeUndefined();
		designer.SetClickThrough("Label1", false);
		designer.SetDocumentClickThrough(true);
		expect(designer.Find("Label1")).not.toHaveProperty("ClickThrough");
		expect(designer.Layout).not.toHaveProperty("ClickThrough");
		designer.SetClickThrough("Ghost", true); // no such widget: nothing happens
		expect(designer.Find("Ghost")).toBeUndefined();
	});

	it("the details panel has the check boxes: the document's, and the selected widget's", async () => {
		const wrapper = mount(WinDesigner, { attachTo: document.body });
		const designer = (wrapper.vm as unknown as { designer: DesignerController; }).designer;
		designer.Add(WidgetType.Label);
		await wrapper.vm.$nextTick();
		const documentBox = wrapper.get('[data-field="LayoutClickThrough"]');
		expect((documentBox.element as HTMLInputElement).checked).toBe(true);
		await documentBox.setValue(false);
		expect(designer.Layout.ClickThrough).toBe(false);
		const widgetBox = wrapper.get('[data-field="ClickThrough"]');
		expect((widgetBox.element as HTMLInputElement).checked).toBe(false);
		await widgetBox.setValue(true);
		expect(designer.Find("Label1")!.ClickThrough).toBe(true);
		wrapper.unmount();
	});
});
