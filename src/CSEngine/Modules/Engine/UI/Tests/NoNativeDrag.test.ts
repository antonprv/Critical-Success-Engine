// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { ScrollBarController } from "../Source/Controls/ScrollBarController";
import { SliderController } from "../Source/Controls/SliderController";
import { WindowController } from "../Source/Controls/WindowController";
import { UseControl } from "../Source/Core/UseControl";
import WinScrollBar from "../Source/Components/WinScrollBar.vue";
import WinSlider from "../Source/Components/WinSlider.vue";
import WinWindow from "../Source/Components/WinWindow.vue";

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

});
