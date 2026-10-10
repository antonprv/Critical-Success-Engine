// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesignerChannels, ProjectChannels, RegisterDesignerIpc, RegisterProjectIpc, type IpcResult } from "../Source/Main/Ipc";
import { ProjectsService } from "../Source/Main/ProjectsService";

const Templates = resolve(__dirname, "../../../../Templates");
let sandbox = "";
beforeEach(() => { sandbox = mkdtempSync(join(tmpdir(), "cse-desktop-")); });
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));
const Service = () => new ProjectsService({ Registry: join(sandbox, "Projects.json"), TemplatesDirectory: Templates, Home: "/home/anton" });

describe("ProjectsService: the engine's registry and templates, for the project browser", () => {
	it("lists the templates (with their genres) and nothing registered at first; new projects go to ~/CSE Projects", () => {
		const service = Service();
		expect(service.Templates().map((t) => [t.Name, t.Genre])).toEqual(expect.arrayContaining([["Blank", "Blank"], ["CoinHunt", "Collectathon"], ["TopDown", "TopDown"]]));
		expect(service.List()).toEqual([]);
		expect(service.DefaultLocation()).toBe(join("/home/anton", "CSE Projects"));
		expect(new ProjectsService({ Registry: "r", TemplatesDirectory: Templates }).DefaultLocation()).toContain("CSE Projects");
	});

	it("creates a project from a template on disk and registers it; a known name is taken; removing forgets it (the files stay)", () => {
		const service = Service();
		expect(service.NameProblem("Moonrise")).toBeNull();
		const { File } = service.Create({ Template: "CoinHunt", Name: "Moonrise", Location: sandbox });
		expect(File).toBe(join(sandbox, "Moonrise", "Moonrise.cseproject"));
		expect(JSON.parse(readFileSync(File, "utf8"))).toMatchObject({ Name: "Moonrise", Template: "CoinHunt", Genre: "Collectathon" });
		expect(service.List()).toMatchObject([{ Name: "Moonrise", File, Template: "CoinHunt", Genre: "Collectathon", Exists: true }]);
		expect(service.NameProblem("Moonrise")).toBe("There is a project called Moonrise already");
		expect(service.NameProblem("bad name")).not.toBeNull();
		expect(() => service.Create({ Template: "Nope", Name: "Other", Location: sandbox })).toThrow('There is no template "Nope"');
		service.Remove(File);
		expect([service.List(), service.Exists(File), existsSync(File)]).toEqual([[], true, true]);
	});
});

describe("the project browser's IPC", () => {
	function Wire() {
		const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<IpcResult<unknown>>>();
		const shell = { PickFolder: vi.fn(async () => "/picked"), OpenInDesigner: vi.fn(async () => undefined) };
		RegisterProjectIpc({ handle: (channel: string, handler: never) => { handlers.set(channel, handler); } }, Service(), shell);
		const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!(null, ...args);
		return { handlers, shell, call };
	}

	it("answers every channel with its value, and a failure with its message", async () => {
		const { handlers, shell, call } = Wire();
		expect([...handlers.keys()]).toEqual(Object.values(ProjectChannels));
		expect(await call(ProjectChannels.List)).toEqual({ ok: true, value: [] });
		expect(((await call(ProjectChannels.Templates)) as { value: unknown[]; }).value.length).toBeGreaterThan(3);
		expect(await call(ProjectChannels.NameProblem, "Fine")).toEqual({ ok: true, value: null });
		expect(await call(ProjectChannels.DefaultLocation)).toEqual({ ok: true, value: join("/home/anton", "CSE Projects") });
		expect(await call(ProjectChannels.PickFolder)).toEqual({ ok: true, value: "/picked" });
		const created = await call(ProjectChannels.Create, { Template: "Blank", Name: "Ball", Location: sandbox });
		expect(created).toEqual({ ok: true, value: { File: join(sandbox, "Ball", "Ball.cseproject") } });
		expect(await call(ProjectChannels.Create, { Template: "Blank", Name: "Ball", Location: sandbox })).toEqual({ ok: false, error: `${join(sandbox, "Ball")} already exists` });
		expect(await call(ProjectChannels.OpenInDesigner, "/x.cseproject")).toEqual({ ok: true, value: undefined });
		expect(shell.OpenInDesigner).toHaveBeenCalledWith("/x.cseproject");
		expect(await call(ProjectChannels.Remove, join(sandbox, "Ball", "Ball.cseproject"))).toEqual({ ok: true, value: undefined });
	});
});

describe("the preload: what the pages may call", () => {
	it("puts the project calls on window.cse; a failure in the main process comes back as an Error with its message", async () => {
		const exposed: Record<string, { projects: Record<string, (...args: unknown[]) => Promise<unknown>>; }> = {};
		const invoke = vi.fn(async (channel: string) => (channel === ProjectChannels.Create ? { ok: false, error: "it exists" } : { ok: true, value: channel }));
		vi.doMock("electron", () => ({ contextBridge: { exposeInMainWorld: (key: string, api: never) => { exposed[key] = api; } }, ipcRenderer: { invoke } }));
		await import("../Source/Preload/Preload");
		const projects = exposed["cse"]!.projects;
		expect(Object.keys(projects)).toEqual(["List", "Templates", "NameProblem", "DefaultLocation", "PickFolder", "Create", "Remove", "OpenInDesigner"]);
		const designer = (exposed["cse"] as unknown as { designer: Record<string, (...args: unknown[]) => Promise<unknown>>; }).designer;
		for (const call of Object.values(designer)) await call("/p.cseproject", "Hud");
		expect(invoke.mock.calls.slice(-Object.keys(DesignerChannels).length).map((c) => c[0])).toEqual(Object.values(DesignerChannels));
		expect(invoke).toHaveBeenCalledWith(DesignerChannels.Read, "/p.cseproject", "Hud");
		invoke.mockClear();
		for (const [name, call] of Object.entries(projects)) {
			if (name === "Create") continue;
			await call("arg");
		}
		expect(invoke.mock.calls.map((c) => c[0])).toEqual(Object.values(ProjectChannels).filter((c) => c !== ProjectChannels.Create));
		expect(invoke).toHaveBeenCalledWith(ProjectChannels.NameProblem, "arg");
		await expect(projects["Create"]!({ Name: "X" })).rejects.toThrow("it exists");
		vi.doUnmock("electron");
	});
});

describe("the main process", () => {
	function FakeElectron(picked: { canceled: boolean; filePaths: string[]; }) {
		const windows: { title: string; url: string; preload: string; isolated: boolean; }[] = [];
		const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<IpcResult<unknown>>>();
		const appEvents = new Map<string, () => void>();
		let ready: () => void = () => undefined;
		const electron = {
			app: { whenReady: () => new Promise<void>((resolve) => { ready = resolve; }), on: (name: string, handler: () => void) => appEvents.set(name, handler), quit: vi.fn() },
			BrowserWindow: class {
				public constructor(options: { title: string; webPreferences: { preload: string; contextIsolation: boolean; }; }) {
					windows.push({ title: options.title, url: "", preload: options.webPreferences.preload, isolated: options.webPreferences.contextIsolation });
				}
				public setMenuBarVisibility(): void { /* no menu bar */ }
				public loadURL(url: string): Promise<void> { windows.at(-1)!.url = url; return Promise.resolve(); }
			},
			ipcMain: { handle: (channel: string, handler: never) => handlers.set(channel, handler) },
			dialog: { showOpenDialog: vi.fn(async () => picked) },
		};
		return { electron, windows, handlers, appEvents, ready: () => ready() };
	}

	it("opens the project browser when ready; a project opens in a UI Designer window; the folder dialog; closing every window quits", async () => {
		vi.stubEnv("CSE_PROJECTS_REGISTRY", join(sandbox, "Projects.json"));
		vi.stubEnv("CSE_UI_DESIGNER_URL", "http://127.0.0.1:5175/");
		const fake = FakeElectron({ canceled: false, filePaths: ["/chosen"] });
		vi.doMock("electron", () => fake.electron);
		vi.resetModules();
		await import("../Source/Main/Main");
		expect(fake.windows).toEqual([]);
		fake.ready();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(fake.windows[0]).toMatchObject({ title: "Critical Success Engine - Projects", isolated: true });
		expect(fake.windows[0]!.url).toMatch(/^file:\/\/.*\/Modules\/Editor\/ProjectBrowser\/index\.html$/);
		expect(fake.windows[0]!.preload).toMatch(/preload\.cjs$/);
		expect(await fake.handlers.get(ProjectChannels.PickFolder)!(null)).toEqual({ ok: true, value: "/chosen" });
		await fake.handlers.get(ProjectChannels.OpenInDesigner)!(null, "/games/Moon/Moon.cseproject");
		expect(fake.windows[1]).toMatchObject({ title: "UI Designer", url: "http://127.0.0.1:5175/?project=%2Fgames%2FMoon%2FMoon.cseproject" });
		expect(await fake.handlers.get(ProjectChannels.List)!(null)).toEqual({ ok: true, value: [] }); // the registry from CSE_PROJECTS_REGISTRY
		expect(await fake.handlers.get(DesignerChannels.IdProblem)!(null, "/nowhere.cseproject", "Hud")).toMatchObject({ ok: false }); // the designer's calls are there too
		fake.appEvents.get("window-all-closed")!();
		expect(fake.electron.app.quit).toHaveBeenCalled();
		vi.doUnmock("electron");
	});

	it("a cancelled folder dialog answers nothing; dev servers and the templates folder come from the environment", async () => {
		vi.stubEnv("CSE_PROJECT_BROWSER_URL", "http://127.0.0.1:5177/");
		vi.stubEnv("CSE_TEMPLATES_DIR", Templates);
		vi.stubEnv("CSE_PROJECTS_REGISTRY", join(sandbox, "Projects.json"));
		const fake = FakeElectron({ canceled: true, filePaths: [] });
		vi.doMock("electron", () => fake.electron);
		vi.resetModules();
		await import("../Source/Main/Main");
		fake.ready();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(fake.windows[0]!.url).toBe("http://127.0.0.1:5177/");
		expect(await fake.handlers.get(ProjectChannels.PickFolder)!(null)).toEqual({ ok: true, value: null });
		const templates = await fake.handlers.get(ProjectChannels.Templates)!(null) as { value: { Name: string; }[]; };
		expect(templates.value.map((t) => t.Name)).toContain("Blank");
		const empty = FakeElectron({ canceled: false, filePaths: [] }); // "chosen" with no path: nothing
		vi.doMock("electron", () => empty.electron);
		vi.resetModules();
		await import("../Source/Main/Main");
		empty.ready();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(await empty.handlers.get(ProjectChannels.PickFolder)!(null)).toEqual({ ok: true, value: null });
		vi.doUnmock("electron");
	});
});

describe("the designer's IPC, and starting on the designer alone", () => {
	it("answers the designer's calls on a project", async () => {
		const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<IpcResult<unknown>>>();
		const { DesignerService } = await import("../Source/Main/DesignerService");
		RegisterDesignerIpc({ handle: (channel: string, handler: never) => { handlers.set(channel, handler); } }, new DesignerService());
		const project = Service().Create({ Template: "Blank", Name: "Ball", Location: sandbox }).File;
		expect([...handlers.keys()]).toEqual(Object.values(DesignerChannels));
		expect(await handlers.get(DesignerChannels.Open)!(null, project)).toMatchObject({ ok: true, value: { Name: "Ball" } });
		expect(((await handlers.get(DesignerChannels.CodeFiles)!(null, project)) as { value: string[]; }).value).toContain("Source/BallModule.ts");
		expect(await handlers.get(DesignerChannels.CodeWrite)!(null, project, "Source/New.ts", "export {};\n")).toEqual({ ok: true, value: undefined });
		expect(await handlers.get(DesignerChannels.CodeRead)!(null, project, "Source/New.ts")).toEqual({ ok: true, value: "export {};\n" });
		expect(await handlers.get(DesignerChannels.IdProblem)!(null, project, "Hud")).toEqual({ ok: true, value: null });
		const layout = JSON.stringify({ Format: 1, Name: "Hud", Script: "", Root: { Name: "Root", Type: "canvas", X: 0, Y: 0, Width: 800, Height: 500, Props: {}, Children: [] } });
		expect(await handlers.get(DesignerChannels.Save)!(null, project, { Id: "Hud", Layout: layout })).toMatchObject({ ok: true });
		expect(await handlers.get(DesignerChannels.Read)!(null, project, "Hud")).toMatchObject({ ok: true });
	});

	it("--ui-designer opens the designer on its own (it will ask for the project)", async () => {
		vi.stubEnv("CSE_PROJECTS_REGISTRY", join(sandbox, "Projects.json"));
		const argv = process.argv;
		process.argv = [...argv, "--ui-designer"];
		const windows: { title: string; url: string; }[] = [];
		let ready: () => void = () => undefined;
		vi.doMock("electron", () => ({
			app: { whenReady: () => new Promise<void>((resolve) => { ready = resolve; }), on: () => undefined, quit: vi.fn() },
			BrowserWindow: class {
				public constructor(options: { title: string; }) { windows.push({ title: options.title, url: "" }); }
				public setMenuBarVisibility(): void { /* none */ }
				public loadURL(url: string): Promise<void> { windows.at(-1)!.url = url; return Promise.resolve(); }
			},
			ipcMain: { handle: () => undefined },
			dialog: { showOpenDialog: vi.fn() },
		}));
		vi.resetModules();
		await import("../Source/Main/Main");
		ready();
		await new Promise((resolve) => setTimeout(resolve, 0));
		process.argv = argv;
		expect(windows).toHaveLength(1);
		expect(windows[0]!.title).toBe("UI Designer");
		expect(windows[0]!.url).toMatch(/UIDesigner\/index\.html$/); // no ?project: it asks
		vi.doUnmock("electron");
	});
});
