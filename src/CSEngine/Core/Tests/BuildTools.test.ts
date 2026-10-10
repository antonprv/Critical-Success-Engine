// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Writable } from "node:stream";
import type { PluginOption, ResolvedConfig, UserConfig, ViteDevServer } from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	CopyPhysicsWasm, CreatePhysicsWasmMiddleware, PhysicsWasmDefaultDirectory, PhysicsWasmPlugin, PhysicsWasmUrlPrefix, ResolvePhysicsWasmDirectory,
} from "../BuildTools/PhysicsWasmPlugin";

let sandbox = "";
beforeEach(() => { sandbox = mkdtempSync(join(tmpdir(), "physics-plugin-")); });
afterEach(() => { rmSync(sandbox, { recursive: true, force: true }); vi.restoreAllMocks(); vi.resetModules(); vi.doUnmock("node:fs"); vi.doUnmock("node:child_process"); vi.doUnmock("node:net"); });

function MakeFramework(): string {
	const directory = join(sandbox, "_framework");
	mkdirSync(join(directory, "supportFiles"), { recursive: true });
	writeFileSync(join(directory, "dotnet.js"), "export const dotnet = {};");
	writeFileSync(join(directory, "dotnet.native.wasm.gz"), Buffer.from([0x1f, 0x8b, 0x08]));
	writeFileSync(join(directory, "dotnet.native.wasm"), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
	writeFileSync(join(directory, "app.js.map"), "{}");
	writeFileSync(join(directory, "blazor.boot.json"), "{}");
	writeFileSync(join(directory, "System.Private.CoreLib.dll"), "MZ");
	writeFileSync(join(directory, "supportFiles", "nested.txt"), "nested");
	return directory;
}

class Sink extends Writable {
	public readonly chunks: Buffer[] = [];
	public override _write(chunk: Buffer, _encoding: string, done: () => void): void { this.chunks.push(chunk); done(); }
	public get text(): string { return Buffer.concat(this.chunks).toString("utf8"); }
	public finished(): Promise<void> { return new Promise((resolvePromise) => this.once("finish", () => resolvePromise())); }
}

function Request(directory: string, url: string) {
	const headers: Record<string, string> = {};
	const response = Object.assign(new Sink(), { setHeader: (name: string, value: string) => { headers[name] = value; } });
	const next = vi.fn();
	CreatePhysicsWasmMiddleware(directory)({ url }, response as never, next);
	return { response, headers, next };
}

describe("ResolvePhysicsWasmDirectory", () => {
	it("defaults to where `dotnet publish` of the physics bridge puts the runtime (the location the old build copied from)", () => {
		expect(PhysicsWasmDefaultDirectory).toBe("../Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework");
		expect(ResolvePhysicsWasmDirectory("/repo/Core", {})).toBe(resolve("/repo/Core", "../Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework"));
	});

	it("PHYSICS_WASM_DIR overrides it - relative to the project root, or absolute", () => {
		expect(ResolvePhysicsWasmDirectory("/repo/Core", { PHYSICS_WASM_DIR: "other/place" })).toBe(resolve("/repo/Core", "other/place"));
		expect(ResolvePhysicsWasmDirectory("/repo/Core", { PHYSICS_WASM_DIR: "/abs/place" })).toBe(resolve("/abs/place"));
	});

	it("an empty override means 'not set'", () => {
		expect(ResolvePhysicsWasmDirectory("/repo/Core", { PHYSICS_WASM_DIR: "" })).toBe(resolve("/repo/Core", PhysicsWasmDefaultDirectory));
	});

	it("reads process.env when no environment is given", () => {
		vi.stubEnv("PHYSICS_WASM_DIR", "/from/env");
		expect(ResolvePhysicsWasmDirectory("/repo/Core")).toBe(resolve("/from/env"));
	});
});

describe("physics runtime middleware (vite dev / vite preview)", () => {
	it("serves files under /physics-wasm/_framework/ with the right content types", async () => {
		const directory = MakeFramework();
		const cases: [string, string, Buffer][] = [
			["dotnet.js", "text/javascript", Buffer.from("export const dotnet = {};")],
			["dotnet.native.wasm", "application/wasm", Buffer.from([0x00, 0x61, 0x73, 0x6d])],
			["dotnet.native.wasm.gz", "application/gzip", Buffer.from([0x1f, 0x8b, 0x08])],
			["app.js.map", "application/json", Buffer.from("{}")],
			["blazor.boot.json", "application/json", Buffer.from("{}")],
			["System.Private.CoreLib.dll", "application/octet-stream", Buffer.from("MZ")],
			["supportFiles/nested.txt", "application/octet-stream", Buffer.from("nested")],
		];

		for (const [file, contentType, bytes] of cases) {
			const { response, headers, next } = Request(directory, `${PhysicsWasmUrlPrefix}${file}`);
			await response.finished();
			expect(headers["Content-Type"], file).toBe(contentType);
			expect(Buffer.concat(response.chunks).equals(bytes), file).toBe(true); // byte-exact, binary files included
			expect(next).not.toHaveBeenCalled();
		}
	});

	it("ignores a query string and decodes escaped names", async () => {
		const directory = MakeFramework();
		const { response, headers } = Request(directory, `${PhysicsWasmUrlPrefix}dotnet.js?v=123`);
		await response.finished();
		expect(headers["Content-Type"]).toBe("text/javascript");

		const escaped = Request(directory, `${PhysicsWasmUrlPrefix}supportFiles%2Fnested.txt`);
		await escaped.response.finished();
		expect(escaped.response.text).toBe("nested");
	});

	it("passes on anything that is not under the physics prefix (or has no url at all)", () => {
		const directory = MakeFramework();
		const other = Request(directory, "/index.html");
		expect(other.next).toHaveBeenCalledTimes(1);

		const next = vi.fn();
		CreatePhysicsWasmMiddleware(directory)({}, new Sink() as never, next);
		expect(next).toHaveBeenCalledTimes(1);
	});

	it("passes on missing files, directories, and anything that escapes the folder", () => {
		const directory = MakeFramework();
		writeFileSync(join(sandbox, "secret.txt"), "top secret");

		for (const url of [
			`${PhysicsWasmUrlPrefix}missing.dll`,
			`${PhysicsWasmUrlPrefix}supportFiles`,         // a directory
			PhysicsWasmUrlPrefix,                           // the folder itself
			`${PhysicsWasmUrlPrefix}../secret.txt`,
			`${PhysicsWasmUrlPrefix}..%2Fsecret.txt`,
			`${PhysicsWasmUrlPrefix}%2Fetc%2Fpasswd`,
		]) {
			const { next, response } = Request(directory, url);
			expect(next, url).toHaveBeenCalledTimes(1);
			expect(response.text, url).toBe("");
		}
	});

	it("the same folder is served by the plugin's dev-server hook", () => {
		const directory = MakeFramework();
		const plugin = PhysicsWasmPlugin(directory);
		const use = vi.fn();
		(plugin.configureServer as (server: ViteDevServer) => void)({ middlewares: { use } } as unknown as ViteDevServer);
		expect(use).toHaveBeenCalledTimes(1);
		expect(typeof use.mock.calls[0]![0]).toBe("function");
	});
});

describe("CopyPhysicsWasm (vite build)", () => {
	it("copies the whole runtime, nested folders included, to <out>/physics-wasm/_framework - the layout the old build produced", () => {
		const directory = MakeFramework();
		const out = join(sandbox, "dist");

		expect(CopyPhysicsWasm(directory, out)).toBe(true);
		const copied = join(out, "physics-wasm", "_framework");
		expect(readFileSync(join(copied, "dotnet.js"), "utf8")).toBe("export const dotnet = {};");
		expect(readFileSync(join(copied, "supportFiles", "nested.txt"), "utf8")).toBe("nested");
		expect([...readFileSync(join(copied, "dotnet.native.wasm.gz"))]).toEqual([0x1f, 0x8b, 0x08]);
	});

	it("a missing runtime is not an error - there is just nothing to copy", () => {
		expect(CopyPhysicsWasm(join(sandbox, "nowhere"), join(sandbox, "dist"))).toBe(false);
	});
});

describe("PhysicsWasmPlugin build hook", () => {
	const Config = (root: string, outDir: string) => {
		const info = vi.fn();
		return { config: { root, build: { outDir }, logger: { info } } as unknown as ResolvedConfig, info };
	};

	it("copies into the build output and says so", () => {
		const directory = MakeFramework();
		const plugin = PhysicsWasmPlugin(directory);
		const { config, info } = Config(sandbox, "dist");
		(plugin.configResolved as (c: ResolvedConfig) => void)(config);
		(plugin.writeBundle as () => void)();

		expect(readFileSync(join(sandbox, "dist", "physics-wasm", "_framework", "dotnet.js"), "utf8")).toContain("dotnet");
		expect(String(info.mock.calls[0]![0])).toContain("physics-wasm: copied");
	});

	it("reports (as info, not a warning) that the site will run without physics when there is no build", () => {
		const plugin = PhysicsWasmPlugin(join(sandbox, "nowhere"));
		const { config, info } = Config(sandbox, "dist");
		(plugin.configResolved as (c: ResolvedConfig) => void)(config);
		(plugin.writeBundle as () => void)();
		expect(String(info.mock.calls[0]![0])).toContain("no physics build");
	});

	it("is named for the build log", () => {
		expect(PhysicsWasmPlugin(sandbox).name).toBe("physics-wasm");
	});
});

describe("LogServerSidecar", () => {
	class FakeChild extends EventEmitter { public kill = vi.fn(); }

	async function Load(options: { scriptExists?: boolean; portTaken?: boolean; } = {}) {
		const child = new FakeChild();
		const spawn = vi.fn(() => child);
		vi.doMock("node:child_process", () => ({ spawn }));
		vi.doMock("node:fs", async (importOriginal) => ({ ...(await importOriginal<typeof import("node:fs")>()), existsSync: () => options.scriptExists ?? true }));
		vi.doMock("node:net", () => ({
			createConnection: () => {
				const socket = new EventEmitter() as EventEmitter & { destroy: () => void; };
				socket.destroy = vi.fn();
				queueMicrotask(() => socket.emit(options.portTaken ? "connect" : "error", new Error("refused")));
				return socket;
			},
		}));
		const module = await import("../BuildTools/LogServerSidecar.mjs");
		return { module, spawn, child };
	}

	it("starts Tools/LogServer.mjs with the current node, once", async () => {
		vi.spyOn(process, "once").mockImplementation(() => process);
		const { module, spawn } = await Load();
		await module.StartLogServerSidecar();
		await module.StartLogServerSidecar(); // already running
		expect(spawn).toHaveBeenCalledTimes(1);
		const [command, args, options] = spawn.mock.calls[0] as unknown as [string, string[], { stdio: string; }];
		expect(command).toBe(process.execPath);
		expect(args[0]).toMatch(/Tools[\\/]LogServer\.mjs$/);
		expect(options).toEqual({ stdio: "inherit" });
	});

	it("does not start when the script is not there, or something already listens on the port", async () => {
		const missing = await Load({ scriptExists: false });
		await missing.module.StartLogServerSidecar();
		expect(missing.spawn).not.toHaveBeenCalled();

		vi.resetModules();
		const taken = await Load({ portTaken: true });
		await taken.module.StartLogServerSidecar();
		expect(taken.spawn).not.toHaveBeenCalled();
	});

	it("stops the child on request, and forgets it when it exits on its own (so it can be started again)", async () => {
		vi.spyOn(process, "once").mockImplementation(() => process);
		const { module, spawn, child } = await Load();
		await module.StartLogServerSidecar();

		module.StopLogServerSidecar();
		expect(child.kill).toHaveBeenCalledTimes(1);
		module.StopLogServerSidecar(); // nothing running: harmless
		expect(child.kill).toHaveBeenCalledTimes(1);

		await module.StartLogServerSidecar();
		expect(spawn).toHaveBeenCalledTimes(2);
		child.emit("exit"); // the child dies by itself...
		module.StopLogServerSidecar();
		expect(child.kill).toHaveBeenCalledTimes(1); // ...so it is forgotten: nothing left to kill
		await module.StartLogServerSidecar();
		expect(spawn).toHaveBeenCalledTimes(3);
	});

	it("registers its shutdown hooks only once: exit kills the child, SIGINT/SIGTERM kill it and exit with the conventional codes", async () => {
		const handlers: Record<string, () => void> = {};
		const once = vi.spyOn(process, "once").mockImplementation(((event: string, handler: () => void) => { handlers[event] = handler; return process; }) as never);
		const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
		const { module, child } = await Load();
		await module.StartLogServerSidecar();
		module.StopLogServerSidecar();
		await module.StartLogServerSidecar();
		expect(once).toHaveBeenCalledTimes(3); // exit, SIGINT, SIGTERM - registered by the first start only

		handlers["exit"]!();
		expect(child.kill).toHaveBeenCalled();
		handlers["SIGINT"]!();
		expect(exit).toHaveBeenLastCalledWith(130);
		handlers["SIGTERM"]!();
		expect(exit).toHaveBeenLastCalledWith(143);
	});
});

describe("LogServerPlugin", () => {
	it("starts the sidecar with the dev server and stops it when the HTTP server closes", async () => {
		const start = vi.fn(() => Promise.resolve());
		const stop = vi.fn();
		vi.doMock("../BuildTools/LogServerSidecar.mjs", () => ({ StartLogServerSidecar: start, StopLogServerSidecar: stop }));
		const { LogServerPlugin } = await import("../BuildTools/LogServerPlugin");

		const plugin = LogServerPlugin();
		expect(plugin.name).toBe("log-server-sidecar");

		const once = vi.fn();
		(plugin.configureServer as (s: ViteDevServer) => void)({ httpServer: { once } } as unknown as ViteDevServer);
		expect(start).toHaveBeenCalledTimes(1);
		expect(once).toHaveBeenCalledWith("close", stop);

		// A dev server in middleware mode has no HTTP server of its own.
		expect(() => (plugin.configureServer as (s: ViteDevServer) => void)({ httpServer: null } as unknown as ViteDevServer)).not.toThrow();
		vi.doUnmock("../BuildTools/LogServerSidecar.mjs");
	});
});

describe("vite.config.ts", () => {
	async function ConfigFor(mode: string): Promise<UserConfig & { build: NonNullable<UserConfig["build"]>; }> {
		const { default: factory } = await import("../vite.config");
		const config = (factory as unknown as (env: { mode: string; command: string; }) => UserConfig)({ mode, command: "build" });
		if (!config.build) throw new Error("vite.config.ts has no build section");
		return config as UserConfig & { build: NonNullable<UserConfig["build"]>; };
	}

	it("production: __DEV__ is false, source maps are on, output goes where Core.esproj and CI expect it", async () => {
		const config = await ConfigFor("production");
		expect(config.define).toEqual({ __DEV__: "false" });
		expect(config.build.sourcemap).toBe(true);
		expect(config.build.outDir).toBe(resolve(process.cwd(), "../Binaries/Core"));
		expect(config.build.emptyOutDir).toBe(true);
		expect(config.worker).toMatchObject({ format: "es" });
		// The game's page.
		expect((config.build as { rolldownOptions?: { input?: unknown; }; }).rolldownOptions?.input).toEqual({
			index: resolve(process.cwd(), "index.html"),
		});
	});

	it("development builds keep __DEV__ true and skip source maps", async () => {
		const config = await ConfigFor("development");
		expect(config.define).toEqual({ __DEV__: "true" });
		expect(config.build.sourcemap).toBe(false);
	});

	it("wires the Vue, Quasar, physics and log-sidecar plugins and the dev/preview servers", async () => {
		const config = await ConfigFor("production");
		const names = ((config.plugins ?? []) as PluginOption[]).flat(3).map((p) => (p as { name?: string; } | null)?.name).filter(Boolean);
		expect(names).toEqual(expect.arrayContaining(["vite:vue", "physics-wasm", "log-server-sidecar"]));
		expect(names.some((n) => String(n).includes("quasar"))).toBe(true);
		// The project being built (virtual:cse/project) is read by the game logic worker: workers get the plugin too.
		expect(names).toContain("cse-project");
		// The UI plugin's page module brings the toolkit's styles, Tailwind kit included.
		expect(names.some((n) => String(n).includes("tailwindcss"))).toBe(true);
		const workerPlugins = await (config.worker!.plugins as () => PluginOption[])();
		expect(workerPlugins.flat(3).map((p) => (p as { name?: string; } | null)?.name)).toContain("cse-project");
		expect(config.server).toMatchObject({ host: "127.0.0.1", port: 5173, strictPort: true });
		expect(config.preview).toMatchObject({ host: "127.0.0.1", port: 4173, strictPort: true });
		expect(config.assetsInclude).toContain("**/*.glb");
		expect((config.build as { rolldownOptions?: { checks?: unknown; }; }).rolldownOptions?.checks).toEqual({ pluginTimings: false });
	});
});
