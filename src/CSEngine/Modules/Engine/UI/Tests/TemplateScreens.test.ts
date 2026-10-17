// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { LabelController } from "../Source/Controls/LabelController";
import { ParseLayout } from "../Source/Documents/Layout";
import { UiDocument } from "../Source/Documents/UiDocument";
import { EngineDocuments, WithEngineDocuments } from "../Source/Runtime/EngineScreens";

const Templates = resolve(__dirname, "../../../../../Templates");
const TemplateFolders = readdirSync(Templates).filter((name) => existsSync(join(Templates, name, "Template.json")));

describe("every template has the engine's screens as its own UI documents", () => {
	it.each(TemplateFolders)("%s lists them in its UI manifest, as copies of the engine's (a new project edits its own in the UI Designer)", (template) => {
		const folder = join(Templates, template, "Content", "UI");
		const manifest = JSON.parse(readFileSync(join(folder, "Ui.manifest.json"), "utf8")) as { Documents: { Id: string; Path: string; }[]; };
		for (const [id, text] of Object.entries(EngineDocuments)) {
			const entry = manifest.Documents.find((d) => d.Id === id);
			expect(entry, `${template} lists ${id}`).toBeDefined();
			const copy = readFileSync(join(folder, entry!.Path), "utf8");
			expect(ParseLayout(copy).Name).toBe(ParseLayout(text).Name);
			expect(JSON.parse(copy)).toEqual(JSON.parse(text));
		}
	});

	it("the game draws a project's own copy, not the engine's", async () => {
		const project = WithEngineDocuments({ Manifest: { FileVersion: 1, Documents: Object.keys(EngineDocuments).map((Id) => ({ Id, Path: `${Id}.ui.json`, Script: "" })) }, Load: async (path) => `own:${path}` });
		expect(project.Manifest.Documents.every((d) => !d.Path.startsWith("engine:"))).toBe(true);
		expect(await project.Load("EngineHints.ui.json")).toBe("own:EngineHints.ui.json");
	});
});

describe("templates use document variables", () => {
	it("First Person's HUD writes its Shots variable (FpsHud sets it) into the label through its node graph", () => {
		const layout = ParseLayout(readFileSync(join(Templates, "FirstPerson", "Content", "UI", "FirstPersonHud.ui.json"), "utf8"));
		const hud = new UiDocument(layout, { Variables: { Shots: 3 } });
		expect(hud.Controller<LabelController>("Shots").Label).toBe("Shots: 3");
		hud.SetVariable("Shots", 4);
		expect(hud.Controller<LabelController>("Shots").Label).toBe("Shots: 4");
	});
});
