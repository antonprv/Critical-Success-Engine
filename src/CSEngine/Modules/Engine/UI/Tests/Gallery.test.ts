// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://test.invalid/"}
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import Gallery from "../Source/Gallery/Gallery.vue";

afterEach(() => { vi.resetModules(); document.body.innerHTML = ""; });

const Mount = () => mount(Gallery, { attachTo: document.body });
const logLines = (wrapper: ReturnType<typeof Mount>) => wrapper.findAll(".gallery-log li").map((li) => li.text());
const windowByTitle = (wrapper: ReturnType<typeof Mount>, title: string) => wrapper.get(`.win-window[aria-label="${title}"]`);

describe("toolkit gallery", () => {
	it("opens a desktop with the Themes, Controls, Explorer and Event log windows, in XP Blue", () => {
		const wrapper = Mount();
		expect(wrapper.findAll(".win-window").map((w) => w.attributes("aria-label"))).toEqual(["Themes", "Controls", "Explorer", "Event log"]);
		expect(wrapper.get(".win-root").classes()).toContain("win-theme--xp-blue");
		expect(wrapper.findAll(".win-taskbar__button").map((b) => b.text())).toEqual(["Themes", "Controls", "Explorer", "More controls", "Event log", "Touch controls"]);
		wrapper.unmount();
	});

	it("picking a theme restyles everything and is logged", async () => {
		const wrapper = Mount();
		const radios = windowByTitle(wrapper, "Themes").findAll(".gallery-classic [role=radio]");
		expect(radios).toHaveLength(12);
		await radios[0]!.trigger("click");
		expect(wrapper.get(".win-root").classes()).toEqual(expect.arrayContaining(["win-family--classic", "win-theme--win98"]));
		expect(logLines(wrapper)[0]).toBe("Theme: Windows 98");
		wrapper.unmount();
	});

	it("every control reports to the event log through its controller's events", async () => {
		const wrapper = Mount();
		const controls = windowByTitle(wrapper, "Controls");
		const button = (label: string) => controls.findAll("button.win-button").find((b) => b.text() === label)!;

		await button("Push me").trigger("click"); // a keyboard-free click: Enter goes through the same path
		await button("Push me").trigger("keydown", { code: "Enter" });
		await button("Step").trigger("keydown", { code: "Enter" });
		await controls.findAll(".win-checkbox")[0]!.trigger("click");
		await controls.findAll(".win-checkbox")[1]!.trigger("click");
		await controls.findAll("[role=radio]")[2]!.trigger("click");
		await controls.get("[role=slider]").trigger("keydown", { code: "ArrowRight" });
		await controls.findAll("[role=tab]")[1]!.trigger("click");

		expect(logLines(wrapper).reverse()).toEqual([
			"Button: click",
			"Progress: 10%",
			"Check box: checked",
			"Progress: marquee on",
			"Radio: Large",
			"Slider: 51",
			"Tabs: Advanced",
		]);
		expect(controls.get(".win-progress").classes()).toContain("win-progress--marquee");
		expect(controls.get("[role=tabpanel]").text()).toContain("Advanced settings");
		wrapper.unmount();
	});

	it("the explorer window's menu, tree and list report to the log too", async () => {
		const wrapper = Mount();
		const explorer = windowByTitle(wrapper, "Explorer");
		await explorer.findAll(".win-menubar__item")[1]!.trigger("click");
		await explorer.get("[role=menuitemcheckbox]").trigger("click");
		await explorer.findAll("[role=treeitem]")[0]!.trigger("click");
		await explorer.findAll(".win-listview__row")[1]!.trigger("click");
		await explorer.findAll(".win-listview__row")[1]!.trigger("dblclick");
		await explorer.findAll("[role=columnheader]")[1]!.trigger("click");
		expect(explorer.findAll(".win-listview__row").map((r) => r.findAll("[role=gridcell]")[1]!.text())).toEqual(["1", "1", "4", "512"]);
		expect(logLines(wrapper).reverse()).toEqual([
			"Menu: Status Bar",
			"Tree: My Computer",
			"List: 1 selected",
			"List: opened readme.txt",
			"List: sorted by size",
		]);
		wrapper.unmount();
	});

	it("window moves, resizes, state changes and closing are logged; the log keeps the last 40 lines", async () => {
		const wrapper = Mount();
		const controls = windowByTitle(wrapper, "Controls");
		await controls.get("[aria-label=Minimize]").trigger("click");
		await nextTick();
		await wrapper.findAll(".win-taskbar__button")[1]!.trigger("click");
		await windowByTitle(wrapper, "Explorer").get("[aria-label=Close]").trigger("click");
		expect(logLines(wrapper).reverse()).toEqual(["Window: Controls minimized", "Window: Controls normal", "Window: Explorer closed"]);

		const push = windowByTitle(wrapper, "Controls").findAll("button.win-button").find((b) => b.text() === "Push me")!;
		for (let i = 0; i < 45; i++) await push.trigger("keydown", { code: "Enter" });
		expect(logLines(wrapper)).toHaveLength(40);
		wrapper.unmount();
	});
});

describe("the Tailwind kit in the gallery", () => {
	it("switching the kit to Tailwind shows its options; accent, neutral, radius and dark restyle everything and are logged", async () => {
		const wrapper = Mount();
		const themes = windowByTitle(wrapper, "Themes");
		expect(themes.find(".gallery-tailwind").exists()).toBe(false);
		await themes.findAll(".gallery-kit [role=radio]")[1]!.trigger("click");
		expect(wrapper.get(".win-root").classes()).toEqual(expect.arrayContaining(["win-kit--tailwind", "tw-accent--indigo", "tw-neutral--zinc", "tw-radius--md"]));
		expect(themes.find(".gallery-classic").exists()).toBe(false);

		const choose = async (index: number, option: string) => {
			await themes.findAll(".gallery-tailwind [role=combobox]")[index]!.trigger("click");
			await themes.findAll(".gallery-tailwind [role=option]").find((o) => o.text() === option)!.trigger("click");
		};
		await choose(0, "rose");
		await choose(1, "stone");
		await choose(2, "full");
		await themes.get(".gallery-tailwind .win-switch").trigger("click");
		expect(wrapper.get(".win-root").classes()).toEqual(expect.arrayContaining(["tw-accent--rose", "tw-neutral--stone", "tw-radius--full", "tw-dark"]));
		await themes.get(".gallery-tailwind .win-switch").trigger("click");
		expect(wrapper.get(".win-root").classes()).not.toContain("tw-dark");
		expect(logLines(wrapper).slice(0, 6).reverse()).toEqual(["Kit: Tailwind", "Accent: rose", "Neutral: stone", "Radius: full", "Dark: on", "Dark: off"]);

		await themes.findAll(".gallery-kit [role=radio]")[0]!.trigger("click");
		expect(wrapper.get(".win-root").classes()).toContain("win-kit--classic");
		expect(logLines(wrapper)[0]).toBe("Kit: Classic");
		wrapper.unmount();
	});
});

describe("the More controls window", () => {
	async function Open() {
		const wrapper = Mount();
		await wrapper.findAll(".win-taskbar__button").find((b) => b.text() === "More controls")!.trigger("click");
		return { wrapper, more: windowByTitle(wrapper, "More controls") };
	}

	it("starts minimized on the taskbar and opens from there", async () => {
		const wrapper = Mount();
		expect(wrapper.find('.win-window[aria-label="More controls"]').exists()).toBe(false);
		const { wrapper: opened } = await Open();
		expect(opened.find('.win-window[aria-label="More controls"]').exists()).toBe(true);
		opened.unmount();
		wrapper.unmount();
	});

	it("toolbar, spinner, combo box and scroll bar report to the log; typing updates the status bar", async () => {
		const { wrapper, more } = await Open();
		await more.findAll(".win-toolbar__button")[1]!.trigger("click");
		await more.get(".win-textbox").setValue("Hello");
		expect(more.findAll(".win-statusbar__panel")[1]!.text()).toBe("5 characters");
		await more.get("[aria-label=Increase]").trigger("click");
		await more.get("[role=combobox]").trigger("click");
		await more.findAll("[role=option]")[1]!.trigger("click");
		await more.get("[aria-label='Scroll forward']").trigger("click");
		expect(logLines(wrapper).slice(0, 4).reverse()).toEqual(["Toolbar: bold", "Spinner: 6", "Font: Courier New", "Scroll: 1"]);
		wrapper.unmount();
	});

	it("the tooltip shows after resting on its button; the message box asks, and its answer is logged", async () => {
		vi.useFakeTimers();
		const { wrapper, more } = await Open();
		more.get(".win-tooltip-host").element.dispatchEvent(new MouseEvent("pointerenter", { bubbles: true }));
		vi.advanceTimersByTime(500);
		await nextTick();
		expect(more.get("[role=tooltip]").text()).toBe("Shows a classic message box");
		expect(logLines(wrapper)[0]).toBe("Tooltip: shown");

		await more.findAll("button.win-button").find((b) => b.text() === "Message box...")!.trigger("keydown", { code: "Enter" });
		const dialog = wrapper.get("[role=alertdialog]");
		expect(dialog.text()).toContain("Do you want to save changes?");
		await dialog.findAll(".win-messagebox__buttons button")[1]!.trigger("click");
		expect(wrapper.find("[role=alertdialog]").exists()).toBe(false);
		expect(logLines(wrapper)[0]).toBe("Message box: No");
		vi.useRealTimers();
		wrapper.unmount();
	});
});

describe("toolkit page entry", () => {
	it("mounts the gallery into #toolkit", async () => {
		document.body.innerHTML = '<div id="toolkit"></div>';
		await import("../Source/Gallery/Main");
		await nextTick();
		expect(document.querySelectorAll(".win-window")).toHaveLength(4); // "More controls" starts minimized
	});

	it("the Touch controls window: the stick's position shows live and is logged when let go; game buttons log their presses", async () => {
		const wrapper = Mount();
		await wrapper.findAll(".win-taskbar__button").find((b) => b.text() === "Touch controls")!.trigger("click");
		const touch = windowByTitle(wrapper, "Touch controls");
		const stick = touch.get(".win-joystick").element as HTMLElement;
		stick.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
		const pointer = (type: string, x: number, y: number) => {
			const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
			Object.defineProperty(event, "pointerId", { value: 1 });
			return event;
		};
		stick.dispatchEvent(pointer("pointerdown", 50, 20));
		await wrapper.vm.$nextTick();
		expect(touch.get(".gallery-touch__readout").text()).toBe("Stick: 0.00, -1.00");
		stick.dispatchEvent(pointer("pointerup", 50, 20));
		const jump = touch.findAll(".win-game-button").find((b) => b.text() === "Jump")!.element as HTMLElement;
		jump.getBoundingClientRect = stick.getBoundingClientRect;
		jump.dispatchEvent(pointer("pointerdown", 50, 50));
		await wrapper.vm.$nextTick();
		expect(logLines(wrapper).slice(0, 2)).toEqual(["Game button: Jump pressed", "Stick: let go at 0.00, -1.00"]);
		wrapper.unmount();
	});
});
