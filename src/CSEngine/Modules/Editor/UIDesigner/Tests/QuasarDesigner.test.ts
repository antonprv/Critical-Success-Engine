// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { CreateNode, NewLayout, WidgetType } from "@cse/ui";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignerController } from "../Source/DesignerController";
import WinDesigner from "../Source/WinDesigner.vue";

afterEach(() => { document.body.innerHTML = ""; });

function Mount() {
	const wrapper = mount(WinDesigner, { attachTo: document.body });
	return { wrapper, designer: (wrapper.vm as unknown as { designer: DesignerController; }).designer };
}

async function Drop(target: Element, type: string): Promise<void> {
	const event = new MouseEvent("drop", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
	Object.defineProperty(event, "dataTransfer", { value: { getData: () => type } });
	target.dispatchEvent(event);
	await nextTick();
}

/** The inspector, once Quasar's catalog has loaded. */
async function Inspector(wrapper: VueWrapper) {
	await vi.waitFor(async () => { await flushPromises(); expect(wrapper.find(".win-quasar-inspector__docs").exists()).toBe(true); });
	return wrapper.get(".win-quasar-inspector");
}

describe("Quasar widgets in the designer's model", () => {
	it("take any JSON prop, lose it again, and keep text, slot and directives - each one undoable", () => {
		const designer = new DesignerController();
		const card = designer.Add("q-card");
		const button = designer.Add("q-btn", { Parent: card.Name });
		expect(designer.SetSlot(button.Name, "default")).toBe(true);
		expect(designer.Find(button.Name)!.Slot).toBeUndefined();
		expect(designer.ParentOf(button.Name)).toBe(card);
		expect(designer.SetProp(button.Name, "icon-right", "send")).toBe(true);
		expect(designer.SetProp(button.Name, "", "x")).toBe(false);
		expect(designer.SetProp(button.Name, "anything", { nested: [1, 2] })).toBe(true);
		expect(designer.ClearProp(button.Name, "anything")).toBe(true);
		expect(designer.ClearProp(button.Name, "anything")).toBe(false);
		expect(designer.ClearProp("Nobody", "label")).toBe(false);
		const label = designer.Add(WidgetType.Label);
		expect(designer.ClearProp(label.Name, "Text")).toBe(false); // the toolkit's widgets keep their props
		expect(designer.SetProp(label.Name, "Other", "x")).toBe(false);

		designer.SetContent(card.Name, "Hello");
		expect(designer.Find(card.Name)!.Content).toBe("Hello");
		designer.SetContent(card.Name, "");
		expect(designer.Find(card.Name)!.Content).toBeUndefined();
		designer.SetContent("Nobody", "x");

		const table = designer.Add("q-table", { Parent: card.Name });
		const cell = designer.Add("q-btn", { Parent: table.Name });
		expect(designer.SetSlot(cell.Name, "top-right")).toBe(true);
		expect(designer.Find(cell.Name)!.Slot).toBe("top-right");
		expect(designer.SetSlot(cell.Name, "body-cell-name")).toBe(true); // a slot Quasar names by a pattern
		expect(designer.SetSlot(cell.Name, "nowhere")).toBe(false);
		expect(designer.SetSlot(cell.Name, "default")).toBe(false); // a table has no default slot
		expect(designer.SetSlot(cell.Name, "top")).toBe(true);
		expect(designer.SetSlot(cell.Name, null)).toBe(true);
		expect(designer.Find(cell.Name)!.Slot).toBeUndefined();
		expect(designer.SetSlot(label.Name, "top")).toBe(false); // its parent has no slots
		expect(designer.SetSlot("Nobody", "top")).toBe(false);

		expect(designer.SetDirective(button.Name, "ripple", { color: "red" })).toBe(true);
		expect(designer.SetDirective(button.Name, "touch-swipe:mouse.left", true)).toBe(true);
		expect(designer.SetDirective(button.Name, "touch-swipe.right", true)).toBe(true); // replaces the other touch-swipe
		expect(designer.Find(button.Name)!.Directives).toEqual({ ripple: { color: "red" }, "touch-swipe.right": true });
		expect(designer.SetDirective(button.Name, "Bad Key", true)).toBe(false);
		expect(designer.SetDirective("Nobody", "ripple", true)).toBe(false);
		expect(designer.SetDirective(button.Name, "ripple", undefined)).toBe(true);
		expect(designer.SetDirective(button.Name, "touch-swipe", undefined)).toBe(true);
		expect(designer.Find(button.Name)!.Directives).toBeUndefined();

		designer.Undo();
		expect(designer.Find(button.Name)!.Directives).toEqual({ "touch-swipe.right": true });

		// bindings and shortcuts
		expect(designer.SetBinding(button.Name, "label", "Caption")).toBe(true);
		expect(designer.SetBinding(button.Name, "color", "Tone")).toBe(true);
		expect(designer.Find(button.Name)!.Bindings).toEqual({ label: "Caption", color: "Tone" });
		expect(designer.SetBinding(button.Name, "", "x")).toBe(false);
		expect(designer.SetBinding(button.Name, "label", "")).toBe(false);
		expect(designer.SetBinding("Nobody", "label", "x")).toBe(false);
		designer.SetBinding(button.Name, "label", null);
		designer.SetBinding(button.Name, "color", null);
		expect(designer.Find(button.Name)!.Bindings).toBeUndefined();
		expect(designer.SetHotkey("ctrl+s", button.Name)).toBe("Ctrl+S");
		expect(designer.SetHotkey("F5", button.Name)).toBe("F5");
		expect(designer.Layout.Hotkeys).toEqual({ "Ctrl+S": button.Name, F5: button.Name });
		expect(designer.SetHotkey("Ctrl+Nothing", button.Name)).toBeNull();
		expect(designer.SetHotkey("Ctrl+P", "Nobody")).toBeNull();
		designer.SetHotkey("Ctrl+S", null);
		designer.SetHotkey("F5", null);
		expect(designer.Layout.Hotkeys).toBeUndefined();
	});
});

describe("Quasar widgets in the designer's window", () => {
	it("the layout's keyboard shortcuts are written one per line", async () => {
		const { wrapper, designer } = Mount();
		designer.Add(WidgetType.Button);
		const field = wrapper.get('[data-field="Hotkeys"]');
		// (setValue fires the field's change, as leaving it does)
		await field.setValue("ctrl+s = Button1\n\nCtrl+Bad = Button1\nF2 = Nobody");
		expect(designer.Layout.Hotkeys).toEqual({ "Ctrl+S": "Button1" });
		await nextTick();
		expect(wrapper.text()).toContain("Not a shortcut or no such widget: Ctrl+Bad, F2");
		await field.setValue("F5 = Button1");
		expect(designer.Layout.Hotkeys).toEqual({ F5: "Button1" });
		expect((wrapper.get('[data-field="Hotkeys"]').element as HTMLTextAreaElement).value).toBe("F5 = Button1");
		await field.setValue("F6"); // a shortcut naming no widget
		expect(designer.Layout.Hotkeys).toBeUndefined();
		wrapper.unmount();
	});

	it("the palette groups them and finds them by name", async () => {
		const { wrapper } = Mount();
		const search = wrapper.get('[data-field="PaletteFilter"]');
		await search.setValue("toggle");
		expect(wrapper.findAll(".win-designer__palette-item").map((item) => item.text())).toEqual(["Btn toggle", "Toggle"]);
		expect(wrapper.findAll(".win-designer__palette-group").every((group) => (group.element as HTMLDetailsElement).open)).toBe(true);
		await search.setValue("q-chip");
		expect(wrapper.findAll(".win-designer__palette-item").map((item) => item.text())).toEqual(["Chip"]);
		wrapper.unmount();
	});

	it("a widget dropped on a Quasar widget goes into its slot; a widget in a slot has no place of its own", async () => {
		const { wrapper, designer } = Mount();
		const toolbar = designer.Add("q-toolbar");
		await nextTick();
		await Drop(wrapper.get(`.win-designer__canvas [data-name="${toolbar.Name}"]`).element, "q-btn");
		const button = designer.Selected!;
		expect(designer.ParentOf(button.Name)!.Name).toBe(toolbar.Name);
		await nextTick();
		expect(wrapper.find('[data-field="X"]').exists()).toBe(false);
		expect(wrapper.find('[data-field="AnchorX"]').exists()).toBe(false);
		expect((wrapper.get('[data-field="Parent"]').element as HTMLSelectElement).value).toBe(toolbar.Name);
		wrapper.unmount();
	});

	it("the inspector edits a Quasar widget by Quasar's catalog", async () => {
		const { wrapper, designer } = Mount();
		const layout = NewLayout("Form");
		const card = { ...CreateNode("q-card", "Card", 10, 10), Children: [CreateNode("q-input", "Name", 0, 0)] };
		layout.Root.Children!.push(card, CreateNode("q-slider", "Volume", 10, 200), CreateNode("q-badge", "Count", 10, 260));
		designer.Load(layout);
		designer.Select("Name");
		await nextTick();
		const inspector = await Inspector(wrapper);
		expect(inspector.get('[data-field="Docs"]').attributes("href")).toBe("https://v2.quasar.dev/vue-components/input");
		const set = () => inspector.findAll('[data-section="Set in this layout"] [data-prop]').map((field) => field.attributes("data-prop"));
		expect(set()).toEqual(["model-value", "label"]);

		// a text prop, a number, a flag, a choice, JSON; emptied: gone
		await inspector.get('[data-prop="hint"]').setValue("Your name");
		expect(designer.Find("Name")!.Props["hint"]).toBe("Your name");
		await inspector.get('[data-prop="maxlength"]').setValue("12");
		expect(designer.Find("Name")!.Props["maxlength"]).toBe("12"); // Quasar takes it as text or a number
		await inspector.get('[data-prop="debounce"]').setValue("200");
		await inspector.get('[data-prop="outlined"]').setValue("true");
		expect(designer.Find("Name")!.Props["outlined"]).toBe(true);
		await inspector.get('[data-prop="outlined"]').setValue("false");
		expect(designer.Find("Name")!.Props["outlined"]).toBe(false);
		await inspector.get('[data-prop="type"]').setValue("email");
		expect(designer.Find("Name")!.Props["type"]).toBe("email");
		const rules = inspector.get('[data-prop="rules"]');
		await rules.setValue('["email", {"Rule": "required"}');
		expect(inspector.find(".win-quasar-inspector__prop--invalid").exists()).toBe(true);
		expect(designer.Find("Name")!.Props["rules"]).toBeUndefined();
		await rules.setValue('["email", {"Rule": "required"}]');
		expect(designer.Find("Name")!.Props["rules"]).toEqual(["email", { Rule: "required" }]);
		await inspector.get('[data-prop="hint"]').setValue("");
		expect("hint" in designer.Find("Name")!.Props).toBe(false);

		// focus and blur group a field's typing into one undo step
		for (const selector of ['[data-prop="label"]', '[data-prop="rules"]']) {
			await inspector.get(selector).trigger("focus");
			await inspector.get(selector).trigger("blur");
		}

		// a number, and a choice with no default of Quasar's
		designer.Select("Volume");
		await nextTick();
		const slider = await Inspector(wrapper);
		await slider.get('[data-prop="step"]').setValue("5");
		expect(designer.Find("Volume")!.Props["step"]).toBe(5);
		designer.Select("Count");
		await nextTick();
		const badge = await Inspector(wrapper);
		expect(badge.get('[data-prop="align"] option').text()).toBe("(default)");
		designer.Select("Name");
		await nextTick();
		await Inspector(wrapper);

		// the prop finder
		await inspector.get('[data-field="PropFilter"]').setValue("autofocus");
		expect(inspector.findAll("[data-prop]").map((field) => field.attributes("data-prop"))).toEqual(["autofocus"]);
		await inspector.get('[data-field="PropFilter"]').setValue("");

		// text of the default slot, the slot it is in
		await inspector.get('[data-field="Slot"]').setValue("default");
		designer.Select("Card");
		await nextTick();
		const cardInspector = await Inspector(wrapper);
		await cardInspector.get('[data-field="Content"]').trigger("focus");
		await cardInspector.get('[data-field="Content"]').setValue("Inside the card");
		await cardInspector.get('[data-field="Content"]').trigger("blur");
		expect(designer.Find("Card")!.Content).toBe("Inside the card");
		expect(cardInspector.find('[data-field="Slot"]').exists()).toBe(false); // on the canvas: no slot

		// directives: on, argument and modifiers, value, off
		await cardInspector.get('[data-directive="v-touch-swipe"]').setValue(true);
		expect(designer.Find("Card")!.Directives).toEqual({ "touch-swipe": true });
		await cardInspector.get('[data-directive-key="v-touch-swipe"]').setValue(".mouse.left");
		expect(designer.Find("Card")!.Directives).toEqual({ "touch-swipe.mouse.left": true });
		await cardInspector.get('[data-directive="v-ripple"]').setValue(true);
		await cardInspector.get('[data-directive-value="v-ripple"]').setValue('{"color": "red"');
		expect(designer.Find("Card")!.Directives!["ripple"]).toBe(true);
		await cardInspector.get('[data-directive-value="v-ripple"]').setValue('{"color": "red"}');
		expect(designer.Find("Card")!.Directives!["ripple"]).toEqual({ color: "red" });
		await cardInspector.get('[data-directive-value="v-ripple"]').setValue("");
		expect(designer.Find("Card")!.Directives!["ripple"]).toBe(true);
		await cardInspector.get('[data-directive="v-ripple"]').setValue(false);
		expect(designer.Find("Card")!.Directives).toEqual({ "touch-swipe.mouse.left": true });

		// bindings: a prop follows a variable
		await cardInspector.get('[data-field="BindProp"]').setValue("flat");
		await cardInspector.get('[data-field="BindVariable"]').setValue("Plain");
		await cardInspector.get('[data-field="Bind"]').trigger("click");
		expect(designer.Find("Card")!.Bindings).toEqual({ flat: "Plain" });
		await cardInspector.get('[data-field="Bind"]').trigger("click"); // nothing written: nothing bound
		await cardInspector.get('[data-unbind="flat"]').trigger("click");
		expect(designer.Find("Card")!.Bindings).toBeUndefined();

		// events and methods for scripts and node graphs
		designer.Select("Name");
		await nextTick();
		const again = await Inspector(wrapper);
		expect(again.get('[data-list="Events"]').text()).toContain("change");
		expect(again.get('[data-list="Methods"]').text()).toContain("focus()");
		wrapper.unmount();
	});
});
