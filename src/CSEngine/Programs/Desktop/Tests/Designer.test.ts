// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DesignerService } from "../Source/Main/DesignerService";
import { ProjectsService } from "../Source/Main/ProjectsService";

const Templates = resolve(__dirname, "../../../../Templates");
let sandbox = "";
let project = "";
beforeEach(() => {
	sandbox = mkdtempSync(join(tmpdir(), "cse-designer-"));
	project = new ProjectsService({ Registry: join(sandbox, "Projects.json"), TemplatesDirectory: Templates }).Create({ Template: "CoinHunt", Name: "Moonrise", Location: sandbox }).File;
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

const Layout = (name: string) => JSON.stringify({ Format: 1, Name: name, Script: "", Root: { Name: "Root", Type: "canvas", X: 0, Y: 0, Width: 800, Height: 500, Props: {}, Children: [] } });

describe("DesignerService: the UI designer works on a project's UI documents", () => {
	it("opens a project: its name and the documents of its UI manifest", () => {
		expect(new DesignerService().Open(project)).toEqual({ Name: "Moonrise", File: project, Documents: [{ Id: "CoinHuntHud", Path: "CoinHuntHud.ui.json", Script: "" }] });
	});

	it("reads a document; saves it back in its place; a new one goes beside the manifest and into it; generated code into Source/UI", () => {
		const service = new DesignerService();
		expect(JSON.parse(service.Read(project, "CoinHuntHud")).Name).toBe("Coin Hunt HUD");
		const documents = service.Save(project, { Id: "CoinHuntHud", Layout: Layout("Changed HUD") });
		expect(JSON.parse(readFileSync(join(sandbox, "Moonrise/Content/UI/CoinHuntHud.ui.json"), "utf8")).Name).toBe("Changed HUD");
		expect(documents).toHaveLength(1);
		const after = service.Save(project, { Id: "PauseMenu", Layout: Layout("Pause menu"), Script: { ClassName: "PauseMenuNodes", Text: "export class PauseMenuNodes {}\n" } });
		expect(after.map((d) => d.Id)).toEqual(["CoinHuntHud", "PauseMenu"]);
		expect(JSON.parse(readFileSync(join(sandbox, "Moonrise/Content/UI/Ui.manifest.json"), "utf8")).Documents.at(-1)).toEqual({ Id: "PauseMenu", Path: "PauseMenu.ui.json", Script: "" });
		expect(existsSync(join(sandbox, "Moonrise/Content/UI/PauseMenu.ui.json"))).toBe(true);
		expect(readFileSync(join(sandbox, "Moonrise/Source/UI/PauseMenuNodes.ts"), "utf8")).toBe("export class PauseMenuNodes {}\n");
		expect(service.Read(project, "PauseMenu")).toBe(`${JSON.stringify(JSON.parse(Layout("Pause menu")), null, 2)}\n`); // kept readable
	});

	it("checks a new document's Id: an identifier, not taken", () => {
		const service = new DesignerService();
		expect(service.IdProblem(project, "PauseMenu")).toBeNull();
		expect(service.IdProblem(project, "CoinHuntHud")).toBe('There is a document called "CoinHuntHud" already');
		expect(service.IdProblem(project, "2nd menu")).toBe('"2nd menu" must start with a letter and hold only letters, digits and _');
		expect(() => service.Save(project, { Id: "2nd menu", Layout: Layout("x") })).toThrow("must start with a letter"); // a new document with a bad Id isn't saved
	});

	it("a project without a UI manifest has no documents yet; the first save makes the manifest", () => {
		const service = new DesignerService();
		rmSync(join(sandbox, "Moonrise/Content/UI"), { recursive: true });
		expect(service.Open(project).Documents).toEqual([]);
		service.Save(project, { Id: "Hud", Layout: Layout("Hud") });
		expect(JSON.parse(readFileSync(join(sandbox, "Moonrise/Content/UI/Ui.manifest.json"), "utf8")).Documents).toEqual([{ Id: "Hud", Path: "Hud.ui.json", Script: "" }]);
	});

	it("never reaches outside the project, says what it can't find, and refuses a layout that isn't one", () => {
		const service = new DesignerService();
		const manifest = join(sandbox, "Moonrise/Content/UI/Ui.manifest.json");
		writeFileSync(manifest, JSON.stringify({ FileVersion: 1, Documents: [{ Id: "Escape", Path: "../../../outside.ui.json", Script: "" }] }));
		expect(() => service.Read(project, "Escape")).toThrow(/is outside the project/);
		expect(() => service.Save(project, { Id: "Escape", Layout: Layout("x") })).toThrow(/is outside the project/);
		expect(() => service.Read(project, "Nope")).toThrow('The project has no UI document "Nope"');
		expect(() => service.Save(project, { Id: "Bad", Layout: "{" })).toThrow("Not a layout: not JSON");
		expect(() => service.Save(project, { Id: "Bad", Layout: "[]" })).toThrow("Not a layout: it has no Root");
		expect(() => service.Save(project, { Id: "Bad", Layout: '{"Name":"x"}' })).toThrow("Not a layout: it has no Root");
		expect(() => service.Save(project, { Id: "Code", Layout: Layout("x"), Script: { ClassName: "../Evil", Text: "" } })).toThrow('"../Evil" is not a class name');
		expect(existsSync(join(sandbox, "outside.ui.json"))).toBe(false); // nothing written out there
		const descriptor = JSON.parse(readFileSync(project, "utf8"));
		descriptor.Ui.Manifest = "../../elsewhere/Ui.manifest.json"; // a project whose manifest points out of it
		writeFileSync(project, JSON.stringify(descriptor));
		expect(() => service.Open(project)).toThrow(/is outside the project/);
	});
});

describe("DesignerService: the project's code, for the code editor", () => {
	it("lists the code files under Source (paths from the project's folder), reads one and writes one (a new one too)", () => {
		const service = new DesignerService();
		const files = service.CodeFiles(project);
		expect(files).toEqual(expect.arrayContaining(["Source/MoonriseModule.ts", "Source/Scripts/CoinHunt.ts", "Source/Data/CoinHuntRules.ts"])); // the template's files, named for the project
		expect(files.every((f) => f.startsWith("Source/") && !f.includes("\\"))).toBe(true);
		expect(service.ReadCode(project, "Source/Data/CoinHuntRules.ts")).toContain("class CoinHuntRules");
		service.WriteCode(project, "Source/Data/CoinHuntRules.ts", "// changed\n");
		expect(readFileSync(join(sandbox, "Moonrise/Source/Data/CoinHuntRules.ts"), "utf8")).toBe("// changed\n");
		service.WriteCode(project, "Source/Extra/Helper.ts", "export {};\n");
		expect(service.CodeFiles(project)).toContain("Source/Extra/Helper.ts");
	});

	it("reaches nothing outside Source: not the project's other files, not out of the project; a project without Source has no code yet", () => {
		const service = new DesignerService();
		expect(() => service.ReadCode(project, "Moonrise.cseproject")).toThrow("Moonrise.cseproject is not in the project's Source folder");
		expect(() => service.WriteCode(project, "Source/../Content/UI/Ui.manifest.json", "{}")).toThrow("is not in the project's Source folder");
		expect(() => service.ReadCode(project, "Source/../../outside.ts")).toThrow("is not in the project's Source folder");
		expect(() => service.ReadCode(project, "Source/Nope.ts")).toThrow("There is no Source/Nope.ts");
		rmSync(join(sandbox, "Moonrise/Source"), { recursive: true });
		expect(service.CodeFiles(project)).toEqual([]);
	});
});
