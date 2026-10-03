// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { ListViewController, SelectionMode, SortDirection } from "../../Source/Toolkit/Controls/ListViewController";
import { MenuController } from "../../Source/Toolkit/Controls/MenuController";
import { TreeViewController } from "../../Source/Toolkit/Controls/TreeViewController";
import { WindowController, WindowState } from "../../Source/Toolkit/Controls/WindowController";
import { WindowManager } from "../../Source/Toolkit/Controls/WindowManager";
import { UseControl } from "../../Source/Toolkit/Core/UseControl";
import WinDesktop from "../../Source/Toolkit/Components/WinDesktop.vue";
import WinListView from "../../Source/Toolkit/Components/WinListView.vue";
import WinMenuBar from "../../Source/Toolkit/Components/WinMenuBar.vue";
import WinTreeView from "../../Source/Toolkit/Components/WinTreeView.vue";
import WinWindow from "../../Source/Toolkit/Components/WinWindow.vue";

async function pointer(target: { element: Element; } | Element | Window, type: string, init: MouseEventInit = {}): Promise<void> {
	const element = "element" in target ? target.element : target;
	element.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
	await nextTick();
}

describe("WinListView", () => {
	type File = { name: string; size: number; };
	const files: File[] = [{ name: "b.txt", size: 20 }, { name: "a.txt", size: 100 }, { name: "c.txt", size: 3 }];
	const columns = [{ Key: "name", Label: "Name" }, { Key: "size", Label: "Size", Compare: (a: File, b: File) => a.size - b.size }];

	it("draws a details view; clicks with Ctrl/Shift select like Explorer; double click and Enter activate", async () => {
		const controller = UseControl(new ListViewController({ Items: [...files], SelectionMode: SelectionMode.Extended }));
		const wrapper = mount(WinListView, { props: { controller, columns } });
		expect(wrapper.findAll("[role=columnheader]").map((h) => h.text())).toEqual(["Name", "Size"]);
		const rows = () => wrapper.findAll("[role=row].win-listview__row");
		expect(rows().map((r) => r.findAll("[role=gridcell]").map((c) => c.text()))).toEqual([["b.txt", "20"], ["a.txt", "100"], ["c.txt", "3"]]);

		await rows()[0]!.trigger("click");
		await rows()[2]!.trigger("click", { shiftKey: true });
		expect(rows().map((r) => r.attributes("aria-selected"))).toEqual(["true", "true", "true"]);
		await rows()[1]!.trigger("click", { ctrlKey: true });
		expect(rows()[1]!.attributes("aria-selected")).toBe("false");
		expect(rows()[1]!.classes()).toContain("win-listview__row--focused");

		await rows()[2]!.trigger("dblclick");
		await wrapper.get("[role=grid]").trigger("keydown", { code: "ArrowUp" });
		await wrapper.get("[role=grid]").trigger("keydown", { code: "Enter" });
		expect(wrapper.emitted("activate")!.map((e) => e[0])).toEqual([2, 1]);
		expect(wrapper.emitted("selection-change")!.length).toBeGreaterThan(2);
	});

	it("clicking a header sorts by it (its own comparer, or by text), with an arrow showing the direction", async () => {
		const controller = UseControl(new ListViewController({ Items: [...files] }));
		const wrapper = mount(WinListView, { props: { controller, columns } });
		const headers = () => wrapper.findAll("[role=columnheader]");
		await headers()[1]!.trigger("click");
		expect(controller.Items.map((f) => f.size)).toEqual([3, 20, 100]);
		expect(headers()[1]!.attributes("aria-sort")).toBe("ascending");
		await headers()[1]!.trigger("click");
		expect(headers()[1]!.attributes("aria-sort")).toBe("descending");
		expect(headers()[0]!.attributes("aria-sort")).toBe("none");
		await headers()[0]!.trigger("click");
		expect(controller.Items.map((f) => f.name)).toEqual(["a.txt", "b.txt", "c.txt"]);
		expect(wrapper.emitted("sort")).toEqual([["size", SortDirection.Ascending], ["size", SortDirection.Descending], ["name", SortDirection.Ascending]]);
	});
});

describe("WinTreeView", () => {
	const nodes = [{ Id: "pc", Label: "My Computer", Children: [{ Id: "c", Label: "Local Disk (C:)" }] }, { Id: "net", Label: "Network" }];

	it("draws the visible nodes indented, expands with the +/- box, selects on click, activates on double click", async () => {
		const controller = UseControl(new TreeViewController({ Nodes: nodes }));
		const wrapper = mount(WinTreeView, { props: { controller } });
		const items = () => wrapper.findAll("[role=treeitem]");
		expect(items().map((i) => i.text())).toEqual(["My Computer", "Network"]);
		expect(items()[0]!.attributes("aria-expanded")).toBe("false");
		expect(items()[1]!.attributes("aria-expanded")).toBeUndefined();
		expect(wrapper.findAll(".win-tree__expander")).toHaveLength(1);

		await wrapper.get(".win-tree__expander").trigger("click");
		expect(items().map((i) => i.text())).toEqual(["My Computer", "Local Disk (C:)", "Network"]);
		expect((items()[1]!.element as HTMLElement).style.paddingLeft).toBe("19px");
		expect(controller.SelectedId).toBeNull(); // the +/- box doesn't select

		await items()[1]!.trigger("click");
		expect(items()[1]!.attributes("aria-selected")).toBe("true");
		await items()[2]!.trigger("dblclick");
		await wrapper.get("[role=tree]").trigger("keydown", { code: "ArrowUp" });
		expect(controller.SelectedId).toBe("c");
		expect(wrapper.emitted("activate")!.map((e) => (e[0] as { Id: string; }).Id)).toEqual(["net"]);
		expect(wrapper.emitted("expand-change")).toHaveLength(1);
		expect(wrapper.emitted("selection-change")).toHaveLength(3);
	});
});

describe("WinMenuBar", () => {
	const menu = () => UseControl(new MenuController({ Items: [
		{ Id: "file", Label: "&File", Items: [
			{ Id: "new", Label: "&New", Shortcut: "Ctrl+N" },
			{ Id: "sep", Label: "", Separator: true },
			{ Id: "recent", Label: "&Recent", Items: [{ Id: "r1", Label: "notes.txt" }] },
			{ Id: "exit", Label: "E&xit", Disabled: true },
		] },
		{ Id: "view", Label: "&View", Items: [{ Id: "status", Label: "&Status Bar", Checkable: true, Checked: true }] },
	] }));

	it("click opens a top menu, a second click closes it; items show mnemonics, shortcuts, checks, separators and submenus", async () => {
		const controller = menu();
		const wrapper = mount(WinMenuBar, { props: { controller } });
		const top = wrapper.findAll(".win-menubar__item");
		expect(top[0]!.html()).toContain("<u>F</u>ile");
		await top[0]!.trigger("click");
		expect(controller.OpenPath).toEqual(["file"]);
		const items = wrapper.findAll("[role=menu] > li");
		expect(items.map((i) => i.attributes("role"))).toEqual(["menuitem", "separator", "menuitem", "menuitem"]);
		expect(items[0]!.text()).toContain("Ctrl+N");
		expect(items[2]!.classes()).toContain("win-menu__item--submenu");
		expect(items[3]!.attributes("aria-disabled")).toBe("true");
		await top[0]!.trigger("click");
		expect(controller.OpenPath).toEqual([]);
	});

	it("moving to another top item while a menu is open switches menus; choosing an item invokes it and closes", async () => {
		const controller = menu();
		const wrapper = mount(WinMenuBar, { props: { controller } });
		const top = wrapper.findAll(".win-menubar__item");
		await pointer(top[1]!, "pointerenter"); // nothing open yet: no effect
		expect(controller.OpenPath).toEqual([]);
		await top[0]!.trigger("click");
		await pointer(top[1]!, "pointerenter");
		expect(controller.OpenPath).toEqual(["view"]);
		const check = wrapper.get("[role=menuitemcheckbox]");
		expect(check.attributes("aria-checked")).toBe("true");
		await check.trigger("click");
		expect(controller.Find("status")!.Checked).toBe(false);
		expect(wrapper.emitted("invoke")).toHaveLength(1);
		expect(wrapper.emitted("check-change")).toHaveLength(1);
		expect(wrapper.findAll("[role=menu]")).toHaveLength(0);
	});

	it("submenus open one level deeper; keys drive the controller; a click outside closes everything", async () => {
		const controller = menu();
		const wrapper = mount(WinMenuBar, { props: { controller }, attachTo: document.body });
		await wrapper.findAll(".win-menubar__item")[0]!.trigger("click");
		await wrapper.get(".win-menu__item--submenu").trigger("click");
		expect(wrapper.findAll("[role=menu]")).toHaveLength(2);
		expect(wrapper.findAll("[role=menu]")[1]!.text()).toContain("notes.txt");

		await wrapper.get("[role=menubar]").trigger("keydown", { code: "ArrowDown" });
		expect(controller.HighlightedId).toBe("r1");
		expect(wrapper.get(".win-menu__item--highlighted").text()).toContain("notes.txt");
		await wrapper.get("[role=menubar]").trigger("keydown", { code: "KeyV", altKey: true });

		await pointer(wrapper.findAll("[role=menu]")[0]!, "pointerdown"); // inside: stays open
		expect(controller.OpenPath.length).toBe(2);
		await pointer(document.body, "pointerdown");
		expect(controller.OpenPath).toEqual([]);
		await pointer(document.body, "pointerdown"); // already closed: nothing to do
		expect(wrapper.emitted("open-change")).toHaveLength(3);
		wrapper.unmount();
	});
});

describe("WinWindow", () => {
	const Window = (options: ConstructorParameters<typeof WindowController>[0] = {}) =>
		UseControl(new WindowController({ Title: "Notepad", X: 10, Y: 20, Width: 300, Height: 200, ...options }));

	it("is placed and sized by its controller; the title bar buttons minimize, maximize/restore and close", async () => {
		const controller = Window();
		const wrapper = mount(WinWindow, { props: { controller }, slots: { default: "<p>Hello</p>" } });
		const root = wrapper.get(".win-window").element as HTMLElement;
		expect([root.style.left, root.style.top, root.style.width, root.style.height]).toEqual(["10px", "20px", "300px", "200px"]);
		expect(wrapper.get(".win-window__title").text()).toBe("Notepad");
		expect(wrapper.get(".win-window__body").text()).toBe("Hello");
		expect(wrapper.findAll(".win-window__resize")).toHaveLength(8);

		await wrapper.get("[aria-label=Maximize]").trigger("click");
		expect(controller.State).toBe(WindowState.Maximized);
		expect(wrapper.get(".win-window").classes()).toContain("win-window--maximized");
		expect(wrapper.findAll(".win-window__resize")).toHaveLength(0);
		await wrapper.get("[aria-label=Restore]").trigger("click");
		await wrapper.get("[aria-label=Minimize]").trigger("click");
		expect(wrapper.find(".win-window").exists()).toBe(false);
		controller.Restore();
		await nextTick();
		await wrapper.get("[aria-label=Close]").trigger("click");
		expect(wrapper.find(".win-window").exists()).toBe(false);
		expect(wrapper.emitted("close")).toHaveLength(1);
		expect(wrapper.emitted("state-change")).toHaveLength(4);
	});

	it("dragging the title bar moves it, double-clicking toggles maximize; disabled buttons are left out", async () => {
		const controller = Window({ Minimizable: false, Closable: false, Resizable: false });
		const wrapper = mount(WinWindow, { props: { controller }, attachTo: document.body });
		expect(wrapper.find("[aria-label=Minimize]").exists()).toBe(false);
		expect(wrapper.find("[aria-label=Close]").exists()).toBe(false);
		expect(wrapper.findAll(".win-window__resize")).toHaveLength(0);

		await pointer(wrapper.get(".win-window__titlebar"), "pointerdown", { button: 2, clientX: 20, clientY: 25 });
		expect(controller.Dragging).toBe(false);
		await pointer(wrapper.get(".win-window__titlebar"), "pointerdown", { button: 0, clientX: 20, clientY: 25 });
		await pointer(window, "pointermove", { clientX: 70, clientY: 45 });
		await pointer(window, "pointerup");
		await pointer(window, "pointermove", { clientX: 500, clientY: 500 });
		expect([controller.X, controller.Y]).toEqual([60, 40]);
		expect(wrapper.emitted("move")).toHaveLength(1);

		await wrapper.get(".win-window__titlebar").trigger("dblclick");
		expect(controller.State).toBe(WindowState.Maximized);
		expect([controller.Width, controller.Height]).toEqual([window.innerWidth, window.innerHeight]);
		controller.Restore();
		await nextTick();
		wrapper.unmount();
	});

	it("pressing a title bar button doesn't start dragging the window", async () => {
		const controller = Window();
		const wrapper = mount(WinWindow, { props: { controller }, attachTo: document.body });
		for (const label of ["Minimize", "Maximize", "Close"]) {
			await pointer(wrapper.get(`[aria-label=${label}]`), "pointerdown", { button: 0, clientX: 5, clientY: 5 });
			expect(controller.Dragging, label).toBe(false);
		}
		wrapper.unmount();
	});

	it("dragging a border resizes; a window with no maximize box ignores double clicks; activation goes through the manager", async () => {
		const manager = UseControl(new WindowManager());
		const a = Window({ Maximizable: false }), b = Window({ Title: "B" });
		manager.Add(a);
		manager.Add(b);
		const wrapper = mount(WinWindow, { props: { controller: a, manager }, attachTo: document.body });
		expect(wrapper.find("[aria-label=Maximize]").exists()).toBe(false);
		expect(wrapper.get(".win-window").classes()).toContain("win-window--inactive");
		expect((wrapper.get(".win-window").element as HTMLElement).style.zIndex).toBe("1");

		await pointer(wrapper.get(".win-window"), "pointerdown", { button: 0 });
		expect(manager.ActiveWindow).toBe(a);
		expect(wrapper.get(".win-window").classes()).not.toContain("win-window--inactive");

		await pointer(wrapper.get(".win-window__resize--right"), "pointerdown", { button: 0, clientX: 310, clientY: 100 });
		await pointer(window, "pointermove", { clientX: 360, clientY: 100 });
		await pointer(window, "pointerup");
		expect(a.Width).toBe(350);
		await pointer(wrapper.get(".win-window__resize--right"), "pointerdown", { button: 1, clientX: 0, clientY: 0 });
		expect(a.Resizing).toBe(false);
		await wrapper.get(".win-window__titlebar").trigger("dblclick");
		expect(a.State).toBe(WindowState.Normal);
		expect(wrapper.emitted("resize")).toHaveLength(1);
		wrapper.unmount();
	});
});

describe("WinDesktop", () => {
	it("hosts windows in a manager, gives them the desktop size for maximizing, and lists them on a taskbar", async () => {
		const manager = UseControl(new WindowManager());
		const a = UseControl(new WindowController({ Title: "A" })), b = UseControl(new WindowController({ Title: "B" }));
		const wrapper = mount(WinDesktop, {
			props: { manager },
			slots: { default: () => [a, b].map((w) => (w === a ? "" : "")) },
			attachTo: document.body,
		});
		const desktop = wrapper.get(".win-desktop__area").element as HTMLElement;
		Object.defineProperty(desktop, "clientWidth", { value: 640 });
		Object.defineProperty(desktop, "clientHeight", { value: 400 });
		manager.Add(a);
		manager.Add(b);
		await nextTick();

		const buttons = () => wrapper.findAll(".win-taskbar__button");
		expect(buttons().map((x) => x.text())).toEqual(["A", "B"]);
		expect(buttons()[1]!.classes()).toContain("win-taskbar__button--active");

		await buttons()[0]!.trigger("click"); // inactive: activate
		expect(manager.ActiveWindow).toBe(a);
		await buttons()[0]!.trigger("click"); // active: minimize
		expect(a.State).toBe(WindowState.Minimized);
		expect(manager.ActiveWindow).toBe(b);
		await buttons()[0]!.trigger("click"); // minimized: restore and activate
		expect([a.State, manager.ActiveWindow]).toEqual([WindowState.Normal, a]);

		const area = (wrapper.vm as unknown as { Area: () => { Width: number; Height: number; }; }).Area();
		expect(area).toEqual({ Width: 640, Height: 400 });
		wrapper.unmount();
	});

	it("creates its own manager when none is given, and maximizes windows to the desktop", async () => {
		const window = UseControl(new WindowController({ Title: "Solo" }));
		const wrapper = mount({
			components: { WinDesktop, WinWindow },
			setup: () => ({ window }),
			template: `<WinDesktop ref="desk" v-slot="{ manager }"><WinWindow :controller="window" :manager="manager" /></WinDesktop>`,
		}, { attachTo: document.body });
		const desk = wrapper.getComponent(WinDesktop);
		const exposed = desk.vm as unknown as { manager: WindowManager; };
		exposed.manager.Add(window);
		const area = wrapper.get(".win-desktop__area").element as HTMLElement;
		Object.defineProperty(area, "clientWidth", { value: 500 });
		Object.defineProperty(area, "clientHeight", { value: 300 });
		await nextTick();
		await wrapper.get("[aria-label=Maximize]").trigger("click");
		expect([window.Width, window.Height]).toEqual([500, 300]);
		wrapper.unmount();
	});
});
