// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { CameraComponent, FixedCamera } from "../Source/Engine/Components/Camera/CameraComponent";
import { Follower } from "../Source/Engine/Components/Follower";
import { MeshRenderer } from "../Source/Engine/Components/MeshRenderer";
import { MovementPreset, MProfile } from "../Source/Engine/Components/Mover/MovementTypes";
import { MoverComponent } from "../Source/Engine/Components/Mover/MoverComponent";
import { CharacterBody } from "../Source/Engine/Components/Physics/CharacterBody";
import { KinematicBody, RigidBody, StaticBody } from "../Source/Engine/Components/Physics/PhysicsBodies";
import { Projectile, type IProjectileHitListener } from "../Source/Engine/Components/Physics/Projectile";
import { Component } from "../Source/Engine/Core/Component";
import { CollisionLayer } from "../Source/Engine/Core/CollisionLayer";
import type { Entity } from "../Source/Engine/Core/Entity";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { Meshes, Shapes } from "../Source/Engine/Core/Shapes";
import { Quat } from "../Source/Engine/Math/Quat";
import { Vec3 } from "../Source/Engine/Math/Vec3";
import { InputEvtType, PhysBodyType, PhysObjectKind, PhysOpType, PhysQueryType, PhysState, RendOpType, UiMsg } from "../Source/Workers/Common/CommonEnums";
import type { PhysicsCommand } from "../Source/Workers/Protocol/PhysicsGameLogicProtocol";
import { MakeEngine, type TestEngine } from "./engine";

const find = <T extends PhysOpType>(commands: PhysicsCommand[], operation: T): Extract<PhysicsCommand, { operation: T; }>[] =>
	commands.filter((c): c is Extract<PhysicsCommand, { operation: T; }> => c.operation === operation);

const settle = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };

describe("MeshRenderer", () => {
	it("spawns its mesh in the renderer, registers as renderable, and removes both on destroy", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Thing", [Comp(MeshRenderer, { Mesh: Meshes.Sphere(1), Color: [1, 0, 0] })], { position: [1, 2, 3] }));
		t.world.FlushLifecycle();

		expect(t.ports.render.sent[0]).toMatchObject({ operation: RendOpType.SpawnEntity, entityId: e.Id, color: [1, 0, 0], transform: [1, 2, 3, 0, 0, 0, 1] });
		expect(t.world.Renderables.has(e.Id)).toBe(true);

		e.Destroy();
		t.world.FlushDestroyed();
		expect(t.ports.render.sent.at(-1)).toMatchObject({ operation: RendOpType.RemoveEntity, entityId: e.Id });
		expect(t.world.Renderables.has(e.Id)).toBe(false);
	});

	it("starts hidden when asked to; SetVisible / SetColor tell the renderer, and repeats are ignored", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Thing", [Comp(MeshRenderer, { Mesh: Meshes.Box(1, 1, 1), Visible: false })]));
		t.world.FlushLifecycle();
		const renderer = e.GetComponent(MeshRenderer)!;
		expect(t.ports.render.sent[1]).toMatchObject({ operation: RendOpType.SetVisible, visible: false });

		const before = t.ports.render.sent.length;
		renderer.SetVisible(false); // no change
		expect(t.ports.render.sent.length).toBe(before);
		renderer.SetVisible(true);
		expect(t.ports.render.sent.at(-1)).toMatchObject({ operation: RendOpType.SetVisible, visible: true });
		renderer.SetColor([0, 1, 0]);
		expect(t.ports.render.sent.at(-1)).toMatchObject({ operation: RendOpType.SetColor, color: [0, 1, 0] });
		expect(renderer.Color).toEqual([0, 1, 0]);
	});

	it("without a mesh it does nothing at all", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Empty", [Comp(MeshRenderer)]));
		t.world.FlushLifecycle();
		const renderer = e.GetComponent(MeshRenderer)!;
		renderer.SetVisible(false);
		renderer.SetColor([1, 1, 1]);
		e.Destroy();
		t.world.FlushDestroyed();
		expect(t.ports.render.sent).toEqual([]);
		expect(t.world.Renderables.size).toBe(0);
	});
});

describe("Follower", () => {
	it("keeps its entity at an offset in the target's local space, using the target's pose", () => {
		const t = MakeEngine();
		const turn = Quat.FromAxisAngle(Vec3.Up(), Math.PI / 2);
		t.world.Spawn(Ent("Player", [], { position: [10, 0, 0], rotation: turn.ToTuple() }));
		const f = t.world.Spawn(Ent("Marker", [Comp(Follower, { Offset: [0, 0, -1] })]));
		t.world.FlushLifecycle();
		t.frame();

		// Forward (-Z) of a player turned 90 degrees about Y is -X.
		expect(f.Transform.Position.X).toBeCloseTo(9);
		expect(f.Transform.Position.Z).toBeCloseTo(0);
		expect(f.Transform.Rotation.ToTuple()[1]).toBeCloseTo(turn.Y);
	});

	it("ignores the target's rotation when FollowRotation is off, and waits for a target to exist", () => {
		const t = MakeEngine();
		const f = t.world.Spawn(Ent("Marker", [Comp(Follower, { FollowRotation: false, Offset: [1, 0, 0] })], { position: [5, 5, 5] }));
		t.world.FlushLifecycle();
		t.frame();
		expect(f.Transform.Position.ToTuple()).toEqual([5, 5, 5]); // no target yet: untouched

		t.world.Spawn(Ent("Player", [], { position: [0, 0, 0], rotation: Quat.FromAxisAngle(Vec3.Up(), 1).ToTuple() }));
		t.world.FlushLifecycle();
		t.frame();
		expect(f.Transform.Position.ToTuple()).toEqual([1, 0, 0]);
		expect(f.Transform.Rotation.ToTuple()).toEqual([0, 0, 0, 1]);
	});
});

describe("physics body components", () => {
	it("StaticBody spawns an immobile solid body and removes it on destroy", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Wall", [Comp(StaticBody, { Shape: Shapes.Box(1, 1, 1), Layer: CollisionLayer.World, Mask: CollisionLayer.Prop })]));
		t.world.FlushLifecycle();
		expect(find(t.commands(), PhysOpType.SpawnBody)[0]).toMatchObject({ entityId: e.Id, bodyType: PhysBodyType.Static, objectKind: PhysObjectKind.Solid, layer: CollisionLayer.World, mask: CollisionLayer.Prop });
		expect(t.physics.GetBodyState(e.Id)).toBeUndefined();
		e.GetComponent(StaticBody)!.OnPhysicsSync(); // nothing to sync

		e.Destroy();
		t.world.FlushDestroyed();
		expect(find(t.commands(), PhysOpType.RemoveBody)[0]).toMatchObject({ entityId: e.Id });
	});

	it("RigidBody is dynamic, takes mass/ccd, and mirrors the simulation into its Transform", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Ball", [Comp(RigidBody, { Shape: Shapes.Sphere(0.5), Mass: 3, ContinuousDetection: true })], { position: [0, 5, 0] }));
		t.world.FlushLifecycle();
		expect(find(t.commands(), PhysOpType.SpawnBody)[0]).toMatchObject({ bodyType: PhysBodyType.Dynamic, mass: 3, continuousDetection: true });
		expect(e.Transform.IsPhysicsDriven).toBe(true);

		const body = e.GetComponent(RigidBody)!;
		expect(body.LinearVelocity.ToTuple()).toEqual([0, 0, 0]); // spawn state, no step yet

		t.step([{ id: e.Id, pos: [1, 2, 3], quat: [0, 0, 0, 1], linear: [4, 5, 6], angular: [7, 8, 9] }]);
		expect(e.Transform.Position.ToTuple()).toEqual([1, 2, 3]);
		expect(e.Transform.PreviousPosition.ToTuple()).toEqual([0, 5, 0]);
		expect(body.LinearVelocity.ToTuple()).toEqual([4, 5, 6]);
		expect(body.AngularVelocity.ToTuple()).toEqual([7, 8, 9]);
	});

	it("RigidBody velocity getters are zero when the body has no state, and OnPhysicsSync tolerates that", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Ball", [Comp(RigidBody, { Shape: Shapes.Sphere(0.5) })]));
		t.world.FlushLifecycle();
		t.physics.RemoveBody(e.Id); // forget the state, as after a world reset
		const body = e.GetComponent(RigidBody)!;
		expect(body.LinearVelocity.ToTuple()).toEqual([0, 0, 0]);
		expect(body.AngularVelocity.ToTuple()).toEqual([0, 0, 0]);
		expect(() => body.OnPhysicsSync()).not.toThrow();
	});

	it("RigidBody commands: velocities, impulses (centred and at a point), teleport", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Ball", [Comp(RigidBody, { Shape: Shapes.Sphere(0.5) })], { position: [1, 1, 1] }));
		t.world.FlushLifecycle();
		t.commands();
		const body = e.GetComponent(RigidBody)!;

		body.SetLinearVelocity(new Vec3(1, 2, 3));
		body.SetAngularVelocity(new Vec3(4, 5, 6));
		body.ApplyImpulse(new Vec3(0, 7, 0));
		body.ApplyImpulse(new Vec3(0, 7, 0), new Vec3(2, 1, 1));
		body.Teleport(new Vec3(9, 9, 9));
		body.Teleport(new Vec3(8, 8, 8), Quat.FromAxisAngle(Vec3.Up(), 1));

		const sent = t.commands();
		expect(find(sent, PhysOpType.SetLinearVelocity)[0]).toMatchObject({ velocity: [1, 2, 3] });
		expect(find(sent, PhysOpType.SetAngularVelocity)[0]).toMatchObject({ velocity: [4, 5, 6] });
		const impulses = find(sent, PhysOpType.ApplyImpulse);
		expect(impulses[0]).toMatchObject({ impulse: [0, 7, 0], offset: [0, 0, 0] });
		expect(impulses[1]).toMatchObject({ offset: [1, 0, 0] }); // world point relative to the body centre
		const poses = find(sent, PhysOpType.SetPose);
		expect(poses[0]!.transform.slice(0, 3)).toEqual([9, 9, 9]);
		expect(poses[1]!.transform[4]).toBeCloseTo(Math.sin(0.5));
	});

	it("KinematicBody reports its Transform to the simulation every physics step", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Lift", [Comp(KinematicBody, { Shape: Shapes.Box(4, 0.4, 4) })], { position: [0, 1, 0] }));
		t.world.FlushLifecycle();
		expect(find(t.commands(), PhysOpType.SpawnBody)[0]).toMatchObject({ bodyType: PhysBodyType.Kinematic });

		e.Transform.Position.Y = 2;
		t.step();
		expect(find(t.commands(), PhysOpType.SetKinematicPose)[0]).toMatchObject({ entityId: e.Id, transform: [0, 2, 0, 0, 0, 0, 1] });
	});
});

describe("CharacterBody", () => {
	it("builds a capsule from radius/height, registers for results, and applies them only after a move was sent", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Hero", [Comp(CharacterBody, { Radius: 0.4, Height: 1.8 })], { position: [0, 1, 0] }));
		t.world.FlushLifecycle();
		const body = e.GetComponent(CharacterBody)!;

		const spawn = find(t.commands(), PhysOpType.SpawnBody)[0]!;
		expect(spawn).toMatchObject({ bodyType: PhysBodyType.Kinematic, objectKind: PhysObjectKind.Character, layer: CollisionLayer.Character });
		expect(spawn.shape).toEqual(Shapes.Capsule(0.4, 1.8));
		expect(body.Gravity.ToTuple()).toEqual([0, -20, 0]);

		// Before any move: snapshots move the body but the floor/velocity results are ignored.
		t.step([{ id: e.Id, pos: [0, 1, 0] }], [{ id: e.Id, onFloor: true, ground: 5, velocity: [1, 1, 1] }]);
		expect(body.IsOnFloor).toBe(false);
		expect(body.Velocity.ToTuple()).toEqual([0, 0, 0]);

		body.MoveAndSlide(1 / 60);
		const move = find(t.commands(), PhysOpType.MoveCharacter)[0]!;
		expect(move.options).toEqual({ maxSlideIterations: 4, skinWidth: 0.015, maxFloorAngleDegrees: 46, floorProbeDistance: 0.08 });

		t.step([{ id: e.Id, pos: [0, 1, 0] }], [{ id: e.Id, onFloor: true, ground: 5, velocity: [1, 2, 3], normal: [0, 0.9, 0.1] }]);
		expect(body.IsOnFloor).toBe(true);
		expect(body.GroundEntityId).toBe(5);
		expect(body.Velocity.ToTuple()).toEqual([1, 2, 3]);
		expect(body.FloorNormal.ToTuple()).toEqual([0, 0.9, 0.1]);
	});

	it("Teleport clears momentum and moves the body; Face turns the visual", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Hero", [Comp(CharacterBody)], { position: [0, 1, 0] }));
		t.world.FlushLifecycle();
		t.commands();
		const body = e.GetComponent(CharacterBody)!;

		body.Velocity.Set(0, -30, 0);
		body.Teleport(new Vec3(5, 6, 7));
		expect(body.Velocity.ToTuple()).toEqual([0, 0, 0]);
		expect(e.Transform.Position.ToTuple()).toEqual([5, 6, 7]);
		expect(find(t.commands(), PhysOpType.SetPose)[0]!.transform.slice(0, 3)).toEqual([5, 6, 7]);

		body.Face(Quat.FromAxisAngle(Vec3.Up(), 1));
		expect(e.Transform.Rotation.Y).toBeCloseTo(Math.sin(0.5));
	});

	it("tolerates having no body or character state (after a world reset)", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Hero", [Comp(CharacterBody)]));
		t.world.FlushLifecycle();
		t.physics.RemoveBody(e.Id);
		expect(() => e.GetComponent(CharacterBody)!.OnPhysicsSync()).not.toThrow();
	});
});

describe("MoverComponent", () => {
	function Level(t: TestEngine, props: Parameters<typeof Comp<MoverComponent>>[1] = {}, withCamera = true) {
		if (withCamera) t.world.Spawn(Ent("Camera", [Comp(CameraComponent, { TargetName: "Player" })]));
		const player = t.world.Spawn(Ent("Player", [Comp(MoverComponent, props)], { position: [0, 1.2, 0], tags: ["player"] }));
		t.world.FlushLifecycle();
		t.input.CapturePlayerInput = true;
		const mover = player.GetComponent(MoverComponent)!;
		const stand = (velocity: [number, number, number] = [0, 0, 0], ground = 0): void =>
			t.step([{ id: player.Id, pos: player.Transform.Position.ToTuple() }], [{ id: player.Id, onFloor: true, velocity, ground }]);
		const lastMove = () => find(t.commands(), PhysOpType.MoveCharacter).at(-1)!;
		return { player, mover, stand, lastMove };
	}

	it("creates the stock profile (jump height 1.8) unless one is given, and starts in QuakeStrafeDoom2016", () => {
		const t = MakeEngine();
		const { mover } = Level(t);
		expect(mover.Profile).toMatchObject({ JumpHeight: 1.8, MaxSpeed: 7 });
		expect(mover.CurrentMode).toBe(MovementPreset.QuakeStrafeDoom2016);

		const custom = new MProfile();
		const t2 = MakeEngine();
		expect(Level(t2, { Profile: custom, InitialMode: MovementPreset.Hybrid }).mover.Profile).toBe(custom);
	});

	it("W runs the player forward (-Z, camera-relative), D to the right, S back, A left", () => {
		const t = MakeEngine();
		const { stand, lastMove } = Level(t);

		for (const [key, axis, sign] of [["KeyW", 2, -1], ["KeyS", 2, 1], ["KeyD", 0, 1], ["KeyA", 0, -1]] as const) {
			t.press(key);
			stand();
			stand();
			stand();
			const velocity = lastMove().velocity;
			expect(Math.sign(velocity[axis])).toBe(sign);
			t.release(key);
			for (let i = 0; i < 60; i++) stand(); // friction brings it to a halt before the next key
		}
	});

	it("without a camera it steers along the world axes", () => {
		const t = MakeEngine();
		const { stand, lastMove } = Level(t, {}, false);
		t.press("KeyW");
		stand();
		stand();
		expect(lastMove().velocity[2]).toBeLessThan(0);
	});

	it("feeds the plane-clipped velocity from the last move back into the motor", () => {
		const t = MakeEngine();
		const { stand, lastMove } = Level(t);
		stand(); // first tick: no result yet
		stand([0.5, 0, 0]); // the simulation says: slid into a wall, 0.5 m/s left along +X
		const velocity = lastMove().velocity; // (commands are drained when read: look at them once)
		expect(velocity[0]).toBeLessThanOrEqual(0.5);
		expect(velocity[0]).toBeGreaterThan(0);
	});

	it("jumps on Space (jump height from the profile) and applies gravity in the air", () => {
		const t = MakeEngine();
		const { player, stand, lastMove } = Level(t);
		stand();
		t.press("Space");
		stand();
		expect(lastMove().velocity[1]).toBeGreaterThan(5);

		t.release("Space");
		// The simulation reports the player in the air, still rising at 2 m/s: gravity takes some of that away.
		t.step([{ id: player.Id, pos: [0, 3, 0] }], [{ id: player.Id, onFloor: false, velocity: [0, 2, 0] }]);
		const velocity = lastMove().velocity[1]!;
		expect(velocity).toBeLessThan(2);
		expect(velocity).toBeCloseTo(2 - 20 / 60, 5);
	});

	it("keys 1-5 switch the movement mode (and choosing the current one changes nothing)", () => {
		const t = MakeEngine();
		const { mover } = Level(t);
		for (const [key, mode] of [
			["Digit1", MovementPreset.Quake], ["Digit2", MovementPreset.Realistic], ["Digit3", MovementPreset.Hybrid],
			["Digit4", MovementPreset.Doom3], ["Digit5", MovementPreset.QuakeStrafeDoom2016],
		] as const) {
			t.press(key);
			t.frame();
			t.release(key);
			expect(mover.CurrentMode).toBe(mode);
		}
		mover.SetMovementMode(MovementPreset.QuakeStrafeDoom2016);
		expect(mover.CurrentMode).toBe(MovementPreset.QuakeStrafeDoom2016);
	});

	it("Doom3 mode jumps to Doom3JumpTraitHeight inches", () => {
		const t = MakeEngine();
		const { mover, stand, lastMove } = Level(t, { InitialMode: MovementPreset.Doom3, Doom3JumpTraitHeight: 90 });
		expect(mover.CurrentMode).toBe(MovementPreset.Doom3);
		stand();
		t.press("Space");
		stand();
		expect(lastMove().velocity[1]).toBeCloseTo(Math.sqrt(2 * 90 * 0.0254 * 20), 4);
	});

	it("Custom mode runs the subclass's trait list (default: Doom3-style jump, friction, accelerate, gravity, strafing)", () => {
		const t = MakeEngine();
		const { mover, stand, lastMove } = Level(t, { InitialMode: MovementPreset.Custom, Doom3JumpTraitHeight: 48 });
		expect(mover.CurrentMode).toBe(MovementPreset.Custom);
		stand();
		t.press("Space");
		stand();
		expect(lastMove().velocity[1]).toBeCloseTo(Math.sqrt(2 * 48 * 0.0254 * 20), 4);
	});

	it("an unknown mode has no traits: nothing accelerates and nothing falls", () => {
		const t = MakeEngine();
		const { player, mover, lastMove, stand } = Level(t);
		mover.SetMovementMode(99 as MovementPreset);
		t.step([{ id: player.Id, pos: [0, 5, 0] }], [{ id: player.Id, onFloor: false }]);
		stand();
		expect(lastMove().velocity).toEqual([0, 0, 0]);
	});

	it("turns the visual towards the direction of travel", () => {
		const t = MakeEngine();
		const { player, stand } = Level(t);
		t.press("KeyD");
		for (let i = 0; i < 90; i++) stand();
		const facing = player.Transform.Rotation.Rotate(Vec3.Forward());
		expect(facing.X).toBeGreaterThan(0.95);

		t.release("KeyD");
		const before = player.Transform.Rotation.ToTuple();
		for (let i = 0; i < 20; i++) stand();
		expect(player.Transform.Rotation.ToTuple()).toEqual(before); // no input: no turning
	});

	describe("noclip", () => {
		it("N toggles it: collisions off (layer None), no gravity, and back again with momentum cleared", () => {
			const t = MakeEngine();
			const { mover, stand, lastMove } = Level(t);
			stand();
			t.press("KeyN");
			t.frame();
			t.release("KeyN");
			expect(mover.IsNoclip).toBe(true);
			expect(mover.Layer).toBe(CollisionLayer.None);

			mover.SetNoclip(true); // already on: nothing changes
			stand();
			expect(find([lastMove()], PhysOpType.MoveCharacter)[0]).toMatchObject({ layer: CollisionLayer.None, velocity: [0, 0, 0] });

			t.press("KeyN");
			t.frame();
			expect(mover.IsNoclip).toBe(false);
			expect(mover.Layer).toBe(CollisionLayer.Character);
			expect(mover.Velocity.ToTuple()).toEqual([0, 0, 0]);
		});

		it("flies along the camera direction, pitch included", () => {
			const t = MakeEngine();
			const { mover, stand, lastMove } = Level(t);
			t.world.FindByName("Camera")!.GetComponent(CameraComponent)!.Pitch = 45;
			mover.SetNoclip(true);

			t.press("KeyW");
			stand();
			const velocity = lastMove().velocity;
			expect(velocity[1]).toBeGreaterThan(5); // looking up 45 degrees: climbing
			expect(Math.hypot(...velocity)).toBeCloseTo(mover.NoclipSpeed);

			t.release("KeyW");
			stand();
			expect(lastMove().velocity).toEqual([0, 0, 0]);
		});

		it("without a camera it flies in the world XZ plane", () => {
			const t = MakeEngine();
			const { mover, stand, lastMove } = Level(t, {}, false);
			mover.SetNoclip(true);
			t.press("KeyD");
			stand();
			expect(lastMove().velocity[0]).toBeCloseTo(mover.NoclipSpeed);
		});
	});

	describe("HUD", () => {
		it("shows mode, speed and what it stands on", () => {
			const t = MakeEngine();
			const floor = t.world.Spawn(Ent("Floor", []));
			const { stand } = Level(t);
			stand([3, 0, 4], floor.Id);
			stand([3, 0, 4], floor.Id);
			t.frame();
			t.engine.Ui.Flush(1000);

			const lines = (t.uiMessages(UiMsg.Hud).at(-1) as { lines: string[]; }).lines;
			expect(lines).toContain("Mode: QuakeStrafeDoom2016");
			const speed = lines.find((l) => l.startsWith("Speed: "))!;
			expect(Number(speed.match(/^Speed: ([\d.]+) m\/s/)![1])).toBeGreaterThan(1); // the traits' friction trims the 5 m/s the simulation reported
			expect(lines).toContain("Floor: Floor");
		});

		it("says 'yes' for an unnamed ground, 'air' when airborne, and marks noclip", () => {
			const t = MakeEngine();
			const { player, mover, stand } = Level(t);
			stand([0, 0, 0], 12345); // ground id nobody knows
			stand([0, 0, 0], 12345);
			t.frame();
			t.engine.Ui.Flush(1000);
			expect((t.uiMessages(UiMsg.Hud).at(-1) as { lines: string[]; }).lines).toContain("Floor: yes");

			t.step([{ id: player.Id, pos: [0, 4, 0] }], [{ id: player.Id, onFloor: false }]);
			mover.SetNoclip(true);
			t.frame();
			t.engine.Ui.Flush(2000);
			const lines = (t.uiMessages(UiMsg.Hud).at(-1) as { lines: string[]; }).lines;
			expect(lines).toContain("Floor: air");
			expect(lines).toContain("Mode: QuakeStrafeDoom2016  (NOCLIP)");
		});

		it("ShowHud = false keeps the HUD empty", () => {
			const t = MakeEngine();
			Level(t, { ShowHud: false });
			t.frame();
			t.engine.Ui.Flush(1000);
			expect(t.uiMessages(UiMsg.Hud)).toEqual([]);
		});
	});
});

describe("CameraComponent", () => {
	function Rig(props: Parameters<typeof Comp<CameraComponent>>[1] = {}, withPlayer = true) {
		const t = MakeEngine();
		const player = withPlayer ? t.world.Spawn(Ent("Player", [], { position: [0, 1, 0] })) : null;
		const camera = t.world.Spawn(Ent("Camera", [Comp(CameraComponent, props)], { position: [7, 7, 7] }));
		t.world.FlushLifecycle();
		t.input.CapturePlayerInput = true;
		return { t, player, camera, component: camera.GetComponent(CameraComponent)! };
	}
	const look = (t: TestEngine, dx: number, dy: number): void => { t.input.Handle({ kind: InputEvtType.PointerMove, dx, dy }); t.frame(); };

	it("registers itself as the main camera", () => {
		const { t, component } = Rig();
		expect(t.engine.Render.MainCamera).toBe(component);
	});

	it("mouse look: right turns right (yaw decreases), up looks up, pitch is clamped", () => {
		const { t, component } = Rig({ MouseSensitivity: 0.5 });
		look(t, 20, 0);
		expect(component.Yaw).toBe(-10);
		look(t, 0, -10);
		expect(component.Pitch).toBe(5);
		look(t, 0, -1000);
		expect(component.Pitch).toBe(85);
		look(t, 0, 5000);
		expect(component.Pitch).toBe(-85);
	});

	it("V toggles first/third person", () => {
		const { t, component } = Rig();
		t.press("KeyV");
		t.frame();
		expect(component.ThirdPerson).toBe(true);
		t.release("KeyV");
		t.press("KeyV");
		t.frame();
		expect(component.ThirdPerson).toBe(false);
	});

	it("first person: the pose is at the target's eye, looking where yaw/pitch say", () => {
		const { component } = Rig({ EyeHeight: 0.6, FovDegrees: 90 });
		component.Yaw = 90;
		const pose = component.GetPose(1);
		expect(pose.transform.slice(0, 3)).toEqual([0, 1.6, 0]);
		expect(pose.fov).toBeCloseTo(Math.PI / 2);

		const forward = component.GetForwardDirection();
		expect(forward.X).toBeCloseTo(-1); // yaw +90 degrees turns the view to -X
		expect(component.GetRightDirection().Z).toBeCloseTo(-1); // facing -X, your right hand points to -Z
	});

	it("without a target the camera stays at its own position", () => {
		const { component } = Rig({ TargetName: "Nobody", ThirdPerson: true }, false);
		component.Update(1 / 60); // third person but no target: no query
		expect(component.GetPose(0).transform.slice(0, 3)).toEqual([7, 7, 11]); // own position, the full arm length behind it
	});

	describe("third person spring arm", () => {
		it("asks the physics world how far back it can go, and uses the answer (margin included)", async () => {
			const { t, component } = Rig({ ThirdPerson: true, ArmLength: 4, ArmMargin: 0.05 });
			t.frame();
			const query = find(t.commands(), PhysOpType.Query)[0]!;
			expect(query.query).toMatchObject({ type: PhysQueryType.SweepSphere, maxDistance: 4, layer: CollisionLayer.Character, mask: CollisionLayer.World });

			t.frame(); // still waiting: no second question
			expect(find(t.commands(), PhysOpType.Query)).toHaveLength(0);

			t.physics.HandleMessage({ state: PhysState.QueryResult, queryId: query.queryId, result: { hit: true, position: [0, 0, 0], point: [0, 0, 0], normal: [0, 0, 1], distance: 1.5, hitEntityId: 1 } });
			await settle();
			expect(component.GetPose(0).transform[2]).toBeCloseTo(1.45); // eye at z = 0, the arm 1.5 - margin 0.05 behind it (yaw 0: +Z)
		});

		it("with nothing behind it, the full arm length is used", async () => {
			const { t, component } = Rig({ ThirdPerson: true, ArmLength: 4 });
			t.frame();
			const query = find(t.commands(), PhysOpType.Query)[0]!;
			t.physics.HandleMessage({ state: PhysState.QueryResult, queryId: query.queryId, result: { hit: false, position: [0, 0, 0], point: [0, 0, 0], normal: [0, 1, 0], distance: 4, hitEntityId: 0 } });
			await settle();
			expect(component.GetPose(0).transform[2]).toBeCloseTo(4);
		});

		it("a hit right at the player's back clamps the arm at zero", async () => {
			const { t, component } = Rig({ ThirdPerson: true, ArmMargin: 0.05 });
			t.frame();
			const query = find(t.commands(), PhysOpType.Query)[0]!;
			t.physics.HandleMessage({ state: PhysState.QueryResult, queryId: query.queryId, result: { hit: true, position: [0, 0, 0], point: [0, 0, 0], normal: [0, 0, 1], distance: 0.01, hitEntityId: 1 } });
			await settle();
			expect(component.GetPose(0).transform[2]).toBeCloseTo(0);
		});

		it("switching back to first person pulls the camera into the head", () => {
			const { t, component } = Rig({ ThirdPerson: true });
			component.ThirdPerson = false;
			t.frame();
			expect(component.GetPose(0).transform.slice(0, 3)).toEqual([0, 2.6, 0]);
		});
	});

	it("FixedCamera registers itself and looks at its target", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Camera", [Comp(FixedCamera, { LookAt: [0, 0, -10], FovDegrees: 45 })], { position: [0, 0, 0] }));
		t.world.FlushLifecycle();
		const camera = e.GetComponent(FixedCamera)!;
		expect(t.engine.Render.MainCamera).toBe(camera);

		const pose = camera.GetPose(0);
		expect(pose.fov).toBeCloseTo(Math.PI / 4);
		expect(Quat.FromTuple([pose.transform[3], pose.transform[4], pose.transform[5], pose.transform[6]]).Rotate(Vec3.Forward()).Z).toBeCloseTo(-1);
	});
});

class HitRecorder extends Component implements IProjectileHitListener {
	public readonly hits: { point: number[]; normal: number[]; entity: string | undefined; }[] = [];
	public OnProjectileHit(point: Vec3, normal: Vec3, hit: Entity | undefined): void {
		this.hits.push({ point: point.ToTuple(), normal: normal.ToTuple(), entity: hit?.Name });
	}
}

describe("Projectile", () => {
	function Shot(props: Parameters<typeof Comp<Projectile>>[1] = {}) {
		const t = MakeEngine();
		const wall = t.world.Spawn(Ent("Wall", []));
		const bullet = t.world.Spawn(Ent("Bullet", [Comp(Projectile, { Radius: 0.1, ...props }), Comp(HitRecorder)], { position: [0, 0, 0] }));
		t.world.FlushLifecycle();
		const projectile = bullet.GetComponent(Projectile)!;
		projectile.Velocity.Set(0, 0, -50);
		const answer = async (result: Partial<{ hit: boolean; position: number[]; point: number[]; normal: number[]; hitEntityId: number; }>): Promise<void> => {
			const query = find(t.commands(), PhysOpType.Query)[0]!;
			t.physics.HandleMessage({ state: PhysState.QueryResult, queryId: query.queryId, result: { hit: false, position: [0, 0, -1], point: [0, 0, 0], normal: [0, 1, 0], hitEntityId: 0, ...result } as never });
			await settle();
		};
		return { t, wall, bullet, projectile, answer, recorder: bullet.GetComponent(HitRecorder)! };
	}

	it("is a small kinematic sphere on the Projectile layer that only sees the world", () => {
		const { t } = Shot();
		const spawn = find(t.commands(), PhysOpType.SpawnBody)[0]!;
		expect(spawn).toMatchObject({ bodyType: PhysBodyType.Kinematic, objectKind: PhysObjectKind.Projectile, layer: CollisionLayer.Projectile, mask: CollisionLayer.World });
		expect(spawn.shape).toEqual(Shapes.Sphere(0.1));
	});

	it("sweeps along its velocity each step and moves to where the sweep ended", async () => {
		const { t, bullet, answer } = Shot();
		t.step();
		await answer({ hit: false, position: [0, 0, -0.8] });

		expect(bullet.Transform.Position.Z).toBeCloseTo(-0.8);
		expect(find(t.commands(), PhysOpType.SetPose)[0]!.transform[2]).toBeCloseTo(-0.8);
	});

	it("only one sweep is in flight; time that passes meanwhile is swept in the next one", async () => {
		const { t, answer } = Shot();
		t.step();
		t.step();
		t.step();
		const first = find(t.commands(), PhysOpType.Query);
		expect(first).toHaveLength(1);
		expect(first[0]!.query).toMatchObject({ type: PhysQueryType.SweepProjectile, dt: 1 / 60 });

		t.step();
		t.physics.HandleMessage({ state: PhysState.QueryResult, queryId: first[0]!.queryId, result: { hit: false, position: [0, 0, -1], point: [0, 0, 0], normal: [0, 1, 0], hitEntityId: 0 } });
		await settle();
		t.step();
		const next = find(t.commands(), PhysOpType.Query);
		expect(next).toHaveLength(1);
		expect((next[0]!.query as { dt: number; }).dt).toBeCloseTo(4 / 60); // the three steps that went by while waiting + this one
		void answer;
	});

	it("on a hit it stops, tells the listeners once with the point/normal/entity, and destroys itself", async () => {
		const { t, wall, bullet, recorder, answer } = Shot();
		t.step();
		await answer({ hit: true, position: [0, 0, -2], point: [0, 0, -2.1], normal: [0, 0, 1], hitEntityId: wall.Id });

		expect(recorder.hits).toEqual([{ point: [0, 0, -2.1], normal: [0, 0, 1], entity: "Wall" }]);
		expect(bullet.IsDestroyed).toBe(true);

		t.step();
		t.world.FlushDestroyed();
		expect(recorder.hits).toHaveLength(1);
	});

	it("DestroyOnHit = false keeps the projectile alive but resolved (no more sweeps, no second hit)", async () => {
		const { t, bullet, recorder, answer } = Shot({ DestroyOnHit: false });
		t.step();
		await answer({ hit: true, hitEntityId: 99999 }); // an entity that no longer exists

		expect(recorder.hits).toHaveLength(1);
		expect(recorder.hits[0]!.entity).toBeUndefined();
		expect(bullet.IsDestroyed).toBe(false);

		t.step();
		expect(find(t.commands(), PhysOpType.Query)).toHaveLength(0);
	});

	it("falls under gravity when asked to", () => {
		const { t, projectile } = Shot({ ApplyGravity: true, Gravity: -10 });
		t.step();
		expect(projectile.Velocity.Y).toBeCloseTo(-10 / 60);
	});

	it("expires after MaxLifetimeSeconds", () => {
		const { t, bullet } = Shot({ MaxLifetimeSeconds: 0.05 });
		t.step();
		t.step();
		t.step();
		t.step();
		expect(bullet.IsDestroyed).toBe(true);
	});

	it("ignores an answer that arrives after it was destroyed", async () => {
		const { t, bullet, recorder, answer } = Shot();
		t.step();
		bullet.Destroy();
		t.world.FlushDestroyed();
		await answer({ hit: true, position: [0, 0, -2], hitEntityId: 1 });
		expect(recorder.hits).toEqual([]);
	});
});

describe("component base class", () => {
	it("every hook exists and does nothing by default", () => {
		class Bare extends Component {}
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Bare", [Comp(Bare)]));
		const c = e.GetComponent(Bare)!;
		const other = t.world.Spawn(Ent("Other", []));
		expect(() => {
			c.Awake(); c.Start(); c.Update(0); c.OnPhysicsUpdate(0); c.OnInputUpdate(t.input, 0); c.OnUIUpdate(t.engine.Ui, 0);
			c.OnCollisionEnter(other); c.OnCollisionExit(other); c.OnTriggerEnter(other); c.OnTriggerExit(other); c.OnDestroy(); c.OnPhysicsSync();
		}).not.toThrow();
		expect(c.Enabled).toBe(true);
		expect(c.Transform).toBe(e.Transform);
		expect(c.Engine).toBe(t.engine);
		void vi;
	});
});
