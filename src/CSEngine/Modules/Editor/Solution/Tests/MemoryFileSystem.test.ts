// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { CopyName, MemoryFileSystem } from "../Source/FileSystem";

const Paths = async (files: MemoryFileSystem): Promise<string[]> => (await files.List()).map((e) => `${e.Path}${e.Folder ? "/" : ""}`).sort();

describe("MemoryFileSystem", () => {
	it("starts with the files and folders given, and the folders above them", async () => {
		const files = new MemoryFileSystem({ "Content/UI/Menu.ui.json": "{}", "Empty/": "" });
		expect(await Paths(files)).toEqual(["Content/", "Content/UI/", "Content/UI/Menu.ui.json", "Empty/"]);
		expect(await files.ReadText("Content/UI/Menu.ui.json")).toBe("{}");
		expect(await files.ReadText("nope")).toBeNull();
	});

	it("creates, moves, copies and deletes, refusing what the disk would", async () => {
		const files = new MemoryFileSystem({ "a/b.txt": "B", "c.txt": "C" });
		await files.CreateFolder("d");
		await expect(files.CreateFolder("d")).rejects.toThrow(/exists already/);
		await expect(files.CreateFolder("")).rejects.toThrow(/project folder exists/);
		await expect(files.CreateFolder("x/y")).rejects.toThrow(/no folder x/);
		await files.Move("a", "d/a");
		expect(await Paths(files)).toEqual(["c.txt", "d/", "d/a/", "d/a/b.txt"]);
		await expect(files.Move("nope", "e")).rejects.toThrow(/There is no nope/);
		await expect(files.Move("d", "d/a/d")).rejects.toThrow(/into itself/);
		await files.Copy("d", "e");
		await files.Copy("c.txt", "e/c.txt");
		expect(await files.ReadText("e/a/b.txt")).toBe("B");
		await expect(files.Copy("e", "e/a/e")).rejects.toThrow(/into itself/);
		await files.Delete("e");
		expect(await Paths(files)).toEqual(["c.txt", "d/", "d/a/", "d/a/b.txt"]);
		await expect(files.Delete("e")).rejects.toThrow(/There is no e/);
		await files.WriteText("f/g.txt", "G");
		expect(await files.ReadText("f/g.txt")).toBe("G");
		await expect(files.WriteText("d", "x")).rejects.toThrow(/is a folder/);
	});

	it("tells its watchers about changes made outside, until they stop", () => {
		const files = new MemoryFileSystem();
		const changed = vi.fn();
		const stop = files.Watch(changed);
		files.External((f) => {
			f.Put("x/y.txt");
			f.Remove("x");
		});
		expect(changed).toHaveBeenCalledTimes(1);
		stop();
		files.External((f) => f.Put("z.txt", "z"));
		expect(changed).toHaveBeenCalledTimes(1);
	});
});

describe("CopyName", () => {
	it("names copies as Explorer does", () => {
		expect(CopyName("Menu.ui.json", () => false)).toBe("Menu - Copy.ui.json");
		expect(CopyName("Menu.ui.json", (name) => name === "Menu - Copy.ui.json")).toBe("Menu - Copy (2).ui.json");
		expect(CopyName("Folder", () => false)).toBe("Folder - Copy");
		expect(CopyName(".gitignore", () => false)).toBe(".gitignore - Copy");
	});
});
