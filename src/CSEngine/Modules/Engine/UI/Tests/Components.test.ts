// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { ButtonController } from "../Source/Controls/ButtonController";
import { CheckBoxController, CheckState } from "../Source/Controls/CheckBoxController";
import { ProgressBarController, ProgressState } from "../Source/Controls/ProgressBarController";
import { RadioGroupController } from "../Source/Controls/RadioGroupController";
import { SliderController } from "../Source/Controls/SliderController";
import { TabsController } from "../Source/Controls/TabsController";
import { UseControl } from "../Source/Core/UseControl";
import { WinTheme } from "../Source/Core/Themes";
import WinButton from "../Source/Components/WinButton.vue";
import WinCheckBox from "../Source/Components/WinCheckBox.vue";
import WinProgressBar from "../Source/Components/WinProgressBar.vue";
import WinRadioGroup from "../Source/Components/WinRadioGroup.vue";
import WinSlider from "../Source/Components/WinSlider.vue";
import WinTabs from "../Source/Components/WinTabs.vue";
import WinThemeProvider from "../Source/Components/WinThemeProvider.vue";

const key = (code: string, extra: Record<string, unknown> = {}) => ({ code, ...extra });

/** jsdom's pointer events have read-only button/clientX, so build the event with them instead of patching it. */
async function pointer(target: { element: Element; } | Element | Window, type: string, init: MouseEventInit = {}): Promise<void> {
	const element = "element" in target ? target.element : target;
	element.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
	await nextTick();
}

describe("WinThemeProvider", () => {
	it("puts the family and theme classes on its root, and follows theme changes", async () => {
		const wrapper = mount(WinThemeProvider, { props: { theme: WinTheme.XpOlive }, slots: { default: "<p>inside</p>" } });
		expect(wrapper.classes()).toEqual(expect.arrayContaining(["win-root", "win-family--luna", "win-theme--xp-olive"]));
		expect(wrapper.text()).toBe("inside");
		await wrapper.setProps({ theme: WinTheme.Win98 } as never);
		expect(wrapper.classes()).toEqual(expect.arrayContaining(["win-family--classic", "win-theme--win98"]));
	});
});

describe("WinButton", () => {
	it("draws the controller's label and flags, and reports clicks made with the mouse", async () => {
		const controller = UseControl(new ButtonController({ Label: "OK", IsDefault: true }));
		const wrapper = mount(WinButton, { props: { controller } });
		const button = wrapper.get("button");
		expect(button.text()).toBe("OK");
		expect(button.classes()).toContain("win-button--default");

		await button.trigger("pointerenter");
		await pointer(button, "pointerdown", { button: 0 });
		expect(button.classes()).toEqual(expect.arrayContaining(["win-button--pressed", "win-button--hovered"]));
		await pointer(button, "pointerup", { button: 0 });
		await button.trigger("pointerleave");
		expect(wrapper.emitted("click")).toHaveLength(1);
		expect(wrapper.emitted("press")).toHaveLength(1);
		expect(button.classes()).not.toContain("win-button--pressed");
	});

	it("releasing outside the button is no click; other mouse buttons are ignored", async () => {
		const wrapper = mount(WinButton, { props: { label: "Cancel" }, attachTo: document.body });
		const button = wrapper.get("button");
		await pointer(button, "pointerdown", { button: 2 });
		await pointer(button, "pointerdown", { button: 0 });
		document.body.dispatchEvent(new Event("pointerup"));
		await nextTick();
		expect(wrapper.emitted("click")).toBeUndefined();
		expect(wrapper.text()).toBe("Cancel");
		wrapper.unmount();
	});

	it("keyboard, focus and disabled state go through the controller; the controller is exposed", async () => {
		const wrapper = mount(WinButton, { props: { label: "Go" } });
		const exposed = (wrapper.vm as unknown as { controller: ButtonController; }).controller;
		const button = wrapper.get("button");
		await button.trigger("focus");
		expect(exposed.Focused).toBe(true);
		expect(button.classes()).toContain("win-button--focused");
		await button.trigger("keydown", key("Space"));
		await button.trigger("keyup", key("Space"));
		await button.trigger("keydown", key("Enter"));
		const other = new KeyboardEvent("keydown", { code: "KeyA", cancelable: true });
		button.element.dispatchEvent(other);
		expect(other.defaultPrevented).toBe(false); // only Space and Enter are the button's
		await button.trigger("blur");
		expect(wrapper.emitted("click")).toHaveLength(2);

		exposed.SetEnabled(false);
		await nextTick();
		expect(button.attributes("disabled")).toBeDefined();
	});

	it("a slot replaces the label", () => {
		const wrapper = mount(WinButton, { slots: { default: "<b>Bold</b>" } });
		expect(wrapper.get("button b").text()).toBe("Bold");
	});
});

describe("WinCheckBox", () => {
	it("click and Space toggle; aria-checked shows all three states", async () => {
		const controller = UseControl(new CheckBoxController({ Label: "Hidden files", ThreeState: true }));
		const wrapper = mount(WinCheckBox, { props: { controller } });
		const box = wrapper.get("[role=checkbox]");
		expect(box.attributes("aria-checked")).toBe("false");
		expect(wrapper.text()).toContain("Hidden files");
		await wrapper.get(".win-checkbox").trigger("click");
		expect(box.attributes("aria-checked")).toBe("true");
		await box.trigger("keydown", key("Space"));
		expect(box.attributes("aria-checked")).toBe("mixed");
		const tab = new KeyboardEvent("keydown", { code: "Tab", cancelable: true });
		box.element.dispatchEvent(tab);
		expect(tab.defaultPrevented).toBe(false); // Tab still moves focus
		expect(wrapper.emitted("change")).toEqual([[CheckState.Checked, CheckState.Unchecked], [CheckState.Indeterminate, CheckState.Checked]]);

		controller.SetEnabled(false);
		await nextTick();
		expect(wrapper.get(".win-checkbox").classes()).toContain("win-checkbox--disabled");
		expect(box.attributes("tabindex")).toBe("-1");
		expect(mount(WinCheckBox).text()).toBe("");
	});
});

describe("WinRadioGroup", () => {
	it("draws the options, selects by click and arrow keys, and skips disabled ones", async () => {
		const controller = UseControl(new RadioGroupController({ Options: [{ Value: "a", Label: "Small" }, { Value: "b", Label: "Large", Disabled: true }, { Value: "c", Label: "Huge" }], Value: "a" }));
		const wrapper = mount(WinRadioGroup, { props: { controller } });
		const radios = wrapper.findAll("[role=radio]");
		expect(radios.map((r) => r.attributes("aria-checked"))).toEqual(["true", "false", "false"]);
		expect(radios[1]!.attributes("aria-disabled")).toBe("true");

		await radios[2]!.trigger("click");
		expect(controller.Value).toBe("c");
		await wrapper.get("[role=radiogroup]").trigger("keydown", key("ArrowDown"));
		expect(controller.Value).toBe("a");
		expect(wrapper.emitted("change")).toEqual([["c", "a"], ["a", "c"]]);
		expect(radios[0]!.attributes("tabindex")).toBe("0");
		expect(radios[2]!.attributes("tabindex")).toBe("-1");
	});
});

describe("WinProgressBar", () => {
	it("fills to the controller's percent and shows marquee and Vista/7 states as modifiers", async () => {
		const controller = UseControl(new ProgressBarController({ Value: 25 }));
		const wrapper = mount(WinProgressBar, { props: { controller } });
		const bar = wrapper.get("[role=progressbar]");
		expect(bar.attributes("aria-valuenow")).toBe("25");
		expect((wrapper.get(".win-progress__fill").element as HTMLElement).style.width).toBe("25%");

		controller.SetState(ProgressState.Error);
		controller.SetMarquee(true);
		await nextTick();
		expect(bar.classes()).toEqual(expect.arrayContaining(["win-progress--error", "win-progress--marquee"]));
		expect(bar.attributes("aria-valuenow")).toBeUndefined();
		controller.SetState(ProgressState.Paused);
		await nextTick();
		expect(bar.classes()).toContain("win-progress--paused");

		controller.SetMarquee(false);
		controller.SetValue(100);
		await nextTick();
		expect(wrapper.emitted("complete")).toHaveLength(1);
		expect(mount(WinProgressBar).get("[role=progressbar]").attributes("aria-valuenow")).toBe("0");
	});
});

describe("WinTabs", () => {
	it("draws the tabs, switches by click and keys, and shows the selected panel's slot", async () => {
		const controller = UseControl(new TabsController({ Tabs: [{ Id: "general", Label: "General" }, { Id: "off", Label: "Off", Disabled: true }, { Id: "advanced", Label: "Advanced" }] }));
		const wrapper = mount(WinTabs, { props: { controller }, slots: { general: "<p>General page</p>", advanced: "<p>Advanced page</p>" } });
		const tabs = wrapper.findAll("[role=tab]");
		expect(tabs.map((t) => t.attributes("aria-selected"))).toEqual(["true", "false", "false"]);
		expect(wrapper.get("[role=tabpanel]").text()).toBe("General page");

		await tabs[2]!.trigger("click");
		expect(wrapper.get("[role=tabpanel]").text()).toBe("Advanced page");
		await wrapper.get("[role=tablist]").trigger("keydown", key("ArrowRight"));
		expect(controller.SelectedId).toBe("general");
		await wrapper.get("[role=tablist]").trigger("keydown", key("Tab", { ctrlKey: true, shiftKey: true }));
		expect(controller.SelectedId).toBe("advanced");
		expect(wrapper.emitted("change")).toHaveLength(3);
		expect(tabs[1]!.attributes("aria-disabled")).toBe("true");
	});
});

describe("WinSlider", () => {
	it("moves by keys and by clicking/dragging the track; ticks are drawn", async () => {
		const controller = UseControl(new SliderController({ Min: 0, Max: 10, Step: 1, TickFrequency: 5, Value: 5 }));
		const wrapper = mount(WinSlider, { props: { controller }, attachTo: document.body });
		const slider = wrapper.get("[role=slider]");
		expect(slider.attributes("aria-valuenow")).toBe("5");
		expect(wrapper.findAll(".win-slider__tick")).toHaveLength(3);

		await slider.trigger("keydown", key("End"));
		expect(controller.Value).toBe(10);

		const track = wrapper.get(".win-slider__track").element as HTMLElement;
		track.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 20, right: 300, bottom: 20, x: 100, y: 0, toJSON: () => ({}) });
		await pointer(wrapper.get(".win-slider__track"), "pointerdown", { clientX: 140 });
		expect(controller.Value).toBe(2);
		await pointer(window, "pointermove", { clientX: 260 });
		expect(controller.Value).toBe(8);
		window.dispatchEvent(new Event("pointerup"));
		await pointer(window, "pointermove", { clientX: 100 });
		expect(controller.Value).toBe(8);
		expect(wrapper.emitted("change")).toEqual([[10], [2], [8]]);
		expect((wrapper.get(".win-slider__thumb").element as HTMLElement).style.left).toBe("80%");
		wrapper.unmount();
	});
});
