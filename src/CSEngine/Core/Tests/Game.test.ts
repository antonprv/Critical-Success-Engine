// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { CameraComponent } from "../Source/Engine/Components/Camera/CameraComponent";
import { MeshRenderer } from "../Source/Engine/Components/MeshRenderer";
import { MoverComponent } from "../Source/Engine/Components/Mover/MoverComponent";
import { CharacterBody } from "../Source/Engine/Components/Physics/CharacterBody";
import { RigidBody } from "../Source/Engine/Components/Physics/PhysicsBodies";
import { Projectile } from "../Source/Engine/Components/Physics/Projectile";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { Meshes, Shapes } from "../Source/Engine/Core/Shapes";
import { Quat } from "../Source/Engine/Math/Quat";
import { Vec3 } from "../Source/Engine/Math/Vec3";
import { Coin, CoinHuntState, FallRespawn, GameRules } from "../Source/Game/Scripts/CoinHunt";
import { CrateSpawner, Door, DoubleJumpTrait, Hazard, LaunchPad, Sprint } from "../Source/Game/Scripts/Recipes";
import { BulletHit, HudText, JumpOnSpace, PlatformMover, Shooter, Spinner, TriggerZone } from "../Source/Game/Scripts/Scripts";
import { DynamicBox, DynamicShape, StaticBox, WedgeTriangles } from "../Source/Game/SceneHelpers";
import { BallGun, FpsCounter, Greeter, Hover, InitialVelocity, Lifetime } from "../Source/Game/GuideExamples/ComponentExamples";
import { Health } from "../Source/Game/GuideExamples/HealthBar";
import { Bumper, RangeFinder } from "../Source/Game/GuideExamples/PhysicsExamples";
import { WindTrait } from "../Source/Game/GuideExamples/PlayerExamples";
import { MProfile, type MovementContext } from "../Source/Engine/Components/Mover/MovementTypes";
import { PhysOpType, PhysQueryType, PhysState, UiMsg } from "../Source/Workers/Common/CommonEnums";
import type { PhysicsCommand } from "../Source/Workers/Protocol/PhysicsGameLogicProtocol";
import { MakeEngine } from "./engine";

const find = <T extends PhysOpType>(commands: PhysicsCommand[], operation: T): Extract<PhysicsCommand, { operation: T; }>[] =>
	commands.filter((c): c is Extract<PhysicsCommand, { operation: T; }> => c.operation === operation);
const settle = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };

describe("sample scripts", () => {
	it("JumpOnSpace kicks its rigid body up on Space only", () => {
		const t = MakeEngine();
		t.world.Spawn(Ent("Ball", [Comp(RigidBody, { Shape: Shapes.Sphere(1) }), Comp(JumpOnSpace, { Impulse: 9 })]));
		t.world.FlushLifecycle();
		t.input.CapturePlayerInput = true;
		t.commands();

		t.frame();
		expect(find(t.commands(), PhysOpType.ApplyImpulse)).toEqual([]);
		t.press("Space");
		t.frame();
		expect(find(t.commands(), PhysOpType.ApplyImpulse)[0]).toMatchObject({ impulse: [0, 9, 0] });
	});

	it("HudText puts its lines on the HUD", () => {
		const t = MakeEngine();
		t.world.Spawn(Ent("Hints", [Comp(HudText, { Lines: ["one", "two"] })]));
		t.world.FlushLifecycle();
		t.frame();
		t.engine.Ui.Flush(1000);
		expect((t.uiMessages(UiMsg.Hud)[0] as { lines: string[]; }).lines).toEqual(["one", "two"]);
	});

	it("TriggerZone recolours its mesh and toasts while somebody stands inside", () => {
		const t = MakeEngine();
		const zone = t.world.Spawn(Ent("Pad", [Comp(MeshRenderer, { Mesh: Meshes.Box(1, 1, 1) }), Comp(TriggerZone, { IdleColor: [0, 0, 1], ActiveColor: [0, 1, 0] })]));
		const a = t.world.Spawn(Ent("A", [])), b = t.world.Spawn(Ent("B", []));
		t.world.FlushLifecycle();
		const component = zone.GetComponent(TriggerZone)!;

		component.OnTriggerEnter(a);
		component.OnTriggerEnter(b);
		expect(zone.GetComponent(MeshRenderer)!.Color).toEqual([0, 1, 0]);
		component.OnTriggerExit(a);
		expect(zone.GetComponent(MeshRenderer)!.Color).toEqual([0, 1, 0]); // B is still inside
		component.OnTriggerExit(b);
		expect(zone.GetComponent(MeshRenderer)!.Color).toEqual([0, 0, 1]);
		expect(t.uiMessages(UiMsg.Toast).map((m) => m["message"])).toEqual(["A entered Pad", "B entered Pad", "A left Pad", "B left Pad"]);
	});

	it("TriggerZone works on an entity without a mesh", () => {
		const t = MakeEngine();
		const zone = t.world.Spawn(Ent("Pad", [Comp(TriggerZone)]));
		const a = t.world.Spawn(Ent("A", []));
		t.world.FlushLifecycle();
		expect(() => { zone.GetComponent(TriggerZone)!.OnTriggerEnter(a); zone.GetComponent(TriggerZone)!.OnTriggerExit(a); }).not.toThrow();
	});

	it("PlatformMover swings its entity back and forth along an axis, with smooth physics-driven poses", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Lift", [Comp(PlatformMover, { Axis: [0, 2, 0], Distance: 2, PeriodSeconds: 4 })], { position: [1, 5, 1] }));
		t.world.FlushLifecycle();

		for (let i = 0; i < 60; i++) t.step(); // one second = a quarter period: the top of the swing
		expect(e.Transform.Position.Y).toBeCloseTo(7, 1);
		expect(e.Transform.Position.X).toBe(1);
		expect(e.Transform.IsPhysicsDriven).toBe(true);
		for (let i = 0; i < 120; i++) t.step();
		expect(e.Transform.Position.Y).toBeCloseTo(3, 1);
	});

	it("Spinner turns its entity around Y", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Coin", [Comp(Spinner, { RadiansPerSecond: Math.PI })]));
		t.world.FlushLifecycle();
		t.frame(0.5);
		expect(e.Transform.Rotation.Rotate(Vec3.Forward()).X).toBeCloseTo(-1); // a quarter... half a turn per second: 90 degrees in 0.5 s
	});

	describe("Shooter and BulletHit", () => {
		it("a click fires a gravity-affected projectile from the camera along its view", () => {
			const t = MakeEngine();
			t.world.Spawn(Ent("Camera", [Comp(CameraComponent, { TargetName: "Nobody" })], { position: [0, 2, 0] }));
			t.world.Spawn(Ent("Player", [Comp(Shooter, { Speed: 30 })]));
			t.world.FlushLifecycle();
			t.input.CapturePlayerInput = true;
			t.input.Handle({ kind: 3, button: 0 }); // InputEvtType.PointerDown
			t.frame();
			t.world.FlushLifecycle();

			const bullet = t.world.FindByName("Bullet")!;
			expect(bullet).toBeDefined();
			const projectile = bullet.GetComponent(Projectile)!;
			expect(projectile.Velocity.Length()).toBeCloseTo(30);
			expect(projectile.ApplyGravity).toBe(true);
			expect(bullet.Transform.Position.Z).toBeCloseTo(-1.2); // spawned a little in front of the camera
		});

		it("nothing happens without a click, or without a camera", () => {
			const t = MakeEngine();
			t.world.Spawn(Ent("Player", [Comp(Shooter)]));
			t.world.FlushLifecycle();
			t.input.CapturePlayerInput = true;
			t.frame();
			t.input.Handle({ kind: 3, button: 0 });
			t.frame(); // clicked, but there is no camera to aim with
			expect(t.world.FindByName("Bullet")).toBeUndefined();
		});

		it("BulletHit pushes a rigid body it hit, and does nothing for anything else", () => {
			const t = MakeEngine();
			const crate = t.world.Spawn(Ent("Crate", [Comp(RigidBody, { Shape: Shapes.Box(1, 1, 1) })]));
			const wall = t.world.Spawn(Ent("Wall", []));
			const bullet = t.world.Spawn(Ent("Bullet", [Comp(Projectile), Comp(BulletHit, { PushStrength: 10 })]));
			t.world.FlushLifecycle();
			bullet.GetComponent(Projectile)!.Velocity.Set(0, 0, -20);
			t.commands();

			const hit = bullet.GetComponent(BulletHit)!;
			hit.OnProjectileHit(new Vec3(0, 0, 1), new Vec3(0, 0, 1), wall);
			hit.OnProjectileHit(new Vec3(0, 0, 1), new Vec3(0, 0, 1), undefined);
			expect(find(t.commands(), PhysOpType.ApplyImpulse)).toEqual([]);

			hit.OnProjectileHit(new Vec3(0, 0, 1), new Vec3(0, 0, 1), crate);
			expect(find(t.commands(), PhysOpType.ApplyImpulse)[0]).toMatchObject({ entityId: crate.Id, impulse: [0, 0, -10] });
		});
	});
});

describe("Coin Hunt scripts", () => {
	function Game(limit = 60) {
		const t = MakeEngine();
		const player = t.world.Spawn(Ent("Player", [Comp(CharacterBody), Comp(FallRespawn, { KillY: -8, SpawnPoint: [0, 1.2, 8] })], { position: [0, 1.2, 8], tags: ["player"] }));
		const coin = t.world.Spawn(Ent("Coin 1", [Comp(Coin, { Shape: Shapes.Sphere(0.6) })], { tags: ["coin"] }));
		t.world.Spawn(Ent("Coin 2", [Comp(Coin, { Shape: Shapes.Sphere(0.6) })], { tags: ["coin"] }));
		const game = t.world.Spawn(Ent("Game", [Comp(GameRules, { TimeLimitSeconds: limit })]));
		t.world.FlushLifecycle();
		t.input.CapturePlayerInput = true;
		return { t, player, coin, rules: game.GetComponent(GameRules)! };
	}

	it("counts the coins by tag and starts the clock", () => {
		const { rules } = Game(30);
		expect(rules.Total).toBe(2);
		expect(rules.TimeLeft).toBe(30);
		expect(rules.State).toBe(CoinHuntState.Playing);
	});

	it("collecting every coin wins (and says how fast); collecting after that changes nothing", () => {
		const { t, rules } = Game();
		rules.TimeLeft = 45;
		rules.Collect();
		expect(rules.State).toBe(CoinHuntState.Playing);
		rules.Collect();
		expect(rules.State).toBe(CoinHuntState.Won);
		expect(t.uiMessages(UiMsg.Toast).at(-1)!["message"]).toBe("All coins collected in 15.0 s! Press R to play again.");

		rules.Collect();
		expect(rules.Collected).toBe(2);
	});

	it("the clock runs down only while playing and ends the game at zero", () => {
		const { t, rules } = Game();
		t.frame(10);
		expect(rules.TimeLeft).toBeCloseTo(50);
		rules.TimeLeft = 0.5;
		t.frame(1);
		expect(rules.State).toBe(CoinHuntState.Lost);
		expect(t.uiMessages(UiMsg.Toast).at(-1)!["message"]).toBe("Time's up! Press R to try again.");
		t.frame(5);
		expect(rules.TimeLeft).toBe(0);
	});

	it("R restarts the scene, but only after the game is over", () => {
		const { t, rules } = Game();
		t.press("KeyR");
		t.frame();
		expect(t.scenes.Load).not.toHaveBeenCalled();
		t.release("KeyR");

		rules.State = CoinHuntState.Lost;
		t.press("KeyR");
		t.frame();
		expect(t.scenes.Load).toHaveBeenCalledWith("test");
	});

	it("R with no current scene does nothing", () => {
		const { t, rules } = Game();
		t.scenes.CurrentSceneId = null;
		rules.State = CoinHuntState.Won;
		t.press("KeyR");
		t.frame();
		expect(t.scenes.Load).not.toHaveBeenCalled();
	});

	it("the HUD shows the score and the state", () => {
		const { t, rules } = Game();
		t.frame();
		t.engine.Ui.Flush(1000);
		expect((t.uiMessages(UiMsg.Hud).at(-1) as { lines: string[]; }).lines).toEqual(["Coins: 0 / 2", "Time: 60.0"]);

		rules.State = CoinHuntState.Won;
		t.frame();
		t.engine.Ui.Flush(2000);
		expect((t.uiMessages(UiMsg.Hud).at(-1) as { lines: string[]; }).lines).toContain("YOU WIN - R to restart");
		rules.State = CoinHuntState.Lost;
		t.frame();
		t.engine.Ui.Flush(3000);
		expect((t.uiMessages(UiMsg.Hud).at(-1) as { lines: string[]; }).lines).toContain("TIME'S UP - R to restart");
	});

	it("a coin is picked up by the player only", () => {
		const { t, player, coin, rules } = Game();
		const other = t.world.Spawn(Ent("Crate", []));
		t.world.FlushLifecycle();

		coin.GetComponent(Coin)!.OnTriggerEnter(other);
		expect(rules.Collected).toBe(0);
		expect(coin.IsDestroyed).toBe(false);

		coin.GetComponent(Coin)!.OnTriggerEnter(player);
		expect(rules.Collected).toBe(1);
		expect(coin.IsDestroyed).toBe(true);
	});

	it("a coin without a Game entity is simply removed", () => {
		const t = MakeEngine();
		const player = t.world.Spawn(Ent("Player", [], { tags: ["player"] }));
		const coin = t.world.Spawn(Ent("Coin", [Comp(Coin)]));
		t.world.FlushLifecycle();
		coin.GetComponent(Coin)!.OnTriggerEnter(player);
		expect(coin.IsDestroyed).toBe(true);
	});

	it("falling off the arena sends the player back to the spawn point with no momentum", () => {
		const { t, player } = Game();
		const body = player.GetComponent(CharacterBody)!;
		body.Velocity.Set(0, -40, 0);

		t.step([{ id: player.Id, pos: [3, -20, 3] }]); // the simulation reports the player far below the arena
		expect(player.Transform.Position.ToTuple()).toEqual([0, 1.2, 8]);
		expect(body.Velocity.ToTuple()).toEqual([0, 0, 0]);

		t.commands();
		t.step([{ id: player.Id, pos: [0, 1.2, 8] }]); // standing on the arena: nothing happens
		expect(find(t.commands(), PhysOpType.SetPose)).toEqual([]);
	});
});

describe("recipes", () => {
	it("Door rises when the player is near, sinks when away, and waits for a player to exist", () => {
		const t = MakeEngine();
		const door = t.world.Spawn(Ent("Door", [Comp(Door, { TriggerDistance: 4, OpenHeight: 3, Speed: 60 })], { position: [0, 2, 0] }));
		t.world.FlushLifecycle();
		t.step();
		expect(door.Transform.Position.Y).toBe(2); // no player yet

		const player = t.world.Spawn(Ent("Player", [], { position: [0, 3, 20] }));
		t.world.FlushLifecycle();
		t.step();
		expect(door.Transform.Position.Y).toBe(2);

		player.Transform.Position.Set(0, 3, 1);
		for (let i = 0; i < 4; i++) t.step();
		expect(door.Transform.Position.Y).toBeCloseTo(5);
		player.Transform.Position.Set(0, 3, 30);
		for (let i = 0; i < 4; i++) t.step();
		expect(door.Transform.Position.Y).toBeCloseTo(2);
	});

	it("CrateSpawner drops a crate every interval and removes the oldest beyond the maximum", () => {
		const t = MakeEngine();
		t.world.Spawn(Ent("Spawner", [Comp(CrateSpawner, { IntervalSeconds: 1, MaxCrates: 2 })], { position: [0, 8, 0] }));
		t.world.FlushLifecycle();
		const crates = () => t.world.Entities.filter((e) => e.Name === "Crate" && !e.IsDestroyed);

		t.frame(0.5);
		expect(crates()).toHaveLength(0);
		for (let i = 0; i < 4; i++) t.frame(1);
		t.world.FlushLifecycle();
		expect(crates()).toHaveLength(2);
		expect(crates()[0]!.GetComponent(RigidBody)).toBeDefined();
	});

	it("Hazard sends a close player back to the spawn point", () => {
		const t = MakeEngine();
		t.world.Spawn(Ent("Spikes", [Comp(Hazard, { Radius: 2, SpawnPoint: [0, 1.2, 8] })], { position: [0, 0, 0] }));
		t.step(); // no player: fine
		const player = t.world.Spawn(Ent("Player", [Comp(CharacterBody)], { position: [10, 0, 0] }));
		t.world.FlushLifecycle();

		t.step([{ id: player.Id, pos: [10, 0, 0] }]);
		expect(player.Transform.Position.X).toBe(10);
		t.step([{ id: player.Id, pos: [1, 0, 0] }]); // the simulation moves the player next to the spikes
		expect(player.Transform.Position.ToTuple()).toEqual([0, 1.2, 8]);
		expect(t.uiMessages(UiMsg.Toast).at(-1)!["message"]).toBe("Ouch!");
	});

	it("Hazard is harmless to a player without a character body (nothing to teleport)", () => {
		const t = MakeEngine();
		t.world.Spawn(Ent("Spikes", [Comp(Hazard)], { position: [0, 0, 0] }));
		t.world.Spawn(Ent("Player", [], { position: [0, 0, 0] }));
		t.world.FlushLifecycle();
		expect(() => t.step()).not.toThrow();
	});

	it("LaunchPad launches movers and ignores everything else", () => {
		const t = MakeEngine();
		const pad = t.world.Spawn(Ent("Pad", [Comp(LaunchPad, { Speed: 12 })]));
		const player = t.world.Spawn(Ent("Player", [Comp(MoverComponent)]));
		const crate = t.world.Spawn(Ent("Crate", []));
		t.world.FlushLifecycle();

		pad.GetComponent(LaunchPad)!.OnTriggerEnter(crate);
		expect(player.GetComponent(MoverComponent)!.Velocity.Y).toBe(0);
		pad.GetComponent(LaunchPad)!.OnTriggerEnter(player);
		expect(player.GetComponent(MoverComponent)!.Velocity.Y).toBe(12);
	});

	it("Sprint scales the profile's top speed while Shift is held", () => {
		const t = MakeEngine();
		const player = t.world.Spawn(Ent("Player", [Comp(MoverComponent), Comp(Sprint, { Multiplier: 2 })]));
		t.world.FlushLifecycle();
		t.input.CapturePlayerInput = true;
		const mover = player.GetComponent(MoverComponent)!;

		t.frame();
		expect(mover.Profile!.MaxSpeed).toBe(7);
		t.press("ShiftLeft");
		t.frame();
		expect(mover.Profile!.MaxSpeed).toBe(14);
		t.release("ShiftLeft");
		t.frame();
		expect(mover.Profile!.MaxSpeed).toBe(7);
	});

	it("DoubleJumpTrait: air jumps are granted on landing, used once, and never steal a consumed jump", () => {
		const trait = new DoubleJumpTrait();
		const ctx = (over: Partial<MovementContext>): MovementContext => ({
			WishDirection: new Vec3(), JumpRequested: false, JumpConsumed: false, Delta: 1 / 60,
			IsOnFloor: false, Gravity: new Vec3(0, -20, 0), Profile: new MProfile(), ...over,
		});
		const v = new Vec3();

		trait.Process(ctx({ JumpRequested: true }), v, 1 / 60); // airborne from the start: no budget yet
		expect(v.Y).toBe(0);

		trait.Process(ctx({ IsOnFloor: true }), v, 1 / 60);
		trait.Process(ctx({ JumpRequested: true, JumpConsumed: true }), v, 1 / 60);
		expect(v.Y).toBe(0);
		trait.Process(ctx({}), v, 1 / 60); // no request
		expect(v.Y).toBe(0);

		const jump = ctx({ JumpRequested: true });
		trait.Process(jump, v, 1 / 60);
		expect(v.Y).toBeGreaterThan(5);
		expect(jump.JumpConsumed).toBe(true);
		v.Y = 0;
		trait.Process(ctx({ JumpRequested: true }), v, 1 / 60); // used up
		expect(v.Y).toBe(0);
	});
});

describe("guide examples", () => {
	it("Hover bobs around its starting height", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Crystal", [Comp(Hover, { Amplitude: 1, Speed: 1 })], { position: [0, 3, 0] }));
		t.world.FlushLifecycle();
		t.time.Elapsed = Math.PI / 2;
		t.frame();
		expect(e.Transform.Position.Y).toBeCloseTo(4);
	});

	it("Lifetime destroys its entity after the given time", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Puff", [Comp(Lifetime, { Seconds: 1 })]));
		t.world.FlushLifecycle();
		t.frame(0.6);
		expect(e.IsDestroyed).toBe(false);
		t.frame(0.6);
		expect(e.IsDestroyed).toBe(true);
	});

	it("InitialVelocity gives a rigid body its starting velocity - after the body exists", () => {
		const t = MakeEngine();
		t.world.Spawn(Ent("Ball", [Comp(RigidBody, { Shape: Shapes.Sphere(1) }), Comp(InitialVelocity, { Velocity: [1, 2, 3] })]));
		t.world.FlushLifecycle();
		expect(t.commands().map((c) => c.operation)).toEqual([PhysOpType.SpawnBody, PhysOpType.SetLinearVelocity]);
	});

	it("BallGun throws a ball along the camera's view, and does nothing without a camera", () => {
		const t = MakeEngine();
		t.world.Spawn(Ent("Gun", [Comp(BallGun, { Speed: 10 })]));
		t.world.FlushLifecycle();
		t.input.CapturePlayerInput = true;
		t.input.Handle({ kind: 3, button: 0 });
		t.frame();
		expect(t.world.FindByName("Thrown Ball")).toBeUndefined(); // no camera

		t.world.Spawn(Ent("Camera", [Comp(CameraComponent, { TargetName: "Nobody" })], { position: [0, 1, 0] }));
		t.world.FlushLifecycle();
		t.input.Handle({ kind: 4, button: 0 });
		t.input.Handle({ kind: 3, button: 0 });
		t.frame();
		t.world.FlushLifecycle();
		expect(t.world.FindByName("Thrown Ball")).toBeDefined();
	});

	it("FpsCounter shows the frame rate, and skips a zero-length frame", () => {
		const t = MakeEngine();
		t.world.Spawn(Ent("Fps", [Comp(FpsCounter)]));
		t.world.FlushLifecycle();
		t.frame(0);
		t.engine.Ui.Flush(1000);
		expect(t.uiMessages(UiMsg.Hud)).toEqual([]);
		t.frame(0.02);
		t.engine.Ui.Flush(2000);
		expect((t.uiMessages(UiMsg.Hud)[0] as { lines: string[]; }).lines).toEqual(["FPS: 50"]);
	});

	it("Greeter greets its target, or complains that there is none", () => {
		const t = MakeEngine();
		t.world.Spawn(Ent("Greeter", [Comp(Greeter, { TargetName: "Nobody" })]));
		t.world.FlushLifecycle();
		expect(t.uiMessages(UiMsg.Toast)[0]!["message"]).toBe('Greeter: nobody called "Nobody" here');

		t.world.Spawn(Ent("Player", [], { position: [1, 2, 3] }));
		t.world.Spawn(Ent("Greeter 2", [Comp(Greeter)]));
		t.world.FlushLifecycle();
		expect(t.uiMessages(UiMsg.Toast)[1]!["message"]).toBe("Greeter 2 sees Player at (1.00, 2.00, 3.00)");
	});

	it("Health shows a bar and cannot go below zero", () => {
		const t = MakeEngine();
		const e = t.world.Spawn(Ent("Hero", [Comp(Health, { Current: 30 })]));
		t.world.FlushLifecycle();
		const health = e.GetComponent(Health)!;
		health.Damage(20);
		health.Damage(50);
		expect(health.Current).toBe(0);
		t.frame();
		t.engine.Ui.Flush(1000);
		expect(t.uiMessages(UiMsg.Bars)[0]).toEqual({ type: UiMsg.Bars, bars: [{ id: "hp", label: "HP 0/100", value: 0 }] });
	});

	it("Bumper pushes rigid bodies away, and ignores other things", () => {
		const t = MakeEngine();
		const bumper = t.world.Spawn(Ent("Bumper", [Comp(Bumper, { Strength: 4 })], { position: [0, 0, 0] }));
		const ball = t.world.Spawn(Ent("Ball", [Comp(RigidBody, { Shape: Shapes.Sphere(0.5) })], { position: [3, 0, 0] }));
		const wall = t.world.Spawn(Ent("Wall", []));
		t.world.FlushLifecycle();
		t.commands();

		bumper.GetComponent(Bumper)!.OnCollisionEnter(wall);
		expect(find(t.commands(), PhysOpType.ApplyImpulse)).toEqual([]);
		bumper.GetComponent(Bumper)!.OnCollisionEnter(ball);
		const impulse = find(t.commands(), PhysOpType.ApplyImpulse)[0]!;
		expect(impulse.entityId).toBe(ball.Id);
		expect(impulse.impulse[0]).toBeGreaterThan(3.5);
		expect(impulse.impulse[1]).toBeGreaterThan(0);
	});

	it("RangeFinder asks one question at a time, shows hits and misses", async () => {
		const t = MakeEngine();
		t.world.Spawn(Ent("Finder", [Comp(RangeFinder, { MaxDistance: 20 })], { position: [0, 1, 0] }));
		t.world.FlushLifecycle();
		t.step();
		t.step();
		const queries = find(t.commands(), PhysOpType.Query);
		expect(queries).toHaveLength(1);
		expect(queries[0]!.query).toMatchObject({ type: PhysQueryType.SweepSphere, maxDistance: 20 });

		t.physics.HandleMessage({ state: PhysState.QueryResult, queryId: queries[0]!.queryId, result: { hit: false, position: [0, 0, 0], point: [0, 0, 0], normal: [0, 1, 0], distance: 20, hitEntityId: 0 } });
		await settle();
		t.frame();
		t.engine.Ui.Flush(1000);
		expect((t.uiMessages(UiMsg.Hud)[0] as { lines: string[]; }).lines).toEqual(["Range: -"]);
	});

	it("WindTrait pushes only while airborne", () => {
		const trait = new WindTrait();
		const ctx = (onFloor: boolean): MovementContext => ({
			WishDirection: new Vec3(), JumpRequested: false, JumpConsumed: false, Delta: 1, IsOnFloor: onFloor,
			Gravity: new Vec3(0, -20, 0), Profile: new MProfile(),
		});
		const air = new Vec3();
		trait.Process(ctx(false), air, 1);
		expect(air.X).toBe(3);
		const ground = new Vec3();
		trait.Process(ctx(true), ground, 1);
		expect(ground.X).toBe(0);
	});
});

describe("scene helpers", () => {
	it("StaticBox pairs a box mesh with a box collider; rotations compose", () => {
		const plain = StaticBox("Wall", [1, 2, 3], [0, 0, 0], [1, 1, 1]);
		expect(plain.components.map((c) => c.type.name)).toEqual(["MeshRenderer", "StaticBody"]);
		expect(plain.rotation).toBeUndefined();

		const tilted = StaticBox("Ramp", [1, 1, 1], [0, 0, 0], [1, 1, 1], { rotationX: 0.5 });
		expect(tilted.rotation).toEqual(Quat.FromAxisAngle(Vec3.Right(), 0.5).ToTuple());
		const yawed = StaticBox("Wall", [1, 1, 1], [0, 0, 0], [1, 1, 1], { rotationY: 0.5 });
		expect(yawed.rotation).toEqual(Quat.FromAxisAngle(Vec3.Up(), 0.5).ToTuple());
	});

	it("DynamicBox and DynamicShape build rigid props", () => {
		const box = DynamicBox("Crate", [1, 1, 1], [0, 1, 0], [1, 0, 0], 4);
		expect(box.components.map((c) => c.type.name)).toEqual(["MeshRenderer", "RigidBody"]);
		expect(box.components[1]!.props).toMatchObject({ Mass: 4 });

		const shape = DynamicShape("Ball", Shapes.Sphere(1), [0, 1, 0], [0, 1, 0]);
		expect(shape.components[1]!.props).toMatchObject({ Mass: 1 });
	});

	it("WedgeTriangles: 8 triangles, every face counter-clockwise seen from outside", () => {
		const v = WedgeTriangles();
		expect(v).toHaveLength(8 * 9);
		const centre = new Vec3(2, 0.5, 1.5);
		for (let i = 0; i < v.length; i += 9) {
			const a = new Vec3(v[i]!, v[i + 1]!, v[i + 2]!), b = new Vec3(v[i + 3]!, v[i + 4]!, v[i + 5]!), c = new Vec3(v[i + 6]!, v[i + 7]!, v[i + 8]!);
			const normal = b.Sub(a).Cross(c.Sub(a));
			expect(normal.Dot(a.Sub(centre))).toBeGreaterThan(0);
		}
	});

});
