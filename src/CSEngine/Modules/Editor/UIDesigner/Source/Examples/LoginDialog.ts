// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { ButtonController } from "@cse/ui";
import type { StatusBarController } from "@cse/ui";
import type { TextBoxController } from "@cse/ui";
import type { ValidationContext } from "@cse/ui";
import { UiScript, UiScriptRegistry } from "@cse/ui";
/** Behaviour of LoginDialog.ui.json: widgets are found by the names they were given in the designer. */
export class LoginDialogScript extends UiScript {
	public override OnConstruct(): void {
		const ok = this.Widget<ButtonController>("OkButton");
		const name = this.Widget<TextBoxController>("UserName");
		const password = this.Widget<TextBoxController>("Password");
		const status = this.Widget<StatusBarController>("Status");

		ok.SetEnabled(false);
		this.On("UserName", "change", () => ok.SetEnabled(name.Value.trim() !== ""));

		// OK has CausesValidation: clicking it validates the window first; its DialogResult (OK) applies only if valid.
		this.Validate("Password", (context) => {
			if (password.Value.length < 4) context.Error("Password", "At least 4 characters");
		});
		this.On("OkButton", "validated", (context) => {
			if ((context as ValidationContext).IsValid) status.SetText(0, `Welcome, ${name.Value.trim()}!`);
		});
		this.On("CancelButton", "click", () => {
			name.SetValue("");
			password.SetValue("");
			status.SetText(0, "Enter your name");
		});
	}
}

/** The scripts the designer's preview can run: register yours here (or pass your own registry to WinDesigner). */
export function ExampleScripts(): UiScriptRegistry {
	return new UiScriptRegistry().Register("LoginDialog", LoginDialogScript);
}
