// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { ScrollBarController } from "../../Source/Toolkit/Controls/ScrollBarController";
import { SliderController } from "../../Source/Toolkit/Controls/SliderController";
import { WindowController } from "../../Source/Toolkit/Controls/WindowController";
import { UseControl } from "../../Source/Toolkit/Core/UseControl";
import { WidgetType } from "../../Source/Toolkit/Designer/Layout";
import WinScrollBar from "../../Source/Toolkit/Components/WinScrollBar.vue";
import WinSlider from "../../Source/Toolkit/Components/WinSlider.vue";
import WinWindow from "../../Source/Toolkit/Components/WinWindow.vue";
import WinDesigner from "../../Source/Toolkit/Designer/WinDesigner.vue";
import type { DesignerController } from "../../Source/Toolkit/Designer/DesignerController";
import { nextTick } from "vue";

/** Dispatches a left-button press and says whether the component cancelled the browser's default (text selection, image drag). */
function Press(element: Element): boolean {
	const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 });
	element.dispatchEvent(event);
	window.dispatchEvent(new MouseEvent("pointerup"));
	return event.defaultPrevented;
}

describe("drags don't start a text selection or a native image drag", () => {
	it("window title bar and borders", () => {
		const wrapper = mount(WinWindow, { props: { controller: UseControl(new WindowController({ Title: "W" })) }, attachTo: document.body });
		expect(Press(wrapper.get(".win-window__titlebar").element)).toBe(true);
		expect(Press(wrapper.get(".win-window__resize--right").element)).toBe(true);
		wrapper.unmount();
	});

	it("slider track and scroll bar thumb", () => {
		const slider = mount(WinSlider, { props: { controller: UseControl(new SliderController()) }, attachTo: document.body });
		expect(Press(slider.get(".win-slider__track").element)).toBe(true);
		const scroll = mount(WinScrollBar, { props: { controller: UseControl(new ScrollBarController()) }, attachTo: document.body });
		expect(Press(scroll.get(".win-scrollbar__thumb").element)).toBe(true);
		slider.unmount();
		scroll.unmount();
	});

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
