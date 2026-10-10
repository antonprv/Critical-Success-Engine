// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The last few situations that only happen at the edges: a camera looking straight up, messages arriving early, odd stacks.

import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CameraComponent } from "../Source/Engine/Components/Camera/CameraComponent";
import { MoverComponent } from "../Source/Engine/Components/Mover/MoverComponent";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { SceneRegistry } from "../Source/Engine/Scenes/SceneRegistry";
import { AssetLoader, AssetPriority } from "../Source/Engine/Assets/AssetLoader";
import { Logger } from "../Source/Logging/Logger";
import { MenuMode, PhysBodyType, PhysObjectKind, PhysOpType, PhysOpType as Op, PhysShape, PhysState, RenderMsg, UiMsg } from "../Source/Workers/Common/CommonEnums";
import type { PhysicsBridgeExports } from "../Source/Workers/Physics/PhysicsBridgeContract";
import { PhysicsWorld } from "../Source/Workers/Physics/PhysicsWorld";
import { UiController } from "../Source/Workers/Ui/UiController";
import { MakeEngine } from "./engine";
import { Harness } from "./Harness";
import { SilenceConsole } from "./helpers";

describe("a camera looking straight up or down", () => {
	function Rig() {
		const t = MakeEngine();
		t.world.Spawn(Ent("Camera", [Comp(CameraComponent, { TargetName: "Player", MaxPitch: 90 })]));
		const player = t.world.Spawn(Ent("Player", [Comp(MoverComponent)], { position: [0, 1.2, 0] }));
		t.world.FlushLifecycle();
		t.input.CapturePlayerInput = true;
		t.world.FindByName("Camera")!.GetComponent(CameraComponent)!.Pitch = 90;
		const lastMove = () => t.commands().filter((c) => c.operation === PhysOpType.MoveCharacter).at(-1) as { velocity: number[]; } | undefined;
		const stand = (): void => t.step([{ id: player.Id, pos: [0, 1.2, 0] }], [{ id: player.Id, onFloor: true }]);
		return { t, player, lastMove, stand };
	}

	it("walking: W has no horizontal 'forward' to go to, so the player stays put (no NaN); strafing still works", () => {
		const { t, lastMove, stand } = Rig();
		t.press("KeyW");
		stand();
		stand();
		const velocity = lastMove()!.velocity;
		expect(velocity.every(Number.isFinite)).toBe(true);
		expect(Math.hypot(velocity[0]!, velocity[2]!)).toBeCloseTo(0);

		t.release("KeyW");
		t.press("KeyD");
		stand();
		stand();
		expect(lastMove()!.velocity[0]).toBeGreaterThan(0);
	});

	it("noclip: W flies straight up", () => {
		const { t, player, lastMove, stand } = Rig();
		player.GetComponent(MoverComponent)!.SetNoclip(true);
		t.press("KeyW");
		stand();
		expect(lastMove()!.velocity[1]).toBeCloseTo(player.GetComponent(MoverComponent)!.NoclipSpeed);
	});
});

describe("GameLogicRuntime boot order", () => {
	it("a renderer that was ready before Boot() is not waited for again", async () => {
		const harness = new Harness(new SceneRegistry().Register({ id: "a", name: "a", description: "", entities: [] }));
		harness.render.Receive({ type: RenderMsg.Ready });
		harness.physics.Receive({ state: PhysState.Ready });
		const boot = harness.runtime.Boot();
		await harness.Pump();
		await boot;
		expect(harness.runtime.Context.Scenes.CurrentSceneId).toBe("a");
	});
});

describe("AssetLoader", () => {
	it("a failed texture logs the exception when there is one, and a failed mesh without one logs the message", () => {
		const log = SilenceConsole();
		const engine = new NullEngine();
		const assets = new AssetLoader(new Scene(engine));
		const managers = assets as unknown as { _critical: { addMeshTask: () => unknown; addTextureTask: () => unknown; }; };
		const tasks: { onError?: (t: unknown, m: string, e?: unknown) => void; }[] = [];
		const capture = (() => { const t = {}; tasks.push(t); return t; }) as never;
		vi.spyOn(managers._critical, "addMeshTask").mockImplementation(capture);
		vi.spyOn(managers._critical, "addTextureTask").mockImplementation(capture);

		assets.AddMesh(AssetPriority.Critical, "level", "/", "level.glb");
		assets.AddTexture(AssetPriority.Critical, "sky", "/sky.png");
		tasks[0]!.onError!({ name: "level" }, "parse error");
		tasks[1]!.onError!({ name: "sky" }, "decode", new Error("bad png"));

		const lines = log.error.mock.calls.map((c) => String(c[0]));
		expect(lines[0]).toMatch(/failed to load level: parse error\nparse error$/);
		expect(lines[1]).toContain("bad png");
		engine.dispose();
	});
});

describe("Logger call sites", () => {
	it("falls back to 'unknown' when the stack is too short to name the caller", () => {
		const log = SilenceConsole();
		const limit = Error.stackTraceLimit;
		Error.stackTraceLimit = 1;
		try {
			Logger.LogInfo("short stack");
		} finally {
			Error.stackTraceLimit = limit;
		}
		expect(String(log.log.mock.calls[0]![0])).toBe("[unknown] short stack");
	});
});

describe("PhysicsWorld edge commands", () => {
	function Setup() {
		const bridge = new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
			get: (target, name: string) => (target[name] ??= vi.fn((...args: unknown[]) => (name.startsWith("Add") ? 1 : name === "Step" || name === "GetLastOverlapEvents" ? [] : args.length ? undefined : 0))),
		});
		const world = new PhysicsWorld(bridge as unknown as PhysicsBridgeExports);
		world.CreateWorld({ gravity: [0, -20, 0] });
		return { bridge, world };
	}

	it("SetPose on an ordinary (non-character) body only moves the body", () => {
		const { bridge, world } = Setup();
		world.ApplyCommands([
			{ operation: Op.SpawnBody, entityId: 1, bodyType: PhysBodyType.Dynamic, shape: { shape: PhysShape.Sphere, radius: 1 }, transform: [0, 0, 0, 0, 0, 0, 1], layer: 1, mask: -1, objectKind: PhysObjectKind.Solid },
			{ operation: Op.SetPose, entityId: 1, transform: [3, 3, 3, 0, 0, 0, 1] },
		], () => undefined);
		expect(bridge["SetBodyPose"]).toHaveBeenCalledTimes(1);
	});

	it("a kinematic pose for an entity it does not know is ignored", () => {
		const { bridge, world } = Setup();
		world.ApplyCommands([{ operation: Op.SetKinematicPose, entityId: 42, transform: [1, 1, 1, 0, 0, 0, 1] }], () => undefined);
		world.Step(1 / 60);
		expect(bridge["SetBodyPose"]).not.toHaveBeenCalled();
	});
});

describe("UiController", () => {
	it("a scene that fails to load before the player ever played brings back the START menu", () => {
		const ui = new UiController(() => undefined, () => undefined);
		ui.OnGameLogicMessage({ type: UiMsg.LoadFailed, sceneId: "x", message: "boom" });
		expect(ui.State.menu).toMatchObject({ visible: true, mode: MenuMode.Start });
	});
});
