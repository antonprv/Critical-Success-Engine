// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { afterEach, describe, expect, it, vi } from "vitest";
import { Component } from "../Source/Engine/Core/Component";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { SceneRegistry } from "../Source/Engine/Scenes/SceneRegistry";
import { GameLogicMsg, InputEvtType, MenuMode, PhysOpType, PhysState, RenderMsg, RendOpType, UiMsg } from "../Source/Workers/Common/CommonEnums";
import { UiController } from "../Source/Workers/Ui/UiController";
import { FakePort, Harness, tick } from "./Harness";
import { SilenceConsole } from "./helpers";

afterEach(() => { vi.useRealTimers(); });

const Scene = (id: string, entities: ReturnType<typeof Ent>[] = []) => ({ id, name: id, description: "", entities });
const messages = (port: FakePort, type: UiMsg) => (port.sent as { type: UiMsg; }[]).filter((m) => m.type === type) as unknown as Record<string, unknown>[];

describe("GameLogicRuntime - the corners", () => {
	it("takes input from the main thread, and ignores other main-thread messages", async () => {
		const harness = new Harness(new SceneRegistry().Register(Scene("a")));
		await harness.BootToScene();
		harness.ui.Receive({ type: UiMsg.SetCapture, enabled: true });

		harness.runtime.HandleMainMessage({ type: GameLogicMsg.Input, event: { kind: InputEvtType.KeyDown, code: "KeyW" } });
		expect(harness.runtime.Context.Input.IsKeyDown("KeyW")).toBe(true);
		harness.runtime.HandleMainMessage({ type: GameLogicMsg.Init } as never);
		expect(harness.runtime.Context.Input.IsKeyDown("KeyW")).toBe(true);
	});

	it("SetFixedDelta changes the step the scripts see", async () => {
		const harness = new Harness(new SceneRegistry().Register(Scene("a")));
		harness.runtime.SetFixedDelta(0.02);
		expect(harness.runtime.Context.Time.FixedDelta).toBe(0.02);
		expect(harness.runtime.Context.Physics.FixedDelta).toBe(0.02);
	});

	it("an asset-loaded notice from the renderer is accepted", async () => {
		const harness = new Harness(new SceneRegistry().Register(Scene("a")));
		await harness.BootToScene();
		expect(() => harness.render.Receive({ type: RenderMsg.AssetLoaded, entityId: 1 })).not.toThrow();
	});

	it("boots only once", async () => {
		const harness = new Harness(new SceneRegistry().Register(Scene("a")));
		await harness.BootToScene();
		const loads = messages(harness.ui, UiMsg.LoadFinished).length;
		await harness.runtime.Boot();
		expect(messages(harness.ui, UiMsg.LoadFinished)).toHaveLength(loads);
	});

	it("with no scenes registered it reports that instead of loading", async () => {
		const harness = new Harness(new SceneRegistry());
		await harness.runtime.Boot();
		expect(messages(harness.ui, UiMsg.LoadFailed)[0]).toMatchObject({ message: "No scenes are registered." });
	});

	it("waits for the renderer before it asks for anything else, then for physics", async () => {
		const harness = new Harness(new SceneRegistry().Register(Scene("a")));
		const boot = harness.runtime.Boot();
		await tick();
		expect(messages(harness.ui, UiMsg.LoadProgress).map((m) => m["label"])).toEqual(["Starting renderer…"]);

		harness.render.Receive({ type: RenderMsg.Ready });
		await tick();
		expect(messages(harness.ui, UiMsg.LoadProgress).at(-1)!["label"]).toContain("Starting physics");

		harness.physics.Receive({ state: PhysState.Ready });
		await harness.Pump();
		await boot;
		expect(harness.runtime.Context.Scenes.CurrentSceneId).toBe("a");
	});

	it("gives up waiting for physics after 30 s, says so in the log, and loads the scene anyway", async () => {
		vi.useFakeTimers();
		const log = SilenceConsole();
		const harness = new Harness(new SceneRegistry().Register(Scene("a")));
		const boot = harness.runtime.Boot();
		harness.render.Receive({ type: RenderMsg.Ready });
		await vi.advanceTimersByTimeAsync(30_000);
		await vi.advanceTimersByTimeAsync(15_000); // physics never answers the reset either
		await boot;

		expect(String(log.error.mock.calls[0]![0])).toContain("physics did not come up within 30 s");
		expect(harness.runtime.Context.Scenes.CurrentSceneId).toBe("a");
	});

	it("tells the player when physics failed to load", async () => {
		const harness = new Harness(new SceneRegistry().Register(Scene("a")));
		const boot = harness.runtime.Boot();
		harness.render.Receive({ type: RenderMsg.Ready });
		harness.physics.Receive({ state: PhysState.Failed, message: "404" });
		await harness.Pump();
		await boot;
		expect(messages(harness.ui, UiMsg.Toast)[0]!["message"]).toContain("Physics failed to load");
	});

	it("overlap events about entities that no longer exist, or an entity with itself, are dropped", async () => {
		class Probe extends Component { public hits = 0; public override OnCollisionEnter(): void { this.hits++; } }
		const harness = new Harness(new SceneRegistry().Register(Scene("a", [Ent("A", [Comp(Probe)])])));
		await harness.BootToScene();
		const a = harness.runtime.Context.World.FindByName("A")!;

		harness.Step([], [], [a.Id, 99999, 1]);
		harness.Step([], [], [a.Id, a.Id, 1]);
		expect(a.GetComponent(Probe)!.hits).toBe(0);
	});

	it("physics steps that arrive while a scene is loading are ignored", async () => {
		class Probe extends Component { public steps = 0; public override OnPhysicsUpdate(): void { this.steps++; } }
		const harness = new Harness(new SceneRegistry().Register(Scene("a", [Ent("A", [Comp(Probe)])])).Register(Scene("b")));
		await harness.BootToScene();
		const probe = harness.runtime.Context.World.FindByName("A")!.GetComponent(Probe)!;

		harness.Step([]);
		expect(probe.steps).toBe(1);

		harness.ui.Receive({ type: UiMsg.LoadScene, sceneId: "b" }); // loading starts (synchronously up to its first await)
		expect(harness.runtime.Context.Scenes.IsLoading).toBe(true);
		harness.Step([]);
		expect(probe.steps).toBe(1);
		await harness.Pump();
	});

	it("frame requests during a scene load are answered with an empty frame, so the renderer keeps asking", async () => {
		const harness = new Harness(new SceneRegistry().Register(Scene("a")).Register(Scene("b")));
		await harness.BootToScene();
		harness.ClearSent();

		harness.ui.Receive({ type: UiMsg.LoadScene, sceneId: "b" });
		harness.render.Receive({ type: RenderMsg.FrameRequest, frameId: 41 });
		const frame = harness.render.sent.find((m) => (m as { operation: RendOpType; }).operation === RendOpType.Frame) as { frameId: number; entityCount: number; camera: unknown; };
		expect(frame).toMatchObject({ frameId: 41, entityCount: 0, camera: null });
		await harness.Pump();
	});

	it("an engine-level failure while building a frame is logged and still answered", async () => {
		const log = SilenceConsole();
		const harness = new Harness(new SceneRegistry().Register(Scene("a")));
		await harness.BootToScene();
		harness.runtime.Context.Render.MainCamera = { GetPose: () => { throw new Error("camera exploded"); } };
		harness.ClearSent();

		harness.render.Receive({ type: RenderMsg.FrameRequest, frameId: 7 });
		expect(harness.render.sent[0]).toMatchObject({ operation: RendOpType.Frame, frameId: 7, entityCount: 0, camera: null });
		expect(String(log.error.mock.calls[0]![0])).toContain("camera exploded");
	});

	it("physics commands queued by scripts leave in one batch per step", async () => {
		const harness = new Harness(new SceneRegistry().Register(Scene("a")));
		await harness.BootToScene();
		harness.runtime.Context.Physics.SetAwake(1, true);
		harness.runtime.Context.Physics.SetAwake(2, true);
		harness.ClearSent();

		harness.Step([]);
		const batches = harness.physics.sent as { commands: { operation: PhysOpType; }[]; }[];
		expect(batches).toHaveLength(1);
		expect(batches[0]!.commands.map((c) => c.operation)).toEqual([PhysOpType.SetAwake, PhysOpType.SetAwake]);
	});
});

describe("SceneManager - the corners", () => {
	it("an unknown scene id is reported, not loaded", async () => {
		const harness = new Harness(new SceneRegistry().Register(Scene("a")));
		await harness.BootToScene();
		await harness.runtime.Context.Scenes.Load("nope");
		expect(messages(harness.ui, UiMsg.LoadFailed).at(-1)).toMatchObject({ sceneId: "nope", message: 'Unknown scene "nope".' });
		expect(harness.runtime.Context.Scenes.CurrentSceneId).toBe("a");
	});

	it("a second load request while one is running is ignored", async () => {
		const harness = new Harness(new SceneRegistry().Register(Scene("a")).Register(Scene("b")).Register(Scene("c")));
		await harness.BootToScene();
		const first = harness.runtime.Context.Scenes.Load("b");
		const second = harness.runtime.Context.Scenes.Load("c");
		await harness.Pump();
		await Promise.all([first, second]);
		expect(harness.runtime.Context.Scenes.CurrentSceneId).toBe("b");
	});

	it("carries on when physics/render do not acknowledge the reset in time, with a warning", async () => {
		vi.useFakeTimers();
		const log = SilenceConsole();
		const harness = new Harness(new SceneRegistry().Register(Scene("a")));
		const boot = harness.runtime.Boot();
		harness.render.Receive({ type: RenderMsg.Ready });
		harness.physics.Receive({ state: PhysState.Ready });
		await vi.advanceTimersByTimeAsync(10_000); // nobody acks the reset
		await vi.advanceTimersByTimeAsync(1_000);
		await boot;

		expect(log.warn.mock.calls.some((c) => String(c[0]).includes("did not acknowledge the reset in time"))).toBe(true);
		expect(harness.runtime.Context.Scenes.CurrentSceneId).toBe("a");
	});

	it("a scene that fails to build is reported and the manager is usable again afterwards", async () => {
		const log = SilenceConsole();
		class Broken extends Component { public constructor() { super(); throw new Error("bad component"); } }
		const registry = new SceneRegistry().Register(Scene("good")).Register(Scene("bad", [Ent("X", [Comp(Broken)])]));
		const harness = new Harness(registry);
		await harness.BootToScene();

		harness.ui.Receive({ type: UiMsg.LoadScene, sceneId: "bad" });
		await harness.Pump();
		expect(messages(harness.ui, UiMsg.LoadFailed).at(-1)).toMatchObject({ sceneId: "bad", message: "bad component" });
		expect(log.error).toHaveBeenCalled();
		expect(harness.runtime.Context.Scenes.IsLoading).toBe(false);

		harness.ui.Receive({ type: UiMsg.LoadScene, sceneId: "good" });
		await harness.Pump();
		expect(harness.runtime.Context.Scenes.CurrentSceneId).toBe("good");
	});

	it("a non-Error failure is reported by its text", async () => {
		SilenceConsole();
		class Strange extends Component { public constructor() { super(); throw "just text"; } }
		const harness = new Harness(new SceneRegistry().Register(Scene("good")).Register(Scene("bad", [Ent("X", [Comp(Strange)])])));
		await harness.BootToScene();
		harness.ui.Receive({ type: UiMsg.LoadScene, sceneId: "bad" });
		await harness.Pump();
		expect(messages(harness.ui, UiMsg.LoadFailed).at(-1)).toMatchObject({ message: "just text" });
	});

	it("loads progress messages in chunks for big scenes", async () => {
		const entities = Array.from({ length: 20 }, (_, i) => Ent(`E${i}`, []));
		const harness = new Harness(new SceneRegistry().Register(Scene("big", entities)));
		await harness.BootToScene();
		const labels = messages(harness.ui, UiMsg.LoadProgress).map((m) => String(m["label"]));
		expect(labels.some((l) => l.startsWith("Creating entities (8/20)"))).toBe(true);
		expect(labels.some((l) => l.startsWith("Creating entities (16/20)"))).toBe(true);
	});
});

describe("UiController - the corners", () => {
	function Controller() {
		const toMain: unknown[] = [], toGame: unknown[] = [];
		const ui = new UiController((m) => toMain.push(m), (m) => toGame.push(m));
		return { ui, toMain, toGame };
	}

	it("after the player has played, a failed load / refused lock brings back the 'paused' menu rather than the start menu", () => {
		const { ui } = Controller();
		ui.OnMainMessage({ type: UiMsg.PointerLock, locked: true });
		ui.OnGameLogicMessage({ type: UiMsg.LoadFailed, sceneId: "x", message: "boom" });
		expect(ui.State.menu).toMatchObject({ visible: true, mode: MenuMode.Paused });
	});

	it("ignores the init message (the worker shell handles it) and a resume click (the lock request already went out)", () => {
		const { ui, toMain, toGame } = Controller();
		const before = JSON.stringify(ui.State);
		toMain.length = 0;
		ui.OnMainMessage({ type: UiMsg.Init, gameLogicPort: {} as MessagePort });
		ui.OnMainMessage({ type: UiMsg.Resume });
		expect(JSON.stringify(ui.State)).toBe(before);
		expect(toMain).toEqual([]);
		expect(toGame).toEqual([]);
	});

	it("losing the pointer lock while no game is running (still loading) does not open the menu", () => {
		const { ui } = Controller();
		ui.OnGameLogicMessage({ type: UiMsg.LoadProgress, sceneId: "x", label: "…", fraction: 0.1 });
		ui.OnMainMessage({ type: UiMsg.PointerLock, locked: false });
		expect(ui.State.menu.visible).toBe(false);
	});
});
