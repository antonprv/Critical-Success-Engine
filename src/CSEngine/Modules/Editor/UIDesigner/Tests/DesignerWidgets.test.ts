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
		expect(wrapper.findAll(".win-designer__palette-item").map((i) => i.text()).slice(-2)).toEqual(["Rating", "My panel"]);
		await wrapper.findAll(".win-designer__palette-item").at(-2)!.trigger("click");
		expect(wrapper.find('.win-designer__canvas [data-name="Rating1"] .rating').exists()).toBe(true);
		expect(wrapper.find('[data-prop="Max"]').exists()).toBe(true);
		wrapper.unmount();
	});
});
