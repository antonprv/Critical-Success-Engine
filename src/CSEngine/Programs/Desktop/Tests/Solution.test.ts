// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeFileSystem } from "../../../Modules/Editor/Solution/Source/BridgeFileSystem";
import { SolutionModel } from "../../../Modules/Editor/Solution/Source/SolutionModel";
import { RegisterSolutionIpc, SolutionChannels, type IpcResult } from "../Source/Main/Ipc";
import { SolutionService } from "../Source/Main/SolutionService";

let sandbox = "";
let project = "";
beforeEach(() => {
	sandbox = mkdtempSync(join(tmpdir(), "cse-solution-"));
	mkdirSync(join(sandbox, "Game", "Content", "UI"), { recursive: true });
	project = join(sandbox, "Game", "Game.cseproject");
	writeFileSync(project, "{}");
	writeFileSync(join(sandbox, "Game", "Content", "UI", "Menu.ui.json"), "{}");
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

type Handler = (event: unknown, ...args: unknown[]) => Promise<IpcResult<unknown>>;

function Ipc(service: SolutionService) {
	const handlers = new Map<string, Handler>();
	RegisterSolutionIpc({ handle: (channel: string, handler: never) => handlers.set(channel, handler) } as never, service);
	return (channel: string, event: unknown, ...args: unknown[]) => handlers.get(channel)!(event, ...args);
}

describe("SolutionService: a project's folder for the tools' pages", () => {
	it("lists, creates, moves, copies, deletes, reads and writes inside the project", async () => {
		const trash = vi.fn(async () => undefined);
		const service = new SolutionService({ Trash: trash });
		expect((await service.List(project)).map((e) => e.Path).sort()).toEqual(["Content", "Content/UI", "Content/UI/Menu.ui.json", "Game.cseproject"]);
		await service.CreateFolder(project, "Levels");
		await service.Move(project, "Levels", "Maps");
		await service.Copy(project, "Content/UI/Menu.ui.json", "Maps/Menu.ui.json");
		await service.WriteText(project, "Game.uisolution", "{}");
		expect(await service.ReadText(project, "Game.uisolution")).toBe("{}");
		await service.Delete(project, "Maps");
		expect(trash).toHaveBeenCalledWith(join(sandbox, "Game", "Maps"));
		await expect(service.ReadText(project, "../../outside")).rejects.toThrow(/outside the project/);
		expect(() => service.List(join(sandbox, "nope.cseproject"))).toThrow(/is not a project/);
		expect(() => service.List(join(sandbox, "Game", "Content"))).toThrow(/is not a project/);
		await new SolutionService().Delete(project, "Content/UI/Menu.ui.json");
		expect(await service.ReadText(project, "Content/UI/Menu.ui.json")).toBeNull();
	});

	it("answers over IPC, sends changes to the page that watches, stops with the page", async () => {
		const service = new SolutionService({ Settle: 10 });
		const call = Ipc(service);
		expect(await call(SolutionChannels.List, null, project)).toMatchObject({ ok: true });
		expect(await call(SolutionChannels.CreateFolder, null, project, "A")).toEqual({ ok: true, value: undefined });
		expect(await call(SolutionChannels.Move, null, project, "A", "B")).toEqual({ ok: true, value: undefined });
		expect(await call(SolutionChannels.Copy, null, project, "B", "C")).toEqual({ ok: true, value: undefined });
		expect(await call(SolutionChannels.WriteText, null, project, "x.txt", "x")).toEqual({ ok: true, value: undefined });
		expect(await call(SolutionChannels.ReadText, null, project, "x.txt")).toEqual({ ok: true, value: "x" });
		expect(await call(SolutionChannels.Delete, null, project, "C")).toEqual({ ok: true, value: undefined });
		expect(await call(SolutionChannels.ReadText, null, "/nope", "x")).toEqual({ ok: false, error: "/nope is not a project" });

		let destroyed: () => void = () => undefined;
		let gone = false;
		const sender = { send: vi.fn(), isDestroyed: () => gone, once: (_event: string, listener: () => void) => { destroyed = listener; } };
		const watch = await call(SolutionChannels.Watch, { sender }, project) as { ok: true; value: number; };
		writeFileSync(join(sandbox, "Game", "y.txt"), "y");
		await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith(SolutionChannels.Changed, watch.value), { timeout: 3000 });
		gone = true;
		sender.send.mockClear();
		writeFileSync(join(sandbox, "Game", "z.txt"), "z");
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(sender.send).not.toHaveBeenCalled();
		destroyed();
		expect(await call(SolutionChannels.Unwatch, null, watch.value)).toEqual({ ok: true, value: undefined });
		const other = await call(SolutionChannels.Watch, { sender }, project) as { ok: true; value: number; };
		expect(other.value).toBe(watch.value + 1);
		service.Dispose();
	});

	it("is what a tool's solution model runs on, through the preload's calls", async () => {
		const service = new SolutionService({ Settle: 10 });
		const api = {
			List: (p: string) => service.List(p),
			CreateFolder: (p: string, path: string) => service.CreateFolder(p, path),
			Move: (p: string, from: string, to: string) => service.Move(p, from, to),
			Copy: (p: string, from: string, to: string) => service.Copy(p, from, to),
			Delete: (p: string, path: string) => service.Delete(p, path),
			ReadText: (p: string, path: string) => service.ReadText(p, path),
			WriteText: (p: string, path: string, text: string) => service.WriteText(p, path, text),
			Watch: (p: string, changed: () => void) => {
				const id = service.Watch(p, changed);
				return () => service.Unwatch(id);
			},
		};
		const model = await SolutionModel.Open({ Files: new BridgeFileSystem(api, project), SolutionPath: "Game.uisolution", ProjectName: "Game", FolderName: "Game" });
		const folder = await model.CreateFolder("p:main", "Menus");
		await model.Move(["f:Content/UI/Menu.ui.json"], folder);
		await model.Copy(["f:Content/UI/Menu.ui.json"], "d:Content");
		await model.Rename("f:Content/Menu.ui.json", "Hud.ui.json");
		await model.Delete(["f:Content/Hud.ui.json"]);
		expect(JSON.parse((await service.ReadText(project, "Game.uisolution"))!).Placements).toEqual({ "Content/UI/Menu.ui.json": folder });
		model.Dispose();
		service.Dispose();
	});
});

describe("the preload's solution calls", () => {
	it("call the main process, and watch until stopped, even when stopped before the watch started", async () => {
		const exposed: Record<string, { solution: Record<string, (...args: unknown[]) => unknown>; }> = {};
		const listeners = new Set<(event: unknown, id: number) => void>();
		let next = 7;
		let refuse = false;
		const invoke = vi.fn(async (channel: string) => {
			if (channel === SolutionChannels.Watch) return refuse ? { ok: false, error: "not a project" } : { ok: true, value: next++ };
			return { ok: true, value: channel };
		});
		const ipcRenderer = {
			invoke,
			on: (_channel: string, listener: (event: unknown, id: number) => void) => listeners.add(listener),
			removeListener: (_channel: string, listener: (event: unknown, id: number) => void) => listeners.delete(listener),
		};
		vi.doMock("electron", () => ({ contextBridge: { exposeInMainWorld: (key: string, api: never) => { exposed[key] = api; } }, ipcRenderer }));
		vi.resetModules();
		await import("../Source/Preload/Preload");
		const solution = exposed["cse"]!.solution;
		for (const [name, call] of Object.entries(solution)) if (name !== "Watch") await call("/p.cseproject", "a", "b");
		expect(invoke.mock.calls.map((c) => c[0])).toEqual([
			SolutionChannels.List, SolutionChannels.CreateFolder, SolutionChannels.Move, SolutionChannels.Copy, SolutionChannels.Delete, SolutionChannels.ReadText, SolutionChannels.WriteText,
		]);
		const Emit = (id: number) => { for (const listener of listeners) listener(null, id); };
		const changed = vi.fn();
		const stop = solution["Watch"]!("/p.cseproject", changed) as () => void;
		await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith(SolutionChannels.Watch, "/p.cseproject"));
		await new Promise((resolve) => setTimeout(resolve, 0));
		Emit(7);
		Emit(99);
		expect(changed).toHaveBeenCalledTimes(1);
		stop();
		expect(invoke).toHaveBeenCalledWith(SolutionChannels.Unwatch, 7);
		Emit(7);
		expect(changed).toHaveBeenCalledTimes(1);
		// Stopped at once: the watch that comes back afterwards is stopped too.
		(solution["Watch"]!("/p.cseproject", changed) as () => void)();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(invoke).toHaveBeenCalledWith(SolutionChannels.Unwatch, 8);
		refuse = true;
		const refused = solution["Watch"]!("/nope", changed) as () => void;
		await new Promise((resolve) => setTimeout(resolve, 0));
		refused();
		vi.doUnmock("electron");
	});
});
