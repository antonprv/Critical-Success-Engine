// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { ButtonController } from "../../Source/Controls/ButtonController";
import { DialogResult } from "../../Source/Documents/DialogResult";
import { CreateNode, NewLayout, SerializeLayout, WidgetType, type UiLayout } from "../../Source/Documents/Layout";
import { ParseUiManifest, SerializeUiManifest, UpsertManifestEntry, type UiManifest } from "../../Source/Documents/UiManifest";
import { UiManager } from "../../Source/Documents/UiManager";
import { UiScript, UiScriptRegistry } from "../../Source/Documents/UiScript";
import WinUiHost from "../../Source/Documents/WinUiHost.vue";

function Menu(name: string, button = "Resume"): UiLayout {
	const layout = NewLayout(name);
	const node = CreateNode(WidgetType.Button, button, 10, 10);
	node.Props["DialogResult"] = DialogResult.OK;
	layout.Root.Children!.push(node);
	return layout;
}

const Manifest: UiManifest = {
	FileVersion: 1,
	Documents: [
		{ Id: "PauseMenu", Path: "PauseMenu.ui.json", Script: "" },
		{ Id: "Hud", Path: "Hud.ui.json", Script: "HudScript" },
		{ Id: "Broken", Path: "Broken.ui.json", Script: "" },
	],
};

/** Files of a project's UI folder, as the game's loader would read them. */
function Files() {
	const files: Record<string, string> = { "PauseMenu.ui.json": SerializeLayout(Menu("Pause")), "Hud.ui.json": SerializeLayout(Menu("Hud", "Coins")), "Broken.ui.json": "{" };
	return { load: vi.fn<(path: string) => Promise<string>>(async (path) => files[path]!) };
}

describe("UI manifests (Ui.manifest.json)", () => {
	it("round-trip; entries are added or replaced by id", () => {
		expect(ParseUiManifest(SerializeUiManifest(Manifest))).toEqual(Manifest);
		const added = UpsertManifestEntry(Manifest, { Id: "Inventory", Path: "Inventory.ui.json", Script: "" });
		expect(added.Documents.map((d) => d.Id)).toEqual(["PauseMenu", "Hud", "Broken", "Inventory"]);
		const replaced = UpsertManifestEntry(added, { Id: "Hud", Path: "NewHud.ui.json", Script: "" });
		expect(replaced.Documents.find((d) => d.Id === "Hud")!.Path).toBe("NewHud.ui.json");
		expect(Manifest.Documents).toHaveLength(3); // the original is untouched
		expect(ParseUiManifest(JSON.stringify({ Documents: [{ Id: "A", Path: "a.ui.json" }] }))).toEqual({ FileVersion: 1, Documents: [{ Id: "A", Path: "a.ui.json", Script: "" }] });
	});

	it("say what is wrong", () => {
		expect(() => ParseUiManifest("nope")).toThrow("Not a UI manifest: not JSON");
		expect(() => ParseUiManifest('{"Documents": 1}')).toThrow("Not a UI manifest: Documents must be a list");
		expect(() => ParseUiManifest('{"Documents": [{"Id": "A"}]}')).toThrow('Not a UI manifest: document "A" has no Path');
		expect(() => ParseUiManifest('{"Documents": [{"Path": "a"}]}')).toThrow("Not a UI manifest: a document has no Id");
		expect(() => ParseUiManifest('{"Documents": [{"Id": "Main Menu", "Path": "a"}]}')).toThrow('Not a UI manifest: Id "Main Menu" must be an identifier');
		expect(() => ParseUiManifest('{"Documents": [{"Id": "A", "Path": "a"}, {"Id": "A", "Path": "b"}]}')).toThrow('Not a UI manifest: two documents are called "A"');
		expect(ParseUiManifest('{}').Documents).toEqual([]);
	});
});

describe("UiManager: scripts show UI documents by their manifest id", () => {
	it("Show loads a document once and shows it; showing again returns it; Hide removes it", async () => {
		const { load } = Files();
		const ui = new UiManager({ Manifest, Load: load });
		expect(ui.Ids).toEqual(["PauseMenu", "Hud", "Broken"]);
		const events: string[] = [];
		ui.Events.On("shown", (id) => events.push(`shown ${id}`));
		ui.Events.On("hidden", (id) => events.push(`hidden ${id}`));
		const [a, b] = await Promise.all([ui.Show("PauseMenu"), ui.Show("PauseMenu")]);
		expect(a).toBe(b);
		expect(ui.IsShown("PauseMenu")).toBe(true);
		expect(ui.Get("PauseMenu")).toBe(a);
		expect(ui.Shown.map((s) => s.Id)).toEqual(["PauseMenu"]);
		expect(ui.Hide("PauseMenu")).toBe(true);
		expect(ui.Hide("PauseMenu")).toBe(false);
		expect(ui.Get("PauseMenu")).toBeNull();
		await ui.Show("PauseMenu");
		expect(load).toHaveBeenCalledTimes(1); // the layout is cached
		expect(events).toEqual(["shown PauseMenu", "hidden PauseMenu", "shown PauseMenu"]);
	});

	it("Toggle flips a document; HideAll hides everything; a document that closes itself (DialogResult) hides", async () => {
		const ui = new UiManager({ Manifest, Load: Files().load });
		expect(await ui.Toggle("PauseMenu")).toBe(true);
		expect(await ui.Toggle("PauseMenu")).toBe(false);
		await ui.Show("PauseMenu");
		await ui.Show("Hud");
		ui.HideAll();
		expect(ui.Shown).toEqual([]);
		const menu = await ui.Show("PauseMenu");
		menu.Controller<ButtonController>("Resume").PerformClick(); // its button closes the form with OK
		expect(ui.IsShown("PauseMenu")).toBe(false);
	});

	it("the manifest can name the document's script; ShowDialog shows a document modally and resolves with its result", async () => {
		class HudScript extends UiScript {
			public static Built = 0;
			public override OnConstruct(): void { HudScript.Built++; }
		}
		const ui = new UiManager({ Manifest, Load: Files().load, Scripts: new UiScriptRegistry().Register("HudScript", HudScript) });
		const hud = await ui.Show("Hud");
		expect(hud.Script).toBeInstanceOf(HudScript);
		const result = ui.ShowDialog("PauseMenu");
		await vi.waitFor(() => expect(ui.Dialogs.Open).toHaveLength(1));
		ui.Dialogs.Open[0]!.Document!.Controller<ButtonController>("Resume").PerformClick();
		await expect(result).resolves.toBe(DialogResult.OK);
	});

	it("unknown ids and broken files say which document and file", async () => {
		const ui = new UiManager({ Manifest, Load: Files().load });
		await expect(ui.Show("Nope")).rejects.toThrow('No UI document "Nope" in the manifest');
		await expect(ui.Show("Broken")).rejects.toThrow('UI document "Broken" (Broken.ui.json): Not a UI layout: not JSON');
		await expect(ui.Show("Broken")).rejects.toThrow(); // a failed load is not cached as shown
		expect(ui.IsShown("Broken")).toBe(false);
	});
});

describe("WinUiHost", () => {
	it("draws the shown documents as layers, newest on top, with their dialogs above", async () => {
		const ui = new UiManager({ Manifest, Load: Files().load });
		const host = mount(WinUiHost, { props: { manager: ui }, attachTo: document.body });
		await ui.Show("Hud");
		await ui.Show("PauseMenu");
		await nextTick();
		expect(host.findAll(".win-ui-host__layer").map((l) => l.attributes("data-ui"))).toEqual(["Hud", "PauseMenu"]);
		expect(host.find(".win-dialog-host").exists()).toBe(true);
		ui.Hide("Hud");
		await nextTick();
		expect(host.findAll(".win-ui-host__layer")).toHaveLength(1);
		host.unmount();
	});
});

describe("UiManager: more", () => {
	it("Show on a shown document returns it at once; a project's own widget registry is used; a manifest that isn't an object lists nothing", async () => {
		const { BuiltInWidgets } = await import("../../Source/Documents/Widgets");
		const widgets = BuiltInWidgets.Extend();
		const ui = new UiManager({ Manifest, Load: Files().load, Widgets: widgets });
		const hud = await ui.Show("Hud");
		expect(await ui.Show("Hud")).toBe(hud);
		expect(hud.Widgets).toBe(widgets);
		expect(ParseUiManifest("[]").Documents).toEqual([]);
	});
});
