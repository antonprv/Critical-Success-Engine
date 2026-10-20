// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { BridgeFileSystem, type ProjectFilesApi } from "../Source/BridgeFileSystem";

describe("BridgeFileSystem", () => {
	it("passes every call to the preload with the project's file", async () => {
		const stop = vi.fn();
		const api: ProjectFilesApi = {
			List: vi.fn(async () => [{ Path: "a", Folder: false }]),
			CreateFolder: vi.fn(async () => undefined),
			Move: vi.fn(async () => undefined),
			Copy: vi.fn(async () => undefined),
			Delete: vi.fn(async () => undefined),
			ReadText: vi.fn(async () => "text"),
			WriteText: vi.fn(async () => undefined),
			Watch: vi.fn(() => stop),
		};
		const files = new BridgeFileSystem(api, "/Game/Game.cseproject");
		expect(await files.List()).toEqual([{ Path: "a", Folder: false }]);
		await files.CreateFolder("d");
		await files.Move("a", "b");
		await files.Copy("b", "c");
		await files.Delete("c");
		expect(await files.ReadText("b")).toBe("text");
		await files.WriteText("b", "x");
		const changed = (): void => undefined;
		files.Watch(changed)();
		expect(api.CreateFolder).toHaveBeenCalledWith("/Game/Game.cseproject", "d");
		expect(api.Move).toHaveBeenCalledWith("/Game/Game.cseproject", "a", "b");
		expect(api.Copy).toHaveBeenCalledWith("/Game/Game.cseproject", "b", "c");
		expect(api.Delete).toHaveBeenCalledWith("/Game/Game.cseproject", "c");
		expect(api.WriteText).toHaveBeenCalledWith("/Game/Game.cseproject", "b", "x");
		expect(api.Watch).toHaveBeenCalledWith("/Game/Game.cseproject", changed);
		expect(stop).toHaveBeenCalled();
	});
});
