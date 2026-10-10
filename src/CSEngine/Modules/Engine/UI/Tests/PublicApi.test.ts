// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import * as Ui from "../Source/index";

describe("@cse/core/ui", () => {
	it("exposes what games, generated code and editor modules build on", () => {
		for (const name of [
			"UiDocument", "UiScript", "UiScriptRegistry", "ParseLayout", "SerializeLayout", "NewLayout", "CreateNode", "BuiltInWidgets",
			"WidgetRegistry", "GraphRunner", "ParseGraph", "Chain", "Actions", "DialogService", "DialogResults", "ValidationContext",
			"NodeStyle", "Reanchor", "SkinPresets", "GenerateSkinCss", "ParseSkin", "WinLayoutView", "WinDialogHost", "WinThemeProvider",
			"WinWindow", "WinButton", "WinSplitter", "WinSwitch", "ButtonController", "WindowController", "UseControl", "EventHub",
			"AllThemes", "TailwindAccents", "UsePointerTracking",
		]) expect(Ui, name).toHaveProperty(name);
	});
});

describe("UiScript helpers (what node graphs and their generated code call)", () => {
	it("a hand-written script uses every helper on its document", async () => {
		const layout = Ui.NewLayout("Helpers");
		layout.Script = "Helpers";
		const window = Ui.CreateNode(Ui.WidgetType.Window, "Settings", 0, 0);
		window.Props["Visible"] = false;
		layout.Root.Children!.push(
			Ui.CreateNode(Ui.WidgetType.Button, "Go", 0, 0), Ui.CreateNode(Ui.WidgetType.CheckBox, "Offline", 0, 0),
			Ui.CreateNode(Ui.WidgetType.TextBox, "Server", 0, 0), Ui.CreateNode(Ui.WidgetType.Label, "Hint", 0, 0), window,
		);
		class Helpers extends Ui.UiScript {
			public override OnConstruct(): void {
				this.On("Go", "click", () => {
					this.Show("Settings");
					this.Hide("Go");
					this.ToggleVisible("Server");
					this.Disable("Offline");
					this.Enable("Offline");
					this.EnabledFollowsCheck("Server", "Offline", true);
					this.SetText("Server", "localhost");
					this.Focus("Offline");
					this.Close(Ui.DialogResult.Retry);
				});
			}
		}
		const document = new Ui.UiDocument(layout, { Scripts: new Ui.UiScriptRegistry().Register("Helpers", Helpers) });
		document.Controller<Ui.ButtonController>("Go").PerformClick();
		expect([
			document.Controller<Ui.WindowController>("Settings").Visible, document.Controller<Ui.ButtonController>("Go").Visible,
			document.Controller<Ui.TextBoxController>("Server").Visible, document.Controller<Ui.CheckBoxController>("Offline").Enabled,
			document.Controller<Ui.TextBoxController>("Server").Enabled, document.Controller<Ui.TextBoxController>("Server").Value,
			document.Controller<Ui.CheckBoxController>("Offline").Focused, document.Result,
		]).toEqual([true, false, false, true, true, "localhost", true, "Retry"]);
	});
});
