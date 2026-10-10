// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { CreateNode, GraphNodeKind, NewLayout, SerializeLayout, WidgetType, type UiManifestEntry } from "@cse/ui";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import { DesignerController } from "../Source/DesignerController";
import { ProjectSession, type DesignerApi } from "../Source/Project";
import WinProjectChooser from "../Source/WinProjectChooser.vue";
import WinProjectPanel from "../Source/WinProjectPanel.vue";

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0)); await nextTick(); };

/** A project in memory, as the desktop app's main process keeps it on disk. */
function MemoryProject() {
	const hud = NewLayout("Coin Hunt HUD");
	hud.Root.Children!.push(CreateNode(WidgetType.Label, "Coins", 10, 10));
	const files = new Map<string, string>([["CoinHuntHud", SerializeLayout(hud)]]);
	let documents: UiManifestEntry[] = [{ Id: "CoinHuntHud", Path: "CoinHuntHud.ui.json", Script: "" }];
	const saved: { Id: string; Layout: string; Script?: { ClassName: string; Text: string; }; }[] = [];
	const api: DesignerApi = {
		Open: async (file) => ({ Name: "Moonrise", File: file, Documents: documents }),
		Read: async (_file, id) => { if (!files.has(id)) throw new Error(`The project has no UI document "${id}"`); return files.get(id)!; },
		IdProblem: async (_file, id) => (documents.some((d) => d.Id === id) ? `There is a document called "${id}" already` : /^[A-Za-z_]\w*$/.test(id) ? null : `"${id}" must start with a letter`),
		Save: async (_file, document) => {
			saved.push(document);
			files.set(document.Id, document.Layout);
			if (!documents.some((d) => d.Id === document.Id)) documents = [...documents, { Id: document.Id, Path: `${document.Id}.ui.json`, Script: "" }];
			return documents;
		},
		CodeFiles: async () => ["Source/Game.ts"],
		ReadCode: async (_file, path) => `// ${path}\n`,
		WriteCode: vi.fn(async () => undefined),
	};
	return { api, saved, files };
}

describe("ProjectSession: the designer on a project's UI documents", () => {
	it("opens the project and its first document; opens another; says when one can't be read", async () => {
		const { api, files } = MemoryProject();
		const designer = new DesignerController();
		const session = await ProjectSession.Start(api, "/games/Moonrise/Moonrise.cseproject", designer);
		expect([session.State.Name, session.State.Documents.map((d) => d.Id), session.State.Current]).toEqual(["Moonrise", ["CoinHuntHud"], "CoinHuntHud"]);
		expect(designer.Find("Coins")).toBeDefined();
		expect(await session.OpenDocument("Missing", designer)).toBe('The project has no UI document "Missing"');
		expect(session.State.Current).toBe("CoinHuntHud");
		files.set("Broken", "{}"); // read, but not a layout (edited by hand, say): refused, the open one stays
		expect(await session.OpenDocument("Broken", designer)).toMatch(/^Not a UI layout/);
		expect([session.State.Current, designer.Find("Coins") !== undefined]).toEqual(["CoinHuntHud", true]);
	});

	it("Save writes the document into the project (with the code its nodes make); a new document is checked, made, saved and listed", async () => {
		const { api, saved } = MemoryProject();
		const designer = new DesignerController();
		const session = await ProjectSession.Start(api, "/p.cseproject", designer);
		const pause = designer.Add(WidgetType.Button);
		expect(await session.Save(designer)).toBe("Saved CoinHuntHud to Moonrise");
		expect([saved[0]!.Id, JSON.parse(saved[0]!.Layout).Root.Children.length, saved[0]!.Script]).toEqual(["CoinHuntHud", 2, undefined]);
		expect(designer.Dirty).toBe(false);
		designer.AddGraphNode(GraphNodeKind.Event, "click", 0, 0, { Widget: pause.Name });
		await session.Save(designer);
		expect(saved[1]!.Script!.ClassName).toBe("CoinHuntHUDNodes"); // from the layout's name, "Coin Hunt HUD"
		expect(await session.NewDocument("CoinHuntHud", designer)).toBe('There is a document called "CoinHuntHud" already');
		expect(await session.NewDocument("2nd", designer)).toBe('"2nd" must start with a letter');
		expect(await session.NewDocument("PauseMenu", designer)).toBe("Saved PauseMenu to Moonrise");
		expect([session.State.Current, session.State.Documents.map((d) => d.Id), designer.Layout.Name]).toEqual(["PauseMenu", ["CoinHuntHud", "PauseMenu"], "PauseMenu"]);
		const failing = { ...api, Save: () => Promise.reject(new Error("disk full")) };
		const broken = await ProjectSession.Start(failing, "/p.cseproject", new DesignerController());
		expect(await broken.Save(designer)).toBe("disk full");
	});

	it("a project with no documents yet starts on a blank layout, ready to be saved as a document", async () => {
		const api: DesignerApi = { Open: async (file) => ({ Name: "Empty", File: file, Documents: [] }), Read: vi.fn(), IdProblem: async () => null, Save: async () => [], CodeFiles: vi.fn(), ReadCode: vi.fn(), WriteCode: vi.fn() };
		const designer = new DesignerController();
		const session = await ProjectSession.Start(api, "/e.cseproject", designer);
		expect([session.State.Current, designer.Hierarchy.length]).toEqual([null, 1]);
		expect(await session.Save(designer)).toBe("Name a new document first (Project panel).");
	});
});

describe("the project panel", () => {
	it("lists the documents (the current one marked), opens one on click, adds one by Id, and reports through message", async () => {
		const { api } = MemoryProject();
		const designer = new DesignerController();
		const session = await ProjectSession.Start(api, "/p.cseproject", designer);
		await session.NewDocument("PauseMenu", designer);
		const view = mount(WinProjectPanel, { props: { session, designer } });
		await nextTick();
		expect(view.get("legend").text()).toBe("Project: Moonrise");
		const items = view.findAll(".win-designer__document");
		expect(items.map((i) => [i.text(), i.classes().includes("win-designer__document--current")])).toEqual([["CoinHuntHud", false], ["PauseMenu", true]]);
		await items[0]!.trigger("click");
		await settle();
		expect(session.State.Current).toBe("CoinHuntHud");
		expect(view.emitted("message")!.at(-1)).toEqual(["Opened CoinHuntHud"]);
		await view.get("input").setValue("Shop");
		await view.get(".win-designer__add-document").trigger("click");
		await settle();
		expect(session.State.Documents.map((d) => d.Id)).toContain("Shop");
		expect(view.emitted("message")!.at(-1)).toEqual(["Saved Shop to Moonrise"]);
		await view.get("input").setValue("Shop");
		await view.get(".win-designer__add-document").trigger("click");
		await settle();
		expect(view.get(".win-designer__project-problem").text()).toBe('There is a document called "Shop" already');
	});
});

describe("the project chooser (the designer started without a project)", () => {
	it("asks which project the UI is for: the known projects (a missing one can't be chosen); choosing one opens it", async () => {
		const open = vi.fn();
		const projects = { List: async () => [{ Name: "Moonrise", File: "/g/Moonrise.cseproject", Exists: true, Template: "CoinHunt", Genre: "Collectathon" }, { Name: "Gone", File: "/g/Gone.cseproject", Exists: false, Template: "", Genre: "Blank" }] };
		const view = mount(WinProjectChooser, { props: { projects, open } });
		await settle();
		const rows = view.findAll(".win-designer__project-choice");
		expect(rows.map((r) => [r.text(), (r.element as HTMLButtonElement).disabled])).toEqual([["Moonrise (Collectathon) - /g/Moonrise.cseproject", false], ["Gone (Blank) - /g/Gone.cseproject [missing]", true]]);
		await rows[0]!.trigger("click");
		expect(open).toHaveBeenCalledWith("/g/Moonrise.cseproject");
		const none = mount(WinProjectChooser, { props: { projects: { List: async () => [] }, open } });
		await settle();
		expect(none.text()).toContain("No projects yet: create one in the project browser.");
	});
});

describe("the designer's page", () => {
	it("in a plain browser: the examples; in the desktop app: on the given project, or asking which one", async () => {
		document.body.innerHTML = '<div id="designer"></div>';
		const { StartDesigner } = await import("../Source/Main");
		await settle();
		expect(document.querySelector(".win-designer")).not.toBeNull(); // the examples, started by the module itself
		expect(document.querySelector('[data-view="code"]')).not.toBeNull(); // with their code in memory
		const { api } = MemoryProject();
		window.cse = { designer: api, projects: { List: async () => [{ Name: "Moonrise", File: "/g/Moonrise.cseproject", Exists: true, Template: "CoinHunt", Genre: "Collectathon" }] } };
		const onProject = document.createElement("div");
		await StartDesigner(onProject, { search: "?project=%2Fg%2FMoonrise.cseproject", assign: vi.fn() });
		await settle();
		expect(onProject.querySelector(".win-designer__project legend")!.textContent).toBe("Project: Moonrise");
		expect(onProject.querySelector('[data-view="code"]')).not.toBeNull(); // the project's code, in the Code tab
		expect(document.title).toBe("UI Designer - Moonrise");
		const assign = vi.fn();
		const asking = document.createElement("div");
		await StartDesigner(asking, { search: "", assign });
		await settle();
		(asking.querySelector(".win-designer__project-choice") as HTMLButtonElement).click();
		expect(assign).toHaveBeenCalledWith("?project=%2Fg%2FMoonrise.cseproject");
		window.cse = { designer: api }; // a preload without the project list: nothing to choose from
		const bare = document.createElement("div");
		await StartDesigner(bare, { search: "", assign });
		await settle();
		expect(bare.textContent).toContain("No projects yet");
		delete window.cse;
	});

	it("a page without the #designer element starts nothing by itself", async () => {
		document.body.innerHTML = "";
		vi.resetModules();
		await import("../Source/Main");
		await settle();
		expect(document.querySelector(".win-designer")).toBeNull();
	});

	it("in the project, Save writes into it (not downloads); the panel's messages show in the status bar", async () => {
		const { api, saved } = MemoryProject();
		const controller = new DesignerController();
		const project = await ProjectSession.Start(api, "/p.cseproject", controller);
		const { default: WinDesigner } = await import("../Source/WinDesigner.vue");
		const view = mount(WinDesigner, { props: { controller, project }, attachTo: document.body });
		await view.findAll(".win-designer__toolbar .win-toolbar__button").find((b) => b.text() === "Save")!.trigger("click");
		await settle();
		expect(saved.map((s) => s.Id)).toEqual(["CoinHuntHud"]);
		expect(view.text()).toContain("Saved CoinHuntHud to Moonrise");
		const ctrlS = new KeyboardEvent("keydown", { code: "KeyS", ctrlKey: true, bubbles: true, cancelable: true });
		view.get(".win-designer").element.dispatchEvent(ctrlS);
		await settle();
		expect([saved.length, ctrlS.defaultPrevented]).toEqual([2, true]); // Ctrl+S saves, not the browser's "save page"
		view.get(".win-designer").element.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS", metaKey: true, bubbles: true, cancelable: true }));
		await settle();
		expect(saved.length).toBe(3); // Cmd+S on a Mac
		await view.get(".win-designer__project button").trigger("click"); // the panel's message reaches the status bar
		await settle();
		expect(view.text()).toContain("Opened CoinHuntHud");
		view.unmount();
	});
});

describe("ProjectSession.Code: the project's Source folder through the desktop app", () => {
	it("lists, reads and writes the project's code files", async () => {
		const { api } = MemoryProject();
		const session = await ProjectSession.Start(api, "/g/Moonrise.cseproject", new DesignerController());
		const code = session.Code();
		expect(await code.Files()).toEqual(["Source/Game.ts"]);
		expect(await code.Read("Source/Game.ts")).toBe("// Source/Game.ts\n");
		await code.Write("Source/Game.ts", "x");
		expect(api.WriteCode).toHaveBeenCalledWith("/g/Moonrise.cseproject", "Source/Game.ts", "x");
	});
});
