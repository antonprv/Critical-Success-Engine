// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodeFileSystem } from "../Source/NodeFileSystem";

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "cse-solution-"));
	mkdirSync(join(root, "Content", "UI"), { recursive: true });
	mkdirSync(join(root, "node_modules", "x"), { recursive: true });
	writeFileSync(join(root, "Content", "UI", "Menu.ui.json"), "{}");
	writeFileSync(join(root, "Game.cseproject"), "{}");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const Paths = async (files: NodeFileSystem): Promise<string[]> => (await files.List()).map((e) => `${e.Path}${e.Folder ? "/" : ""}`).sort();

describe("NodeFileSystem", () => {
	it("lists the project's folder, skipping what tools make", async () => {
		const files = new NodeFileSystem(root);
		expect(await Paths(files)).toEqual(["Content/", "Content/UI/", "Content/UI/Menu.ui.json", "Game.cseproject"]);
		expect(await Paths(new NodeFileSystem(root, { Skip: [] }))).toContain("node_modules/x/");
	});

	it("creates, moves (even only the case), copies, deletes, reads and writes", async () => {
		const files = new NodeFileSystem(root);
		await files.CreateFolder("Levels");
		await expect(files.CreateFolder("Levels")).rejects.toThrow(/exists already/);
		await expect(files.CreateFolder("")).rejects.toThrow(/project folder exists/);
		await expect(files.CreateFolder("No/Such")).rejects.toThrow();
		await files.Move("Content/UI/Menu.ui.json", "Levels/Menu.ui.json");
		await files.Move("Levels", "levels");
		await files.Copy("levels", "Copy");
		expect(await files.ReadText("Copy/Menu.ui.json")).toBe("{}");
		await files.Delete("Copy");
		expect(await files.ReadText("Copy/Menu.ui.json")).toBeNull();
		await expect(files.Delete("Copy")).rejects.toThrow();
		await expect(files.Delete("")).rejects.toThrow(/can't be deleted/);
		await files.WriteText("Deep/Notes.txt", "hi");
		expect(await files.ReadText("Deep/Notes.txt")).toBe("hi");
		expect(await Paths(files)).not.toContain("Deep/Notes.txt.tmp");
		await expect(files.ReadText("Deep")).rejects.toThrow();
	});

	it("deletes into the bin when it can", async () => {
		const trash = vi.fn(async () => undefined);
		const files = new NodeFileSystem(root, { Trash: trash });
		await files.Delete("Game.cseproject");
		expect(trash).toHaveBeenCalledWith(join(root, "Game.cseproject"));
	});

	it("refuses paths that leave the project", async () => {
		const files = new NodeFileSystem(root);
		await expect(files.ReadText("../outside.txt")).rejects.toThrow(/outside the project/);
		await expect(files.WriteText("..\\outside.txt", "x")).rejects.toThrow(/outside the project/);
	});

	it("tells about changes once they settle, ignoring what tools make, until stopped", async () => {
		const files = new NodeFileSystem(root, { Settle: 20 });
		const changed = vi.fn();
		const stop = files.Watch(changed);
		writeFileSync(join(root, "node_modules", "x", "y.js"), "");
		writeFileSync(join(root, "a.txt.tmp"), "");
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(changed).not.toHaveBeenCalled();
		writeFileSync(join(root, "a.txt"), "1");
		writeFileSync(join(root, "b.txt"), "2");
		await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1), { timeout: 2000 });
		writeFileSync(join(root, "c.txt"), "3");
		stop();
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(changed).toHaveBeenCalledTimes(1);
		files.Watch(changed)();
	});

	it("coalesces events and stops a pending one", () => {
		vi.useFakeTimers();
		let listener: (event: string, name: string | null) => void = () => undefined;
		const close = vi.fn();
		const on = vi.fn();
		const files = new NodeFileSystem(root, { Watcher: (_root, l) => {
			listener = l;
			return { close, on } as never;
		} });
		const changed = vi.fn();
		const stop = files.Watch(changed);
		listener("change", null);
		listener("change", "Content\\a.txt");
		listener("change", "bin\\x.dll");
		vi.advanceTimersByTime(100);
		expect(changed).toHaveBeenCalledTimes(1);
		listener("change", "b.txt");
		stop();
		vi.advanceTimersByTime(100);
		expect(changed).toHaveBeenCalledTimes(1);
		expect(close).toHaveBeenCalled();
		// A watcher that fails closes itself.
		(on.mock.calls[0]![1] as () => void)();
		expect(close).toHaveBeenCalledTimes(2);
		vi.useRealTimers();
	});
});
