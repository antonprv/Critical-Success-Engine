// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UseControl } from "@cse/ui";
import { DesignerController } from "../Source/DesignerController";
import { ActionType, GraphNodeKind } from "@cse/ui";
import { NewLayout, SerializeLayout, WidgetType } from "@cse/ui";
import { BuiltInWidgets } from "@cse/ui";
import WinDesigner from "../Source/WinDesigner.vue";
import WinNodeEditor from "../Source/WinNodeEditor.vue";

afterEach(() => { document.body.innerHTML = ""; vi.unstubAllGlobals(); });

function Mount(designer = UseControl(new DesignerController())) {
	const wrapper = mount(WinNodeEditor, { props: { designer, widgets: BuiltInWidgets }, attachTo: document.body });
	return { wrapper, designer };
}

async function pointer(target: Element | Window, type: string, init: MouseEventInit = {}): Promise<void> {
	target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));
	await nextTick();
}

const nodes = (wrapper: VueWrapper) => wrapper.findAll(".win-nodes__node");

describe("WinNodeEditor", () => {
	it("+ Event adds an event for the selected widget (else the first one with behaviour); + Action adds the chosen action", async () => {
		const { wrapper, designer } = Mount();
		designer.Add(WidgetType.Image);
		designer.Add(WidgetType.CheckBox, { Parent: "Root" });
		designer.Add(WidgetType.Button, { Parent: "Root" });
		designer.Select("Image1"); // an image has no behaviour: falls back to the first widget that has some
		await wrapper.get('[data-add="event"]').trigger("click");
		expect(designer.Layout.Graph!.Nodes[0]).toMatchObject({ Kind: GraphNodeKind.Event, Type: "change", Params: { Widget: "CheckBox1" } });
		designer.Select("Button1");
		await wrapper.get('[data-add="event"]').trigger("click");
		expect(designer.Layout.Graph!.Nodes[1]).toMatchObject({ Type: "click", Params: { Widget: "Button1" } });
		await wrapper.get('[data-add="action"]').setValue(ActionType.EnabledFollowsCheck);
		expect(designer.Layout.Graph!.Nodes[2]).toMatchObject({ Kind: GraphNodeKind.Action, Type: ActionType.EnabledFollowsCheck, Params: { Widget: "CheckBox1", Check: "CheckBox1", Invert: false } });
		expect((wrapper.get('[data-add="action"]').element as HTMLSelectElement).value).toBe("");
		await wrapper.get('[data-add="action"]').setValue(ActionType.CloseForm);
		await wrapper.get('[data-add="action"]').setValue(ActionType.MessageBox);
		expect(designer.Layout.Graph!.Nodes.slice(3).map((n) => n.Params)).toEqual([{ Result: "OK" }, { Text: "", Title: "" }]);
		expect(nodes(wrapper)).toHaveLength(5);
		expect(nodes(wrapper)[0]!.get(".win-nodes__title").text()).toBe("When CheckBox1 change");
		expect(nodes(wrapper)[2]!.get(".win-nodes__title").text()).toBe("Enabled follows check box");
	});

	it("with no widget that has behaviour, an event starts empty", async () => {
		const { wrapper, designer } = Mount();
		await wrapper.get('[data-add="event"]').trigger("click");
		await wrapper.get('[data-add="action"]').setValue(ActionType.Show);
		expect(designer.Layout.Graph!.Nodes.map((n) => [n.Type, n.Params])).toEqual([["click", { Widget: "" }], [ActionType.Show, { Widget: "" }]]);
	});

	it("node fields edit the params: widget, event, check condition, text, inverted, result", async () => {
		const { wrapper, designer } = Mount();
		designer.Add(WidgetType.CheckBox);
		designer.Add(WidgetType.TextBox, { Parent: "Root" });
		const e = designer.AddGraphNode(GraphNodeKind.Event, "change", 0, 0, { Widget: "CheckBox1" });
		designer.AddGraphNode(GraphNodeKind.Action, ActionType.EnabledFollowsCheck, 300, 0, { Widget: "CheckBox1", Check: "CheckBox1", Invert: false });
		designer.AddGraphNode(GraphNodeKind.Action, ActionType.SetText, 300, 100, { Widget: "TextBox1", Text: "" });
		designer.AddGraphNode(GraphNodeKind.Action, ActionType.CloseForm, 300, 200, { Result: "OK" });
		await nextTick();
		const field = (node: number, key: string) => nodes(wrapper)[node]!.get(`[data-param="${key}"]`);
		expect(field(0, "Widget").findAll("option").map((o) => o.text())).toEqual(["CheckBox1", "TextBox1"]);
		expect(field(0, "Event").findAll("option").map((o) => o.text())).toEqual(["change", "enter", "leave"]);
		await field(0, "When").setValue("checked");
		expect(e.Params["When"]).toBe("checked");
		await field(0, "Widget").setValue("TextBox1");
		expect(nodes(wrapper)[0]!.find('[data-param="When"]').exists()).toBe(false); // a condition only for check boxes
		await field(0, "Event").setValue("enter");
		expect(designer.Layout.Graph!.Nodes[0]).toMatchObject({ Type: "enter", Params: { Widget: "TextBox1" } });
		// Another check box keeps the condition; a widget without the event switches the event to one it has.
		designer.Add(WidgetType.CheckBox, { Parent: "Root" });
		designer.Add(WidgetType.Button, { Parent: "Root" });
		await nextTick();
		await field(0, "Widget").setValue("CheckBox2");
		await field(0, "Event").setValue("change");
		await field(0, "When").setValue("unchecked");
		await field(0, "Widget").setValue("CheckBox1");
		expect(e.Params["When"]).toBe("unchecked");
		await field(0, "Widget").setValue("Button1");
		expect(designer.Layout.Graph!.Nodes[0]).toMatchObject({ Type: "click", Params: { Widget: "Button1" } });
		expect(designer.Layout.Graph!.Nodes[0]!.Params).not.toHaveProperty("When");
		await field(1, "Invert").setValue(true);
		await field(1, "Check").setValue("CheckBox1");
		await field(2, "Text").setValue("Hello");
		await field(3, "Result").setValue("Cancel");
		expect(designer.Layout.Graph!.Nodes.slice(1).map((n) => n.Params)).toEqual([
			{ Widget: "CheckBox1", Check: "CheckBox1", Invert: true }, { Widget: "TextBox1", Text: "Hello" }, { Result: "Cancel" },
		]);
		expect(field(3, "Result").findAll("option").map((o) => o.text())).not.toContain("None");
	});

	it("dragging from an output to an input links the nodes; a drop elsewhere doesn't; the link's button unlinks", async () => {
		const { wrapper, designer } = Mount();
		const e = designer.AddGraphNode(GraphNodeKind.Event, "click", 0, 0, { Widget: "" });
		const a = designer.AddGraphNode(GraphNodeKind.Action, ActionType.Show, 320, 40, { Widget: "" });
		await nextTick();
		const canvas = wrapper.get(".win-nodes__canvas").element as HTMLElement;
		canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 900, bottom: 600, width: 900, height: 600, x: 0, y: 0, toJSON: () => ({}) });
		await pointer(nodes(wrapper)[0]!.get(".win-nodes__port--out").element, "pointerdown", { clientX: 220, clientY: 14 });
		await pointer(window, "pointermove", { clientX: 300, clientY: 50 });
		expect(wrapper.find(".win-nodes__pending").exists()).toBe(true);
		await pointer(canvas, "pointerup", { clientX: 600, clientY: 400 });
		expect(designer.Layout.Graph!.Links).toEqual([]);
		expect(wrapper.find(".win-nodes__pending").exists()).toBe(false);

		await pointer(nodes(wrapper)[0]!.get(".win-nodes__port--out").element, "pointerdown", { clientX: 220, clientY: 14 });
		await pointer(nodes(wrapper)[1]!.get(".win-nodes__port--in").element, "pointerup", { clientX: 320, clientY: 54 });
		expect(designer.Layout.Graph!.Links).toEqual([{ From: e.Id, To: a.Id }]);
		expect(wrapper.get(".win-nodes__links path").attributes("d")).toBe("M 220 14 C 280 14, 260 54, 320 54");
		await pointer(nodes(wrapper)[1]!.get(".win-nodes__port--in").element, "pointerup"); // no drag in progress: nothing
		await wrapper.get(".win-nodes__unlink").trigger("click");
		expect(designer.Layout.Graph!.Links).toEqual([]);
		await pointer(nodes(wrapper)[0]!.get(".win-nodes__port--out").element, "pointerdown", { button: 2 });
		expect(wrapper.find(".win-nodes__pending").exists()).toBe(false);
	});

	it("nodes are dragged by their header (one undo step) and deleted with their button", async () => {
		const { wrapper, designer } = Mount();
		designer.AddGraphNode(GraphNodeKind.Event, "click", 16, 16, { Widget: "" });
		await nextTick();
		const header = nodes(wrapper)[0]!.get(".win-nodes__header").element;
		await pointer(header, "pointerdown", { clientX: 100, clientY: 100 });
		await pointer(window, "pointermove", { clientX: 140, clientY: 124 });
		await pointer(window, "pointerup");
		expect(designer.Layout.Graph!.Nodes[0]).toMatchObject({ X: 56, Y: 40 });
		designer.Undo();
		expect(designer.Layout.Graph!.Nodes[0]).toMatchObject({ X: 16, Y: 16 });
		await pointer(nodes(wrapper)[0]!.get(".win-nodes__header").element, "pointerdown", { button: 2 });
		await pointer(nodes(wrapper)[0]!.get(".win-nodes__delete").element, "pointerdown"); // the delete button doesn't start a drag
		await pointer(window, "pointermove", { clientX: 999, clientY: 999 });
		await pointer(window, "pointerup");
		expect(designer.Layout.Graph!.Nodes[0]).toMatchObject({ X: 16, Y: 16 });
		await nodes(wrapper)[0]!.get(".win-nodes__delete").trigger("click");
		expect(designer.Layout.Graph!.Nodes).toEqual([]);
	});
});

describe("node scripting in the designer", () => {
	it("the Nodes tab shows the editor and the code it generates, live", async () => {
		const wrapper = mount(WinDesigner, { attachTo: document.body });
		const designer = (wrapper.vm as unknown as { designer: DesignerController; }).designer;
		designer.Add(WidgetType.Button);
		expect(wrapper.find(".win-nodes").exists()).toBe(false);
		await wrapper.get('[data-view="nodes"]').trigger("click");
		expect(wrapper.find(".win-nodes").exists()).toBe(true);
		expect(wrapper.get(".win-designer__canvas").isVisible()).toBe(false); // kept (hidden), so anchors can still measure it
		await wrapper.get('[data-add="event"]').trigger("click");
		expect(wrapper.get(".win-designer__code").text()).toContain('this.On("Button1", "click", () => {');
		await wrapper.get('[data-view="canvas"]').trigger("click");
		expect(wrapper.get(".win-designer__canvas").isVisible()).toBe(true);
		expect(wrapper.find(".win-nodes").exists()).toBe(false);
	});

	it("Save downloads the layout and, when it has a graph, the generated code", async () => {
		const created: Blob[] = [];
		const names: string[] = [];
		vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (blob: Blob) => { created.push(blob); return "blob:x"; }, revokeObjectURL: vi.fn() }));
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
		const layout = NewLayout("Main screen");
		const wrapper = mount(WinDesigner, { props: { layout }, attachTo: document.body });
		const designer = (wrapper.vm as unknown as { designer: DesignerController; }).designer;
		const save = async () => {
			await wrapper.findAll(".win-designer .win-menubar__item")[0]!.trigger("click");
			await wrapper.findAll(".win-menu__item").find((i) => i.text().includes("Save"))!.trigger("click");
		};
		await save();
		expect(names).toEqual(["Main screen.ui.json"]);
		designer.AddGraphNode(GraphNodeKind.Event, "click", 0, 0, { Widget: "" });
		await save();
		expect(names.slice(1)).toEqual(["Main screen.ui.json", "MainScreenNodes.ts"]);
		expect(await created[2]!.text()).toContain("export class MainScreenNodes extends UiScript");
		expect(await created[1]!.text()).toBe(SerializeLayout(designer.Layout));
	});
});
