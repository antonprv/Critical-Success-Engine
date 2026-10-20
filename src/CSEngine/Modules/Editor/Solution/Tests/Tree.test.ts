// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import type { FileEntry } from "../Source/FileSystem";
import { DefaultSolution, ViewMode, type SolutionData } from "../Source/SolutionFile";
import { AncestorsOf, BuildTree, FilterTree, FindNode, IsHidden, NaturalPlace, OwnerOf, SolutionLabel, Walk, type TreeInput } from "../Source/Tree";
import { Print } from "./Print";

const Entries = (...paths: string[]): FileEntry[] => paths.map((path) => (path.endsWith("/") ? { Path: path.slice(0, -1), Folder: true } : { Path: path, Folder: false }));

const Project = Entries("Content/", "Content/UI/", "Content/UI/Menu.ui.json", "Content/UI/Hud.ui.json", "Source/", "Source/UI/", "Source/UI/MenuGraph.ts", "Source/Main.ts", "Game.cseproject", "Game.uisolution", "file10.txt", "file2.txt");

function Input(data: SolutionData, extra: Partial<TreeInput> = {}): TreeInput {
	return { Data: data, Entries: Project, FolderName: "Game", ...extra };
}

describe("Folder View", () => {
	it("is the folder as it is on disk: folders first, names as Explorer orders them", () => {
		expect(Print(BuildTree(Input(DefaultSolution("Game")), ViewMode.Files))).toEqual([
			"Game",
			"  Content",
			"    UI",
			"      Hud.ui.json",
			"      Menu.ui.json",
			"  Source",
			"    UI",
			"      MenuGraph.ts",
			"    Main.ts",
			"  file2.txt",
			"  file10.txt",
			"  Game.cseproject",
			"  Game.uisolution",
		]);
	});

	it("shows what the manifests list but isn't on disk, and nests dependent files", () => {
		const tree = BuildTree(Input(DefaultSolution("Game"), {
			Expected: ["Content/UI/Menu.ui.json", "Content/Old/Gone.ui.json", ""],
			Nesting: { "Source/UI/MenuGraph.ts": "Content/UI/Menu.ui.json", "Source/Main.ts": "Source", "file2.txt": "nope.txt", "Source/UI": "Source/Main.ts", "Game.cseproject": "Game.cseproject" },
		}), ViewMode.Files);
		expect(Print(tree).slice(0, 8)).toEqual([
			"Game",
			"  Content",
			"    Old [missing]",
			"      Gone.ui.json [missing]",
			"    UI",
			"      Hud.ui.json",
			"      Menu.ui.json",
			"        MenuGraph.ts [nested]",
		]);
		expect(FindNode(tree, "f:Source/Main.ts")!.Nested).toBe(false);
	});

	it("breaks files that nest round in a loop", () => {
		const tree = BuildTree(Input(DefaultSolution("Game"), { Nesting: { "file2.txt": "file10.txt", "file10.txt": "file2.txt", "Source/Main.ts": "file2.txt" } }), ViewMode.Files);
		expect(FindNode(tree, "f:file2.txt")!.Nested).toBe(false);
		expect(AncestorsOf(tree, "f:file10.txt")).toEqual(["d:", "f:file2.txt"]);
		expect(AncestorsOf(tree, "f:Source/Main.ts")).toEqual(["d:", "f:file2.txt"]);
	});
});

describe("Solution view", () => {
	it("is the same as Folder View under one project when nothing was changed, less the project files", () => {
		const data = DefaultSolution("Game");
		const solution = Print(BuildTree(Input(data), ViewMode.Solution));
		const files = Print(BuildTree(Input(data), ViewMode.Files)).slice(1).filter((line) => !line.includes(".cseproject") && !line.includes(".uisolution"));
		expect(solution[0]).toBe("Solution 'Game' (1 project)");
		expect(solution[1]).toBe("  Game");
		expect(solution.slice(2)).toEqual(files.map((line) => `  ${line}`));
	});

	it("shows visual projects, sub-projects bound to folders, virtual folders and moved items", () => {
		const data = DefaultSolution("Game");
		data.Projects.push(
			{ Id: "ui", Name: "UI project", Folder: "Content/UI", Parent: "p:main" },
			{ Id: "docs", Name: "Docs", Folder: null, Parent: "s" },
		);
		data.VirtualFolders.push({ Id: "f1", Name: "Scripts", Parent: "p:main" }, { Id: "f2", Name: "Notes", Parent: "p:docs" });
		data.Placements = { "Source/Main.ts": "v:f1", "file2.txt": "p:docs", "file10.txt": "v:f2", "Gone.txt": "v:f2", "Source/UI": "s" };
		expect(Print(BuildTree(Input(data), ViewMode.Solution))).toEqual([
			"Solution 'Game' (3 projects)",
			"  Docs",
			"    Notes",
			"      file10.txt",
			"      Gone.txt [missing]",
			"    file2.txt",
			"  Game",
			"    UI project",
			"      Hud.ui.json",
			"      Menu.ui.json",
			"    Scripts",
			"      Main.ts",
			"    Content",
			"    Source",
			"  UI",
			"    MenuGraph.ts",
		]);
	});

	it("hides by path, by name pattern and under hidden folders; ShowHidden greys them instead", () => {
		const data = DefaultSolution("Game");
		data.Hidden = ["Source", "file2.txt"];
		const hidden = Print(BuildTree(Input(data), ViewMode.Solution));
		expect(hidden.some((line) => line.includes("Source") || line.includes("Main.ts") || line.includes("file2") || line.includes("cseproject"))).toBe(false);
		data.ShowHidden = true;
		const shown = BuildTree(Input(data), ViewMode.Solution);
		expect(FindNode(shown, "f:Source/Main.ts")!.Hidden).toBe(true);
		expect(FindNode(shown, "f:Game.cseproject")!.Hidden).toBe(true);
		expect(FindNode(shown, "f:file10.txt")!.Hidden).toBe(false);
		expect(IsHidden(data, "Source/UI/MenuGraph.ts")).toBe(true);
		data.Hidden = [""];
		expect(IsHidden(data, "file10.txt")).toBe(false);
	});

	it("puts what was in a vanished place back where it belongs, and breaks loops", () => {
		const data = DefaultSolution("Game");
		data.VirtualFolders.push({ Id: "a", Name: "A", Parent: "v:b" }, { Id: "b", Name: "B", Parent: "v:a" }, { Id: "c", Name: "C", Parent: "v:gone" });
		data.Projects.push({ Id: "x", Name: "X", Folder: null, Parent: "v:gone" });
		data.Placements = { "Source/Main.ts": "v:gone", "Content": "d:Content/UI", "file2.txt": "v:a" };
		const tree = BuildTree(Input(data), ViewMode.Solution);
		expect(AncestorsOf(tree, "v:a")).toEqual(["s"]);
		expect(AncestorsOf(tree, "v:b")).toEqual(["s", "v:a"]);
		expect(AncestorsOf(tree, "v:c")).toEqual(["s"]);
		expect(AncestorsOf(tree, "p:x")).toEqual(["s"]);
		expect(AncestorsOf(tree, "f:Source/Main.ts")).toEqual(["s", "p:main", "d:Source"]);
		expect(AncestorsOf(tree, "d:Content")).toEqual(["s", "p:main"]);
		expect(AncestorsOf(tree, "f:file2.txt")).toEqual(["s", "v:a"]);
	});

	it("shows a file nested under a hidden one in its own folder", () => {
		const data = DefaultSolution("Game");
		data.Hidden = ["file2.txt"];
		const tree = BuildTree(Input(data, { Nesting: { "file10.txt": "file2.txt" } }), ViewMode.Solution);
		expect(AncestorsOf(tree, "f:file10.txt")).toEqual(["s", "p:main"]);
		expect(FindNode(tree, "f:file10.txt")!.Nested).toBe(false);
	});

	it("does not place a nested file elsewhere", () => {
		const data = DefaultSolution("Game");
		data.Placements = { "Source/UI/MenuGraph.ts": "s" };
		const tree = BuildTree(Input(data, { Nesting: { "Source/UI/MenuGraph.ts": "Content/UI/Menu.ui.json" } }), ViewMode.Solution);
		expect(AncestorsOf(tree, "f:Source/UI/MenuGraph.ts")!.at(-1)).toBe("f:Content/UI/Menu.ui.json");
	});

	it("keeps what no project holds right under the solution, in its folders", () => {
		const data = DefaultSolution("Game");
		data.Projects[0]!.Folder = "Content";
		const tree = BuildTree(Input(data), ViewMode.Solution);
		expect(FindNode(tree, "f:Source/Main.ts")).not.toBeNull();
		expect(AncestorsOf(tree, "f:Source/Main.ts")).toEqual(["s", "d:Source"]);
		expect(AncestorsOf(tree, "d:Source")).toEqual(["s"]);
	});
});

describe("Tree helpers", () => {
	const data = DefaultSolution("Game");
	data.Projects.push({ Id: "ui", Name: "UI", Folder: "Content/UI", Parent: "p:main" }, { Id: "v", Name: "V", Folder: null, Parent: "s" });

	it("finds the owner and natural place of a path", () => {
		expect(OwnerOf(data.Projects, "Content/UI/Menu.ui.json")!.Id).toBe("ui");
		expect(OwnerOf(data.Projects, "Content/UI")!.Id).toBe("main");
		expect(OwnerOf(data.Projects, "Source/Main.ts")!.Id).toBe("main");
		expect(OwnerOf([], "a")).toBeNull();
		expect(OwnerOf([...data.Projects].reverse(), "Content/UI/Menu.ui.json")!.Id).toBe("ui");
		expect(NaturalPlace(data, "Content/UI/Menu.ui.json")).toBe("p:ui");
		expect(NaturalPlace(data, "Source/UI")).toBe("d:Source");
		expect(NaturalPlace({ ...data, Projects: [] }, "a")).toBeNull();
		expect(SolutionLabel(data)).toBe("Solution 'Game' (3 projects)");
	});

	it("walks, finds and filters", () => {
		const tree = BuildTree(Input(DefaultSolution("Game")), ViewMode.Files);
		expect([...Walk(tree)].length).toBe(Project.length + 1);
		expect(FindNode(tree, "nope")).toBeNull();
		expect(AncestorsOf(tree, "nope")).toBeNull();
		expect(AncestorsOf(tree, "d:")).toEqual([]);
		expect(Print(FilterTree(tree, " MENU "))).toEqual(["Game", "  Content", "    UI", "      Menu.ui.json", "  Source", "    UI", "      MenuGraph.ts"]);
		expect(FilterTree(tree, "")).toBe(tree);
		expect(FilterTree(tree, "zzz")).toBeNull();
	});
});

describe("Big trees", () => {
	it("builds 40 000 files in both modes quickly", () => {
		const entries: FileEntry[] = [];
		for (let folder = 0; folder < 400; folder++) {
			entries.push({ Path: `Content/F${folder}`, Folder: true });
			for (let file = 0; file < 100; file++) entries.push({ Path: `Content/F${folder}/File${file}.ui.json`, Folder: false });
		}
		entries.push({ Path: "Content", Folder: true });
		const data = DefaultSolution("Game");
		data.Hidden = ["Content/F1"];
		data.Placements = { "Content/F2/File1.ui.json": "s" };
		const started = performance.now();
		const files = BuildTree({ Data: data, Entries: entries, FolderName: "Game" }, ViewMode.Files);
		const solution = BuildTree({ Data: data, Entries: entries, FolderName: "Game" }, ViewMode.Solution);
		const took = performance.now() - started;
		expect([...Walk(files)].length).toBe(entries.length + 1);
		expect([...Walk(solution)].length).toBe(entries.length + 2 - 101);
		expect(took).toBeLessThan(2000);
	});
});
