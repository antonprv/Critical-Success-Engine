// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { LoadingPhase, ModuleThread, ModuleType } from "../Source/Engine/Modules/ModuleManager";
import { Genre, Genres, ParseProject, ProjectFileVersion, SerializeProject, type CseProject } from "../Source/Engine/Projects/ProjectDescriptor";

const Valid = (): CseProject => ({
	FileVersion: ProjectFileVersion,
	Name: "Starfall",
	Description: "A first person shooter",
	Template: "FirstPerson",
	Genre: Genre.FirstPerson,
	Modules: [{ Name: "Starfall", Type: ModuleType.Runtime, LoadingPhase: LoadingPhase.Default, Primary: true, Dependencies: ["Engine"], Thread: ModuleThread.GameLogic, Entry: "Source/StarfallModule.ts" }],
	Plugins: [{ Name: "UI", Enabled: true }],
	Ui: { Manifest: "Content/UI/Ui.manifest.json" },
	Input: { Manifests: [{ Id: "Starfall", Path: "Content/Input/Starfall.input.json" }], Default: "Starfall" },
	Data: [{ Id: "StarfallRules", Path: "Content/Data/StarfallRules.csedata" }],
});

describe("project descriptors (.cseproject)", () => {
	it("round-trip through text; genres cover the templates", () => {
		expect(ParseProject(SerializeProject(Valid()))).toEqual(Valid());
		expect(Genres).toEqual([Genre.Blank, Genre.FirstPerson, Genre.ThirdPerson, Genre.TopDown, Genre.Collectathon]);
		expect(SerializeProject(Valid())).toContain('\n  "Name": "Starfall",');
	});

	it("fill in what an older or hand-written file leaves out", () => {
		const minimal = ParseProject(JSON.stringify({ FileVersion: 1, Name: "Tiny", Modules: [{ Name: "Tiny", Entry: "Source/TinyModule.ts" }] }));
		expect(minimal).toEqual({
			FileVersion: 1, Name: "Tiny", Description: "", Template: "", Genre: Genre.Blank,
			Modules: [{ Name: "Tiny", Type: ModuleType.Runtime, LoadingPhase: LoadingPhase.Default, Primary: false, Dependencies: [], Thread: ModuleThread.GameLogic, Entry: "Source/TinyModule.ts" }],
			Plugins: [], Ui: { Manifest: "Content/UI/Ui.manifest.json" }, Input: { Manifests: [], Default: "" }, Data: [],
		});
	});

	it("say exactly what is wrong", () => {
		const reason = (patch: Record<string, unknown>) => {
			try {
				ParseProject(JSON.stringify({ ...Valid(), ...patch }));
				return "parsed";
			} catch (error) {
				return (error as Error).message;
			}
		};
		expect(() => ParseProject("{")).toThrow("Not a project file: not JSON");
		expect(reason({ FileVersion: 99 })).toBe("Not a project file: FileVersion 99 is newer than this engine understands (1)");
		expect(reason({ Name: "has space" })).toBe('Not a project file: Name "has space" must be an identifier (letters, digits, _; not starting with a digit)');
		expect(reason({ Name: 5 })).toBe("Not a project file: Name must be a string");
		expect(reason({ Genre: "Racing" })).toBe('Not a project file: unknown Genre "Racing"');
		expect(reason({ Modules: "x" })).toBe("Not a project file: Modules must be a list");
		expect(reason({ Modules: [{ Name: "A" }] })).toBe('Not a project file: module "A" has no Entry');
		expect(reason({ Modules: [{ Entry: "x.ts" }] })).toBe("Not a project file: a module has no Name");
		expect(reason({ Modules: [{ Name: "A", Entry: "a.ts", Type: "Server" }] })).toBe('Not a project file: module "A" has an unknown Type "Server"');
		expect(reason({ Modules: [{ Name: "A", Entry: "a.ts", LoadingPhase: "Soon" }] })).toBe('Not a project file: module "A" has an unknown LoadingPhase "Soon"');
		expect(reason({ Modules: [{ Name: "A", Entry: "a.ts", Primary: true }, { Name: "B", Entry: "b.ts", Primary: true }] })).toBe("Not a project file: more than one primary game module");
		expect(reason({ Plugins: [{ Name: 1 }] })).toBe("Not a project file: a plugin reference needs a Name");
		expect(reason({ Ui: { Manifest: 7 } })).toBe("Not a project file: Ui.Manifest must be a path");
		expect(reason({ Description: 3, Template: 4 })).toBe("parsed"); // optional text of the wrong kind is just dropped
	});
});

describe("project descriptors: what may be missing", () => {
	it("no FileVersion means the current one; no Modules means none; JSON that isn't an object has no Name", () => {
		const project = ParseProject(JSON.stringify({ Name: "Bare" }));
		expect([project.FileVersion, project.Modules]).toEqual([ProjectFileVersion, []]);
		expect(() => ParseProject("[]")).toThrow("Not a project file: Name must be a string");
	});
});

describe("project modules: threads", () => {
	it("Thread defaults to GameLogic; Main and Any are accepted; anything else is named", () => {
		const read = (thread: unknown) => ParseProject(JSON.stringify({ Name: "P", Modules: [{ Name: "M", Entry: "m.ts", ...(thread === undefined ? {} : { Thread: thread }) }] })).Modules[0]!.Thread;
		expect([read(undefined), read("Main"), read("Any"), read("GameLogic")]).toEqual(["GameLogic", "Main", "Any", "GameLogic"]);
		expect(() => read("Render")).toThrow('Not a project file: module "M" has an unknown Thread "Render"');
	});
});

describe("plugin descriptors (.cseplugin)", () => {
	it("read like a project's modules, with the plugin's own fields; problems are named", async () => {
		const { ParsePlugin } = await import("../Source/Engine/Projects/ProjectDescriptor");
		const plugin = ParsePlugin(JSON.stringify({
			FileVersion: 1, Name: "UI", FriendlyName: "UI documents", Version: "1.2", Description: "d", Category: "UI",
			Modules: [{ Name: "UIHost", Thread: "Main", Entry: "Source/Host.ts" }], Plugins: [{ Name: "Other" }],
		}));
		expect(plugin).toEqual({
			FileVersion: 1, Name: "UI", FriendlyName: "UI documents", Version: "1.2", Description: "d", Category: "UI", EnabledByDefault: false,
			Modules: [{ Name: "UIHost", Type: ModuleType.Runtime, LoadingPhase: LoadingPhase.Default, Primary: false, Dependencies: [], Thread: ModuleThread.Main, Entry: "Source/Host.ts" }],
			Plugins: [{ Name: "Other", Enabled: true }],
		});
		expect(ParsePlugin(JSON.stringify({ Name: "Bare", EnabledByDefault: true }))).toMatchObject({ FriendlyName: "Bare", Version: "1.0", Description: "", Category: "", EnabledByDefault: true, Modules: [], Plugins: [] });
		expect(() => ParsePlugin("x")).toThrow("Not a plugin file: not JSON");
		expect(() => ParsePlugin("{}")).toThrow("Not a plugin file: Name must be a string");
		expect(() => ParsePlugin("[]")).toThrow("Not a plugin file: Name must be a string");
		expect(() => ParsePlugin(JSON.stringify({ Name: "P", Modules: [{ Name: "M" }] }))).toThrow('Not a plugin file: module "M" has no Entry');
	});
});

describe("project descriptors: input manifests", () => {
	it("list the project's input manifests by Id; the default is named, or the first", () => {
		const read = (input: unknown) => ParseProject(JSON.stringify({ Name: "P", Input: input })).Input;
		expect(read({ Manifests: [{ Id: "A", Path: "a.json" }, { Id: "B", Path: "b.json" }], Default: "B" }).Default).toBe("B");
		expect(read({ Manifests: [{ Id: "A", Path: "a.json" }] }).Default).toBe("A");
		expect(read(undefined)).toEqual({ Manifests: [], Default: "" });
		const reason = (input: unknown) => { try { read(input); return "parsed"; } catch (e) { return (e as Error).message; } };
		expect(reason({ Manifests: "x" })).toBe("Not a project file: Input.Manifests must be a list");
		expect(reason({ Manifests: [{ Path: "a" }] })).toBe("Not a project file: an input manifest has no Id");
		expect(reason({ Manifests: [{ Id: "A" }] })).toBe('Not a project file: input manifest "A" has no Path');
		expect(reason({ Manifests: [{ Id: "A", Path: "a" }, { Id: "A", Path: "b" }] })).toBe('Not a project file: two input manifests are called "A"');
		expect(reason({ Manifests: [{ Id: "A", Path: "a" }], Default: "Z" })).toBe('Not a project file: Input.Default "Z" is not one of its input manifests');
	});
});

describe("project descriptors: data assets", () => {
	it("list the project's .csedata files by Id; problems are named", () => {
		const read = (data: unknown) => ParseProject(JSON.stringify({ Name: "P", Data: data })).Data;
		expect(read([{ Id: "A", Path: "a.csedata" }])).toEqual([{ Id: "A", Path: "a.csedata" }]);
		expect(read(undefined)).toEqual([]);
		const reason = (data: unknown) => { try { read(data); return "parsed"; } catch (e) { return (e as Error).message; } };
		expect(reason("x")).toBe("Not a project file: Data must be a list");
		expect(reason([{ Path: "a" }])).toBe("Not a project file: a data asset has no Id");
		expect(reason([{ Id: "A" }])).toBe('Not a project file: data asset "A" has no Path');
		expect(reason([{ Id: "A", Path: "a" }, { Id: "A", Path: "b" }])).toBe('Not a project file: two data assets are called "A"');
		expect(reason([{ Id: "a b", Path: "a" }])).toBe('Not a project file: data asset Id "a b" must be an identifier');
	});
});
