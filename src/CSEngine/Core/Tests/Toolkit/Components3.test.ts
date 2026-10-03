// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComboBoxController } from "../../Source/Toolkit/Controls/ComboBoxController";
import { MessageBoxButtons, MessageBoxController, MessageBoxIcon, MessageBoxResult } from "../../Source/Toolkit/Controls/MessageBoxController";
import { ScrollBarController } from "../../Source/Toolkit/Controls/ScrollBarController";
import { SpinnerController } from "../../Source/Toolkit/Controls/SpinnerController";
import { StatusBarController } from "../../Source/Toolkit/Controls/StatusBarController";
import { TextBoxController } from "../../Source/Toolkit/Controls/TextBoxController";
import { ToolbarController } from "../../Source/Toolkit/Controls/ToolbarController";
import { TooltipController } from "../../Source/Toolkit/Controls/TooltipController";
import { UseControl } from "../../Source/Toolkit/Core/UseControl";
import WinComboBox from "../../Source/Toolkit/Components/WinComboBox.vue";
import WinGroupBox from "../../Source/Toolkit/Components/WinGroupBox.vue";
import WinMessageBox from "../../Source/Toolkit/Components/WinMessageBox.vue";
import WinScrollBar from "../../Source/Toolkit/Components/WinScrollBar.vue";
import WinSpinner from "../../Source/Toolkit/Components/WinSpinner.vue";
import WinStatusBar from "../../Source/Toolkit/Components/WinStatusBar.vue";
import WinTextBox from "../../Source/Toolkit/Components/WinTextBox.vue";
import WinToolbar from "../../Source/Toolkit/Components/WinToolbar.vue";
import WinTooltip from "../../Source/Toolkit/Components/WinTooltip.vue";

afterEach(() => vi.useRealTimers());

async function pointer(target: { element: Element; } | Element | Window, type: string, init: MouseEventInit = {}): Promise<void> {
	const element = "element" in target ? target.element : target;
	element.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
	await nextTick();
}

function Rect(element: Element, rect: { left: number; top: number; width: number; height: number; }): void {
	(element as HTMLElement).getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) });
}

describe("WinTextBox", () => {
	it("typing goes through the controller: MaxLength cuts it, ReadOnly refuses it (the box shows what the controller holds)", async () => {
		const controller = UseControl(new TextBoxController({ MaxLength: 4, Placeholder: "Name" }));
		const wrapper = mount(WinTextBox, { props: { controller } });
		const input = wrapper.get("input");
		expect(input.attributes()).toMatchObject({ type: "text", placeholder: "Name", maxlength: "4" });

		await input.setValue("Hello");
		expect(controller.Value).toBe("Hell");
		expect((input.element as HTMLInputElement).value).toBe("Hell");
		controller.ReadOnly = true;
		await nextTick();
		await input.setValue("Nope");
		expect((input.element as HTMLInputElement).value).toBe("Hell");
		expect(wrapper.emitted("change")).toEqual([["Hell", ""]]);
	});

	it("selection and Ctrl+A reach the controller; focus is tracked; a password box hides the text", async () => {
		const controller = UseControl(new TextBoxController({ Value: "secret", Password: true }));
		const wrapper = mount(WinTextBox, { props: { controller } });
		const input = wrapper.get("input");
		expect(input.attributes("type")).toBe("password");
		expect(input.attributes("maxlength")).toBeUndefined();
		(input.element as HTMLInputElement).setSelectionRange(1, 3);
		await input.trigger("select");
		expect(controller.SelectedText).toBe("ec");
		await input.trigger("keydown", { code: "KeyA", ctrlKey: true });
		expect(controller.SelectedText).toBe("secret");
		await input.trigger("focus");
		expect(controller.Focused).toBe(true);
		await input.trigger("blur");
		expect(wrapper.emitted("select")).toHaveLength(2);
	});

	it("is a textarea when multiline; works with its own controller; disabled boxes are disabled", async () => {
		const multi = mount(WinTextBox, { props: { controller: UseControl(new TextBoxController({ Multiline: true, Enabled: false })) } });
		expect(multi.find("textarea").exists()).toBe(true);
		expect(multi.get("textarea").attributes("disabled")).toBeDefined();
		const plain = mount(WinTextBox);
		await plain.get("input").setValue("abc");
		expect((plain.vm as unknown as { controller: TextBoxController; }).controller.Value).toBe("abc");
	});
});

describe("WinSpinner", () => {
	it("the arrow buttons and keys step it; typed text is checked when committed", async () => {
		const controller = UseControl(new SpinnerController({ Min: 0, Max: 10, Value: 5 }));
		const wrapper = mount(WinSpinner, { props: { controller } });
		const edit = wrapper.get("input");
		await wrapper.get("[aria-label=Increase]").trigger("click");
		await wrapper.get("[aria-label=Decrease]").trigger("click");
		await wrapper.get("[aria-label=Decrease]").trigger("click");
		await edit.trigger("keydown", { code: "End" });
		expect(controller.Value).toBe(10);
		// Like Windows, typed text is checked when it is committed (Enter or leaving the box), not on every key.
		const type = async (text: string) => { await edit.setValue(text); await edit.trigger("change"); };
		await type("7");
		expect(controller.Value).toBe(7);
		await type("seven");
		expect((edit.element as HTMLInputElement).value).toBe("7");
		await type("007");
		expect((edit.element as HTMLInputElement).value).toBe("7");
		expect(wrapper.emitted("change")!.map((e) => e[0])).toEqual([6, 5, 4, 10, 7]);
	});
});

describe("WinComboBox", () => {
	const options = [{ Value: 1, Label: "Arial" }, { Value: 2, Label: "Courier New" }, { Value: 3, Label: "Tahoma" }];

	it("a click opens the list; hovering highlights; clicking an item chooses it and closes the list", async () => {
		const controller = UseControl(new ComboBoxController({ Options: options }));
		const wrapper = mount(WinComboBox, { props: { controller } });
		const box = wrapper.get("[role=combobox]");
		expect(box.attributes("aria-expanded")).toBe("false");
		expect(wrapper.get(".win-combobox__text").text()).toBe("");
		await box.trigger("click");
		const items = wrapper.findAll("[role=option]");
		expect(items.map((i) => i.text())).toEqual(["Arial", "Courier New", "Tahoma"]);
		await pointer(items[2]!, "pointerenter");
		expect(wrapper.findAll("[role=option]")[2]!.attributes("aria-selected")).toBe("true");
		await items[2]!.trigger("click");
		expect(wrapper.find("[role=listbox]").exists()).toBe(false);
		expect(wrapper.get(".win-combobox__text").text()).toBe("Tahoma");
		expect(wrapper.emitted("change")).toEqual([[2, 3]]);
		expect(wrapper.emitted("open-change")).toEqual([[true], [false]]);
	});

	it("keys go to the controller; a click outside closes the list", async () => {
		const controller = UseControl(new ComboBoxController({ Options: options, SelectedIndex: 0 }));
		const wrapper = mount(WinComboBox, { props: { controller }, attachTo: document.body });
		await wrapper.get("[role=combobox]").trigger("keydown", { code: "ArrowDown", altKey: true });
		expect(controller.Open).toBe(true);
		await pointer(wrapper.get("[role=listbox]"), "pointerdown");
		expect(controller.Open).toBe(true);
		await pointer(document.body, "pointerdown");
		expect(controller.Open).toBe(false);
		await pointer(document.body, "pointerdown");
		controller.SetEnabled(false);
		await nextTick();
		expect(wrapper.get("[role=combobox]").attributes("aria-disabled")).toBe("true");
		wrapper.unmount();
	});
});

describe("WinScrollBar", () => {
	it("vertical: arrow buttons scroll a line, clicks on the track a page, the thumb is sized and placed by the controller", async () => {
		const controller = UseControl(new ScrollBarController({ Max: 100, PageSize: 25, SmallChange: 5 }));
		const wrapper = mount(WinScrollBar, { props: { controller } });
		const thumb = () => wrapper.get(".win-scrollbar__thumb").element as HTMLElement;
		expect([thumb().style.height, thumb().style.top]).toEqual(["25%", "0%"]);
		Rect(wrapper.get(".win-scrollbar__track").element, { left: 0, top: 100, width: 16, height: 200 });

		await wrapper.get("[aria-label='Scroll forward']").trigger("click");
		expect(controller.Value).toBe(5);
		await pointer(wrapper.get(".win-scrollbar__track"), "pointerdown", { clientY: 250 });
		expect(controller.Value).toBe(30);
		await pointer(wrapper.get(".win-scrollbar__track"), "pointerdown", { clientY: 105 });
		expect(controller.Value).toBe(5);
		await wrapper.get("[aria-label='Scroll back']").trigger("click");
		await wrapper.get(".win-scrollbar").trigger("keydown", { code: "End" });
		expect(thumb().style.top).toBe("75%");
		expect(wrapper.emitted("scroll")!.map((e) => e[0])).toEqual([5, 30, 5, 0, 75]);
	});

	it("horizontal: dragging the thumb scrolls along the free part of the track", async () => {
		const controller = UseControl(new ScrollBarController({ Max: 200, PageSize: 50, Horizontal: true }));
		const wrapper = mount(WinScrollBar, { props: { controller }, attachTo: document.body });
		const thumb = wrapper.get(".win-scrollbar__thumb");
		expect((thumb.element as HTMLElement).style.width).toBe("25%");
		Rect(wrapper.get(".win-scrollbar__track").element, { left: 0, top: 0, width: 400, height: 16 });

		await pointer(thumb, "pointerdown", { clientX: 10 });
		await pointer(window, "pointermove", { clientX: 160 }); // 150 px of 300 px free track
		expect(controller.Value).toBe(75);
		await pointer(window, "pointermove", { clientX: 1000 });
		expect(controller.Value).toBe(150);
		await pointer(window, "pointerup");
		expect((thumb.element as HTMLElement).style.left).toBe("75%");
		await pointer(wrapper.get(".win-scrollbar__track"), "pointerdown", { clientX: 5 });
		expect(controller.Value).toBe(100);
		wrapper.unmount();
	});
});

describe("WinMessageBox", () => {
	it("shows the icon, text and buttons; a button closes it with its result; the default button gets focus", async () => {
		const controller = UseControl(new MessageBoxController({ Title: "Notepad", Text: "Save changes?", Icon: MessageBoxIcon.Warning, Buttons: MessageBoxButtons.YesNoCancel, DefaultButton: 0 }));
		const wrapper = mount(WinMessageBox, { props: { controller }, attachTo: document.body });
		expect(wrapper.get("[role=alertdialog]").attributes("aria-label")).toBe("Notepad");
		expect(wrapper.get(".win-messagebox__icon").classes()).toContain("win-messagebox__icon--warning");
		expect(wrapper.findAll(".win-messagebox__buttons button").map((b) => b.text())).toEqual(["Yes", "No", "Cancel"]);
		await nextTick();
		expect(document.activeElement?.textContent).toBe("Yes");
		await wrapper.findAll(".win-messagebox__buttons button")[1]!.trigger("click");
		expect(controller.Result).toBe(MessageBoxResult.No);
		expect(wrapper.find("[role=alertdialog]").exists()).toBe(false);
		expect(wrapper.emitted("close")).toEqual([[MessageBoxResult.No]]);
		wrapper.unmount();
	});

	it("the title bar close button means Cancel (or OK on an OK box) and is greyed out on Yes/No boxes; keys go to the controller", async () => {
		const okCancel = UseControl(new MessageBoxController({ Buttons: MessageBoxButtons.OkCancel }));
		const a = mount(WinMessageBox, { props: { controller: okCancel } });
		await a.get("[aria-label=Close]").trigger("click");
		expect(okCancel.Result).toBe(MessageBoxResult.Cancel);

		const ok = UseControl(new MessageBoxController({ Text: "Done." }));
		const b = mount(WinMessageBox, { props: { controller: ok } });
		expect(b.find(".win-messagebox__icon").exists()).toBe(false);
		await b.get("[role=alertdialog]").trigger("keydown", { code: "Enter" });
		expect(ok.Result).toBe(MessageBoxResult.Ok);

		const yesNo = UseControl(new MessageBoxController({ Buttons: MessageBoxButtons.YesNo, Icon: MessageBoxIcon.Question }));
		const c = mount(WinMessageBox, { props: { controller: yesNo } });
		expect(c.get("[aria-label=Close]").attributes("disabled")).toBeDefined();
		for (const [icon, name] of [[MessageBoxIcon.Information, "information"], [MessageBoxIcon.Error, "error"]] as const) {
			const d = mount(WinMessageBox, { props: { controller: UseControl(new MessageBoxController({ Icon: icon })) } });
			expect(d.get(".win-messagebox__icon").classes()).toContain(`win-messagebox__icon--${name}`);
		}
	});
});

describe("WinTooltip", () => {
	it("shows the controller's text after the delay while the pointer rests on the slot, hides on leave or press", async () => {
		vi.useFakeTimers();
		const controller = UseControl(new TooltipController({ Text: "Saves the document", Delay: 300 }));
		const wrapper = mount(WinTooltip, { props: { controller }, slots: { default: "<button>Save</button>" } });
		await pointer(wrapper.get(".win-tooltip-host"), "pointerenter");
		expect(wrapper.find("[role=tooltip]").exists()).toBe(false);
		vi.advanceTimersByTime(300);
		await nextTick();
		expect(wrapper.get("[role=tooltip]").text()).toBe("Saves the document");
		await pointer(wrapper.get(".win-tooltip-host"), "pointerdown");
		expect(wrapper.find("[role=tooltip]").exists()).toBe(false);
		await pointer(wrapper.get(".win-tooltip-host"), "pointerenter");
		await pointer(wrapper.get(".win-tooltip-host"), "pointerleave");
		vi.advanceTimersByTime(1000);
		expect(wrapper.emitted("show")).toHaveLength(1);
		expect(wrapper.emitted("hide")).toHaveLength(1);
	});
});

describe("WinStatusBar, WinToolbar and WinGroupBox", () => {
	it("the status bar draws its panels, fixed-width ones at their width, and follows text changes", async () => {
		const controller = UseControl(new StatusBarController({ Panels: [{ Text: "Ready" }, { Text: "Ln 1", Width: 80 }] }));
		const wrapper = mount(WinStatusBar, { props: { controller } });
		const panels = () => wrapper.findAll(".win-statusbar__panel");
		expect(panels().map((p) => p.text())).toEqual(["Ready", "Ln 1"]);
		expect((panels()[1]!.element as HTMLElement).style.width).toBe("80px");
		expect((panels()[0]!.element as HTMLElement).style.width).toBe("");
		controller.SetText(1, "Ln 9");
		await nextTick();
		expect(panels()[1]!.text()).toBe("Ln 9");
		expect(wrapper.emitted("change")).toEqual([[1, "Ln 9"]]);
	});

	it("toolbar buttons click and toggle; toggles show aria-pressed, disabled ones are disabled", async () => {
		const controller = UseControl(new ToolbarController({ Buttons: [{ Id: "bold", Label: "B", Toggle: true }, { Id: "save", Label: "Save" }, { Id: "print", Label: "Print", Disabled: true }] }));
		const wrapper = mount(WinToolbar, { props: { controller } });
		const buttons = wrapper.findAll(".win-toolbar__button");
		expect(buttons[0]!.attributes("aria-pressed")).toBe("false");
		expect(buttons[1]!.attributes("aria-pressed")).toBeUndefined();
		expect(buttons[2]!.attributes("disabled")).toBeDefined();
		await buttons[0]!.trigger("click");
		expect(buttons[0]!.attributes("aria-pressed")).toBe("true");
		expect(buttons[0]!.classes()).toContain("win-toolbar__button--pressed");
		await buttons[1]!.trigger("click");
		expect(wrapper.emitted("click")).toEqual([["bold"], ["save"]]);
		expect(wrapper.emitted("toggle")).toEqual([["bold", true]]);
	});

	it("a group box frames its content under a caption", () => {
		const wrapper = mount(WinGroupBox, { props: { title: "Options" }, slots: { default: "<p>inside</p>" } });
		expect(wrapper.get("legend").text()).toBe("Options");
		expect(wrapper.get("fieldset p").text()).toBe("inside");
	});
});
