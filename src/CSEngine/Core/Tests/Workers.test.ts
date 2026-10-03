// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The worker entry modules ("shells"): each one wires `self`'s messages to the engine pieces. Tests give them a fake `self`,
// import them fresh, and talk to them exactly the way the main thread and the other workers do.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioMsg, GameLogicMsg, PhysicsMsg, PhysState, RenderMsg, RendOpType, SoundAction, SoundType, UiMsg } from "../Source/Workers/Common/CommonEnums";
import { FakePort } from "./Harness";
import { SilenceConsole } from "./helpers";

type Listener = (event: { data: unknown; }) => void;

/** A stand-in for a worker's global scope. */
class FakeSelf {
	public readonly location = { hostname: "test.invalid" };
	public onmessage: Listener | null = null;
	public readonly posted: { message: unknown; transfer?: Transferable[] | undefined; }[] = [];
	private readonly _listeners: Record<string, Listener[]> = {};
	public postMessage(message: unknown, transfer?: Transferable[]): void { this.posted.push({ message, transfer }); }
	public addEventListener(type: string, listener: Listener): void { (this._listeners[type] ??= []).push(listener); }
	public Send(data: unknown): void {
		this.onmessage?.({ data });
		for (const listener of this._listeners["message"] ?? []) listener({ data });
	}
}

let fakeSelf: FakeSelf;
beforeEach(() => {
	vi.resetModules();
	fakeSelf = new FakeSelf();
	vi.stubGlobal("self", fakeSelf);
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
	vi.useRealTimers();
	vi.doUnmock("../Source/Engine/Runtime/GameLogicRuntime");
	vi.doUnmock("../Source/Workers/Audio/AudioBank");
	vi.doUnmock("../Source/Workers/Physics/PhysicsWasmLoader");
	vi.doUnmock("../Source/Workers/Physics/PhysicsWorld");
	vi.doUnmock("../Source/Workers/Render/RenderScene");
	vi.doUnmock("../Source/Workers/Render/EntityMeshRegistry");
});

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe("UiWorker", () => {
	it("creates the UI controller on init and routes both directions; messages before init are ignored", async () => {
		await import("../Source/Workers/UiWorker");
		expect(() => fakeSelf.Send({ type: UiMsg.PointerLock, locked: true })).not.toThrow(); // no controller yet

		const gameLogic = new FakePort();
		fakeSelf.Send({ type: UiMsg.Init, gameLogicPort: gameLogic });

		gameLogic.Receive({ type: UiMsg.Scenes, scenes: [{ id: "a", name: "A", description: "" }] });
		const patches = fakeSelf.posted.map((p) => p.message as { type: UiMsg; patch?: { menu?: { scenes?: unknown[]; }; }; });
		expect(patches.some((m) => m.type === UiMsg.State && m.patch?.menu?.scenes?.length === 1)).toBe(true);

		gameLogic.Receive({ type: UiMsg.LoadFinished, sceneId: "a" }); // booting is over: the menu takes picks now
		fakeSelf.Send({ type: UiMsg.SelectScene, sceneId: "a" });
		expect(gameLogic.sent).toContainEqual({ type: UiMsg.LoadScene, sceneId: "a" });
	});
});

describe("GameLogicWorker", () => {
	function MockRuntime(boot: () => Promise<void> = () => Promise.resolve()) {
		const instances: { ports: unknown; handled: unknown[]; }[] = [];
		vi.doMock("../Source/Engine/Runtime/GameLogicRuntime", () => ({
			GameLogicRuntime: class {
				public handled: unknown[] = [];
				public constructor(public ports: unknown) { instances.push(this as never); }
				public Boot = boot;
				public HandleMainMessage(message: unknown): void { this.handled.push(message); }
			},
		}));
		return instances;
	}

	it("builds the runtime with the four ports on init, boots it, and forwards later main-thread messages", async () => {
		const instances = MockRuntime();
		await import("../Source/Workers/GameLogicWorker");
		fakeSelf.Send({ type: GameLogicMsg.Input, event: {} }); // before init: dropped

		const ports = { renderPort: new FakePort(), physicsPort: new FakePort(), audioPort: new FakePort(), uiPort: new FakePort() };
		fakeSelf.Send({ type: GameLogicMsg.Init, ...ports });
		expect(instances).toHaveLength(1);
		expect(instances[0]!.ports).toEqual({ render: ports.renderPort, physics: ports.physicsPort, audio: ports.audioPort, ui: ports.uiPort });

		fakeSelf.Send({ type: GameLogicMsg.Input, event: { kind: 1, code: "KeyW" } });
		expect(instances[0]!.handled).toEqual([{ type: GameLogicMsg.Input, event: { kind: 1, code: "KeyW" } }]);
	});

	it("logs a failed boot instead of losing it", async () => {
		const log = SilenceConsole();
		MockRuntime(() => Promise.reject(new Error("no scenes")));
		await import("../Source/Workers/GameLogicWorker");
		fakeSelf.Send({ type: GameLogicMsg.Init, renderPort: new FakePort(), physicsPort: new FakePort(), audioPort: new FakePort(), uiPort: new FakePort() });
		await flush();
		expect(String(log.error.mock.calls[0]![0])).toContain("[GameLogicWorker] boot failed:");
	});

	it("registers the game's scenes", async () => {
		const { SceneRegistry } = await import("../Source/Engine/Scenes/SceneRegistry");
		const register = vi.spyOn(SceneRegistry.prototype, "Register");
		MockRuntime();
		await import("../Source/Workers/GameLogicWorker");
		expect(register.mock.calls.map((c) => (c[0] as { id: string; }).id)).toEqual(expect.arrayContaining(["bouncing-ball", "character-test", "coin-hunt"]));
	});
});

describe("AudioWorker", () => {
	async function Start(resolve: (id: string) => unknown) {
		vi.doMock("../Source/Workers/Audio/AudioBank", () => ({ AudioBank: class { public Resolve = vi.fn((id: string) => Promise.resolve(resolve(id))); } }));
		await import("../Source/Workers/AudioWorker");
		const gameLogic = new FakePort();
		fakeSelf.Send({ type: AudioMsg.Init, gameLogicPort: gameLogic });
		return gameLogic;
	}

	it("decoded sounds go to the main thread with their channel buffers transferred", async () => {
		const left = new Float32Array([0.1]), right = new Float32Array([0.2]);
		const gameLogic = await Start(() => ({ kind: SoundType.Pcm, sampleRate: 48000, channels: [left, right] }));
		gameLogic.Receive({ action: SoundAction.PlaySound, soundId: "coin", position: [1, 2, 3] });
		await flush();

		expect(fakeSelf.posted[0]!.message).toMatchObject({ action: SoundAction.PlaySound, soundId: "coin", position: [1, 2, 3], sound: { kind: SoundType.Pcm } });
		expect(fakeSelf.posted[0]!.transfer).toEqual([left.buffer, right.buffer]);
	});

	it("encoded sounds transfer their single buffer; unknown sounds and other actions send nothing", async () => {
		const data = new ArrayBuffer(4);
		const gameLogic = await Start((id) => (id === "known" ? { kind: SoundType.Encoded, data } : null));
		gameLogic.Receive({ action: SoundAction.PlaySound, soundId: "unknown" });
		gameLogic.Receive({ action: 99, soundId: "known" });
		gameLogic.Receive({ action: SoundAction.PlaySound, soundId: "known" });
		await flush();

		expect(fakeSelf.posted).toHaveLength(1);
		expect(fakeSelf.posted[0]!.transfer).toEqual([data]);
	});

	it("ignores messages it does not know", async () => {
		await Start(() => null);
		expect(() => fakeSelf.Send({ type: "something-else" })).not.toThrow();
	});
});

describe("AudioBank", () => {
	async function Bank(options: { offline?: unknown; } = {}) {
		if ("offline" in options) (fakeSelf as unknown as { OfflineAudioContext?: unknown; }).OfflineAudioContext = options.offline;
		const { AudioBank } = await import("../Source/Workers/Audio/AudioBank");
		const bank = new AudioBank();
		(bank as unknown as { _soundUrls: Record<string, string>; })._soundUrls["coin"] = "/assets/audio/coin.wav";
		const fetchMock = vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3, 4]))));
		vi.stubGlobal("fetch", fetchMock);
		return { bank, fetchMock };
	}

	it("a sound with no registered URL is reported and resolves to nothing", async () => {
		const log = SilenceConsole();
		const { bank } = await Bank();
		expect(await bank.Resolve("missing")).toBeNull();
		expect(String(log.warn.mock.calls[0]![0])).toContain('no URL registered for sound "missing"');
	});

	it("without in-worker decoding the raw file is handed over (a copy - the cache keeps its own), fetched only once", async () => {
		const { bank, fetchMock } = await Bank();
		const first = await bank.Resolve("coin");
		const second = await bank.Resolve("coin");
		expect(first).toMatchObject({ kind: SoundType.Encoded });
		expect([...new Uint8Array((first as { data: ArrayBuffer; }).data)]).toEqual([1, 2, 3, 4]);
		expect((first as { data: ArrayBuffer; }).data).not.toBe((second as { data: ArrayBuffer; }).data);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("decodes in the worker when it can, and serves copies of the decoded channels from then on", async () => {
		const decodeAudioData = vi.fn(() => Promise.resolve({ numberOfChannels: 2, sampleRate: 44100, getChannelData: (i: number) => new Float32Array([i, i]) }));
		const offline = vi.fn(function (this: unknown) { return { decodeAudioData }; });
		const { bank, fetchMock } = await Bank({ offline });

		const first = await bank.Resolve("coin") as { kind: SoundType; sampleRate: number; channels: Float32Array[]; };
		const second = await bank.Resolve("coin") as { channels: Float32Array[]; };
		expect(first.kind).toBe(SoundType.Pcm);
		expect(first.sampleRate).toBe(44100);
		expect(first.channels.map((c) => [...c])).toEqual([[0, 0], [1, 1]]);
		expect(second.channels[1]).not.toBe(first.channels[1]); // a fresh copy each time (they get transferred away)
		expect(decodeAudioData).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("falls back to the raw file when in-worker decoding fails", async () => {
		const log = SilenceConsole();
		const offline = vi.fn(function (this: unknown) { return { decodeAudioData: () => Promise.reject(new Error("unsupported")) }; });
		const { bank } = await Bank({ offline });
		expect(await bank.Resolve("coin")).toMatchObject({ kind: SoundType.Encoded });
		expect(String(log.warn.mock.calls[0]![0])).toContain("falling back to main-thread decode");
	});
});

describe("PhysicsWorker", () => {
	class World {
		public static instances: World[] = [];
		public applied: unknown[] = [];
		public created: unknown;
		public stepError: Error | null = null;
		public steps = 0;
		public constructor(public bridge: unknown) { World.instances.push(this); }
		public CreateWorld(settings: unknown): void { this.created = settings; }
		public ApplyCommands(commands: unknown, reply: (m: unknown) => void): void {
			this.applied.push(commands);
			reply({ state: PhysState.SyncAck, token: 1 });
		}
		public Step(): unknown {
			if (this.stepError) throw this.stepError;
			this.steps++;
			return { step: this.steps, bodyCount: 0, bodies: new ArrayBuffer(8), characterCount: 0, characters: new ArrayBuffer(8), overlaps: this.steps === 2 ? new Int32Array([1, 2, 1]) : null };
		}
	}

	let clock = 0;
	async function Start(load: () => Promise<unknown>) {
		World.instances = [];
		clock = 0;
		vi.spyOn(performance, "now").mockImplementation(() => clock);
		vi.doMock("../Source/Workers/Physics/PhysicsWasmLoader", () => ({ PhysicsWasmLoader: class { public Load = load; } }));
		vi.doMock("../Source/Workers/Physics/PhysicsWorld", () => ({ PhysicsWorld: World }));
		await import("../Source/Workers/PhysicsWorker");
		const gameLogic = new FakePort();
		return gameLogic;
	}
	const init = (port: FakePort): void => fakeSelf.Send({ type: PhysicsMsg.Init, gameLogicPort: port, settings: { gravity: [0, -20, 0] }, fixedTimestepMs: 10 });
	const advance = (ms: number): void => { clock += ms; vi.advanceTimersByTime(ms); };
	const steps = (port: FakePort) => (port.sent as { state: PhysState; }[]).filter((m) => m.state === PhysState.Step);

	it("queues commands until the runtime has loaded, then creates the world, says Ready, replays the queue and starts stepping", async () => {
		let finishLoading!: (bridge: unknown) => void;
		const port = await Start(() => new Promise((resolve) => (finishLoading = resolve)));
		init(port);
		port.Receive({ commands: ["early"] });
		expect(World.instances).toHaveLength(0);

		finishLoading({ bridge: true });
		await flush();
		const world = World.instances[0]!;
		expect(world.created).toEqual({ gravity: [0, -20, 0] });
		expect(port.sent[0]).toEqual({ state: PhysState.Ready });
		expect(world.applied).toEqual([["early"]]);

		port.Receive({ commands: ["later"] });
		expect(world.applied).toEqual([["early"], ["later"]]);

		advance(10);
		advance(10);
		expect(steps(port).length).toBeGreaterThanOrEqual(2);
		const withOverlaps = (port.sent as { overlaps?: Int32Array | null; }[]).find((m) => m.overlaps);
		expect(withOverlaps).toBeDefined();
	});

	it("catches up at most 5 steps after a stall, then drops the backlog", async () => {
		const port = await Start(() => Promise.resolve({}));
		init(port);
		await flush();
		const before = steps(port).length;

		clock += 1000;                // the tab was frozen for a second
		vi.advanceTimersByTime(5);    // one tick
		expect(steps(port).length - before).toBe(5);

		const after = steps(port).length;
		vi.advanceTimersByTime(5);    // no time passed on the clock: the backlog is gone, nothing to do
		expect(steps(port).length).toBe(after);
	});

	it("set-running pauses and resumes the loop (and is harmless before the world exists)", async () => {
		let finishLoading!: (bridge: unknown) => void;
		const port = await Start(() => new Promise((resolve) => (finishLoading = resolve)));
		init(port);
		fakeSelf.Send({ type: PhysicsMsg.SetRunning, running: true }); // no world yet: ticks do nothing
		advance(50);
		expect(steps(port)).toHaveLength(0);

		finishLoading({});
		await flush();
		fakeSelf.Send({ type: PhysicsMsg.SetRunning, running: false });
		advance(100);
		expect(steps(port)).toHaveLength(0);

		fakeSelf.Send({ type: PhysicsMsg.SetRunning, running: true });
		advance(30);
		expect(steps(port).length).toBeGreaterThan(0);
	});

	it("a step that throws is logged and stops the simulation", async () => {
		const log = SilenceConsole();
		const port = await Start(() => Promise.resolve({}));
		init(port);
		await flush();
		World.instances[0]!.stepError = new Error("bad contact");
		advance(20);
		advance(50);
		expect(steps(port)).toHaveLength(0);
		expect(String(log.error.mock.calls[0]![0])).toContain("step failed - stopping the simulation");
	});

	it("when the runtime cannot load: Failed (with the reason) is reported once, and later commands are dropped", async () => {
		const log = SilenceConsole();
		const port = await Start(() => Promise.reject(new Error("404 dotnet.js")));
		init(port);
		port.Receive({ commands: ["queued"] });
		await flush();

		expect(port.sent).toEqual([{ state: PhysState.Failed, message: "404 dotnet.js" }]);
		expect(log.error).toHaveBeenCalled();
		port.Receive({ commands: ["after"] });
		advance(100);
		expect(port.sent).toHaveLength(1);
		expect(World.instances).toHaveLength(0);
	});

	it("a non-Error rejection is reported by its text", async () => {
		SilenceConsole();
		const port = await Start(() => Promise.reject("no wasm"));
		init(port);
		await flush();
		expect(port.sent).toEqual([{ state: PhysState.Failed, message: "no wasm" }]);
	});

	it("complains after 15 s if the runtime is still loading", async () => {
		const log = SilenceConsole();
		const port = await Start(() => new Promise(() => undefined));
		init(port);
		vi.advanceTimersByTime(15_000);
		expect(String(log.error.mock.calls[0]![0])).toContain("still not loaded after 15 s");
	});

	it("does not complain when the runtime loaded in time", async () => {
		const log = SilenceConsole();
		const port = await Start(() => Promise.resolve({}));
		init(port);
		await flush();
		fakeSelf.Send({ type: PhysicsMsg.SetRunning, running: false });
		vi.advanceTimersByTime(15_000);
		expect(log.error.mock.calls.some((c) => String(c[0]).includes("15 s"))).toBe(false);
	});
});

describe("RenderWorker", () => {
	async function Start() {
		const scene = {
			Scene: {}, AssetLoader: {},
			Resize: vi.fn(), SetClearColor: vi.fn(), PoseCamera: vi.fn(),
			loop: null as (() => void) | null,
			RunRenderLoop(callback: () => void) { this.loop = callback; },
		};
		const registry = { Spawn: vi.fn(), Remove: vi.fn(), SetVisible: vi.fn(), SetColor: vi.fn(), Clear: vi.fn(), ApplyTransformBatch: vi.fn(), OnGltfLoaded: undefined as ((id: number) => void) | undefined };
		const created: unknown[][] = [];
		vi.doMock("../Source/Workers/Render/RenderScene", () => ({ RenderScene: vi.fn(function (...args: unknown[]) { created.push(args); return scene; }) }));
		vi.doMock("../Source/Workers/Render/EntityMeshRegistry", () => ({ EntityMeshRegistry: vi.fn(function () { return registry; }) }));
		await import("../Source/Workers/RenderWorker");
		return { scene, registry, created };
	}

	it("a resize before init is ignored; after init it reaches the scene; the inspector toggle is a no-op", async () => {
		const { scene } = await Start();
		fakeSelf.Send({ type: RenderMsg.Resize, width: 1, height: 1, devicePixelRatio: 1 });
		expect(scene.Resize).not.toHaveBeenCalled();

		fakeSelf.Send({ type: RenderMsg.Init, canvas: {}, gameLogicPort: new FakePort(), devMode: false, width: 800, height: 600, devicePixelRatio: 2 });
		fakeSelf.Send({ type: RenderMsg.Resize, width: 640, height: 480, devicePixelRatio: 1 });
		expect(scene.Resize).toHaveBeenCalledWith(640, 480, 1);
		expect(() => fakeSelf.Send({ type: RenderMsg.SetInspectorVisible, visible: true })).not.toThrow();
	});

	it("on init: builds the scene at the canvas size, says ready, and asks GameLogic for frames - at most two at a time", async () => {
		const { scene, created } = await Start();
		const port = new FakePort();
		fakeSelf.Send({ type: RenderMsg.Init, canvas: { id: "c" }, gameLogicPort: port, devMode: false, width: 800, height: 600, devicePixelRatio: 2 });
		expect(created[0]).toEqual([{ id: "c" }, 800, 600, 2]);
		expect(port.sent[0]).toEqual({ type: RenderMsg.Ready });

		scene.loop!();
		scene.loop!();
		scene.loop!(); // a third display frame while two requests are still out: no new request
		const requests = (port.sent as { type: RenderMsg; frameId?: number; }[]).filter((m) => m.type === RenderMsg.FrameRequest);
		expect(requests.map((r) => r.frameId)).toEqual([1, 2]);
	});

	it("applies a received frame on the next display frame (transforms + camera), then asks for another", async () => {
		const { scene, registry } = await Start();
		const port = new FakePort();
		fakeSelf.Send({ type: RenderMsg.Init, canvas: {}, gameLogicPort: port, devMode: false, width: 1, height: 1, devicePixelRatio: 1 });
		scene.loop!();
		scene.loop!();

		const buffer = new ArrayBuffer(8);
		port.Receive({ operation: RendOpType.Frame, frameId: 1, buffer, entityCount: 1, camera: { transform: [0, 0, 0, 0, 0, 0, 1], fov: 1 } });
		scene.loop!();
		expect(registry.ApplyTransformBatch).toHaveBeenCalledWith(buffer, 1);
		expect(scene.PoseCamera).toHaveBeenCalledTimes(1);
		expect((port.sent as { type: RenderMsg; }[]).filter((m) => m.type === RenderMsg.FrameRequest)).toHaveLength(3);

		port.Receive({ operation: RendOpType.Frame, frameId: 2, buffer, entityCount: 1, camera: null }); // no camera in this scene
		scene.loop!();
		expect(registry.ApplyTransformBatch).toHaveBeenCalledTimes(2);
		expect(scene.PoseCamera).toHaveBeenCalledTimes(1);
	});

	it("forwards scene edits to the mesh registry and the scene, and answers sync markers", async () => {
		const { scene, registry } = await Start();
		const port = new FakePort();
		fakeSelf.Send({ type: RenderMsg.Init, canvas: {}, gameLogicPort: port, devMode: false, width: 1, height: 1, devicePixelRatio: 1 });

		port.Receive({ operation: RendOpType.SpawnEntity, entityId: 1, mesh: { shape: 0 }, transform: [0, 0, 0, 0, 0, 0, 1], color: [1, 0, 0] });
		port.Receive({ operation: RendOpType.SetVisible, entityId: 1, visible: false });
		port.Receive({ operation: RendOpType.SetColor, entityId: 1, color: [0, 1, 0] });
		port.Receive({ operation: RendOpType.RemoveEntity, entityId: 1 });
		port.Receive({ operation: RendOpType.SetEnvironment, clearColor: [0.1, 0.2, 0.3] });
		port.Receive({ operation: RendOpType.Sync, token: 9 });

		expect(registry.Spawn).toHaveBeenCalledWith(1, { shape: 0 }, [0, 0, 0, 0, 0, 0, 1], [1, 0, 0]);
		expect(registry.SetVisible).toHaveBeenCalledWith(1, false);
		expect(registry.SetColor).toHaveBeenCalledWith(1, [0, 1, 0]);
		expect(registry.Remove).toHaveBeenCalledWith(1);
		expect(scene.SetClearColor).toHaveBeenCalledWith(0.1, 0.2, 0.3);
		expect(port.sent).toContainEqual({ type: RenderMsg.SyncAck, token: 9 });
	});

	it("clearing the scene drops a frame that has not been shown yet; a glTF arrival is reported", async () => {
		const { scene, registry } = await Start();
		const port = new FakePort();
		fakeSelf.Send({ type: RenderMsg.Init, canvas: {}, gameLogicPort: port, devMode: false, width: 1, height: 1, devicePixelRatio: 1 });

		port.Receive({ operation: RendOpType.Frame, frameId: 1, buffer: new ArrayBuffer(8), entityCount: 1, camera: null });
		port.Receive({ operation: RendOpType.ClearScene });
		scene.loop!();
		expect(registry.Clear).toHaveBeenCalled();
		expect(registry.ApplyTransformBatch).not.toHaveBeenCalled();

		registry.OnGltfLoaded!(42);
		expect(port.sent).toContainEqual({ type: RenderMsg.AssetLoaded, entityId: 42 });
	});
});

describe("PhysicsWasmLoader", () => {
	let directory = "";
	beforeEach(() => { vi.useRealTimers(); directory = mkdtempSync(join(tmpdir(), "dotnet-")); });
	afterEach(() => rmSync(directory, { recursive: true, force: true }));

	/** A fake dotnet.js on disk: hands its resource loader to the test and exposes a bridge object. */
	function FakeDotnet(): string {
		const file = join(directory, "dotnet.mjs");
		writeFileSync(file, `
			export const dotnet = {
				withResourceLoader(loader) {
					globalThis.__resourceLoader = loader;
					return { create: async () => ({
						getConfig: () => ({ mainAssemblyName: "PhysicsBridge" }),
						getAssemblyExports: async (name) => ({ Physics: { Wasm: { PhysicsBridge: { assembly: name } } } }),
					}) };
				},
			};
		`);
		return file;
	}

	type Loader = (type: string, name: string, uri: string) => Promise<Response | undefined> | undefined;
	const loaderOf = (): Loader => (globalThis as unknown as { __resourceLoader: Loader; }).__resourceLoader;

	it("boots the runtime from the given dotnet.js and returns the PhysicsBridge exports of the main assembly", async () => {
		const { PhysicsWasmLoader } = await import("../Source/Workers/Physics/PhysicsWasmLoader");
		const bridge = await new PhysicsWasmLoader(FakeDotnet()).Load();
		expect(bridge).toEqual({ assembly: "PhysicsBridge" });
	});

	it("defaults to /physics-wasm/_framework/dotnet.js - where the build puts the runtime", async () => {
		const { PhysicsWasmLoader } = await import("../Source/Workers/Physics/PhysicsWasmLoader");
		expect((new PhysicsWasmLoader() as unknown as { _dotnetJsUrl: string; })._dotnetJsUrl).toBe("/physics-wasm/_framework/dotnet.js");
	});

	describe("resource loader", () => {
		async function Loader(): Promise<Loader> {
			const { PhysicsWasmLoader } = await import("../Source/Workers/Physics/PhysicsWasmLoader");
			await new PhysicsWasmLoader(FakeDotnet()).Load();
			return loaderOf();
		}
		const wasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

		it("leaves everything that is not .wasm to dotnet.js", async () => {
			const loader = await Loader();
			expect(loader("assembly", "x.dll", "/physics-wasm/_framework/x.dll")).toBeUndefined();
		});

		it("fetches the .wasm.gz instead, unzips it, and serves it as application/wasm", async () => {
			const loader = await Loader();
			const fetchMock = vi.fn(() => Promise.resolve(new Response(gzipSync(wasm))));
			vi.stubGlobal("fetch", fetchMock);

			const response = (await loader("dotnetwasm", "dotnet.native.wasm", "/f/dotnet.native.wasm"))!;
			expect(fetchMock).toHaveBeenCalledWith("/f/dotnet.native.wasm.gz");
			expect(response.headers.get("Content-Type")).toBe("application/wasm");
			expect(response.headers.get("Content-Length")).toBe("8");
			expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...wasm]);
		});

		it("accepts bytes the server already decompressed (Content-Encoding: gzip)", async () => {
			const loader = await Loader();
			vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(wasm))));
			const response = (await loader("dotnetwasm", "dotnet.native.wasm", "/f/dotnet.native.wasm"))!;
			expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...wasm]);
		});

		it("explains a missing .wasm.gz", async () => {
			const loader = await Loader();
			vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("nope", { status: 404, statusText: "Not Found" }))));
			await expect(loader("dotnetwasm", "dotnet.native.wasm", "/f/dotnet.native.wasm")).rejects.toThrow(/Missing gzip asset: \/f\/dotnet\.native\.wasm\.gz \(404 Not Found\)/);
		});
	});
});
