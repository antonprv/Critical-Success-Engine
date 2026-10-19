// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, shallowRef } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import WinThemeProvider from "../../Source/Components/WinThemeProvider.vue";
import { WinKit } from "../../Source/Core/Kits";
import { WinTheme } from "../../Source/Core/Themes";
import { CreateNode, NewLayout, type LayoutNode, type UiLayout } from "../../Source/Documents/Layout";
import { UiDocument } from "../../Source/Documents/UiDocument";
import WinLayoutView from "../../Source/Documents/WinLayoutView.vue";
import { BuiltInWidgets } from "../../Source/Documents/Widgets";
import type { QuasarController } from "../../Source/Quasar/QuasarController";
import { QuasarWidget } from "../../Source/Quasar/QuasarWidgets";
import { ListenerOf, MissingParent, ParseDirectiveKey } from "../../Source/Quasar/QuasarView";
import type { QuasarComponentRow } from "../../Source/Quasar/QuasarTypes";
import { QuasarComponentTable } from "../../Source/Quasar/QuasarTable.generated";

afterEach(() => { document.body.innerHTML = ""; });

function Layout(...nodes: LayoutNode[]): UiLayout {
	const layout = NewLayout("Quasar");
	layout.Root.Children!.push(...nodes);
	return layout;
}

async function Show(layout: UiLayout, kit = WinKit.Classic, dark = false) {
	const document = new UiDocument(layout);
	const wrapper = mount({ render: () => h(WinThemeProvider, { theme: WinTheme.XpBlue, kit, tailwind: { Accent: "indigo", Neutral: "zinc", Dark: dark, Radius: "md" } }, () => h(WinLayoutView, { document })) }, { attachTo: window.document.body });
	await flushPromises();
	await vi.waitFor(() => expect(wrapper.find(".win-quasar--loading").exists()).toBe(false));
	return { wrapper, document };
}

describe("Quasar widgets in a UI document", () => {
	it("draws the component with its props, forwards its events and keeps its value", async () => {
		const button = CreateNode("q-btn", "Ok", 10, 20);
		const input = { ...CreateNode("q-input", "Name", 10, 60), Props: { label: "Name", "model-value": "Ann", rules: ["email", { Rule: "required" }] } };
		const { wrapper, document } = await Show(Layout(button, input));

		const node = wrapper.get('[data-name="Ok"]');
		expect(node.get(".q-btn").text()).toBe("Button");
		expect((node.element as HTMLElement).style.left).toBe("10px");
		const clicks = vi.fn();
		document.On("Ok", "click", clicks);
		await node.get(".q-btn").trigger("click");
		expect(clicks).toHaveBeenCalledOnce();

		const name = document.Controller<QuasarController>("Name");
		const changes = vi.fn();
		document.On("Name", "change", changes);
		const field = wrapper.get('[data-name="Name"] input');
		expect((field.element as HTMLInputElement).value).toBe("Ann");
		await field.setValue("Bob");
		expect(name.Value).toBe("Bob");
		expect(changes).toHaveBeenCalledWith("Bob");
		name.SetValue("Cy");
		await nextTick();
		expect((field.element as HTMLInputElement).value).toBe("Cy");
		wrapper.unmount();
	});

	it("puts child widgets into the slots they name, flowing; the default slot shows the text otherwise", async () => {
		const toolbar = CreateNode("q-toolbar", "Bar", 0, 0);
		const title = { ...CreateNode("q-toolbar-title", "Title", 0, 0), Content: "My app" };
		const button = { ...CreateNode("q-btn", "Menu", 0, 0), Props: { icon: "menu", flat: true } };
		const old = { ...CreateNode("button", "Classic", 0, 0), Width: 80, Height: 24 };
		toolbar.Children = [title, button, old];
		const item = CreateNode("q-item", "Item", 0, 100);
		item.Children = [{ ...CreateNode("q-item-section", "Side", 0, 0), Props: { avatar: true }, Content: "A" }, { ...CreateNode("q-item-section", "Main", 0, 0), Content: "Main text" }];
		const banner = CreateNode("q-banner", "Note", 0, 200);
		banner.Children = [{ ...CreateNode("q-btn", "Action", 0, 0), Slot: "action" }];
		const { wrapper } = await Show(Layout(toolbar, item, banner));

		const bar = wrapper.get('[data-name="Bar"] .q-toolbar');
		expect(bar.get(".q-toolbar__title").text()).toBe("My app");
		expect(wrapper.get('[data-name="Title"]').classes()).toEqual(expect.arrayContaining(["win-layout__node--flow", "win-layout__node--contents"]));
		const classic = wrapper.get('[data-name="Classic"]').element as HTMLElement;
		expect([classic.style.width, classic.style.height, classic.style.left]).toEqual(["80px", "24px", ""]);
		expect(wrapper.get('[data-name="Item"] .q-item').text()).toBe("AMain text");
		expect(wrapper.find('[data-name="Note"] .q-banner__actions [data-name="Action"]').exists()).toBe(true);
		expect(wrapper.get('[data-name="Note"] .q-banner__content').text()).toBe("Banner");
		wrapper.unmount();
	});

	it("is disabled with its controller, dark in a dark theme, and runs its directives", async () => {
		const chip = { ...CreateNode("q-card", "Card", 0, 0), Directives: { ripple: true, "touch-swipe:mouse.left": true }, Content: "Swipe me" };
		const field = { ...CreateNode("q-input", "Field", 0, 100), Props: { label: "F", dark: false } };
		const { wrapper, document } = await Show(Layout(chip, field), WinKit.Tailwind, true);
		expect(wrapper.get('[data-name="Card"] .q-card').classes()).toContain("q-card--dark");
		expect(wrapper.get('[data-name="Field"] .q-field').classes()).not.toContain("q-field--dark");
		const swipes = vi.fn();
		document.On("Card", "touch-swipe", swipes);
		// what Quasar's touch-swipe calls when the card is swiped: its handler, which is the widget's event
		const card = wrapper.get('[data-name="Card"] .q-card').element as unknown as { __qtouchswipe: { handler: (detail: unknown) => void; }; };
		card.__qtouchswipe.handler({ direction: "left" });
		expect(swipes).toHaveBeenCalledWith({ direction: "left" });

		const control = document.Controller<QuasarController>("Field");
		control.SetEnabled(false);
		await nextTick();
		expect(wrapper.get('[data-name="Field"] .q-field').classes()).toContain("q-field--disabled");
		wrapper.unmount();
	});

	it("draws at once when its component was loaded before, and says why when it can't load", async () => {
		await Show(Layout(CreateNode("q-badge", "First", 0, 0)));
		const document = new UiDocument(Layout({ ...CreateNode("q-badge", "Again", 0, 0), Directives: { ripple: true } }));
		// an app with Quasar already, a component and a directive loaded before: drawn at once
		const wrapper = mount({ render: () => h(WinThemeProvider, { theme: WinTheme.XpBlue }, () => h(WinLayoutView, { document })) }, { global: { config: { globalProperties: { $q: { platform: {} } } } } });
		expect(wrapper.find(".q-badge").exists()).toBe(true);

		const row = { ...QuasarComponentTable.find((r) => r.Name === "QSpace")!, Name: "QBroken", Type: "q-broken", Load: () => Promise.reject(new Error("offline")) };
		const widgets = BuiltInWidgets.Extend().Register(QuasarWidget(row));
		const layout = Layout(CreateNode("q-broken", "Broken", 0, 0, widgets));
		const broken = mount(WinLayoutView, { props: { document: new UiDocument(layout, { Widgets: widgets }) } });
		await flushPromises();
		expect(broken.get(".win-quasar--failed").text()).toBe("QBroken: offline");
		wrapper.unmount();
	});
});

describe("Quasar view helpers", () => {
	it("reads a directive's name, argument and modifiers, and an event's listener prop", () => {
		expect(ParseDirectiveKey("touch-swipe:mouse.left.right")).toEqual({ Name: "touch-swipe", Arg: "mouse", Modifiers: { left: true, right: true } });
		expect(ParseDirectiveKey("ripple")).toEqual({ Name: "ripple", Arg: undefined, Modifiers: {} });
		expect(ListenerOf("update:model-value")).toBe("onUpdate:modelValue");
		expect(ListenerOf("click")).toBe("onClick");
	});
});

describe("Quasar widgets in the designer", () => {
	it("follow the designer's new document at every change: its controllers and props", async () => {
		const layout = (label: string, directives?: Record<string, true>): UiLayout => Layout({ ...CreateNode("q-btn", "Ok", 0, 0), Props: { label }, ...(directives ? { Directives: directives } : {}) });
		const current = shallowRef(new UiDocument(layout("First")));
		const wrapper = mount({ render: () => h(WinThemeProvider, { theme: WinTheme.XpBlue }, () => h(WinLayoutView, { document: current.value })) }, { attachTo: window.document.body });
		await flushPromises();
		await vi.waitFor(() => expect(wrapper.find('[data-name="Ok"] .q-btn').exists()).toBe(true));
		const old = current.value.Controller<QuasarController>("Ok");
		expect(() => old.Call("click")).not.toThrow();

		// the designer's next document: the same view, the new controller's props, the component handed over
		current.value = new UiDocument(layout("Second"));
		await flushPromises();
		expect(wrapper.get('[data-name="Ok"] .q-btn').text()).toBe("Second");
		expect(() => old.Call("click")).toThrow("isn't on screen");
		expect(() => current.value.Controller<QuasarController>("Ok").Call("click")).not.toThrow();

		// a directive added: loaded, then drawn with it
		current.value = new UiDocument(layout("Third", { ripple: true }));
		await flushPromises();
		await vi.waitFor(() => expect(wrapper.get('[data-name="Ok"] .q-btn').text()).toBe("Third"));
		// a directive Quasar hasn't: said on the widget
		current.value = new UiDocument(layout("Fourth", { "no-such": true } as Record<string, true>));
		await flushPromises();
		await vi.waitFor(() => expect(wrapper.get('[data-name="Ok"] .win-quasar--failed').text()).toBe('QBtn: Quasar has no directive "no-such"'));
		wrapper.unmount();
	});

	it("says where a component that needs a parent goes, and draws it there", async () => {
		const drawer = CreateNode("q-drawer", "Side", 0, 0);
		const page = CreateNode("q-page", "Page", 0, 0);
		const tabs = CreateNode("q-tabs", "Tabs", 0, 100);
		tabs.Children = [{ ...CreateNode("q-tab", "One", 0, 0), Props: { name: "one", label: "One" } }, { ...CreateNode("q-route-tab", "Route", 0, 0), Props: { name: "route", label: "Route" } }];
		const { wrapper } = await Show(Layout(drawer, page, tabs));
		expect(wrapper.get('[data-name="Side"] .win-quasar--orphan').text()).toBe("QDrawer goes inside a Layout (q-layout)");
		expect(wrapper.get('[data-name="Page"] .win-quasar--orphan').text()).toContain("q-page-container");
		expect(wrapper.find('[data-name="One"] .q-tab').exists()).toBe(true);
		expect(wrapper.get('[data-name="Route"] .win-quasar--orphan').text()).toContain("Vue Router");
		expect(MissingParent("QBtn", () => false)).toBeNull();
		wrapper.unmount();
	});

	it("shows a component that fails alone, the rest of the document drawn", async () => {
		const failing: QuasarComponentRow = { ...QuasarComponentTable.find((row) => row.Name === "QBtn")!, Name: "QBroken", Type: "q-broken", Load: async () => ({ default: defineComponent({ setup: () => { throw new Error("broken setup"); } }) }) };
		const thrown: QuasarComponentRow = { ...failing, Name: "QThrown", Type: "q-thrown", Load: async () => ({ default: defineComponent({ setup: () => { throw "a string"; } }) }) };
		const widgets = BuiltInWidgets.Extend().Register(QuasarWidget(failing)).Register(QuasarWidget(thrown));
		const document = new UiDocument(Layout(CreateNode("q-broken", "Broken", 0, 0, widgets), CreateNode("q-thrown", "Thrown", 0, 40, widgets), CreateNode("q-btn", "Fine", 0, 80)), { Widgets: widgets });
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const wrapper = mount({ render: () => h(WinThemeProvider, { theme: WinTheme.XpBlue }, () => h(WinLayoutView, { document })) }, { attachTo: window.document.body });
		await vi.waitFor(() => expect(wrapper.find('[data-name="Broken"] .win-quasar--failed').exists()).toBe(true));
		expect(wrapper.get('[data-name="Broken"] .win-quasar--failed').text()).toBe("QBroken: broken setup");
		await vi.waitFor(() => expect(wrapper.get('[data-name="Thrown"] .win-quasar--failed').text()).toBe("QThrown: a string"));
		await vi.waitFor(() => expect(wrapper.find('[data-name="Fine"] .q-btn').exists()).toBe(true));
		wrapper.unmount();
	});

	it("draws a virtual scroll's items as text without widgets of its own", async () => {
		const scroll = { ...CreateNode("q-virtual-scroll", "List", 0, 0), Props: { items: ["Plain", { label: "Labelled" }] } };
		const { wrapper } = await Show(Layout(scroll));
		await vi.waitFor(() => expect(wrapper.get('[data-name="List"]').text()).toContain("Labelled"));
		expect(wrapper.get('[data-name="List"]').text()).toContain("Plain");
		wrapper.unmount();
	});
});
