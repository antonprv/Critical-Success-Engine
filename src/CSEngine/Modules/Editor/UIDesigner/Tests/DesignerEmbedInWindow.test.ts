// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { NewLayout, WidgetType } from "@cse/ui";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { DesignerController } from "../Source/DesignerController";
import WinDesigner from "../Source/WinDesigner.vue";

describe("Embed in window bounds in the designer", () => {
	it("is set per widget, undoably; the file keeps the flag only when it is off", () => {
		const designer = new DesignerController(NewLayout("Form"));
		designer.Add(WidgetType.ComboBox);
		designer.SetEmbedInWindow("ComboBox1", false);
		expect(designer.Find("ComboBox1")!.EmbedInWindow).toBe(false);
		designer.Undo();
		expect(designer.Find("ComboBox1")).not.toHaveProperty("EmbedInWindow");
		designer.Redo();
		designer.SetEmbedInWindow("ComboBox1", true);
		expect(designer.Find("ComboBox1")).not.toHaveProperty("EmbedInWindow");
		designer.SetEmbedInWindow("Ghost", false); // no such widget: nothing happens
		expect(designer.Find("Ghost")).toBeUndefined();
	});

	it("the details panel has a check box for the selected widget, checked by default", async () => {
		const wrapper = mount(WinDesigner, { attachTo: document.body });
		const designer = (wrapper.vm as unknown as { designer: DesignerController; }).designer;
		designer.Add(WidgetType.ComboBox);
		await wrapper.vm.$nextTick();
		const box = wrapper.get('[data-field="EmbedInWindow"]');
		expect((box.element as HTMLInputElement).checked).toBe(true);
		expect(box.element.parentElement!.textContent).toContain("Embed in window bounds");
		await box.setValue(false);
		expect(designer.Find("ComboBox1")!.EmbedInWindow).toBe(false);
		await box.setValue(true);
		expect(designer.Find("ComboBox1")).not.toHaveProperty("EmbedInWindow");
		wrapper.unmount();
	});
});
