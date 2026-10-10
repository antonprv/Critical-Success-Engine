// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { WidgetType } from "@cse/ui";
import WinDesigner from "../Source/WinDesigner.vue";
import type { DesignerController } from "../Source/DesignerController";
import { nextTick } from "vue";

/** Dispatches a left-button press and says whether the component cancelled the browser's default (text selection, image drag). */
function Press(element: Element): boolean {
	const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 });
	element.dispatchEvent(event);
	window.dispatchEvent(new MouseEvent("pointerup"));
	return event.defaultPrevented;
}

describe("the designer canvas doesn't start a text selection or a native image drag", () => {
	it("the designer canvas, and images on it are not draggable", async () => {
		const wrapper = mount(WinDesigner, { attachTo: document.body });
		const designer = (wrapper.vm as unknown as { designer: DesignerController; }).designer;
		const image = designer.Add(WidgetType.Image);
		designer.SetProp(image.Name, "Source", "data:image/png;base64,AA");
		await nextTick();
		expect(Press(wrapper.get('.win-designer__canvas [data-name="Image1"]').element)).toBe(true);
		expect(wrapper.get('.win-designer__canvas [data-name="Image1"] img').attributes("draggable")).toBe("false");
		wrapper.unmount();
	});
});
