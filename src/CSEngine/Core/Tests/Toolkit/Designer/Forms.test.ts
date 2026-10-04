// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { ButtonController } from "../../../Source/Toolkit/Controls/ButtonController";
import { MessageBoxButtons, MessageBoxIcon, MessageBoxResult } from "../../../Source/Toolkit/Controls/MessageBoxController";
import type { TextBoxController } from "../../../Source/Toolkit/Controls/TextBoxController";
import type { WindowController } from "../../../Source/Toolkit/Controls/WindowController";
import { DesignerController } from "../../../Source/Toolkit/Designer/DesignerController";
import { DialogResult, DialogService } from "../../../Source/Toolkit/Designer/Dialogs";
import { CreateNode, NewLayout, ParseLayout, SerializeLayout, WidgetType, type LayoutNode, type UiLayout } from "../../../Source/Toolkit/Designer/Layout";
import { UiDocument, ValidationContext } from "../../../Source/Toolkit/Designer/UiDocument";
import { UiScript, UiScriptRegistry } from "../../../Source/Toolkit/Designer/UiScript";
import { PropKind } from "../../../Source/Toolkit/Designer/Widgets";
import WinDesigner from "../../../Source/Toolkit/Designer/WinDesigner.vue";
import WinDialogHost from "../../../Source/Toolkit/Designer/WinDialogHost.vue";
import WinLayoutView from "../../../Source/Toolkit/Designer/WinLayoutView.vue";

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

class SignUpScript extends UiScript {
	public readonly Log: string[] = [];
	public CancelClosing = false;
	public override OnLoad(): void { this.Log.push("load"); }
	public override OnShown(): void { this.Log.push("shown"); }
	public override OnClosing(event: { Result: DialogResult; Cancel(): void; }): void {
		this.Log.push(`closing ${event.Result}`);
		if (this.CancelClosing) event.Cancel();
	}
	public override OnClosed(result: DialogResult): void { this.Log.push(`closed ${result}`); }
	public override OnDisposed(): void { this.Log.push("disposed"); }
	public override OnValidating(context: ValidationContext): void {
		context.Data["minimumAge"] = 18;
		this.Log.push(`validating ${context.Trigger}`);
	}
	public override OnValidated(context: ValidationContext): void { this.Log.push(`validated ${context.IsValid}`); }
	public override OnConstruct(): void {
		this.Validate("Name", (context) => {
			if (this.Widget<TextBoxController>("Name").Value.trim() === "") context.Error("Name", "Enter your name");
		});
		this.Validate("Age", (context) => {
			const age = Number(this.Widget<TextBoxController>("Age").Value);
			if (!(age >= (context.Data["minimumAge"] as number))) context.Error("Age", `You must be at least ${context.Data["minimumAge"]}`);
		});
		this.Validate("Outside", (context) => context.Error("Outside", "never checked by the form's buttons"));
		this.On("Name", "enter", () => this.Log.push("enter Name"));
		this.On("Name", "leave", () => this.Log.push("leave Name"));
		this.On("OkButton", "click", () => this.Log.push("click OK"));
	}
}

function Open() {
	const document = new UiDocument(SignUp("SignUp"), { Scripts: new UiScriptRegistry().Register("SignUp", SignUpScript) });
	return { document, script: document.Script as SignUpScript };
}

describe("form lifecycle (WinForms: Load, Shown, FormClosing, FormClosed, Disposed)", () => {
	it("Load runs when the widgets exist, Shown once the view first draws it, Disposed at the end", async () => {
		const { document, script } = Open();
		expect(script.Log).toEqual(["load"]);
		const view = mount(WinLayoutView, { props: { document } });
		mount(WinLayoutView, { props: { document } }); // a second view: Shown happens once
		await nextTick();
		expect(script.Log).toEqual(["load", "shown"]);
		document.Dispose();
		expect(script.Log.at(-1)).toBe("disposed");
		view.unmount();
	});

	it("Close asks OnClosing (which may cancel), then closes once with the result", () => {
		const { document, script } = Open();
		const closed = vi.fn();
		document.Events.On("closed", closed);
		script.CancelClosing = true;
		expect(document.Close(DialogResult.OK)).toBe(false);
		expect(document.Closed).toBe(false);
		script.CancelClosing = false;
		expect(document.Close(DialogResult.OK)).toBe(true);
		expect(document.Close(DialogResult.Cancel)).toBe(false);
		expect([document.Closed, document.Result]).toEqual([true, DialogResult.OK]);
		expect(script.Log.slice(1)).toEqual(["closing OK", "closing OK", "closed OK"]);
		expect(closed).toHaveBeenCalledWith(DialogResult.OK);
		expect(new UiDocument(SignUp()).Close()).toBe(true); // no script: closes with Cancel
	});

	it("the close box of a top-level window closes the form with Cancel, unless OnClosing cancels it", () => {
		const { document, script } = Open();
		script.CancelClosing = true;
		const form = document.Controller<WindowController>("Form");
		expect(form.RequestClose()).toBe(false);
		script.CancelClosing = false;
		expect(form.RequestClose()).toBe(true);
		expect(document.Result).toBe(DialogResult.Cancel);
	});
});

describe("focus events (WinForms: Enter, Leave)", () => {
	it("every control reports enter and leave; scripts subscribe by widget name", () => {
		const { document, script } = Open();
		const all: string[] = [];
		document.Events.On("widget-event", (name, event) => all.push(`${name}.${event}`));
		const name = document.Controller<TextBoxController>("Name");
		name.Focus();
		name.Blur();
		expect(script.Log.slice(1)).toEqual(["enter Name", "leave Name"]);
		expect(all).toEqual(["Name.enter", "Name.leave"]);
	});
});

describe("validation (WinForms: Validating / Validated, ValidateChildren, ErrorProvider)", () => {
	it("a button with CausesValidation validates every widget in its container first, with a shared context", () => {
		const { document, script } = Open();
		const validated: ValidationContext[] = [];
		document.On("OkButton", "validated", (context) => validated.push(context as ValidationContext));
		document.Controller<ButtonController>("OkButton").PerformClick();

		const context = validated[0]!;
		expect(context).toBeInstanceOf(ValidationContext);
		expect([context.Container, context.Trigger, context.IsValid]).toEqual(["Form", "OkButton", false]);
		expect(context.Errors).toEqual([{ Widget: "Name", Message: "Enter your name" }, { Widget: "Age", Message: "You must be at least 18" }]);
		expect(context.ErrorsFor("Age")).toEqual(["You must be at least 18"]);
		expect(document.ErrorOf("Name")).toBe("Enter your name");
		expect(document.ErrorOf("Outside")).toBeNull(); // not in the form's window
		expect(script.Log.slice(1)).toEqual(["validating OkButton", "validated false", "click OK"]);
		expect(document.Closed).toBe(false); // invalid: the dialog result doesn't apply
	});

	it("when everything is valid the errors clear and the button's DialogResult closes the form after its click handlers", () => {
		const { document, script } = Open();
		document.Controller<ButtonController>("OkButton").PerformClick();
		document.Controller<TextBoxController>("Name").SetValue("Anton");
		document.Controller<TextBoxController>("Age").SetValue("30");
		document.Controller<ButtonController>("OkButton").PerformClick();
		expect([document.ErrorOf("Name"), document.ErrorOf("Age")]).toEqual([null, null]);
		expect(script.Log.slice(-4)).toEqual(["validated true", "click OK", "closing OK", "closed OK"]);
		expect(document.Result).toBe(DialogResult.OK);
	});

	it("a validating button without a dialog result only validates; a plain button with one just closes", () => {
		const { document } = Open();
		document.Controller<ButtonController>("Check").PerformClick();
		expect(document.ErrorOf("Name")).toBe("Enter your name");
		expect(document.Closed).toBe(false);
		document.Controller<ButtonController>("CancelButton").PerformClick();
		expect(document.Result).toBe(DialogResult.Cancel);
	});

	it("ValidateChildren can be called from code with its own context data; a form-level Cancel makes it invalid", () => {
		const { document } = Open();
		document.Controller<TextBoxController>("Name").SetValue("Anton");
		document.Controller<TextBoxController>("Age").SetValue("20");
		const context = document.ValidateChildren("Form", { minimumAge: 30 });
		expect([context.Trigger, context.IsValid, context.Data["minimumAge"]]).toEqual([null, true, 18]); // OnValidating set it
		const all = document.ValidateChildren();
		expect(all.Container).toBe("Root");
		expect(all.ErrorsFor("Outside")).toEqual(["never checked by the form's buttons"]);

		const standalone = new ValidationContext("Root", null);
		standalone.Cancel("The server is down");
		expect([standalone.IsValid, standalone.Errors]).toEqual([false, [{ Widget: "", Message: "The server is down" }]]);
		expect(new ValidationContext("Root", null).Data).toEqual({});
	});

	it("validators can be removed; a document without a script validates nothing and is valid", () => {
		const document = new UiDocument(SignUp());
		const off = document.Validate("Name", (context) => context.Error("Name", "nope"));
		expect(document.ValidateChildren().IsValid).toBe(false);
		off();
		off();
		expect(document.ValidateChildren().IsValid).toBe(true);
		expect(() => document.Validate("Nobody", vi.fn())).toThrow('No widget named "Nobody"');
	});

	it("invalid widgets are marked in the view with their message, like an ErrorProvider", async () => {
		const { document } = Open();
		const view = mount(WinLayoutView, { props: { document } });
		document.Controller<ButtonController>("OkButton").PerformClick();
		await nextTick();
		const name = view.get('[data-name="Name"]');
		expect(name.classes()).toContain("win-layout__node--invalid");
		expect(name.get(".win-layout__error").attributes("title")).toBe("Enter your name");
		expect(view.get('[data-name="Outside"]').find(".win-layout__error").exists()).toBe(false);
	});
});

describe("dialog keys (WinForms: AcceptButton, CancelButton)", () => {
	it("Enter clicks the accept button and Escape the cancel button of the window; Enter in a multiline box or on a button doesn't", async () => {
		const { document } = Open();
		const view = mount(WinLayoutView, { props: { document }, attachTo: window.document.body });
		const clicks: string[] = [];
		document.Events.On("widget-event", (name, event) => { if (event === "click") clicks.push(name); });
		const form = view.get('[data-name="Form"] .win-window');
		await form.trigger("keydown", { code: "Enter" });
		await view.get('[data-name="OkButton"] button').trigger("keydown", { code: "Enter" }); // the button's own Enter
		await form.trigger("keydown", { code: "KeyA" });
		expect(clicks).toEqual(["OkButton", "OkButton"]);
		await form.trigger("keydown", { code: "Escape" });
		expect(document.Result).toBe(DialogResult.Cancel);
		view.unmount();
	});

	it("without an accept or cancel button the keys do nothing but Escape still cancels the form", () => {
		const layout = SignUp();
		layout.Root.Children![0]!.Props["AcceptButton"] = "";
		layout.Root.Children![0]!.Props["CancelButton"] = "Nobody";
		const document = new UiDocument(layout);
		expect(document.DialogKey("Form", "Enter")).toBe(false);
		expect(document.DialogKey("Form", "Escape")).toBe(true);
		expect(document.Result).toBe(DialogResult.Cancel);
		expect(document.DialogKey("Form", "Tab")).toBe(false);
	});
});

describe("modal dialogs (WinForms: ShowDialog, MessageBox.Show)", () => {
	it("ShowDialog shows a layout modally in the host and resolves with its DialogResult", async () => {
		const dialogs = new DialogService();
		const host = mount(WinDialogHost, { props: { service: dialogs }, attachTo: document.body });
		const result = dialogs.ShowDialog(SignUp());
		await nextTick();
		expect(host.findAll(".win-dialog-host__modal")).toHaveLength(1);
		await host.get('[data-name="CancelButton"] button').trigger("keydown", { code: "Enter" });
		await expect(result).resolves.toBe(DialogResult.Cancel);
		await nextTick();
		expect(host.findAll(".win-dialog-host__modal")).toHaveLength(0);
		host.unmount();
	});

	it("MessageBox resolves with the button chosen; scripts open dialogs and message boxes through their document", async () => {
		const dialogs = new DialogService();
		const host = mount(WinDialogHost, { props: { service: dialogs }, attachTo: document.body });
		class Asker extends UiScript {
			public Answer: MessageBoxResult | null = null;
			public Inner: DialogResult | null = null;
			public async Ask(): Promise<void> {
				this.Answer = await this.MessageBox("Save changes?", "Notepad", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
				this.Inner = await this.ShowDialog(SignUp());
			}
		}
		const layout = NewLayout("Main");
		layout.Script = "Asker";
		const main = new UiDocument(layout, { Scripts: new UiScriptRegistry().Register("Asker", Asker), Dialogs: dialogs });
		const asking = (main.Script as Asker).Ask();
		await nextTick();
		expect(host.get("[role=alertdialog]").text()).toContain("Save changes?");
		await host.findAll(".win-messagebox__buttons button")[1]!.trigger("click");
		await new Promise((resolve) => setTimeout(resolve, 0));
		await nextTick();
		expect(dialogs.Open).toHaveLength(1);
		dialogs.Open[0]!.Document!.Close(DialogResult.Abort);
		await asking;
		expect([(main.Script as Asker).Answer, (main.Script as Asker).Inner]).toEqual([MessageBoxResult.No, DialogResult.Abort]);
		expect(dialogs.MessageBox("Done")).toBeInstanceOf(Promise);
		host.unmount();
	});

	it("a document without a dialog service can't open dialogs", async () => {
		class Lonely extends UiScript { public Try(): Promise<unknown> { return this.MessageBox("x"); } }
		const layout = NewLayout("x");
		layout.Script = "Lonely";
		const document = new UiDocument(layout, { Scripts: new UiScriptRegistry().Register("Lonely", Lonely) });
		expect(() => (document.Script as Lonely).Try()).toThrow("This UI has no dialog service: create its UiDocument with { Dialogs }");
	});
});

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

describe("form edges", () => {
	it("a widget with several errors shows the first one", () => {
		const document = new UiDocument(SignUp());
		document.Validate("Name", (context) => { context.Error("Name", "first"); context.Error("Name", "second"); });
		expect(document.ValidateChildren().ErrorsFor("Name")).toEqual(["first", "second"]);
		expect(document.ErrorOf("Name")).toBe("first");
	});

	it("a script that overrides nothing goes through the whole lifecycle", () => {
		class Plain extends UiScript {}
		const layout = SignUp("Plain");
		const document = new UiDocument(layout, { Scripts: new UiScriptRegistry().Register("Plain", Plain) });
		document.NotifyShown();
		expect(document.ValidateChildren().IsValid).toBe(true);
		expect(document.Close(DialogResult.OK)).toBe(true);
		expect(() => document.Dispose()).not.toThrow();
	});
});
