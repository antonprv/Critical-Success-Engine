// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { MemoryFileSystem } from "../Source/FileSystem";
import { ParseSolution, ViewMode } from "../Source/SolutionFile";
import { SolutionError, SolutionModel, type SolutionOptions } from "../Source/SolutionModel";
import { AncestorsOf, FindNode } from "../Source/Tree";
import { Print } from "./Print";

const Files = (): MemoryFileSystem => new MemoryFileSystem({
	"Game.cseproject": "{}",
	"Content/UI/Menu.ui.json": "{}",
	"Content/UI/Hud.ui.json": "{}",
	"Source/Main.ts": "",
	"Source/UI/MenuGraph.ts": "",
	"Readme.md": "",
});

async function Open(files = Files(), extra: Partial<SolutionOptions> = {}): Promise<{ model: SolutionModel; files: MemoryFileSystem; }> {
	const model = await SolutionModel.Open({ Files: files, SolutionPath: "Game.uisolution", ProjectName: "Game", FolderName: "Game", ...extra });
	return { model, files };
}

const Saved = async (files: MemoryFileSystem) => ParseSolution((await files.ReadText("Game.uisolution"))!, "Game");
const Has = async (files: MemoryFileSystem, path: string) => (await files.List()).some((e) => e.Path === path);

describe("SolutionModel: opening and the presentation", () => {
	it("opens a project without a .uisolution on the default one, written on the first change", async () => {
		const { model, files } = await Open();
		expect(model.Mode).toBe(ViewMode.Solution);
		expect(Print(model.Tree)[0]).toBe("Solution 'Game' (1 project)");
		expect(await files.ReadText("Game.uisolution")).toBeNull();
		await model.SetMode(ViewMode.Files);
		expect(Print(model.Tree)[0]).toBe("Game");
		expect((await Saved(files)).Mode).toBe(ViewMode.Files);
		expect(model.TreeOf(ViewMode.Solution)).toBe(model.TreeOf(ViewMode.Solution));
		expect(model.Entries.length).toBeGreaterThan(0);
		expect(model.Data.Mode).toBe(ViewMode.Files);
	});

	it("opens a project's own .uisolution", async () => {
		const files = Files();
		await files.WriteText("Game.uisolution", JSON.stringify({ Mode: "Files" }));
		const { model } = await Open(files);
		expect(model.Mode).toBe(ViewMode.Files);
	});

	it("remembers expanded nodes per mode, collapses all, reveals a file", async () => {
		const { model, files } = await Open();
		await model.SetExpanded("d:Content", true);
		await model.SetExpanded("d:Content", true);
		expect(model.Data.Expanded.Solution).toEqual(["p:main", "d:Content"]);
		await model.SetExpanded("d:Content", false);
		await model.SetExpanded("d:Content", false);
		expect(model.Data.Expanded.Solution).toEqual(["p:main"]);
		expect(await model.Reveal("Content/UI/Menu.ui.json")).toBe("f:Content/UI/Menu.ui.json");
		expect(model.Data.Expanded.Solution).toEqual(["p:main", "s", "d:Content", "d:Content/UI"]);
		expect(await model.Reveal("Content/UI")).toBe("d:Content/UI");
		expect(await model.Reveal("Game.cseproject")).toBeNull();
		await model.CollapseAll();
		expect(model.Data.Expanded.Solution).toEqual(["p:main"]);
		await model.SetMode(ViewMode.Files);
		await model.SetExpanded("d:Source", true);
		await model.CollapseAll();
		expect((await Saved(files)).Expanded.Files).toEqual([]);
	});

	it("shows hidden files greyed on demand, tells listeners, and stops when disposed", async () => {
		const { model } = await Open();
		const changed = vi.fn();
		const stop = model.OnChanged(changed);
		await model.SetShowHidden(true);
		expect(FindNode(model.Tree, "f:Game.cseproject")!.Hidden).toBe(true);
		expect(changed).toHaveBeenCalled();
		stop();
		changed.mockClear();
		await model.SetShowHidden(false);
		expect(changed).not.toHaveBeenCalled();
		model.OnChanged(changed);
		model.Dispose();
		await model.SetShowHidden(true);
		expect(changed).not.toHaveBeenCalled();
	});

	it("asks the tool which files it expects and which nest", async () => {
		const describe = vi.fn(async () => ({ Expected: ["Content/UI/Gone.ui.json"], Nesting: { "Source/UI/MenuGraph.ts": "Content/UI/Menu.ui.json" } }));
		const { model } = await Open(Files(), { Describe: describe });
		expect(FindNode(model.Tree, "f:Content/UI/Gone.ui.json")!.Missing).toBe(true);
		expect(AncestorsOf(model.Tree, "f:Source/UI/MenuGraph.ts")!.at(-1)).toBe("f:Content/UI/Menu.ui.json");
		expect(describe).toHaveBeenCalledWith(expect.any(Array), expect.any(MemoryFileSystem));
		// Dropped on a nested file: into the folder of the file it nests under.
		await model.Move(["f:Readme.md"], "f:Source/UI/MenuGraph.ts");
		expect(AncestorsOf(model.Tree, "f:Readme.md")).toEqual(["s", "p:main", "d:Content", "d:Content/UI"]);
	});
});

describe("SolutionModel: Folder View works on the disk", () => {
	it("creates, renames, moves, copies and deletes real files, and undoes and redoes them", async () => {
		const { model, files } = await Open();
		expect(model.UndoLabel).toBeNull();
		expect(model.RedoLabel).toBeNull();
		await model.SetMode(ViewMode.Files);
		expect(await model.CreateFolder("d:Content", "Levels")).toBe("d:Content/Levels");
		expect(await Has(files, "Content/Levels")).toBe(true);
		expect(model.UndoLabel).toBe("New Folder");
		expect(await model.Rename("f:Readme.md", "README.md")).toBe("f:README.md");
		expect(await model.Rename("d:Content/Levels", "Maps")).toBe("d:Content/Maps");
		expect(await model.Rename("f:README.md", "README.md")).toBe("f:README.md");
		await model.Move(["f:README.md", "f:Source/Main.ts"], "f:Content/UI/Menu.ui.json");
		expect(await Has(files, "Content/UI/README.md")).toBe(true);
		await model.Move(["f:Content/UI/Hud.ui.json"], "d:Content/UI");
		expect(await model.Copy(["f:Content/UI/Menu.ui.json", "d:Content/Maps"], "d:Content/UI")).toEqual(["f:Content/UI/Menu - Copy.ui.json", "d:Content/UI/Maps"]);
		expect(await model.Copy(["f:Content/UI/Menu.ui.json"], "d:Content/UI")).toEqual(["f:Content/UI/Menu - Copy (2).ui.json"]);
		await model.Undo();
		expect(await Has(files, "Content/UI/Menu - Copy (2).ui.json")).toBe(false);
		await model.Redo();
		expect(await Has(files, "Content/UI/Menu - Copy (2).ui.json")).toBe(true);
		for (let i = 0; i < 4; i++) await model.Undo();
		expect(await Has(files, "Content/UI/README.md")).toBe(false);
		expect(await Has(files, "Content/Maps")).toBe(true);
		await model.Undo();
		await model.Undo();
		await model.Undo();
		expect(await Has(files, "Content/Levels")).toBe(false);
		expect(model.CanUndo).toBe(false);
		await model.Undo();
		expect(model.RedoLabel).toBe("New Folder");
		await model.Redo();
		expect(await Has(files, "Content/Levels")).toBe(true);
		await model.Delete(["d:Content/Levels", "f:Readme.md"]);
		expect(await Has(files, "Content/Levels")).toBe(false);
		expect(model.CanUndo).toBe(false);
		expect(model.CanRedo).toBe(false);
		await model.Redo();
	});

	it("refuses what the disk can't do, leaving it as it was", async () => {
		const { model, files } = await Open();
		await model.SetMode(ViewMode.Files);
		await expect(model.CreateFolder("d:Content", "UI")).rejects.toThrow(/exists already/);
		await expect(model.CreateFolder("d:Content", "a/b")).rejects.toThrow(SolutionError);
		await expect(model.Rename("f:Readme.md", "game.CSEPROJECT")).rejects.toThrow(/exists already/);
		await expect(model.Rename("d:", "X")).rejects.toThrow(/project's folder/);
		await expect(model.Move(["d:Content"], "d:Content/UI")).rejects.toThrow(/into itself/);
		await expect(model.Move(["d:"], "d:Content")).rejects.toThrow(/can't be moved/);
		await expect(model.Copy(["d:Content"], "d:Content/UI")).rejects.toThrow(/into itself/);
		await expect(model.Copy(["d:"], "d:Content")).rejects.toThrow(/can't be copied/);
		await expect(model.Delete(["d:"])).rejects.toThrow(/can't be deleted/);
		await expect(model.Rename("nope", "x")).rejects.toThrow(/There is no nope/);
		// The second move fails on disk: the first is taken back.
		const move = vi.spyOn(files, "Move");
		move.mockImplementationOnce(MemoryFileSystem.prototype.Move.bind(files)).mockRejectedValueOnce(new Error("disk full"));
		await expect(model.Move(["f:Readme.md", "f:Source/Main.ts"], "d:Content")).rejects.toThrow(/disk full/);
		expect(await Has(files, "Readme.md")).toBe(true);
		expect(await Has(files, "Content/Readme.md")).toBe(false);
		move.mockReset().mockRejectedValue(new Error("locked"));
		await expect(model.Move(["f:Readme.md", "f:Source/Main.ts"], "d:Content")).rejects.toThrow(/locked/);
		// Taking back fails too: the error reported is the first one.
		move.mockReset().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("first")).mockRejectedValueOnce(new Error("second"));
		await expect(model.Move(["f:Readme.md", "f:Source/Main.ts"], "d:Content")).rejects.toThrow(/first/);
	});

	it("keeps going after an operation failed", async () => {
		const { model } = await Open();
		await expect(model.Rename("nope", "x")).rejects.toThrow();
		expect(await model.Rename("f:Readme.md", "Notes.md")).toBe("f:Notes.md");
	});
});

describe("SolutionModel: the solution view works on the presentation", () => {
	it("makes virtual folders and projects, moves items in the view only, and undoes it", async () => {
		const { model, files } = await Open();
		const folder = await model.CreateFolder("p:main", " Scripts ");
		expect(folder).toBe("v:folder1");
		expect(await model.CreateFolder("s", "Solution Items")).toBe("v:folder2");
		await model.Move(["f:Source/Main.ts", "d:Content/UI"], folder);
		expect(AncestorsOf(model.Tree, "f:Source/Main.ts")).toEqual(["s", "p:main", "v:folder1"]);
		expect(await Has(files, "Source/Main.ts")).toBe(true);
		const project = await model.CreateProject("Tools", "p:main");
		expect(project).toBe("p:project1");
		await model.Move(["v:folder1"], project);
		await model.Move([project], "v:folder2");
		expect(AncestorsOf(model.Tree, "f:Source/Main.ts")).toEqual(["s", "v:folder2", "p:project1", "v:folder1"]);
		// Back to where it naturally is: the placement goes.
		await model.Move(["f:Source/Main.ts"], "d:Source");
		expect((await Saved(files)).Placements).toEqual({ "Content/UI": "v:folder1" });
		await model.Undo();
		expect((await Saved(files)).Placements["Source/Main.ts"]).toBe("v:folder1");
		await expect(model.Move(["v:folder2"], "v:folder1")).rejects.toThrow(/into itself/);
		await expect(model.Move(["p:main"], "v:folder2")).rejects.toThrow(/can't be moved/);
		await expect(model.Move(["s"], "v:folder2")).rejects.toThrow(/can't be moved/);
		await expect(model.CreateFolder("p:main", " ")).rejects.toThrow(/empty/);
	});

	it("makes real folders inside folders and bound projects only", async () => {
		const { model, files } = await Open();
		expect(await model.CreateFolder("p:main", "Levels", true)).toBe("d:Levels");
		expect(await model.CreateFolder("d:Content", "Maps", true)).toBe("d:Content/Maps");
		expect(await Has(files, "Content/Maps")).toBe(true);
		const ui = await model.CreateProject("UI", "p:main", "Content/UI");
		expect(await model.CreateFolder(ui, "Skins", true)).toBe("d:Content/UI/Skins");
		await expect(model.CreateFolder("v:nope", "x", true)).rejects.toThrow(/There is no/);
		const virtual = await model.CreateFolder("p:main", "V");
		await expect(model.CreateFolder(virtual, "x", true)).rejects.toThrow(/not a folder on disk/);
		const unbound = await model.CreateProject("Docs");
		await expect(model.CreateFolder(unbound, "x", true)).rejects.toThrow(/not a folder on disk/);
	});

	it("binds sub-projects to real folders, refusing what can't be one", async () => {
		const { model } = await Open();
		const ui = await model.CreateProject("UI", "p:main", "Content/UI");
		expect(Print(model.Tree)).toContain("    UI");
		expect(AncestorsOf(model.Tree, "f:Content/UI/Menu.ui.json")).toEqual(["s", "p:main", ui]);
		await expect(model.CreateProject("Again", "p:main", "Content/UI")).rejects.toThrow(/belongs to a project/);
		await expect(model.CreateProject("X", "p:main", "Nope")).rejects.toThrow(/no folder Nope/);
		await expect(model.CreateProject("X", "p:main", "")).rejects.toThrow(/no folder/);
		await expect(model.CreateProject("X", "d:Content")).rejects.toThrow(/goes under/);
		await expect(model.CreateProject(" ", "p:main")).rejects.toThrow(/empty/);
		await model.SetMode(ViewMode.Files);
		await expect(model.CreateProject("X")).rejects.toThrow(/solution view/);
	});

	it("renames projects, virtual folders and the solution in the .uisolution, files on disk", async () => {
		const { model, files } = await Open();
		const folder = await model.CreateFolder("p:main", "A");
		await model.Rename(folder, "B");
		await model.Rename("p:main", "Renamed");
		await model.Rename("s", "Solved");
		expect((await Saved(files)).Projects[0]!.Name).toBe("Solved");
		expect((await Saved(files)).VirtualFolders[0]!.Name).toBe("B");
		await expect(model.Rename(folder, "")).rejects.toThrow(/empty/);
		// A file renamed in the solution view keeps its place there.
		await model.Move(["f:Readme.md"], folder);
		await model.Hide(["d:Source"]);
		await model.SetExpanded("d:Content", true);
		expect(await model.Rename("f:Readme.md", "About.md")).toBe("f:About.md");
		expect(await Has(files, "About.md")).toBe(true);
		expect((await Saved(files)).Placements).toEqual({ "About.md": folder });
		await model.SetShowHidden(true);
		await model.Rename("d:Source", "Code");
		await model.Rename("d:Content", "Assets");
		const saved = await Saved(files);
		expect(saved.Hidden).toEqual(["Code"]);
		expect(saved.Expanded.Solution).toContain("d:Assets");
	});

	it("follows a renamed folder in everything that names it", async () => {
		const files = Files();
		// A project under a real folder can only be written by hand.
		await files.WriteText("Game.uisolution", JSON.stringify({ Projects: [{ Id: "main", Name: "Game", Folder: "" }, { Id: "other", Name: "Other", Folder: null, Parent: "d:Content" }] }));
		const { model } = await Open(files);
		const other = "p:other";
		const ui = await model.CreateProject("UI", "p:main", "Content/UI");
		const inUi = await model.CreateFolder("d:Content", "Inner");
		await model.Move(["f:Readme.md"], "d:Content");
		await model.Move([inUi], "d:Content");
		await expect(model.Move([other], "d:Source")).rejects.toThrow(/goes under/);
		await model.Rename("d:Content", "Assets");
		const saved = await Saved(files);
		expect(saved.Projects.find((p) => `p:${p.Id}` === ui)!.Folder).toBe("Assets/UI");
		expect(saved.Projects.find((p) => `p:${p.Id}` === other)!.Parent).toBe("d:Assets");
		expect(saved.VirtualFolders[0]!.Parent).toBe("d:Assets");
		expect(saved.Placements).toEqual({ "Readme.md": "d:Assets" });
	});

	it("hides and shows again", async () => {
		const { model, files } = await Open();
		await model.Hide(["f:Readme.md", "f:Readme.md"]);
		expect(FindNode(model.Tree, "f:Readme.md")).toBeNull();
		await model.SetShowHidden(true);
		await model.Unhide(["f:Readme.md"]);
		expect((await Saved(files)).Hidden).toEqual([]);
		await expect(model.Hide(["p:main"])).rejects.toThrow(/not a file or a folder/);
	});

	it("deletes virtual folders and projects into their parent, undoably", async () => {
		const { model, files } = await Open();
		const outer = await model.CreateFolder("p:main", "Outer");
		const inner = await model.CreateFolder(outer, "Inner");
		const project = await model.CreateProject("P", outer);
		await model.Move(["f:Readme.md"], outer);
		await model.Move(["f:Source/Main.ts"], outer);
		await model.Move(["f:Content/UI/Menu.ui.json"], project);
		await model.Delete([outer]);
		let saved = await Saved(files);
		expect(saved.VirtualFolders.find((f) => `v:${f.Id}` === inner)!.Parent).toBe("p:main");
		expect(saved.Projects.find((p) => `p:${p.Id}` === project)!.Parent).toBe("p:main");
		expect(saved.Placements).toEqual({ "Source/Main.ts": "p:main", "Content/UI/Menu.ui.json": project });
		await model.Delete([project]);
		saved = await Saved(files);
		expect(saved.Placements).toEqual({ "Source/Main.ts": "p:main", "Content/UI/Menu.ui.json": "p:main" });
		await model.Undo();
		await model.Undo();
		expect((await Saved(files)).VirtualFolders.some((f) => `v:${f.Id}` === outer)).toBe(true);
		await expect(model.Delete(["p:main"])).rejects.toThrow(/can't be deleted/);
		await expect(model.Delete(["s"])).rejects.toThrow(/can't be deleted/);
	});

	it("forgets what a deleted file or folder was in the .uisolution", async () => {
		const { model, files } = await Open();
		const folder = await model.CreateFolder("p:main", "V");
		await model.Move(["f:Content/UI/Menu.ui.json"], folder);
		await model.Move(["f:Readme.md"], "d:Content/UI");
		await model.SetShowHidden(true);
		await model.Hide(["f:Source/Main.ts"]);
		await model.Delete(["d:Content", "f:Source/Main.ts"]);
		const saved = await Saved(files);
		expect(saved.Placements).toEqual({});
		expect(saved.Hidden).toEqual([]);
	});

	it("copies into virtual places next to the original, shown there", async () => {
		const { model, files } = await Open();
		const folder = await model.CreateFolder("p:main", "V");
		expect(await model.Copy(["f:Readme.md"], folder)).toEqual(["f:Readme - Copy.md"]);
		expect((await Saved(files)).Placements).toEqual({ "Readme - Copy.md": folder });
		expect(await model.Copy(["f:Source/Main.ts"], "d:Content")).toEqual(["f:Content/Main.ts"]);
		expect(await model.Copy(["f:Content/UI/Hud.ui.json"], "p:main")).toEqual(["f:Hud.ui.json"]);
	});

	it("marks a missing file and refuses to rename or copy it", async () => {
		const { model, files } = await Open();
		const folder = await model.CreateFolder("p:main", "V");
		await model.Move(["f:Readme.md"], folder);
		files.External((f) => f.Remove("Readme.md"));
		await model.Refresh();
		expect(FindNode(model.Tree, "f:Readme.md")!.Missing).toBe(true);
		await expect(model.Rename("f:Readme.md", "x.md")).rejects.toThrow(/not on disk/);
		await expect(model.Copy(["f:Readme.md"], folder)).rejects.toThrow(/can't be copied/);
		// Deleting a missing file only forgets it, and can be undone.
		await model.Delete(["f:Readme.md"]);
		expect(model.CanUndo).toBe(true);
		expect(FindNode(model.Tree, "f:Readme.md")).toBeNull();
	});
});

describe("SolutionModel: changes made outside", () => {
	it("follows the disk and a .uisolution changed by another tool; ignores one that doesn't parse", async () => {
		const { model, files } = await Open();
		const changed = new Promise<void>((resolve) => model.OnChanged(resolve));
		files.External((f) => f.Put("Content/New.ui.json", "{}"));
		await changed;
		expect(FindNode(model.Tree, "f:Content/New.ui.json")).not.toBeNull();
		await files.WriteText("Game.uisolution", JSON.stringify({ Mode: "Files" }));
		await model.Refresh();
		expect(model.Mode).toBe(ViewMode.Files);
		await files.WriteText("Game.uisolution", "{ broken");
		await model.Refresh();
		expect(model.Mode).toBe(ViewMode.Files);
	});

	it("survives a refresh that fails", async () => {
		const files = Files();
		const { model } = await Open(files);
		vi.spyOn(files, "List").mockRejectedValueOnce(new Error("gone"));
		files.External(() => undefined);
		await expect(model.Refresh()).resolves.toBeUndefined();
	});
});
