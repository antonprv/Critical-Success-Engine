// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DefaultTypesPackages, EngineTypes, EngineTypesPlugin, EngineTypesVirtualId } from "../BuildTools/EngineTypes";

describe("EngineTypes: the engine's declarations, for the code editor's TypeScript", () => {
	const types = EngineTypes(DefaultTypesPackages());
	const at = (path: string) => types[`file:///node_modules/${path}`];

	it("are the packages' sources as .d.ts, where an import of them looks (node_modules/@cse/...)", () => {
		expect(Object.keys(types).every((path) => path.startsWith("file:///node_modules/@cse/") && path.endsWith(".d.ts"))).toBe(true);
		expect(at("@cse/core/Engine/Core/Component.d.ts")).toMatch(/export declare abstract class Component/);
		expect(at("@cse/core/Engine/Math/Vec3.d.ts")).toMatch(/export declare class Vec3/);
		expect(at("@cse/ui/Runtime/GameUi.d.ts")).toMatch(/export declare class GameUi/);
		expect(Object.keys(types).some((path) => /\/Tests\/|\.test\.d\.ts$/.test(path))).toBe(false); // the sources only
	});

	it("the export maps' short names lead to their files (the editor's TypeScript doesn't read export maps)", () => {
		expect(at("@cse/core/modules.d.ts")).toBe('export * from "./Engine/Modules/ModuleManager";\n');
		expect(at("@cse/core/events.d.ts")).toBe('export * from "./Engine/Core/EventHub";\n');
		expect(at("@cse/ui/game.d.ts")).toBe('export * from "./Runtime/GameUiModule";\n');
		expect(at("@cse/ui/index.d.ts")).toMatch(/export \* from "\.\/Documents\/UiDocument"/); // "." is the package's own index
	});

	it("comes to the editor as a virtual module of the build", () => {
		const plugin = EngineTypesPlugin(() => ({ "file:///node_modules/@cse/x.d.ts": "export {};\n" }));
		expect(plugin.resolveId(EngineTypesVirtualId)).toBe(`\0${EngineTypesVirtualId}`);
		expect(plugin.resolveId("other")).toBeUndefined();
		expect(plugin.load(`\0${EngineTypesVirtualId}`)).toBe('export default {"file:///node_modules/@cse/x.d.ts":"export {};\\n"};');
		expect(plugin.load("other")).toBeUndefined();
		const made: string[] = [];
		const counted = EngineTypesPlugin(() => { made.push("once"); return {}; });
		counted.load(`\0${EngineTypesVirtualId}`);
		counted.load(`\0${EngineTypesVirtualId}`);
		expect(made).toEqual(["once"]); // made once per build
	});
	it("works for any package: one without an export map has its sources only (tests left out)", () => {
		const root = mkdtempSync(join(tmpdir(), "cse-types-"));
		mkdirSync(join(root, "Source"));
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@x/y" }));
		writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, noEmitOnError: true, module: "ESNext", target: "ES2022" }, include: ["Source/**/*.ts"] }));
		writeFileSync(join(root, "Source/Speed.ts"), "export const Speed: number = 6;\n");
		writeFileSync(join(root, "Source/Speed.test.ts"), "export {};\n");
		expect(EngineTypes([{ Name: "@x/y", Root: root, Sources: "Source" }])).toEqual({ "file:///node_modules/@x/y/Speed.d.ts": "export declare const Speed: number;\n" });
		rmSync(root, { recursive: true, force: true });
	});
}, 120_000);
