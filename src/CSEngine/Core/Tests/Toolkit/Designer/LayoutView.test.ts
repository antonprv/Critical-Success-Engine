// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import type { ButtonController } from "../../../Source/Toolkit/Controls/ButtonController";
import { CreateNode, NewLayout, WidgetType, type UiLayout } from "../../../Source/Toolkit/Designer/Layout";
import { BuiltInWidgets } from "../../../Source/Toolkit/Designer/Widgets";
import { UiDocument } from "../../../Source/Toolkit/Designer/UiDocument";
import WinLayoutView from "../../../Source/Toolkit/Designer/WinLayoutView.vue";

function EveryWidget(): UiLayout {
	const layout = NewLayout("All");
	const window = CreateNode(WidgetType.Window, "Win", 10, 20);
	const group = CreateNode(WidgetType.GroupBox, "Group", 5, 5);
	group.Children!.push(CreateNode(WidgetType.Label, "Inside", 1, 2));
	window.Children!.push(group);
	layout.Root.Children!.push(window);
	for (const type of BuiltInWidgets.Palette.filter((t) => t !== WidgetType.Window && t !== WidgetType.GroupBox)) {
		layout.Root.Children!.push(CreateNode(type, `${type}X`, 0, 0));
	}
	layout.Root.Children!.push({ ...CreateNode(WidgetType.Image, "Picture", 0, 0), Props: { Source: "data:image/png;base64,AA", Fit: "cover" } });
	layout.Root.Children!.push({ ...CreateNode(WidgetType.Label, "Big", 0, 0), Props: { Text: "Big", FontSize: 20, Bold: true } });
	return layout;
}

describe("WinLayoutView", () => {
	it("draws every widget type at its rectangle, with containers holding their children", () => {
		const document = new UiDocument(EveryWidget());
		const wrapper = mount(WinLayoutView, { props: { document } });
		const node = (name: string) => wrapper.get(`[data-name="${name}"]`);

		const root = node("Root").element as HTMLElement;
		expect([root.style.left, root.style.top, root.style.right, root.style.bottom]).toEqual(["0px", "0px", "0px", "0px"]); // fills the view
		const win = node("Win").element as HTMLElement;
		expect([win.style.left, win.style.top, win.style.width, win.style.height]).toEqual(["10px", "20px", "320px", "240px"]);
		expect(node("Win").find(".win-window__title").text()).toBe("Window");
		expect(node("Win").find('[data-container="Win"] [data-name="Group"] [data-container="Group"] [data-name="Inside"]').exists()).toBe(true);
		expect(node("Group").find("legend").text()).toBe("Group");

		expect(node("labelX").text()).toBe("Label");
		expect(node("imageX").find(".win-layout__image-placeholder").exists()).toBe(true);
		expect(node("Picture").get("img").attributes("src")).toBe("data:image/png;base64,AA");
		expect((node("Picture").get("img").element as HTMLElement).style.objectFit).toBe("cover");
		const big = node("Big").get(".win-layout__label").element as HTMLElement;
		expect([big.style.fontSize, big.style.fontWeight]).toEqual(["20px", "bold"]);
		expect(node("buttonX").get("button").text()).toBe("Button");
		expect(node("checkboxX").find("[role=checkbox]").exists()).toBe(true);
		expect(node("radiogroupX").findAll("[role=radio]")).toHaveLength(2);
		expect(node("textboxX").find("input").exists()).toBe(true);
		expect(node("spinnerX").find(".win-spinner").exists()).toBe(true);
		expect(node("comboboxX").find("[role=combobox]").exists()).toBe(true);
		expect(node("progressbarX").find("[role=progressbar]").exists()).toBe(true);
		expect(node("sliderX").find("[role=slider]").exists()).toBe(true);
		expect(node("listboxX").findAll(".win-listview__row")).toHaveLength(3);
		expect(node("listboxX").get("[role=columnheader]").text()).toBe("Name");
		expect(node("statusbarX").find("[role=status]").exists()).toBe(true);
	});

	it("is live: the widgets are the document's controllers, so scripts and the view stay in sync", async () => {
		const document = new UiDocument(EveryWidget());
		const wrapper = mount(WinLayoutView, { props: { document } });
		document.Controller<ButtonController>("buttonX").Label = "Changed by a script";
		await nextTick();
		expect(wrapper.get('[data-name="buttonX"] button').text()).toBe("Changed by a script");
	});

	it("design mode marks the view, outlines the selected widget and gives it resize handles", () => {
		const document = new UiDocument(EveryWidget());
		const wrapper = mount(WinLayoutView, { props: { document, design: true, selected: "buttonX" } });
		expect(wrapper.get(".win-layout").classes()).toContain("win-layout--design");
		const selected = wrapper.get('[data-name="buttonX"]');
		expect(selected.classes()).toContain("win-layout__node--selected");
		expect(selected.findAll(".win-layout__handle").map((h) => h.attributes("data-handle"))).toEqual(["right", "bottom", "corner"]);
		expect(wrapper.findAll(".win-layout__handle")).toHaveLength(3);

		const live = mount(WinLayoutView, { props: { document } });
		expect(live.get(".win-layout").classes()).not.toContain("win-layout--design");
		expect(live.findAll(".win-layout__handle")).toHaveLength(0);
	});
});

describe("WinLayoutView with a new document", () => {
	it("given a rebuilt document (as the designer does after every edit), it shows the new one, not the old widgets", async () => {
		const first = EveryWidget();
		const second = EveryWidget();
		second.Root.Children!.find((n) => n.Name === "buttonX")!.Props["Text"] = "Edited";
		const a = new UiDocument(first);
		const b = new UiDocument(second);
		expect(b.Id).not.toBe(a.Id);
		const wrapper = mount(WinLayoutView, { props: { document: a } });
		await wrapper.setProps({ document: b } as never);
		expect(wrapper.get('[data-name="buttonX"] button').text()).toBe("Edited");
	});
});

describe("WinLayoutView size and anchors", () => {
	it("takes the given size (else fills its host) and draws each widget at its anchors", async () => {
		const { AnchorMode } = await import("../../../Source/Toolkit/Designer/Anchors");
		const layout = NewLayout("A");
		layout.Root.Children!.push({ ...CreateNode(WidgetType.Button, "Ok", 16, 8), AnchorX: AnchorMode.End, AnchorY: AnchorMode.End });
		const sized = mount(WinLayoutView, { props: { document: new UiDocument(layout), width: 640, height: 480 } });
		const view = sized.get(".win-layout").element as HTMLElement;
		expect([view.style.width, view.style.height]).toEqual(["640px", "480px"]);
		const ok = sized.get('[data-name="Ok"]').element as HTMLElement;
		expect([ok.style.right, ok.style.bottom, ok.style.left]).toEqual(["16px", "8px", ""]);
		const filling = mount(WinLayoutView, { props: { document: new UiDocument(layout) } });
		expect((filling.get(".win-layout").element as HTMLElement).style.width).toBe("100%");
	});
});
