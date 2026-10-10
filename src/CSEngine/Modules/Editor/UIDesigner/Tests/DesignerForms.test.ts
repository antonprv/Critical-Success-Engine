// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { DesignerController } from "../Source/DesignerController";
import { DialogResult } from "@cse/ui";
import { CreateNode, NewLayout, ParseLayout, SerializeLayout, WidgetType, type LayoutNode, type UiLayout } from "@cse/ui";
import { PropKind } from "@cse/ui";
import WinDesigner from "../Source/WinDesigner.vue";

const Props = (node: LayoutNode, props: Record<string, unknown>): LayoutNode => ({ ...node, Props: { ...node.Props, ...props } as LayoutNode["Props"] });

/** A sign-up form: a window with name and age boxes, OK (validates, closes with OK) and Cancel (closes with Cancel). */
function SignUp(script = ""): UiLayout {
	const layout = NewLayout("Sign up");
	layout.Script = script;
	const window = Props(CreateNode(WidgetType.Window, "Form", 0, 0), { Title: "Sign up", AcceptButton: "OkButton", CancelButton: "CancelButton" });
	window.Children!.push(
		CreateNode(WidgetType.TextBox, "Name", 8, 8),
		CreateNode(WidgetType.TextBox, "Age", 8, 40),
		Props(CreateNode(WidgetType.Button, "OkButton", 8, 80), { Text: "OK", CausesValidation: true, DialogResult: DialogResult.OK }),
		Props(CreateNode(WidgetType.Button, "CancelButton", 96, 80), { Text: "Cancel", DialogResult: DialogResult.Cancel }),
		Props(CreateNode(WidgetType.Button, "Check", 184, 80), { Text: "Check", CausesValidation: true }),
	);
	layout.Root.Children!.push(window, CreateNode(WidgetType.TextBox, "Outside", 400, 0));
	return layout;
}

describe("the new props in the designer", () => {
	it("button DialogResult is a choice; layout files keep a valid choice and drop an unknown one", () => {
		const designer = new DesignerController();
		const ok = designer.Add(WidgetType.Button);
		expect(designer.SetProp(ok.Name, "DialogResult", DialogResult.OK)).toBe(true);
		expect(designer.SetProp(ok.Name, "DialogResult", "Maybe")).toBe(false);
		expect(designer.Widgets.Get(WidgetType.Button)!.Props.find((p) => p.Key === "DialogResult")!.Kind).toBe(PropKind.Choice);
		const text = SerializeLayout(designer.Layout).replace('"DialogResult": "OK"', '"DialogResult": "Maybe"');
		expect(ParseLayout(text).Root.Children![0]!.Props["DialogResult"]).toBe(DialogResult.None);
	});

	it("the details panel edits a choice with a list", async () => {
		const wrapper = mount(WinDesigner, { attachTo: document.body });
		const designer = (wrapper.vm as unknown as { designer: DesignerController; }).designer;
		designer.Add(WidgetType.Button);
		await nextTick();
		const select = wrapper.get('[data-prop="DialogResult"]');
		expect(select.element.tagName).toBe("SELECT");
		expect(select.findAll("option").map((o) => o.text())).toEqual(["None", "OK", "Cancel", "Yes", "No", "Abort", "Retry", "Ignore"]);
		await select.setValue("Yes");
		expect(designer.Find("Button1")!.Props["DialogResult"]).toBe("Yes");
		wrapper.unmount();
	});

	it("previewing a form with dialog buttons: OK closes it and the log says how", async () => {
		const layout = SignUp();
		const wrapper = mount(WinDesigner, { props: { layout }, attachTo: document.body });
		const designer = (wrapper.vm as unknown as { designer: DesignerController; }).designer;
		designer.SetMode("preview" as never);
		await nextTick();
		await wrapper.get('.win-designer__canvas [data-name="CancelButton"] button').trigger("keydown", { code: "Enter" });
		await nextTick();
		expect(wrapper.findAll(".win-designer__log li").map((l) => l.text())).toContain("closed: Cancel");
		wrapper.unmount();
	});
});
