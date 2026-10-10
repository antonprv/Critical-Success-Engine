// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";

import { Quat } from "../Source/Engine/Math/Quat";
import { Vec3 } from "../Source/Engine/Math/Vec3";
import { AudioService } from "../Source/Engine/Services/AudioService";
import { InputService } from "../Source/Engine/Services/InputService";
import { PhysicsService } from "../Source/Engine/Services/PhysicsService";
import { RenderService } from "../Source/Engine/Services/RenderService";
import { UiService } from "../Source/Engine/Services/UiService";
import { InputEvtType, PhysBodyType, PhysObjectKind, PhysOpType, PhysQueryType, PhysShape, PhysState, RendMesh, RendOpType, SoundAction, UiMsg } from "../Source/Workers/Common/CommonEnums";
import type { PhysicsCommand } from "../Source/Workers/Protocol/PhysicsGameLogicProtocol";
import { BODY_STRIDE, CHARACTER_STRIDE } from "../Source/Workers/Protocol/TransformProtocol";

class FakePort {
	public readonly sent: unknown[] = [];
	public readonly transfers: unknown[][] = [];
	public postMessage(message: unknown, transfer: unknown[] = []): void { this.sent.push(message); this.transfers.push(transfer); }
}
const asPort = (port: FakePort): MessagePort => port as unknown as MessagePort;

describe("InputService", () => {
	const key = (service: InputService, code: string, down = true): void =>
		service.Handle(down ? { kind: InputEvtType.KeyDown, code } : { kind: InputEvtType.KeyUp, code });

	it("reports nothing while input is not captured, and ignores events", () => {
		const input = new InputService();
		expect(input.CapturePlayerInput).toBe(false);
		key(input, "KeyW");
		input.Handle({ kind: InputEvtType.PointerDown, button: 0 });
		input.Handle({ kind: InputEvtType.PointerMove, dx: 5, dy: 5 });

		input.CapturePlayerInput = true;
		expect(input.IsKeyDown("KeyW")).toBe(false);
		expect(input.IsKeyDown("Mouse0")).toBe(false);
		expect(input.ConsumeLookDelta()).toEqual([0, 0]);
	});

	it("tracks keys and mouse buttons, and the two 'just pressed' clocks", () => {
		const input = new InputService();
		input.CapturePlayerInput = true;

		key(input, "Space");
		key(input, "Space"); // key repeat while held is not a new press
		input.Handle({ kind: InputEvtType.PointerDown, button: 0 });
		expect(input.IsKeyDown("Space")).toBe(true);
		expect(input.IsKeyDown("Mouse0")).toBe(true);
		expect(input.JustPressed("Space")).toBe(true);
		expect(input.JustPressedPhysics("Space")).toBe(true);

		input.EndFrame();
		expect(input.JustPressed("Space")).toBe(false);
		expect(input.JustPressedPhysics("Space")).toBe(true); // physics has not seen it yet
		input.EndPhysicsStep();
		expect(input.JustPressedPhysics("Space")).toBe(false);
		expect(input.IsKeyDown("Space")).toBe(true); // still held

		key(input, "Space", false);
		input.Handle({ kind: InputEvtType.PointerUp, button: 0 });
		expect(input.IsKeyDown("Space")).toBe(false);
		expect(input.IsKeyDown("Mouse0")).toBe(false);
	});

	it("accumulates mouse look and hands it out once", () => {
		const input = new InputService();
		input.CapturePlayerInput = true;
		input.Handle({ kind: InputEvtType.PointerMove, dx: 3, dy: -1 });
		input.Handle({ kind: InputEvtType.PointerMove, dx: 2, dy: -2 });
		expect(input.ConsumeLookDelta()).toEqual([5, -3]);
		expect(input.ConsumeLookDelta()).toEqual([0, 0]);
	});

	it("builds the WASD / arrows vector (forward is negative y) and clamps diagonals", async () => {
		const { TestProjectInput } = await import("./InputFixture");
		const input = new InputService();
		input.System.Install(TestProjectInput);
		expect(input.GetInputVector()).toEqual([0, 0]); // not captured
		input.CapturePlayerInput = true;
		expect(input.GetInputVector()).toEqual([0, 0]);

		key(input, "KeyW");
		expect(input.GetInputVector()).toEqual([0, -1]);
		key(input, "KeyW", false);
		key(input, "ArrowDown");
		expect(input.GetInputVector()).toEqual([0, 1]);
		key(input, "ArrowDown", false);
		key(input, "KeyA");
		expect(input.GetInputVector()).toEqual([-1, 0]);
		key(input, "KeyA", false);
		key(input, "ArrowRight");
		expect(input.GetInputVector()).toEqual([1, 0]);
		key(input, "ArrowRight", false);
		key(input, "ArrowUp");
		key(input, "ArrowLeft");
		const [x, y] = input.GetInputVector();
		expect(Math.hypot(x, y)).toBeCloseTo(1);
		expect(x).toBeLessThan(0);
		expect(y).toBeLessThan(0);
		key(input, "KeyD");
		key(input, "KeyS"); // opposite keys cancel
		key(input, "ArrowLeft", false);
		key(input, "ArrowUp", false);
		expect(input.GetInputVector()).toEqual([1, 1].map((v) => v / Math.SQRT2));
	});

	it("releasing capture, or a ReleaseAll event, drops everything that was held", () => {
		const input = new InputService();
		input.CapturePlayerInput = true;
		key(input, "KeyW");
		input.Handle({ kind: InputEvtType.PointerMove, dx: 4, dy: 4 });
		input.CapturePlayerInput = true; // no change: nothing is reset
		expect(input.IsKeyDown("KeyW")).toBe(true);

		input.CapturePlayerInput = false;
		input.CapturePlayerInput = true;
		expect(input.IsKeyDown("KeyW")).toBe(false);
		expect(input.ConsumeLookDelta()).toEqual([0, 0]);

		key(input, "KeyW");
		input.Handle({ kind: InputEvtType.ReleaseAll });
		expect(input.IsKeyDown("KeyW")).toBe(false);
		expect(input.JustPressed("KeyW")).toBe(false);
	});
});

describe("UiService", () => {
	it("forwards scene lists, load progress/results and toasts as messages", () => {
		const port = new FakePort();
		const ui = new UiService(asPort(port));
		ui.PublishScenes([{ id: "a", name: "A", description: "d" }]);
		ui.LoadProgress("a", "working", 0.5);
		ui.LoadFinished("a");
		ui.LoadFailed("a", "boom");
		ui.Toast("hello");
		expect(port.sent).toEqual([
			{ type: UiMsg.Scenes, scenes: [{ id: "a", name: "A", description: "d" }] },
			{ type: UiMsg.LoadProgress, sceneId: "a", label: "working", fraction: 0.5 },
			{ type: UiMsg.LoadFinished, sceneId: "a", cursor: "locked" },
			{ type: UiMsg.LoadFailed, sceneId: "a", message: "boom" },
			{ type: UiMsg.Toast, message: "hello" },
		]);
	});

	it("coalesces HUD changes and sends them at most every 100 ms", () => {
		const port = new FakePort();
		const ui = new UiService(asPort(port));

		ui.Flush(1000);
		expect(port.sent).toEqual([]); // nothing changed

		ui.SetHud("a", "one");
		ui.SetHud("a", "one"); // same text: not a change
		ui.SetHud("b", "two");
		ui.Flush(1000);
		expect(port.sent).toEqual([{ type: UiMsg.Hud, lines: ["one", "two"] }]);

		ui.SetHud("a", "uno");
		ui.Flush(1050); // too soon
		expect(port.sent).toHaveLength(1);
		ui.Flush(1100);
		expect(port.sent[1]).toEqual({ type: UiMsg.Hud, lines: ["uno", "two"] });

		ui.SetHud("a", null);
		ui.SetHud("missing", null); // removing something absent changes nothing
		ui.Flush(1300);
		expect(port.sent[2]).toEqual({ type: UiMsg.Hud, lines: ["two"] });
	});

	it("bars: clamps, replaces, removes, and only sends what changed", () => {
		const port = new FakePort();
		const ui = new UiService(asPort(port));

		ui.SetBar("hp", "HP", 2);
		ui.SetBar("mp", "MP", -1);
		ui.Flush(1000);
		expect(port.sent).toEqual([{ type: UiMsg.Bars, bars: [{ id: "hp", label: "HP", value: 1 }, { id: "mp", label: "MP", value: 0 }] }]);

		ui.SetBar("hp", "HP", 1); // same value: no change
		ui.Flush(1200);
		expect(port.sent).toHaveLength(1);

		ui.SetBar("hp", "HP!", 1); // new label
		ui.SetBar("mp", "MP", 0.5);
		ui.SetBar("mp", "", null);
		ui.SetBar("nothing", "", null);
		ui.Flush(1400);
		expect(port.sent[1]).toEqual({ type: UiMsg.Bars, bars: [{ id: "hp", label: "HP!", value: 1 }] });
	});

	it("ClearHud empties lines and bars (and does not announce an already empty HUD)", () => {
		const port = new FakePort();
		const ui = new UiService(asPort(port));
		ui.ClearHud();
		ui.Flush(1000);
		expect(port.sent).toEqual([]);

		ui.SetHud("a", "x");
		ui.SetBar("b", "B", 0.5);
		ui.Flush(1000);
		port.sent.length = 0;

		ui.ClearHud();
		ui.Flush(1200);
		expect(port.sent).toEqual([{ type: UiMsg.Hud, lines: [] }, { type: UiMsg.Bars, bars: [] }]);
	});
});

describe("AudioService", () => {
	it("asks the audio worker to play a sound, with or without a position", () => {
		const port = new FakePort();
		const audio = new AudioService(asPort(port));
		audio.PlaySound("coin");
		audio.PlaySound("coin", new Vec3(1, 2, 3));
		expect(port.sent).toEqual([
			{ action: SoundAction.PlaySound, soundId: "coin" },
			{ action: SoundAction.PlaySound, soundId: "coin", position: [1, 2, 3] },
		]);
	});
});

describe("RenderService", () => {
	it("posts spawn/remove/visibility/colour/environment/clear messages", () => {
		const port = new FakePort();
		const render = new RenderService(asPort(port));
		const transform: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 1];
		render.Spawn(1, { shape: RendMesh.Sphere, diameter: 1 }, transform);
		render.Spawn(2, { shape: RendMesh.Sphere, diameter: 1 }, transform, [1, 0, 0]);
		render.Remove(1);
		render.SetVisible(2, false);
		render.SetColor(2, [0, 1, 0]);
		render.SetEnvironment([0.1, 0.2, 0.3]);
		render.ClearScene();

		expect(port.sent).toEqual([
			{ operation: RendOpType.SpawnEntity, entityId: 1, mesh: { shape: RendMesh.Sphere, diameter: 1 }, transform },
			{ operation: RendOpType.SpawnEntity, entityId: 2, mesh: { shape: RendMesh.Sphere, diameter: 1 }, transform, color: [1, 0, 0] },
			{ operation: RendOpType.RemoveEntity, entityId: 1 },
			{ operation: RendOpType.SetVisible, entityId: 2, visible: false },
			{ operation: RendOpType.SetColor, entityId: 2, color: [0, 1, 0] },
			{ operation: RendOpType.SetEnvironment, clearColor: [0.1, 0.2, 0.3] },
			{ operation: RendOpType.ClearScene },
		]);
	});

	it("Sync resolves on acknowledgement; PostFrame transfers the buffer", async () => {
		const port = new FakePort();
		const render = new RenderService(asPort(port));
		const sync = render.Sync();
		expect(port.sent[0]).toEqual({ operation: RendOpType.Sync, token: 1 });
		render.AcknowledgeSync(1);
		await sync;

		const buffer = new ArrayBuffer(16);
		render.PostFrame(7, 2, buffer, null);
		expect(port.sent[1]).toEqual({ operation: RendOpType.Frame, frameId: 7, camera: null, entityCount: 2, buffer });
		expect(port.transfers[1]).toEqual([buffer]);
		expect(render.MainCamera).toBeNull();
	});
});

describe("PhysicsService", () => {
	const transform: [number, number, number, number, number, number, number] = [1, 2, 3, 0, 0, 0, 1];
	const box = { shape: PhysShape.Box as const, size: [1, 1, 1] as [number, number, number] };
	const create = () => {
		const port = new FakePort();
		const service = new PhysicsService(asPort(port));
		const commands = (): PhysicsCommand[] => port.sent.flatMap((m) => (m as { commands: PhysicsCommand[]; }).commands);
		return { port, service, commands };
	};

	it("batches commands: nothing is sent before Flush, one message per flush, nothing for an empty queue", () => {
		const { port, service } = create();
		service.Flush();
		expect(port.sent).toEqual([]);

		service.SetAwake(1, true);
		service.SetAwake(1, false);
		expect(port.sent).toEqual([]);
		service.Flush();
		expect(port.sent).toHaveLength(1);
		expect((port.sent[0] as { commands: unknown[]; }).commands).toHaveLength(2);
	});

	it("spawns bodies with exactly the fields given, and tracks their kinds and state", () => {
		const { service, commands } = create();
		service.SpawnBody({ entityId: 1, bodyType: PhysBodyType.Static, shape: box, transform, layer: 1, mask: -1 });
		service.SpawnBody({
			entityId: 2, bodyType: PhysBodyType.Dynamic, shape: box, transform, layer: 16, mask: -1,
			objectKind: PhysObjectKind.Solid, mass: 3, continuousDetection: true,
		});
		service.SpawnBody({ entityId: 3, bodyType: PhysBodyType.Kinematic, shape: box, transform, layer: 2, mask: -1, objectKind: PhysObjectKind.Trigger });
		service.Flush();

		const [staticBody, dynamicBody, kinematicBody] = commands() as Extract<PhysicsCommand, { operation: PhysOpType.SpawnBody; }>[];
		expect(staticBody).not.toHaveProperty("mass");
		expect(staticBody).not.toHaveProperty("continuousDetection");
		expect(staticBody!.objectKind).toBe(PhysObjectKind.Solid);
		expect(dynamicBody).toMatchObject({ mass: 3, continuousDetection: true, bodyType: PhysBodyType.Dynamic });
		expect(kinematicBody!.objectKind).toBe(PhysObjectKind.Trigger);

		expect(service.GetKind(1)).toBe(PhysObjectKind.Solid);
		expect(service.GetKind(3)).toBe(PhysObjectKind.Trigger);
		expect(service.GetBodyState(1)).toBeUndefined(); // statics have no state
		expect(service.GetBodyState(2)?.Position.ToTuple()).toEqual([1, 2, 3]);
		expect(service.GetBodyState(2)?.Rotation.ToTuple()).toEqual([0, 0, 0, 1]);

		service.RemoveBody(2);
		expect(service.GetBodyState(2)).toBeUndefined();
		expect(service.GetKind(2)).toBeUndefined();
	});

	it("translates every body command", () => {
		const { service, commands } = create();
		const characterState = service.RegisterCharacter(5);
		expect(characterState.IsOnFloor).toBe(false);
		expect(service.GetCharacterState(5)).toBe(characterState);

		service.RemoveBody(5);
		service.SetPose(1, transform);
		service.SetKinematicPose(1, transform);
		service.SetLinearVelocity(1, new Vec3(1, 2, 3));
		service.SetAngularVelocity(1, new Vec3(4, 5, 6));
		service.ApplyImpulse(1, new Vec3(0, 1, 0));
		service.ApplyImpulse(1, new Vec3(0, 1, 0), new Vec3(1, 0, 0));
		service.SetAwake(1, true);
		service.MoveCharacter(1, new Vec3(0, 0, -1), 2, -1);
		service.MoveCharacter(1, new Vec3(0, 0, -1), 2, -1, { skinWidth: 0.1 });
		service.Flush();

		expect(commands().map((c) => c.operation)).toEqual([
			PhysOpType.RemoveBody, PhysOpType.SetPose, PhysOpType.SetKinematicPose, PhysOpType.SetLinearVelocity, PhysOpType.SetAngularVelocity,
			PhysOpType.ApplyImpulse, PhysOpType.ApplyImpulse, PhysOpType.SetAwake, PhysOpType.MoveCharacter, PhysOpType.MoveCharacter,
		]);
		expect(commands()[5]).toMatchObject({ impulse: [0, 1, 0], offset: [0, 0, 0] });
		expect(commands()[6]).toMatchObject({ offset: [1, 0, 0] });
		expect(commands()[8]).not.toHaveProperty("options");
		expect(commands()[9]).toMatchObject({ options: { skinWidth: 0.1 } });
		expect(service.GetCharacterState(5)).toBeUndefined(); // removed with its body
	});

	it("queries return promises that resolve with the physics worker's answer", async () => {
		const { service, commands } = create();
		const cast = service.SweepSphere(new Vec3(0, 1, 0), new Vec3(0, 0, -1), 10, 0.1, -1, 1);
		const castExcluding = service.SweepSphere(new Vec3(0, 1, 0), new Vec3(0, 0, -1), 10, 0.1, -1, 1, 7);
		const projectile = service.SweepProjectile(4, new Vec3(), new Vec3(0, 0, -1), 0.016, 0.1, 4, 1);
		const awake = service.IsAwake(9);
		service.Flush();

		const queries = commands().filter((c): c is Extract<PhysicsCommand, { operation: PhysOpType.Query; }> => c.operation === PhysOpType.Query);
		expect(queries.map((q) => q.query.type)).toEqual([PhysQueryType.SweepSphere, PhysQueryType.SweepSphere, PhysQueryType.SweepProjectile, PhysQueryType.AwakeState]);
		expect(queries[0]!.query).not.toHaveProperty("excludeEntityId");
		expect(queries[1]!.query).toMatchObject({ excludeEntityId: 7 });

		const hit = { hit: true, position: [0, 0, 0], point: [0, 0, 0], normal: [0, 1, 0], distance: 3, hitEntityId: 2 };
		service.HandleMessage({ state: PhysState.QueryResult, queryId: queries[0]!.queryId, result: hit as never });
		service.HandleMessage({ state: PhysState.QueryResult, queryId: queries[1]!.queryId, result: { ...hit, hit: false } as never });
		service.HandleMessage({ state: PhysState.QueryResult, queryId: queries[2]!.queryId, result: { hit: false } as never });
		service.HandleMessage({ state: PhysState.QueryResult, queryId: queries[3]!.queryId, result: { awake: true } });
		service.HandleMessage({ state: PhysState.QueryResult, queryId: 12345, result: { awake: false } }); // nobody waits for it

		await expect(cast).resolves.toMatchObject({ hit: true, distance: 3 });
		await expect(castExcluding).resolves.toMatchObject({ hit: false });
		await expect(projectile).resolves.toMatchObject({ hit: false });
		await expect(awake).resolves.toBe(true);
	});

	it("applies step snapshots to bodies and characters, and reports overlap transitions", () => {
		const { service } = create();
		service.SpawnBody({ entityId: 10, bodyType: PhysBodyType.Dynamic, shape: box, transform, layer: 1, mask: -1 });
		const character = service.RegisterCharacter(20);
		const steps: { step: number; overlaps: unknown[]; }[] = [];
		service.OnStep = (step, overlaps) => steps.push({ step, overlaps });

		const bodies = new Float64Array(BODY_STRIDE * 2);
		bodies.set([10, 7, 8, 9, 0, 0, 0, 1, 1, 2, 3, 4, 5, 6], 0);
		bodies.set([999, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0], BODY_STRIDE); // removed on our side meanwhile
		const characters = new Float64Array(CHARACTER_STRIDE * 2);
		characters.set([20, 1, 0, 1, 0, 33, 4, 5, 6], 0);
		characters.set([777, 1, 0, 1, 0, 0, 0, 0, 0], CHARACTER_STRIDE); // unknown character

		const before = performance.now();
		service.HandleMessage({
			state: PhysState.Step, step: 5, bodyCount: 2, bodies: bodies.buffer, characterCount: 2, characters: characters.buffer,
			overlaps: new Int32Array([1, 2, 1, 3, 4, 0]),
		});

		const state = service.GetBodyState(10)!;
		expect(state.Position.ToTuple()).toEqual([7, 8, 9]);
		expect(state.LinearVelocity.ToTuple()).toEqual([1, 2, 3]);
		expect(state.AngularVelocity.ToTuple()).toEqual([4, 5, 6]);
		expect(character).toMatchObject({ IsOnFloor: true, GroundEntityId: 33 });
		expect(character.Velocity.ToTuple()).toEqual([4, 5, 6]);
		expect(service.LastStepTimeMs).toBeGreaterThanOrEqual(before);
		expect(steps).toEqual([{ step: 5, overlaps: [{ entityA: 1, entityB: 2, entered: true }, { entityA: 3, entityB: 4, entered: false }] }]);

		service.HandleMessage({ state: PhysState.Step, step: 6, bodyCount: 0, bodies: new ArrayBuffer(0), characterCount: 0, characters: new ArrayBuffer(0), overlaps: null });
		expect(steps[1]).toEqual({ step: 6, overlaps: [] });
	});

	it("a step without an OnStep listener is simply applied", () => {
		const { service } = create();
		service.SpawnBody({ entityId: 10, bodyType: PhysBodyType.Dynamic, shape: box, transform, layer: 1, mask: -1 });
		const bodies = new Float64Array(BODY_STRIDE);
		bodies.set([10, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
		service.HandleMessage({ state: PhysState.Step, step: 1, bodyCount: 1, bodies: bodies.buffer, characterCount: 0, characters: new ArrayBuffer(0), overlaps: new Int32Array([1, 2, 1]) });
		expect(service.GetBodyState(10)!.Position.ToTuple()).toEqual([1, 1, 1]);
	});

	it("ResetWorld clears state, sets gravity, ignores in-flight snapshots until acknowledged, and resolves on the ack", async () => {
		const { service, port, commands } = create();
		service.SpawnBody({ entityId: 10, bodyType: PhysBodyType.Dynamic, shape: box, transform, layer: 1, mask: -1 });
		service.RegisterCharacter(20);
		service.SweepSphere(new Vec3(), new Vec3(0, 1, 0), 1, 0.1, 1, 1); // dropped by the reset

		let done = false;
		const reset = service.ResetWorld({ gravity: [0, -9.8, 0] }).then(() => { done = true; });
		expect(service.Gravity.ToTuple()).toEqual([0, -9.8, 0]);
		expect(service.GetBodyState(10)).toBeUndefined();
		expect(service.GetCharacterState(20)).toBeUndefined();
		expect(commands().map((c) => c.operation)).toEqual([PhysOpType.ResetWorld, PhysOpType.Sync]); // the stale spawn/query are gone

		const stale = new Float64Array(BODY_STRIDE);
		stale.set([10, 5, 5, 5, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
		service.SpawnBody({ entityId: 10, bodyType: PhysBodyType.Dynamic, shape: box, transform, layer: 1, mask: -1 });
		service.HandleMessage({ state: PhysState.Step, step: 1, bodyCount: 1, bodies: stale.buffer, characterCount: 0, characters: new ArrayBuffer(0), overlaps: null });
		expect(service.GetBodyState(10)!.Position.ToTuple()).toEqual([1, 2, 3]); // the old world's snapshot was ignored

		await Promise.resolve();
		expect(done).toBe(false);
		const sync = commands().find((c) => c.operation === PhysOpType.Sync) as { token: number; };
		service.HandleMessage({ state: PhysState.SyncAck, token: sync.token });
		await reset;
		expect(done).toBe(true);
		expect(port.sent.length).toBeGreaterThan(0);

		const fresh = new Float64Array(BODY_STRIDE);
		fresh.set([10, 6, 6, 6, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
		service.HandleMessage({ state: PhysState.Step, step: 2, bodyCount: 1, bodies: fresh.buffer, characterCount: 0, characters: new ArrayBuffer(0), overlaps: null });
		expect(service.GetBodyState(10)!.Position.ToTuple()).toEqual([6, 6, 6]); // snapshots flow again
	});

	it("Sync sends a marker and resolves on its ack", async () => {
		const { service, commands } = create();
		const sync = service.Sync();
		const marker = commands().find((c) => c.operation === PhysOpType.Sync) as { token: number; };
		service.HandleMessage({ state: PhysState.SyncAck, token: marker.token });
		await sync;
	});

	it("announces readiness", () => {
		const { service } = create();
		const ready = vi.fn();
		service.OnReady = ready;
		expect(service.Ready).toBe(false);
		service.HandleMessage({ state: PhysState.Ready });
		expect(service.Ready).toBe(true);
		expect(ready).toHaveBeenCalledOnce();

		const noListener = create().service;
		noListener.HandleMessage({ state: PhysState.Ready }); // OnReady unset: still fine
		expect(noListener.Ready).toBe(true);
	});

	it("after a failed wasm load nothing is sent or awaited", async () => {
		const { service, port } = create();
		const ready = vi.fn();
		service.OnReady = ready;
		service.HandleMessage({ state: PhysState.Failed, message: "404" });

		expect(service.Failed).toBe(true);
		expect(service.FailureMessage).toBe("404");
		expect(ready).toHaveBeenCalledOnce(); // boot must not wait for a "ready" that will never come

		service.SetAwake(1, true);
		service.Flush();
		await service.ResetWorld({ gravity: [0, -1, 0] });
		await service.Sync();
		expect(port.sent).toEqual([]);
		expect(service.Gravity.ToTuple()).toEqual([0, -1, 0]);

		const noListener = create().service;
		noListener.HandleMessage({ state: PhysState.Failed, message: "x" }); // OnReady unset: still fine
		expect(noListener.Failed).toBe(true);
	});

	it("Quat tuples survive the round trip into body state", () => {
		const { service } = create();
		service.SpawnBody({ entityId: 1, bodyType: PhysBodyType.Dynamic, shape: box, transform: [0, 0, 0, 0, 1, 0, 0], layer: 1, mask: -1 });
		expect(service.GetBodyState(1)!.Rotation).toEqual(new Quat(0, 1, 0, 0));
	});
});

describe("InputService: the cursor and the wheel (free-cursor scenes)", () => {
	it("knows where the cursor is on the game view and when it left; wheel steps add up until read, only while playing", async () => {
		const { InputService } = await import("../Source/Engine/Services/InputService");
		const { InputEvtType } = await import("../Source/Workers/Common/CommonEnums");
		const input = new InputService();
		expect(input.Cursor).toBeNull();
		input.Handle({ kind: InputEvtType.PointerMove, dx: 1, dy: 1, x: 0.25, y: 0.75 });
		expect(input.Cursor).toBeNull(); // not playing: nothing to report
		input.CapturePlayerInput = true;
		input.Handle({ kind: InputEvtType.PointerMove, dx: 1, dy: 1, x: 0.25, y: 0.75 });
		expect(input.Cursor).toEqual([0.25, 0.75]);
		input.Handle({ kind: InputEvtType.PointerMove, dx: 3, dy: 0 }); // a locked pointer has no position: the last one stays
		expect(input.Cursor).toEqual([0.25, 0.75]);
		input.Handle({ kind: InputEvtType.PointerLeave });
		expect(input.Cursor).toBeNull();
		input.Handle({ kind: InputEvtType.Wheel, dy: 100 });
		input.Handle({ kind: InputEvtType.Wheel, dy: 100 });
		expect(input.ConsumeWheel()).toBe(200);
		expect(input.ConsumeWheel()).toBe(0);
		input.CapturePlayerInput = false;
		input.Handle({ kind: InputEvtType.Wheel, dy: 100 });
		input.CapturePlayerInput = true;
		expect(input.ConsumeWheel()).toBe(0); // what turned while not playing doesn't count
		input.Handle({ kind: InputEvtType.Wheel, dy: -50 });
		input.Handle({ kind: InputEvtType.ReleaseAll });
		expect(input.ConsumeWheel()).toBe(0);
	});

	it("UiService reports a finished scene with its cursor mode", async () => {
		const { UiService } = await import("../Source/Engine/Services/UiService");
		const { UiMsg } = await import("../Source/Workers/Common/CommonEnums");
		const sent: unknown[] = [];
		const ui = new UiService({ postMessage: (m: unknown) => sent.push(m) } as never);
		ui.LoadFinished("top-down", "free");
		ui.LoadFinished("room");
		expect(sent).toEqual([{ type: UiMsg.LoadFinished, sceneId: "top-down", cursor: "free" }, { type: UiMsg.LoadFinished, sceneId: "room", cursor: "locked" }]);
	});
});
