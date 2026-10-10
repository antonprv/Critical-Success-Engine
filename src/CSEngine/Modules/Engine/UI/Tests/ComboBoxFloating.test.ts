// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WinComboBox from "../Source/Components/WinComboBox.vue";
import { ComboBoxController } from "../Source/Controls/ComboBoxController";
import { UseControl } from "../Source/Core/UseControl";

const options = [{ Value: 1, Label: "Arial" }, { Value: 2, Label: "Courier New" }, { Value: 3, Label: "Tahoma" }];

/** A theme root around a skinned layout, as the runtime builds them. */
function ThemeRoot(): { themeRoot: HTMLElement; layout: HTMLElement; } {
	const themeRoot = Object.assign(document.createElement("div"), { className: "win-root win-kit--classic" });
	const layout = Object.assign(document.createElement("div"), { className: "win-layout win-skin win-skin--fancy" });
	themeRoot.appendChild(layout);
	document.body.appendChild(themeRoot);
	return { themeRoot, layout };
}

function Rect(element: Element, rect: { left: number; top: number; width: number; height: number; }): void {
	(element as HTMLElement).getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) });
}

const Controller = () => UseControl(new ComboBoxController({ Options: options, SelectedIndex: 0 }));
const Host = () => document.querySelector(".win-popup-host") as HTMLElement | null;
const List = () => document.querySelector("[role=listbox]") as HTMLElement;

async function Open(wrapper: VueWrapper): Promise<void> {
	await wrapper.get("[role=combobox]").trigger("click");
	await flushPromises();
}

let mounted: VueWrapper[] = [];
const Mount = (props: { controller: ReturnType<typeof Controller>; embedded?: boolean; }, parent: HTMLElement = document.body) => {
	const wrapper = mount(WinComboBox, { props, attachTo: parent });
	mounted.push(wrapper);
	return wrapper;
};

beforeEach(() => {
	vi.spyOn(window, "innerHeight", "get").mockReturnValue(768);
	vi.spyOn(window, "innerWidth", "get").mockReturnValue(1024);
});

afterEach(() => {
	for (const wrapper of mounted) wrapper.unmount();
	mounted = [];
	document.body.innerHTML = "";
});

describe("WinComboBox that is not embedded in its window", () => {
	it("keeps its list in a host at the end of the theme root, with the layout's skin classes, fixed under the box", async () => {
		const { themeRoot, layout } = ThemeRoot();
		const wrapper = Mount({ controller: Controller(), embedded: false }, layout);
		Rect(wrapper.get("[role=combobox]").element, { left: 20, top: 100, width: 140, height: 21 });
		await Open(wrapper);

		expect(wrapper.find("[role=listbox]").exists()).toBe(false);
		const host = Host()!;
		expect(host.parentElement).toBe(themeRoot);
		expect(host.parentElement!.lastElementChild).toBe(host);
		expect([...host.classList]).toEqual(["win-popup-host", "win-skin", "win-skin--fancy"]);
		const list = List();
		expect(host.contains(list)).toBe(true);
		expect(list.classList).toContain("win-combobox__list--floating");
		expect(list.style).toMatchObject({ position: "fixed", left: "20px", top: "121px", minWidth: "140px", zIndex: "3000", pointerEvents: "auto" });
	});

	it("opens above the box when the list is taller than the room below", async () => {
		vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(300);
		const wrapper = Mount({ controller: Controller(), embedded: false });
		Rect(wrapper.get("[role=combobox]").element, { left: 20, top: 700, width: 140, height: 21 });
		await Open(wrapper);

		expect(List().style).toMatchObject({ top: "400px", maxHeight: "696px" });
	});

	it("still works: hovering highlights, a press inside the list keeps it open, a click chooses and closes", async () => {
		const controller = Controller();
		const wrapper = Mount({ controller, embedded: false });
		await Open(wrapper);
		const items = [...List().querySelectorAll("[role=option]")];

		items[2]!.dispatchEvent(new MouseEvent("pointerenter", { bubbles: true }));
		await nextTick();
		expect(controller.HighlightedIndex).toBe(2);
		List().dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
		await nextTick();
		expect(controller.Open).toBe(true);
		items[2]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await nextTick();
		expect(controller.Open).toBe(false);
		expect(wrapper.get(".win-combobox__text").text()).toBe("Tahoma");
		expect(wrapper.emitted("change")).toEqual([[2, 3]]);
		expect(List()).toBeNull();
	});

	it("a click outside closes it; pressing in the list keeps the focus on the box", async () => {
		const controller = Controller();
		const wrapper = Mount({ controller, embedded: false });
		await Open(wrapper);

		const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
		List().dispatchEvent(press);
		expect(press.defaultPrevented).toBe(true);
		document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
		await nextTick();
		expect(controller.Open).toBe(false);
	});

	it("follows the box when the page resizes or scrolls, but not when the list itself scrolls", async () => {
		const wrapper = Mount({ controller: Controller(), embedded: false });
		const box = wrapper.get("[role=combobox]").element;
		Rect(box, { left: 20, top: 100, width: 140, height: 21 });
		await Open(wrapper);
		expect(List().style.top).toBe("121px");

		Rect(box, { left: 20, top: 200, width: 140, height: 21 });
		window.dispatchEvent(new Event("resize"));
		await nextTick();
		expect(List().style.top).toBe("221px");

		Rect(box, { left: 20, top: 300, width: 140, height: 21 });
		List().dispatchEvent(new Event("scroll"));
		await nextTick();
		expect(List().style.top).toBe("221px");
		document.body.dispatchEvent(new Event("scroll"));
		await nextTick();
		expect(List().style.top).toBe("321px");
	});

	it("stops following when it closes, and reuses its host the next time it opens", async () => {
		const removeListener = vi.spyOn(window, "removeEventListener");
		const controller = Controller();
		const wrapper = Mount({ controller, embedded: false });
		await Open(wrapper);
		const host = Host();
		controller.Close();
		await nextTick();
		expect(removeListener).toHaveBeenCalledWith("resize", expect.any(Function));
		expect(removeListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);

		await Open(wrapper);
		expect(Host()).toBe(host);
		expect(document.querySelectorAll(".win-popup-host")).toHaveLength(1);
	});

	it("without a theme root it goes to the body, with no skin classes", async () => {
		const wrapper = Mount({ controller: Controller(), embedded: false });
		await Open(wrapper);

		expect(Host()!.parentElement).toBe(document.body);
		expect([...Host()!.classList]).toEqual(["win-popup-host"]);
	});

	it("closing or unmounting before the list is measured leaves nothing behind", async () => {
		const addListener = vi.spyOn(window, "addEventListener");
		const controller = Controller();
		const wrapper = Mount({ controller, embedded: false });
		controller.Toggle();
		controller.Close();
		await flushPromises();
		expect(addListener).not.toHaveBeenCalledWith("resize", expect.any(Function));

		controller.Toggle();
		wrapper.unmount();
		mounted = [];
		await flushPromises();
		expect(addListener).not.toHaveBeenCalledWith("resize", expect.any(Function));
		expect(Host()).toBeNull();
	});

	it("toggling the prop closes the list and moves it: a host appears when it floats and goes when it is embedded again", async () => {
		const { layout } = ThemeRoot();
		const controller = Controller();
		const wrapper = Mount({ controller }, layout);
		await Open(wrapper);
		expect(Host()).toBeNull();
		expect(wrapper.find("[role=listbox]").exists()).toBe(true);

		await wrapper.setProps({ embedded: false });
		expect(controller.Open).toBe(false);
		expect(Host()).not.toBeNull();
		await wrapper.setProps({ embedded: true });
		expect(Host()).toBeNull();
	});
});

describe("WinComboBox embedded in its window (the default)", () => {
	it("keeps its list inside the box with no host and no fixed positioning, whether the prop is absent or set", async () => {
		for (const props of [{ controller: Controller() }, { controller: Controller(), embedded: true }]) {
			const wrapper = Mount(props);
			await Open(wrapper);
			const list = wrapper.get("[role=listbox]");
			expect(wrapper.get("[role=combobox]").element.contains(list.element)).toBe(true);
			expect(list.classes()).not.toContain("win-combobox__list--floating");
			expect(list.attributes("style")).toBeUndefined();
			expect(Host()).toBeNull();
		}
	});
});
