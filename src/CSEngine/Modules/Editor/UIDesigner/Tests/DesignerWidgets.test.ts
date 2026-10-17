// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { defineComponent, h, type PropType } from "vue";
import { describe, expect, it } from "vitest";
import { EventHub } from "@cse/ui";
import { UseControl } from "@cse/ui";
import { DesignerController } from "../Source/DesignerController";
import { type LayoutNode } from "@cse/ui";
import { BuiltInWidgets, PropKind, WidgetRegistry } from "@cse/ui";
import WinDesigner from "../Source/WinDesigner.vue";

// A widget written by "the user": its own controller and its own Vue component.
class RatingController {
	public readonly Events = new EventHub<{ change: [value: number]; }>();
	public constructor(public Max: number, public Value: number) {}
	public Rate(value: number): void {
		this.Value = value;
		this.Events.Emit("change", value);
	}
}

const Rating = defineComponent({
	props: { controller: { type: Object as PropType<RatingController>, required: true }, node: { type: Object as PropType<LayoutNode>, required: true } },
	setup(props) {
		return () => h("span", { class: "rating" }, Array.from({ length: props.controller.Max }, (_, i) =>
			h("button", { class: "rating__star", onClick: () => props.controller.Rate(i + 1) }, i < props.controller.Value ? "★" : "☆")));
	},
});

const Panel = defineComponent({
	props: { node: { type: Object as PropType<LayoutNode>, required: true } },
	setup(_props, { slots }) { return () => h("div", { class: "my-panel" }, slots["default"]?.()); },
});

function Registry(): WidgetRegistry {
	return BuiltInWidgets.Extend()
		.Register({
			Type: "rating", Label: "Rating", Container: false, Size: [100, 20], Events: ["change"],
			Props: [{ Key: "Max", Label: "Stars", Kind: PropKind.Number, Default: 5 }, { Key: "Value", Label: "Value", Kind: PropKind.Number, Default: 3 }],
			CreateController: (node) => UseControl(new RatingController(node.Props["Max"] as number, node.Props["Value"] as number)),
			Component: Rating,
		})
		.Register({ Type: "my-panel", Label: "My panel", Container: true, Size: [200, 100], Events: [], Props: [], Component: Panel });
}

describe("a custom widget in the designer", () => {
	it("the designer offers it in the palette, names it, edits its props and saves it", async () => {
		const registry = Registry();
		const designer = new DesignerController(undefined, registry);
		const stars = designer.Add("rating");
		expect(stars.Name).toBe("Rating1");
		expect(designer.SetProp("Rating1", "Max", 10)).toBe(true);
		expect(designer.SetProp("Rating1", "Max", "ten")).toBe(false);
		expect(designer.Add("my-panel").Name).toBe("MyPanel1");
		expect(designer.Import(designer.Export())).toBeNull();

		const wrapper = mount(WinDesigner, { props: { widgets: registry }, attachTo: document.body });
		const own = wrapper.findAll('[data-group="Controls"] .win-designer__palette-item');
		expect(own.map((i) => i.text()).slice(-2)).toEqual(["Rating", "My panel"]);
		await own.at(-2)!.trigger("click");
		expect(wrapper.find('.win-designer__canvas [data-name="Rating1"] .rating').exists()).toBe(true);
		expect(wrapper.find('[data-prop="Max"]').exists()).toBe(true);
		wrapper.unmount();
	});
});

describe("the items of combo boxes and radio buttons", () => {
	async function Open(type: string): Promise<{ wrapper: ReturnType<typeof mount>; designer: DesignerController; name: string; }> {
		const wrapper = mount(WinDesigner, { attachTo: document.body });
		const designer = (wrapper.vm as unknown as { designer: DesignerController }).designer;
		const name = designer.Add(type).Name;
		designer.Select(name);
		await wrapper.vm.$nextTick();
		return { wrapper, designer, name };
	}
	const Options = (designer: DesignerController, name: string): string[] => designer.Find(name)!.Props["Options"] as string[];

	it("a count and a name for every item; a longer list continues the numbering, a shorter one is cut", async () => {
		const { wrapper, designer, name } = await Open("combobox");
		await wrapper.get('[data-items-count="Options"]').setValue("4");
		expect(Options(designer, name)).toEqual(["Item 1", "Item 2", "Item 3", "Item 4"]);
		await wrapper.get('[data-item="Options2"]').setValue("Hard");
		expect(Options(designer, name)).toEqual(["Item 1", "Item 2", "Hard", "Item 4"]);
		await wrapper.get('[data-items-count="Options"]').setValue("1");
		expect(Options(designer, name)).toEqual(["Item 1"]);
		wrapper.unmount();
	});

	it("keeps the chosen option valid: a smaller combo box moves its index, a renamed radio option stays chosen", async () => {
		const combo = await Open("combobox");
		await combo.wrapper.get('[data-items-count="Options"]').setValue("5");
		combo.designer.SetProp(combo.name, "Selected", 4);
		await combo.wrapper.get('[data-items-count="Options"]').setValue("2");
		expect(combo.designer.Find(combo.name)!.Props["Selected"]).toBe(1);
		combo.wrapper.unmount();

		const radio = await Open("radiogroup");
		await radio.wrapper.get('[data-item="Options0"]').setValue("Low");
		expect(Options(radio.designer, radio.name)).toEqual(["Low", "Option 2"]);
		expect(radio.designer.Find(radio.name)!.Props["Selected"]).toBe("Low");
		await radio.wrapper.get('[data-item="Options1"]').setValue("Low"); // taken: not applied
		expect(Options(radio.designer, radio.name)).toEqual(["Low", "Option 2"]);
		radio.wrapper.unmount();
	});

	it("a count that isn't a number yet is ignored; new items skip names already taken", async () => {
		const { wrapper, designer, name } = await Open("combobox");
		await wrapper.get('[data-items-count="Options"]').setValue("");
		expect(Options(designer, name)).toEqual(["Item 1", "Item 2"]);
		await wrapper.get('[data-item="Options1"]').setValue("Item 3");
		await wrapper.get('[data-items-count="Options"]').setValue("3");
		expect(Options(designer, name)).toEqual(["Item 1", "Item 3", "Item 4"]);
		wrapper.unmount();
	});

	it("a radio group whose chosen option is cut chooses the first; leaving a refused name puts the old one back", async () => {
		const { wrapper, designer, name } = await Open("radiogroup");
		designer.SetProp(name, "Selected", "Option 2");
		await wrapper.get('[data-items-count="Options"]').setValue("3");
		expect(designer.Find(name)!.Props["Selected"]).toBe("Option 2");
		await wrapper.get('[data-items-count="Options"]').setValue("1");
		expect(designer.Find(name)!.Props["Selected"]).toBe("Option 1");
		const field = wrapper.get('[data-item="Options0"]');
		await field.trigger("focus");
		await field.setValue("");
		await field.trigger("blur");
		expect((field.element as HTMLInputElement).value).toBe("Option 1");
		const count = wrapper.get('[data-items-count="Options"]');
		await count.trigger("focus");
		await count.trigger("blur");
		wrapper.unmount();
	});

	it("a widget of the user's with items but no chosen option, and no default items, still gets numbered items", async () => {
		const registry = BuiltInWidgets.Extend().Register({
			Type: "tags", Label: "Tags", Container: false, Size: [100, 20], Events: [],
			Props: [{ Key: "Tags", Label: "Tags", Kind: PropKind.Items, Default: [] }],
			Component: Panel,
		});
		const wrapper = mount(WinDesigner, { props: { widgets: registry }, attachTo: document.body });
		const designer = (wrapper.vm as unknown as { designer: DesignerController; }).designer;
		const name = designer.Add("tags").Name;
		designer.Select(name);
		await wrapper.vm.$nextTick();
		await wrapper.get('[data-items-count="Tags"]').setValue("2");
		expect(designer.Find(name)!.Props["Tags"]).toEqual(["Item 1", "Item 2"]);
		wrapper.unmount();
	});
});
