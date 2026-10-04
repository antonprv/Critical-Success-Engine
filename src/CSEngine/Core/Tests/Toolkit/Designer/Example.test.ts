// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import type { ButtonController } from "../../../Source/Toolkit/Controls/ButtonController";
import type { StatusBarController } from "../../../Source/Toolkit/Controls/StatusBarController";
import type { TextBoxController } from "../../../Source/Toolkit/Controls/TextBoxController";
import LoginDialog from "../../../Source/Toolkit/Designer/Examples/LoginDialog.ui.json?raw";
import { ExampleScripts, LoginDialogScript } from "../../../Source/Toolkit/Designer/Examples/LoginDialog";
import { ParseLayout } from "../../../Source/Toolkit/Designer/Layout";
import { UiDocument } from "../../../Source/Toolkit/Designer/UiDocument";

describe("the login dialog example: a layout made in the designer, brought to life by a script", () => {
	const Open = () => new UiDocument(ParseLayout(LoginDialog), { Scripts: ExampleScripts() });

	it("is a valid layout file that names its script", () => {
		const layout = ParseLayout(LoginDialog);
		expect(layout.Script).toBe("LoginDialog");
		expect(Open().Script).toBeInstanceOf(LoginDialogScript);
	});

	it("OK is only available once a name is typed; it validates the password, then greets and closes with OK; Cancel clears", () => {
		const document = Open();
		const ok = document.Controller<ButtonController>("OkButton");
		const name = document.Controller<TextBoxController>("UserName");
		const status = document.Controller<StatusBarController>("Status");
		expect(ok.Enabled).toBe(false);
		name.Input("   ");
		expect(ok.Enabled).toBe(false);
		name.Input(" Anton ");
		expect(ok.Enabled).toBe(true);
		ok.PerformClick(); // validates the window first: the password is too short
		expect(document.ErrorOf("Password")).toBe("At least 4 characters");
		expect([status.Panels[0]!.Text, document.Closed]).toEqual(["Enter your name", false]);
		document.Controller<TextBoxController>("Password").Input("secret");
		ok.PerformClick();
		expect(document.ErrorOf("Password")).toBeNull();
		expect(status.Panels[0]!.Text).toBe("Welcome, Anton!");
		expect(document.Result).toBe("OK"); // OK's DialogResult closed the form

		const again = Open();
		again.Controller<TextBoxController>("UserName").Input("x");
		again.Controller<TextBoxController>("Password").Input("secret");
		again.Controller<ButtonController>("CancelButton").PerformClick();
		expect([again.Controller<TextBoxController>("UserName").Value, again.Controller<TextBoxController>("Password").Value, again.Controller<ButtonController>("OkButton").Enabled]).toEqual(["", "", false]);
	});
});

describe("designer page entry", () => {
	it("opens the designer on the login dialog example", async () => {
		document.body.innerHTML = '<div id="designer"></div>';
		await import("../../../Source/Toolkit/Designer/Main");
		await nextTick();
		expect(document.querySelector(".win-designer")).not.toBeNull();
		expect([...document.querySelectorAll(".win-designer__tree-item")].map((i) => i.textContent)).toContain("LoginWindow");
	});
});
