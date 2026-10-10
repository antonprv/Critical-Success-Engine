// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ButtonController } from "@cse/ui";
import { DesignerMode, type DesignerController } from "../Source/DesignerController";
import { CreateNode, NewLayout, SerializeLayout, WidgetType } from "@cse/ui";
import { UiScript, UiScriptRegistry } from "@cse/ui";
import WinDesigner from "../Source/WinDesigner.vue";

afterEach(() => { document.body.innerHTML = ""; vi.unstubAllGlobals(); });

class Greeter extends UiScript {
	public override OnConstruct(): void {
		this.On("Button1", "click", () => { this.Widget<ButtonController>("Button1").Label = "Hello!"; });
	}
}

function Mount(props: Record<string, unknown> = {}) {
	const wrapper = mount(WinDesigner, { props: { scripts: new UiScriptRegistry().Register("Greeter", Greeter), ...props }, attachTo: document.body });
	const designer = (wrapper.vm as unknown as { designer: DesignerController; }).designer;
	return { wrapper, designer };
}

async function pointer(target: { element: Element; } | Element | Window, type: string, init: MouseEventInit = {}): Promise<void> {
	const element = "element" in target ? target.element : target;
	element.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
	await nextTick();
}

function Rect(element: Element, rect: { left: number; top: number; }): void {
	(element as HTMLElement).getBoundingClientRect = () => ({ ...rect, width: 800, height: 500, right: rect.left + 800, bottom: rect.top + 500, x: rect.left, y: rect.top, toJSON: () => ({}) });
}

async function Drop(target: Element, type: string, clientX: number, clientY: number): Promise<void> {
	const event = new MouseEvent("drop", { bubbles: true, cancelable: true, clientX, clientY });
	Object.defineProperty(event, "dataTransfer", { value: { getData: (format: string) => (format === "application/x-win-widget" ? type : "") } });
	target.dispatchEvent(event);
	await nextTick();
}

const field = (wrapper: VueWrapper, name: string) => wrapper.get(`[data-field="${name}"]`);
const prop = (wrapper: VueWrapper, name: string) => wrapper.get(`[data-prop="${name}"]`);
const status = (wrapper: VueWrapper) => wrapper.findAll(".win-designer__statusbar .win-statusbar__panel").map((p) => p.text());

describe("WinDesigner: building", () => {
	it("starts with the given layout (or an empty one), the palette, and an empty hierarchy", () => {
		const { wrapper } = Mount();
		expect(wrapper.findAll(".win-designer__palette-item").map((i) => i.text())).toEqual([
			"Window", "Group box", "Label", "Image", "Button", "Check box", "Radio buttons", "Text box", "Spinner", "Combo box", "Progress bar", "Slider", "Stick (touch)", "Game button (touch)", "List box", "Status bar",
		]);
		expect(wrapper.findAll(".win-designer__tree-item").map((i) => i.text())).toEqual(["Root"]);
		expect(status(wrapper)).toEqual(["Ready", "Design", ""]);

		const layout = NewLayout("Login");
		layout.Root.Children!.push(CreateNode(WidgetType.Button, "Go", 0, 0));
		const { wrapper: other } = Mount({ layout });
		expect(other.findAll(".win-designer__tree-item").map((i) => i.text())).toEqual(["Root", "Go"]);
	});

	it("clicking a palette item adds that widget; it appears on the canvas and in the hierarchy, selected", async () => {
		const { wrapper, designer } = Mount();
		await wrapper.findAll(".win-designer__palette-item")[4]!.trigger("click");
		expect(designer.SelectedName).toBe("Button1");
		expect(wrapper.find('.win-designer__canvas [data-name="Button1"]').classes()).toContain("win-layout__node--selected");
		expect(wrapper.get(".win-designer__tree-item--selected").text()).toBe("Button1");
		expect(status(wrapper)[2]).toBe("Modified");
	});

	it("dragging a palette item onto the canvas drops it where it was released, inside the container under the pointer", async () => {
		const { wrapper, designer } = Mount();
		designer.Add(WidgetType.Window, { X: 100, Y: 100 });
		await nextTick();
		const item = wrapper.findAll(".win-designer__palette-item")[4]!;
		const setData = vi.fn();
		const start = new MouseEvent("dragstart", { bubbles: true });
		Object.defineProperty(start, "dataTransfer", { value: { setData, effectAllowed: "" } });
		item.element.dispatchEvent(start);
		expect(setData).toHaveBeenCalledWith("application/x-win-widget", "button");

		const over = new MouseEvent("dragover", { bubbles: true, cancelable: true });
		wrapper.get(".win-designer__canvas").element.dispatchEvent(over);
		expect(over.defaultPrevented).toBe(true);

		// The browser delivers the drop to the widget wrapper under the pointer (the window), not to its inner area.
		const window1 = wrapper.get('[data-name="Window1"]').element;
		Rect(wrapper.get('[data-container="Window1"]').element, { left: 300, top: 200 });
		await Drop(window1, "button", 340, 260);
		expect(designer.ParentOf("Button1")?.Name).toBe("Window1");
		expect([designer.Find("Button1")!.X, designer.Find("Button1")!.Y]).toEqual([40, 64]);

		// Dropped on a widget that is not a container: next to it, in its container.
		Rect(wrapper.get('[data-container="Root"]').element, { left: 0, top: 0 });
		await Drop(wrapper.get('[data-name="Button1"]').element, "label", 120, 136);
		expect(designer.ParentOf("Label1")?.Name).toBe("Window1");

		await Drop(window1, "", 340, 260); // not a widget drag
		await Drop(wrapper.get(".win-designer__canvas").element, "label", 1, 1); // on the canvas area, outside any container
		expect(designer.Hierarchy).toHaveLength(4);
	});

	it("on the canvas: a press selects, dragging moves (one undo step), the handles resize", async () => {
		const { wrapper, designer } = Mount();
		designer.Add(WidgetType.Button, { X: 16, Y: 16 });
		designer.Select(null);
		await nextTick();
		const node = () => wrapper.get('.win-designer__canvas [data-name="Button1"]');

		await pointer(node(), "pointerdown", { button: 0, clientX: 20, clientY: 20 });
		expect(designer.SelectedName).toBe("Button1");
		await pointer(window, "pointermove", { clientX: 60, clientY: 44 });
		await pointer(window, "pointerup");
		expect([designer.Find("Button1")!.X, designer.Find("Button1")!.Y]).toEqual([56, 40]);
		designer.Undo();
		expect(designer.Find("Button1")!.X).toBe(16);
		designer.Redo();
		await nextTick();

		// 75x23 to start; the right handle ignores dy, the bottom one dx; a size snaps to the 8 px grid only when it changes.
		for (const [handle, dx, dy, size] of [["right", 24, 50, [96, 23]], ["bottom", 50, 16, [96, 40]], ["corner", 8, 8, [104, 48]]] as const) {
			await pointer(node().get(`[data-handle="${handle}"]`), "pointerdown", { button: 0, clientX: 0, clientY: 0 });
			await pointer(window, "pointermove", { clientX: dx, clientY: dy });
			await pointer(window, "pointerup");
			expect([designer.Find("Button1")!.Width, designer.Find("Button1")!.Height], handle).toEqual(size);
		}

		await pointer(node(), "pointerdown", { button: 2, clientX: 0, clientY: 0 });
		await pointer(wrapper.get('.win-designer__canvas [data-name="Root"]'), "pointerdown", { button: 0 });
		expect(designer.SelectedName).toBe("Root");
		await pointer(window, "pointermove", { clientX: 300, clientY: 300 });
		await pointer(window, "pointerup");
		expect(designer.Layout.Root.X).toBe(0);
		await pointer(wrapper.get(".win-designer__canvas"), "pointerdown", { button: 0 }); // the canvas area around the layout
	});

	it("the hierarchy selects, reorders, duplicates and deletes", async () => {
		const { wrapper, designer } = Mount();
		designer.Add(WidgetType.Label, { Parent: "Root" });
		designer.Add(WidgetType.Button, { Parent: "Root" });
		await nextTick();
		await wrapper.findAll(".win-designer__tree-item")[1]!.trigger("click");
		expect(designer.SelectedName).toBe("Label1");
		await wrapper.get("[aria-label='Move down']").trigger("click");
		expect(designer.Layout.Root.Children!.map((c) => c.Name)).toEqual(["Button1", "Label1"]);
		await wrapper.get("[aria-label='Move up']").trigger("click");
		await wrapper.get("[aria-label='Duplicate']").trigger("click");
		expect(designer.SelectedName).toBe("Label2");
		await wrapper.get("[aria-label='Delete']").trigger("click");
		expect(designer.Hierarchy.map((h) => h.Node.Name)).toEqual(["Root", "Label1", "Button1"]);
		expect((wrapper.findAll(".win-designer__tree-item")[1]!.element as HTMLElement).style.paddingLeft).toBe("18px");
		designer.Select(null);
		await nextTick();
		for (const label of ["Move up", "Move down", "Duplicate", "Delete"]) await wrapper.get(`[aria-label='${label}']`).trigger("click");
		expect(designer.Hierarchy).toHaveLength(3);
	});
});

describe("WinDesigner: details panel", () => {
	it("edits the name (refusing invalid ones), position and size", async () => {
		const { wrapper, designer } = Mount();
		designer.Add(WidgetType.Button);
		await nextTick();
		await field(wrapper, "Name").setValue("PlayButton");
		expect(designer.SelectedName).toBe("PlayButton");
		await field(wrapper, "Name").setValue("not valid");
		expect(status(wrapper)[0]).toBe('"not valid" is not a valid unique name');
		await field(wrapper, "Name").trigger("blur"); // leaving the field brings the last valid name back
		expect((field(wrapper, "Name").element as HTMLInputElement).value).toBe("PlayButton");
		await field(wrapper, "Name").trigger("blur");

		const name = field(wrapper, "Name").element as HTMLInputElement;
		name.focus();
		await field(wrapper, "Name").trigger("keydown", { key: "Enter", code: "Enter" });
		expect(document.activeElement).not.toBe(name); // Enter commits the field

		await field(wrapper, "X").setValue("40");
		await field(wrapper, "Y").setValue("48");
		await field(wrapper, "Width").setValue("120");
		await field(wrapper, "Height").setValue("32");
		expect(designer.Find("PlayButton")).toMatchObject({ X: 40, Y: 48, Width: 120, Height: 32 });
	});

	it("edits props by kind: text, number, check box, lines", async () => {
		const { wrapper, designer } = Mount();
		designer.Add(WidgetType.ListBox);
		await nextTick();
		await prop(wrapper, "Header").setValue("Files");
		await prop(wrapper, "Items").setValue("a.txt\nb.txt\n");
		await prop(wrapper, "Enabled").setValue(false);
		expect(designer.Find("ListBox1")!.Props).toEqual({ Header: "Files", Items: ["a.txt", "b.txt"], Enabled: false });
		designer.Add(WidgetType.Spinner, { Parent: "Root" });
		await nextTick();
		await prop(wrapper, "Max").setValue("10");
		expect(designer.Find("Spinner1")!.Props["Max"]).toBe(10);
		await prop(wrapper, "Max").setValue("");
		expect(designer.Find("Spinner1")!.Props["Max"]).toBe(10); // not a number: unchanged
	});

	it("moves a widget into another container with the Parent field, refusing impossible moves", async () => {
		const { wrapper, designer } = Mount();
		designer.Add(WidgetType.Window, { Parent: "Root" });
		designer.Add(WidgetType.Button, { Parent: "Root" });
		await nextTick();
		expect(field(wrapper, "Parent").findAll("option").map((o) => o.text())).toEqual(["Root", "Window1"]);
		await field(wrapper, "Parent").setValue("Window1");
		expect(designer.ParentOf("Button1")?.Name).toBe("Window1");
		designer.Select("Window1");
		await nextTick();
		await field(wrapper, "Parent").setValue("Window1");
		expect(designer.ParentOf("Window1")?.Name).toBe("Root");
		expect((field(wrapper, "Parent").element as HTMLSelectElement).value).toBe("Root");
		designer.Select("Root");
		await nextTick();
		expect(wrapper.find('[data-field="Parent"]').exists()).toBe(false);
		expect(wrapper.find('[data-field="X"]').exists()).toBe(false);
	});

	it("the layout's own name and script are always editable", async () => {
		const { wrapper, designer } = Mount();
		expect(field(wrapper, "Script").findAll("option").map((o) => o.text())).toEqual(["(none)", "Greeter"]);
		await field(wrapper, "LayoutName").setValue("Main menu");
		await field(wrapper, "Script").setValue("Greeter");
		expect(designer.Layout).toMatchObject({ Name: "Main menu", Script: "Greeter" });
		expect(wrapper.find(".win-designer__hint").exists()).toBe(true);
	});
});

describe("WinDesigner: live editing", () => {
	const typeInto = async (element: Element, value: string) => {
		(element as HTMLInputElement).value = value;
		element.dispatchEvent(new Event("input", { bubbles: true }));
		await nextTick();
	};

	it("fields apply while typing (no Enter needed), and everything typed into one field is a single undo step", async () => {
		const { wrapper, designer } = Mount();
		designer.Add(WidgetType.Button);
		await nextTick();
		const text = wrapper.get('[data-prop="Text"]').element;
		text.dispatchEvent(new FocusEvent("focus"));
		await typeInto(text, "P");
		await typeInto(text, "Pl");
		await typeInto(text, "Play");
		expect(designer.Find("Button1")!.Props["Text"]).toBe("Play");
		expect(wrapper.get('.win-designer__canvas [data-name="Button1"] button').text()).toBe("Play");
		text.dispatchEvent(new FocusEvent("blur"));
		designer.Undo();
		expect(designer.Find("Button1")!.Props["Text"]).toBe("Button");

		const x = wrapper.get('[data-field="X"]').element;
		x.dispatchEvent(new FocusEvent("focus"));
		await typeInto(x, "4");
		await typeInto(x, "40");
		await typeInto(x, "");
		x.dispatchEvent(new FocusEvent("blur"));
		expect(designer.Find("Button1")!.X).toBe(40); // an empty or partial number doesn't move it
		await typeInto(wrapper.get('[data-prop="Enabled"]').element, "");
	});

	it("focusing and leaving any field without changing it adds no undo step", async () => {
		const { wrapper, designer } = Mount();
		designer.Add(WidgetType.ListBox);
		designer.SetSkinStyle("button" as never, "normal" as never, "Sprite", { Image: "a.png", Slice: [8, 8, 8, 8] });
		const undoDepth = () => { let n = 0; while (designer.CanUndo) { designer.Undo(); n++; } return n; };
		await nextTick();
		const visit = (selector: string) => {
			for (const element of wrapper.findAll(selector)) {
				element.element.dispatchEvent(new FocusEvent("focus"));
				element.element.dispatchEvent(new FocusEvent("blur"));
			}
		};
		visit('[data-field="LayoutName"]');
		visit('[data-prop="Items"]');
		await wrapper.get('[data-tab="skin"]').trigger("click");
		for (const name of ["Slice0", "Slice1", "Slice2", "Slice3", "Border", "Background", "TextColor", "Font", "Shadow", "FontSize", "Radius", "MinHeight", "Padding"]) visit(`[data-skin="${name}"]`);
		expect(undoDepth()).toBe(2); // the Add and the sprite: visits changed nothing
	});

	it("a name applies as soon as it is valid; while it isn't, the field is marked and the name kept", async () => {
		const { wrapper, designer } = Mount();
		designer.Add(WidgetType.Button);
		await nextTick();
		const name = wrapper.get('[data-field="Name"]');
		await typeInto(name.element, "Play Button");
		expect(designer.SelectedName).toBe("Button1");
		expect(name.classes()).toContain("win-designer__field--invalid");
		await typeInto(name.element, "PlayButton");
		expect(designer.SelectedName).toBe("PlayButton");
		expect(wrapper.get('[data-field="Name"]').classes()).not.toContain("win-designer__field--invalid");
	});

	it("the bar's lists are labelled, and dark mode is a switch", async () => {
		const { wrapper } = Mount();
		expect(wrapper.findAll(".win-designer__bar-label").map((l) => l.text())).toEqual(["Kit", "Theme"]);
		await wrapper.get(".win-designer__kit [role=combobox]").trigger("click");
		await wrapper.findAll(".win-designer__kit [role=option]")[1]!.trigger("click");
		expect(wrapper.findAll(".win-designer__bar-label").map((l) => l.text())).toEqual(["Kit", "Accent", "Neutral"]);
		expect(wrapper.find(".win-designer__tailwind [role=switch]").exists()).toBe(true);
	});
});

describe("WinDesigner: menus, files, keys", () => {
	it("menu and toolbar commands: new, undo, redo, duplicate, delete, design and preview", async () => {
		const { wrapper, designer } = Mount();
		const menu = async (top: number, item: string) => {
			await wrapper.findAll(".win-designer .win-menubar__item")[top]!.trigger("click");
			await wrapper.findAll(".win-menu__item").find((i) => i.text().includes(item))!.trigger("click");
		};
		designer.Add(WidgetType.Button);
		await menu(1, "Duplicate");
		expect(designer.Find("Button2")).toBeDefined();
		await menu(1, "Delete");
		await menu(1, "Undo");
		expect(designer.Find("Button2")).toBeDefined();
		await menu(1, "Redo");
		expect(designer.Find("Button2")).toBeUndefined();
		await menu(2, "Preview");
		expect(designer.Mode).toBe(DesignerMode.Preview);
		await menu(2, "Design");
		await wrapper.findAll(".win-designer__toolbar .win-toolbar__button").find((b) => b.text() === "Undo")!.trigger("click");
		await wrapper.findAll(".win-designer__toolbar .win-toolbar__button").find((b) => b.text() === "Redo")!.trigger("click");
		await wrapper.findAll(".win-designer__toolbar .win-toolbar__button").find((b) => b.text() === "Preview")!.trigger("click");
		expect(designer.Mode).toBe(DesignerMode.Preview);
		await wrapper.findAll(".win-designer__toolbar .win-toolbar__button").find((b) => b.text() === "Design")!.trigger("click");
		expect(designer.Mode).toBe(DesignerMode.Design);
		await menu(0, "New");
		expect(designer.Hierarchy).toHaveLength(1);
	});

	it("Save downloads the layout as a .ui.json file; Open loads one or reports why it can't", async () => {
		const created: Blob[] = [];
		vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (blob: Blob) => { created.push(blob); return "blob:x"; }, revokeObjectURL: vi.fn() }));
		const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
		const { wrapper, designer } = Mount();
		designer.SetLayoutName("Main menu");
		designer.Add(WidgetType.Button);
		await wrapper.findAll(".win-designer .win-menubar__item")[0]!.trigger("click");
		await wrapper.findAll(".win-menu__item").find((i) => i.text().includes("Save"))!.trigger("click");
		expect(click).toHaveBeenCalled();
		expect(await created[0]!.text()).toBe(SerializeLayout(designer.Layout));
		expect(status(wrapper)).toEqual(["Saved Main menu.ui.json", "Design", ""]);

		const open = wrapper.get(".win-designer__open");
		const openClick = vi.spyOn(open.element as HTMLInputElement, "click");
		await wrapper.findAll(".win-designer .win-menubar__item")[0]!.trigger("click");
		await wrapper.findAll(".win-menu__item").find((i) => i.text().includes("Open"))!.trigger("click");
		expect(openClick).toHaveBeenCalled();

		const layout = NewLayout("Other");
		layout.Root.Children!.push(CreateNode(WidgetType.Label, "Hello", 0, 0));
		const choose = async (file: File | null) => {
			Object.defineProperty(open.element, "files", { configurable: true, value: file ? [file] : [] });
			await open.trigger("change");
			await new Promise((resolve) => setTimeout(resolve, 0));
			await nextTick();
		};
		await choose(new File([SerializeLayout(layout)], "other.ui.json"));
		expect(designer.Layout.Name).toBe("Other");
		expect(status(wrapper)[0]).toBe("Opened other.ui.json");
		await choose(new File(["garbage"], "bad.json"));
		expect(status(wrapper)[0]).toBe("Not a UI layout: not JSON");
		await choose(null);
		expect(designer.Layout.Name).toBe("Other");
		designer.SetLayoutName("");
		await wrapper.findAll(".win-designer .win-menubar__item")[0]!.trigger("click");
		await wrapper.findAll(".win-menu__item").find((i) => i.text().includes("Save"))!.trigger("click");
		expect(status(wrapper)[0]).toBe("Saved layout.ui.json");
	});

	it("keys reach the designer, except while typing in a field", async () => {
		const { wrapper, designer } = Mount();
		designer.Add(WidgetType.Button);
		await nextTick();
		await field(wrapper, "Name").trigger("keydown", { code: "Delete" });
		expect(designer.Find("Button1")).toBeDefined();
		await wrapper.get(".win-designer").trigger("keydown", { code: "KeyD", ctrlKey: true });
		expect(designer.Find("Button2")).toBeDefined();
		await wrapper.get(".win-designer").trigger("keydown", { code: "KeyZ", metaKey: true }); // Cmd on a Mac
		expect(designer.Find("Button2")).toBeUndefined();
		designer.Select("Button1");
		await wrapper.get(".win-designer").trigger("keydown", { code: "Delete" });
		expect(designer.Hierarchy.map((h) => h.Node.Name)).toEqual(["Root"]);
	});

	it("switches to the Tailwind kit, with its accent, neutral and dark mode, and back", async () => {
		const { wrapper } = Mount();
		expect(wrapper.find(".win-designer__tailwind").exists()).toBe(false);
		const kit = wrapper.get(".win-designer__kit [role=combobox]");
		await kit.trigger("click");
		await wrapper.findAll(".win-designer__kit [role=option]")[1]!.trigger("click");
		expect(wrapper.get(".win-root").classes()).toEqual(expect.arrayContaining(["win-kit--tailwind", "tw-accent--indigo"]));
		expect(wrapper.find(".win-designer__theme").exists()).toBe(false);
		const pick = async (index: number, option: string) => {
			await wrapper.findAll(".win-designer__tailwind [role=combobox]")[index]!.trigger("click");
			await wrapper.findAll(".win-designer__tailwind [role=option]").find((o) => o.text() === option)!.trigger("click");
		};
		await pick(0, "emerald");
		await pick(1, "slate");
		await wrapper.get(".win-designer__tailwind .win-switch").trigger("click");
		expect(wrapper.get(".win-root").classes()).toEqual(expect.arrayContaining(["tw-accent--emerald", "tw-neutral--slate", "tw-dark"]));
		await kit.trigger("click");
		await wrapper.findAll(".win-designer__kit [role=option]")[0]!.trigger("click");
		expect(wrapper.get(".win-root").classes()).toContain("win-kit--classic");
	});

	it("switches the theme of everything it draws", async () => {
		const { wrapper } = Mount();
		await wrapper.get(".win-designer__theme [role=combobox]").trigger("click");
		await wrapper.findAll(".win-designer__theme [role=option]")[0]!.trigger("click");
		expect(wrapper.get(".win-root").classes()).toContain("win-theme--win98");
	});
});

describe("WinDesigner: preview", () => {
	it("runs the layout with its script; widget events go to the log; back in design the canvas is editable again", async () => {
		const layout = NewLayout("Hello");
		layout.Script = "Greeter";
		layout.Root.Children!.push(CreateNode(WidgetType.Button, "Button1", 16, 16));
		const { wrapper, designer } = Mount({ layout });
		designer.SetMode(DesignerMode.Preview);
		await nextTick();
		expect(wrapper.find(".win-layout--design").exists()).toBe(false);
		await wrapper.get('.win-designer__canvas [data-name="Button1"] button').trigger("keydown", { code: "Enter" });
		expect(wrapper.get('.win-designer__canvas [data-name="Button1"] button').text()).toBe("Hello!");
		expect(wrapper.findAll(".win-designer__log li").map((l) => l.text())).toEqual(["Button1.click"]);
		expect(status(wrapper)[1]).toBe("Preview");
		await pointer(wrapper.get('.win-designer__canvas [data-name="Button1"]'), "pointerdown", { button: 0 });
		expect(designer.SelectedName).toBeNull(); // the canvas doesn't edit while previewing

		designer.SetMode(DesignerMode.Design);
		await nextTick();
		expect(wrapper.find(".win-layout--design").exists()).toBe(true);
		expect(wrapper.get('.win-designer__canvas [data-name="Button1"] button').text()).toBe("Button");
		expect(wrapper.find(".win-designer__log").exists()).toBe(false);
	});

	it("a layout whose script isn't registered previews without it, and says so", async () => {
		const layout = NewLayout("x");
		layout.Script = "Nobody";
		const { wrapper, designer } = Mount({ layout, scripts: undefined });
		designer.SetMode(DesignerMode.Preview);
		await nextTick();
		expect(wrapper.findAll(".win-designer__log li").map((l) => l.text())).toEqual(['Script "Nobody" is not registered: previewing without it']);
		wrapper.unmount();
	});
});

describe("WinDesigner: skin panel", () => {
	const skinField = (wrapper: VueWrapper, name: string) => wrapper.get(`[data-skin="${name}"]`);

	async function OpenSkinTab() {
		const mounted = Mount();
		await mounted.wrapper.get('[data-tab="skin"]').trigger("click");
		return mounted;
	}

	async function ChooseFile(input: VueWrapper | ReturnType<VueWrapper["get"]>, file: File | null): Promise<void> {
		Object.defineProperty(input.element, "files", { configurable: true, value: file ? [file] : [] });
		await input.trigger("change");
		for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
		await nextTick();
	}

	it("the Properties / Skin tabs switch the details panel", async () => {
		const { wrapper } = Mount();
		expect(wrapper.find('[data-skin="Part"]').exists()).toBe(false);
		await wrapper.get('[data-tab="skin"]').trigger("click");
		expect(wrapper.find('[data-skin="Part"]').exists()).toBe(true);
		expect(wrapper.find('[data-field="LayoutName"]').exists()).toBe(false);
		await wrapper.get('[data-tab="properties"]').trigger("click");
		expect(wrapper.find('[data-field="LayoutName"]').exists()).toBe(true);
	});

	it("a preset skins the canvas (only the canvas); choosing none removes it", async () => {
		const { wrapper, designer } = await OpenSkinTab();
		expect(skinField(wrapper, "Preset").findAll("option").map((o) => o.text())).toEqual(["(theme only)", "Celestial (bright adventure)", "Grimoire (dark fantasy RPG)"]);
		await skinField(wrapper, "Preset").setValue("grimoire");
		expect(designer.Layout.Skin?.Id).toBe("grimoire");
		expect(wrapper.get(".win-designer__canvas .win-layout").classes()).toContain("win-skin--grimoire");
		expect(wrapper.get(".win-designer").classes()).not.toContain("win-skin");
		await skinField(wrapper, "Preset").setValue("");
		expect(designer.Layout.Skin).toBeUndefined();
	});

	it("picks a part and a state; switching to a part without that state falls back to Normal", async () => {
		const { wrapper } = await OpenSkinTab();
		await skinField(wrapper, "Part").setValue("button");
		expect(skinField(wrapper, "State").findAll("option").map((o) => o.text())).toEqual(["normal", "hover", "pressed", "focused", "disabled", "default"]);
		await skinField(wrapper, "State").setValue("hover");
		await skinField(wrapper, "Part").setValue("panel");
		expect((skinField(wrapper, "State").element as HTMLSelectElement).value).toBe("normal");
	});

	it("edits colours, font and spacing of the chosen part and state; empty fields remove the setting", async () => {
		const { wrapper, designer } = await OpenSkinTab();
		await skinField(wrapper, "Part").setValue("button");
		await skinField(wrapper, "State").setValue("hover");
		await skinField(wrapper, "Background").setValue("#800");
		await skinField(wrapper, "TextColor").setValue("#fff");
		await skinField(wrapper, "Font").setValue("Georgia");
		await skinField(wrapper, "Shadow").setValue("0 0 4px gold");
		await skinField(wrapper, "FontSize").setValue("14");
		await skinField(wrapper, "Radius").setValue("6");
		await skinField(wrapper, "MinHeight").setValue("30");
		await skinField(wrapper, "Padding").setValue("4");
		expect(designer.Layout.Skin!.Parts.button!.hover).toEqual({ Background: "#800", TextColor: "#fff", Font: "Georgia", Shadow: "0 0 4px gold", FontSize: 14, Radius: 6, MinHeight: 30, Padding: [4, 4, 4, 4] });
		await skinField(wrapper, "Background").setValue("  ");
		await skinField(wrapper, "FontSize").setValue("");
		await skinField(wrapper, "Padding").setValue("x");
		expect(designer.Layout.Skin!.Parts.button!.hover).toEqual({ TextColor: "#fff", Font: "Georgia", Shadow: "0 0 4px gold", Radius: 6, MinHeight: 30 });
		await skinField(wrapper, "Clear").trigger("click");
		expect(designer.Layout.Skin!.Parts).toEqual({});
	});

	it("an uploaded image becomes the state's 9-slice sprite; slice, border, repeat and fill are editable; it can be removed", async () => {
		const { wrapper, designer } = await OpenSkinTab();
		expect(wrapper.find('[data-skin="Slice0"]').exists()).toBe(false);
		await ChooseFile(skinField(wrapper, "SpriteFile"), new File([new Uint8Array([137, 80, 78, 71])], "button.png", { type: "image/png" }));
		const sprite = () => designer.Layout.Skin!.Parts.button?.normal?.Sprite ?? designer.Layout.Skin!.Parts.window?.normal?.Sprite;
		expect(sprite()!.Image).toMatch(/^data:image\/png;base64,/);
		expect(sprite()!.Slice).toEqual([8, 8, 8, 8]);
		expect(wrapper.get(".win-designer__sprite-preview").attributes("src")).toMatch(/^data:image\/png/);

		await skinField(wrapper, "Slice1").setValue("12");
		await skinField(wrapper, "Slice2").setValue("nope");
		await skinField(wrapper, "Border").setValue("4");
		await skinField(wrapper, "Repeat").setValue("round");
		await skinField(wrapper, "Fill").setValue(false);
		expect(sprite()).toMatchObject({ Slice: [8, 12, 8, 8], Border: [4, 4, 4, 4], Repeat: "round", Fill: false });
		await skinField(wrapper, "Border").setValue("");
		await skinField(wrapper, "Fill").setValue(true);
		expect(sprite()!.Border).toBeUndefined();
		expect(sprite()!.Fill).toBe(true);

		// A new image keeps the slicing already set up for this state.
		await ChooseFile(skinField(wrapper, "SpriteFile"), new File([new Uint8Array([1])], "other.png", { type: "image/png" }));
		expect(sprite()!.Slice).toEqual([8, 12, 8, 8]);
		await ChooseFile(skinField(wrapper, "SpriteFile"), null);
		await skinField(wrapper, "RemoveSprite").trigger("click");
		expect(designer.Layout.Skin?.Parts ?? {}).toEqual({});
	});

	it("a skin can be saved to its own file and loaded into another layout", async () => {
		const created: Blob[] = [];
		vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (blob: Blob) => { created.push(blob); return "blob:x"; }, revokeObjectURL: vi.fn() }));
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
		const { wrapper, designer } = await OpenSkinTab();
		await skinField(wrapper, "Preset").setValue("celestial");
		await skinField(wrapper, "SaveSkin").trigger("click");
		expect(JSON.parse(await created[0]!.text()).Id).toBe("celestial");
		expect(status(wrapper)[0]).toBe("Saved Celestial (bright adventure).skin.json");
		designer.SetSkin(null);
		await skinField(wrapper, "SaveSkin").trigger("click");
		expect(created).toHaveLength(1); // nothing to save without a skin

		await ChooseFile(skinField(wrapper, "OpenSkin"), new File([await created[0]!.text()], "celestial.skin.json"));
		expect(designer.Layout.Skin?.Id).toBe("celestial");
		expect(skinField(wrapper, "Preset").findAll("option")).toHaveLength(3);
		designer.SetSkinStyle("button" as never, "normal" as never, "TextColor", "#000");
		designer.Layout.Skin!.Id = "mine";
		designer.Layout.Skin!.Name = "Mine";
		await nextTick();
		expect(skinField(wrapper, "Preset").findAll("option").map((o) => o.text())).toContain("Mine");
		await skinField(wrapper, "Preset").setValue("mine"); // picking the current custom skin keeps it as it is
		expect(designer.Layout.Skin?.Id).toBe("mine");
		await ChooseFile(skinField(wrapper, "OpenSkin"), new File(["nope"], "bad.skin.json"));
		expect(status(wrapper)[0]).toBe("Not a skin file: not JSON");
		await ChooseFile(skinField(wrapper, "OpenSkin"), null);
	});
});

describe("WinDesigner: anchors and screen sizes", () => {
	it("anchors are chosen per axis; the geometry fields follow the mode", async () => {
		const { wrapper, designer } = Mount();
		designer.Add(WidgetType.Button, { X: 16, Y: 16 });
		await nextTick();
		// jsdom has no layout: give the canvas's root container its size (again after each edit: the canvas is rebuilt).
		const sizeRoot = () => {
			const container = wrapper.get('.win-designer__canvas [data-container="Root"]').element;
			Object.defineProperty(container, "clientWidth", { configurable: true, value: 800 });
			Object.defineProperty(container, "clientHeight", { configurable: true, value: 500 });
		};
		const labels = () => wrapper.findAll(".win-designer__geometry > span").map((l) => l.text());
		expect(labels()).toEqual(["Left", "Top", "Width", "Height"]);
		sizeRoot();
		await field(wrapper, "AnchorX").setValue("end");
		sizeRoot();
		await field(wrapper, "AnchorY").setValue("stretch");
		expect(designer.Find("Button1")).toMatchObject({ AnchorX: "end", AnchorY: "stretch", X: 709, Bottom: 461 });
		expect(labels()).toEqual(["Right margin", "Top margin", "Width", "Bottom margin"]);
		await field(wrapper, "Bottom").setValue("24");
		expect(designer.Find("Button1")!.Bottom).toBe(24);
		sizeRoot();
		await field(wrapper, "AnchorX").setValue("stretch");
		await field(wrapper, "Right").setValue("32");
		expect(designer.Find("Button1")!.Right).toBe(32);
		sizeRoot();
		await field(wrapper, "AnchorX").setValue("center");
		sizeRoot();
		await field(wrapper, "AnchorY").setValue("center");
		expect(labels()).toEqual(["Offset X", "Offset Y", "Width", "Height"]);
	});

	it("the canvas shows the layout at a chosen screen size; the root's size is the layout's own design size", async () => {
		const { wrapper, designer } = Mount();
		const view = () => wrapper.get(".win-designer__canvas .win-layout").element as HTMLElement;
		expect([view().style.width, view().style.height]).toEqual(["800px", "500px"]);
		const screen = field(wrapper, "Screen");
		expect(screen.findAll("option").map((o) => o.text())[0]).toBe("Layout size (800 × 500)");
		await screen.setValue("1920x1080");
		expect([view().style.width, view().style.height]).toEqual(["1920px", "1080px"]);
		designer.Select("Root");
		await nextTick();
		await field(wrapper, "Width").setValue("1024");
		await field(wrapper, "Height").setValue("600");
		await screen.setValue("layout");
		expect([view().style.width, view().style.height]).toEqual(["1024px", "600px"]);
		designer.SetMode("preview" as never);
		await nextTick();
		expect(view().style.width).toBe("1024px");
	});
});

describe("WinDesigner: resizable panels", () => {
	it("the side panels have splitters; dragging or keys resize them, within limits", async () => {
		const { wrapper } = Mount();
		const columns = () => (wrapper.get(".win-designer__main").element as HTMLElement).style.gridTemplateColumns;
		expect(columns()).toBe("180px 4px 1fr 4px 260px");
		const [left, right] = wrapper.findAll(".win-designer__main > [role=separator]");
		left!.element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 180 }));
		window.dispatchEvent(new MouseEvent("pointermove", { clientX: 240 }));
		window.dispatchEvent(new MouseEvent("pointerup"));
		await nextTick();
		expect(columns()).toBe("240px 4px 1fr 4px 260px");
		await right!.trigger("keydown", { code: "ArrowLeft" }); // the right panel grows towards the left
		expect(columns()).toBe("240px 4px 1fr 4px 270px");
		await right!.trigger("keydown", { code: "End" });
		expect(columns()).toBe("240px 4px 1fr 4px 560px");
	});
});
