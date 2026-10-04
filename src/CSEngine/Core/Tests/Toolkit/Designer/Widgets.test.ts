// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, type PropType } from "vue";
import { describe, expect, it } from "vitest";
import { EventHub } from "../../../Source/Toolkit/Core/EventHub";
import { UseControl } from "../../../Source/Toolkit/Core/UseControl";
import { DesignerController } from "../../../Source/Toolkit/Designer/DesignerController";
import { CreateNode, NewLayout, ParseLayout, SerializeLayout, WidgetType, type LayoutNode } from "../../../Source/Toolkit/Designer/Layout";
import { UiDocument } from "../../../Source/Toolkit/Designer/UiDocument";
import { UiScript, UiScriptRegistry } from "../../../Source/Toolkit/Designer/UiScript";
import { BuiltInWidgets, PropKind, WidgetRegistry } from "../../../Source/Toolkit/Designer/Widgets";
import WinDesigner from "../../../Source/Toolkit/Designer/WinDesigner.vue";
import WinLayoutView from "../../../Source/Toolkit/Designer/WinLayoutView.vue";

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

describe("WidgetRegistry", () => {
	it("holds the built-in widgets; the canvas is a widget too, but never in the palette", () => {
		expect(BuiltInWidgets.Types).toContain(WidgetType.Canvas);
		expect(BuiltInWidgets.Palette).not.toContain(WidgetType.Canvas);
		expect(BuiltInWidgets.Get("teleporter")).toBeUndefined();
		expect(BuiltInWidgets.Has(WidgetType.Button)).toBe(true);
	});

	it("Extend gives an app its own copy: what it registers doesn't leak into the shared built-ins; types are unique", () => {
		const registry = Registry();
		expect(registry.Palette.slice(-2)).toEqual(["rating", "my-panel"]);
		expect(BuiltInWidgets.Has("rating")).toBe(false);
		expect(() => registry.Register({ ...registry.Get("rating")! })).toThrow('A widget type "rating" is already registered');
	});
});

describe("a custom widget goes through the whole pipeline", () => {
	it("layout files: created with defaults, saved, and parsed only by a registry that knows the type", () => {
		const registry = Registry();
		const layout = NewLayout("Shop");
		layout.Root.Children!.push(CreateNode("rating", "Stars", 8, 8, registry));
		expect(layout.Root.Children![0]).toMatchObject({ Type: "rating", Width: 100, Props: { Max: 5, Value: 3 } });
		const text = SerializeLayout(layout);
		expect(ParseLayout(text, registry)).toEqual(layout);
		expect(() => ParseLayout(text)).toThrow(/"Stars" has an unknown type/);
	});

	it("the runtime creates its controller, reports its events and lets scripts subscribe; the view draws its component", async () => {
		class Shop extends UiScript {
			public static Rated = 0;
			public override OnConstruct(): void { this.On("Stars", "change", (value) => { Shop.Rated = value as number; }); }
		}
		const registry = Registry();
		const layout = NewLayout("Shop");
		layout.Script = "Shop";
		const panel = CreateNode("my-panel", "Box", 0, 0, registry);
		panel.Children!.push(CreateNode("rating", "Stars", 8, 8, registry));
		layout.Root.Children!.push(panel);
		const document = new UiDocument(layout, { Widgets: registry, Scripts: new UiScriptRegistry().Register("Shop", Shop) });
		const events: string[] = [];
		document.Events.On("widget-event", (name, event) => events.push(`${name}.${event}`));

		const wrapper = mount(WinLayoutView, { props: { document } });
		expect(wrapper.get('[data-name="Box"] .my-panel [data-container="Box"] [data-name="Stars"] .rating').text()).toBe("★★★☆☆");
		await wrapper.findAll(".rating__star")[4]!.trigger("click");
		expect(Shop.Rated).toBe(5);
		expect(events).toEqual(["Stars.change"]);
		await nextTick();
		expect(wrapper.get(".rating").text()).toBe("★★★★★");
		expect(document.Find("Box")!.Controller).toBeNull();
	});

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
