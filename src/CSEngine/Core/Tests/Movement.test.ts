// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { CreateMovementPreset } from "../Source/Engine/Components/Mover/MovementPresets";
import { MovementMotor } from "../Source/Engine/Components/Mover/MovementMotor";
import {
	Doom3Constants, MovementPreset, MovementTrait, MProfile, type MovementContext,
} from "../Source/Engine/Components/Mover/MovementTypes";
import * as T from "../Source/Engine/Components/Mover/Traits/Traits";
import { Vec3 } from "../Source/Engine/Math/Vec3";

const dt = 1 / 60;

function Context(over: Partial<MovementContext> = {}): MovementContext {
	return {
		WishDirection: new Vec3(), JumpRequested: false, JumpConsumed: false, Delta: dt,
		IsOnFloor: false, Gravity: new Vec3(0, -20, 0), Profile: new MProfile(), ...over,
	};
}

const wish = (x: number, z: number): Vec3 => new Vec3(x, 0, z);

describe("GravityTrait", () => {
	const trait = new T.GravityTrait();

	it("pulls down in the air", () => {
		const v = new Vec3(1, 0, 0);
		trait.Process(Context(), v, 0.5);
		expect(v.ToTuple()).toEqual([1, -10, 0]);
	});

	it("on the floor it only cancels downward speed", () => {
		const falling = new Vec3(0, -5, 0);
		trait.Process(Context({ IsOnFloor: true }), falling, dt);
		expect(falling.Y).toBe(0);

		const rising = new Vec3(0, 5, 0);
		trait.Process(Context({ IsOnFloor: true }), rising, dt);
		expect(rising.Y).toBe(5);
	});
});

describe("JumpTrait (jump buffer + coyote time)", () => {
	it("jumps from the floor when asked", () => {
		const trait = new T.JumpTrait();
		const ctx = Context({ IsOnFloor: true, JumpRequested: true });
		const v = new Vec3();
		trait.PreProcess(ctx);
		trait.Process(ctx, v, dt);
		expect(v.Y).toBeCloseTo(Math.sqrt(2 * 20 * ctx.Profile.JumpHeight));
		expect(ctx.JumpConsumed).toBe(true);
	});

	it("does not jump without a request", () => {
		const trait = new T.JumpTrait();
		const ctx = Context({ IsOnFloor: true });
		const v = new Vec3();
		trait.PreProcess(ctx);
		trait.Process(ctx, v, dt);
		expect(v.Y).toBe(0);
		expect(ctx.JumpConsumed).toBe(false);
	});

	it("coyote time: a jump pressed shortly after leaving the ground still works, a late one does not", () => {
		const trait = new T.JumpTrait();
		const v = new Vec3();

		trait.PreProcess(Context({ IsOnFloor: true })); // standing: coyote window refilled
		const early = Context({ JumpRequested: true });
		trait.PreProcess(early);
		trait.Process(early, v, dt);
		expect(v.Y).toBeGreaterThan(0);

		const late = new T.JumpTrait();
		late.PreProcess(Context({ IsOnFloor: true }));
		for (let i = 0; i < 20; i++) late.PreProcess(Context()); // 20 ticks airborne = 0.33 s > 0.12 s
		const ctx = Context({ JumpRequested: true });
		const w = new Vec3();
		late.PreProcess(ctx);
		late.Process(ctx, w, dt);
		expect(w.Y).toBe(0);
	});

	it("jump buffer: a press shortly BEFORE landing jumps on landing", () => {
		const trait = new T.JumpTrait();
		const v = new Vec3();

		const press = Context({ JumpRequested: true });
		trait.PreProcess(press);
		trait.Process(press, v, dt);
		expect(v.Y).toBe(0); // still in the air, nothing yet

		const land = Context({ IsOnFloor: true });
		trait.PreProcess(land);
		trait.Process(land, v, dt);
		expect(v.Y).toBeGreaterThan(0);
	});
});

describe("Quake traits", () => {
	it("GroundAccelerationTrait accelerates towards the wanted velocity, and settles exactly on it", () => {
		const trait = new T.GroundAccelerationTrait();
		const ctx = Context({ IsOnFloor: true, WishDirection: wish(1, 0) });

		const v = new Vec3();
		trait.Process(ctx, v, dt);
		expect(v.X).toBeCloseTo(ctx.Profile.GroundAcceleration * dt);

		const nearly = new Vec3(ctx.Profile.MaxSpeed - 0.01, 0, 0);
		trait.Process(ctx, nearly, 1); // would overshoot: clamped
		expect(nearly.X).toBeCloseTo(ctx.Profile.MaxSpeed);

		const there = new Vec3(ctx.Profile.MaxSpeed, 0, 0);
		trait.Process(ctx, there, dt); // already there: no change
		expect(there.X).toBe(ctx.Profile.MaxSpeed);
	});

	it("GroundAccelerationTrait does nothing in the air or without input", () => {
		const trait = new T.GroundAccelerationTrait();
		const air = new Vec3();
		trait.Process(Context({ WishDirection: wish(1, 0) }), air, dt);
		const idle = new Vec3();
		trait.Process(Context({ IsOnFloor: true }), idle, dt);
		expect(air.ToTuple()).toEqual([0, 0, 0]);
		expect(idle.ToTuple()).toEqual([0, 0, 0]);
	});

	it("NoFrictionTrait damps only on the floor without input", () => {
		const trait = new T.NoFrictionTrait();
		const v = new Vec3(10, 3, 10);
		trait.Process(Context({ IsOnFloor: true }), v, dt);
		expect(v.ToTuple()).toEqual([9.8, 3, 9.8]);

		const air = new Vec3(10, 0, 0);
		trait.Process(Context(), air, dt);
		const steering = new Vec3(10, 0, 0);
		trait.Process(Context({ IsOnFloor: true, WishDirection: wish(1, 0) }), steering, dt);
		expect(air.X).toBe(10);
		expect(steering.X).toBe(10);
	});

	it("QuakeAirStrafeTrait adds speed in the wished direction up to the air cap", () => {
		const trait = new T.QuakeAirStrafeTrait();
		const ctx = Context({ WishDirection: wish(1, 0) });

		const v = new Vec3();
		trait.Process(ctx, v, dt);
		expect(v.X).toBeCloseTo(ctx.Profile.AirAcceleration * dt);

		const capped = new Vec3(ctx.Profile.AirMaxSpeed + 1, 0, 0);
		trait.Process(ctx, capped, dt);
		expect(capped.X).toBe(ctx.Profile.AirMaxSpeed + 1);

		const nearCap = new Vec3(ctx.Profile.AirMaxSpeed - 0.001, 0, 0);
		trait.Process(ctx, nearCap, 1);
		expect(nearCap.X).toBeCloseTo(ctx.Profile.AirMaxSpeed);

		const grounded = new Vec3();
		trait.Process(Context({ IsOnFloor: true, WishDirection: wish(1, 0) }), grounded, dt);
		const idle = new Vec3();
		trait.Process(Context(), idle, dt);
		expect(grounded.X).toBe(0);
		expect(idle.X).toBe(0);
	});
});

describe("Doom 3 traits", () => {
	it("Doom3AccelerateTrait: ground vs air acceleration, cap, clamp and idle", () => {
		const trait = new T.Doom3AccelerateTrait();

		const ground = new Vec3();
		trait.Process(Context({ IsOnFloor: true, WishDirection: wish(1, 0) }), ground, dt);
		const air = new Vec3();
		trait.Process(Context({ WishDirection: wish(1, 0) }), air, dt);
		expect(ground.X).toBeGreaterThan(air.X);
		expect(air.X).toBeCloseTo(Doom3Constants.PM_AIRACCELERATE * dt * 7);

		const full = new Vec3(7, 0, 0);
		trait.Process(Context({ IsOnFloor: true, WishDirection: wish(1, 0) }), full, dt);
		expect(full.X).toBe(7);

		const clamped = new Vec3(6.9, 0, 0);
		trait.Process(Context({ IsOnFloor: true, WishDirection: wish(1, 0) }), clamped, 1);
		expect(clamped.X).toBeCloseTo(7);

		const idle = new Vec3();
		trait.Process(Context({ IsOnFloor: true }), idle, dt);
		expect(idle.X).toBe(0);
	});

	it("Doom3FrictionTrait: stops tiny speeds, keeps a vertical component, brakes on the floor, not in the air", () => {
		const trait = new T.Doom3FrictionTrait();

		const crawl = new Vec3(0.01, 0, 0);
		trait.Process(Context({ IsOnFloor: true }), crawl, dt);
		expect(crawl.ToTuple()).toEqual([0, 0, 0]);

		const fallingSlowly = new Vec3(0.01, -3, 0); // on the floor the vertical part is ignored for the speed check, but kept
		trait.Process(Context({ IsOnFloor: true }), fallingSlowly, dt);
		expect(fallingSlowly.ToTuple()).toEqual([0, -3, 0]);

		const slide = new Vec3(5, 0, 0);
		trait.Process(Context({ IsOnFloor: true }), slide, dt);
		expect(slide.X).toBeLessThan(5);
		expect(slide.X).toBeGreaterThan(4);

		const slow = new Vec3(0.5, 0, 0); // below the stop speed: friction acts on the stop speed instead
		trait.Process(Context({ IsOnFloor: true }), slow, dt);
		expect(slow.X).toBeCloseTo(0.5 - Doom3Constants.PM_STOPSPEED * Doom3Constants.InchesToMeters * Doom3Constants.PM_FRICTION * dt);

		const stopped = new Vec3(0.5, 0, 0);
		trait.Process(Context({ IsOnFloor: true }), stopped, 1); // would brake below zero: clamped
		expect(stopped.X).toBe(0);

		const air = new Vec3(5, 0, 0);
		trait.Process(Context(), air, dt);
		expect(air.X).toBe(5); // PM_AIRFRICTION is 0
	});

	it("Doom3JumpTrait jumps to the configured height, only from the floor on request", () => {
		const trait = new T.Doom3JumpTrait();
		trait.MaxJumpHeightInches = 48;

		const ctx = Context({ IsOnFloor: true, JumpRequested: true });
		const v = new Vec3();
		trait.Process(ctx, v, dt);
		expect(v.Y).toBeCloseTo(Math.sqrt(2 * 48 * Doom3Constants.InchesToMeters * 20));
		expect(ctx.JumpConsumed).toBe(true);

		for (const over of [{ IsOnFloor: true }, { JumpRequested: true }]) {
			const c = Context(over);
			const w = new Vec3();
			trait.Process(c, w, dt);
			expect(w.Y).toBe(0);
			expect(c.JumpConsumed).toBe(false);
		}
	});

	it("Doom3GroundAccelTrait only accelerates on the floor with input, with the Doom 3 curve", () => {
		const trait = new T.Doom3GroundAccelTrait();
		const v = new Vec3();
		trait.Process(Context({ IsOnFloor: true, WishDirection: wish(0, 1) }), v, dt);
		expect(v.Z).toBeCloseTo(Doom3Constants.PM_ACCELERATE * dt * 7);

		const clamped = new Vec3(0, 0, 6.99);
		trait.Process(Context({ IsOnFloor: true, WishDirection: wish(0, 1) }), clamped, 1);
		expect(clamped.Z).toBeCloseTo(7);

		const full = new Vec3(0, 0, 8);
		trait.Process(Context({ IsOnFloor: true, WishDirection: wish(0, 1) }), full, dt);
		expect(full.Z).toBe(8);

		for (const over of [{ WishDirection: wish(0, 1) }, { IsOnFloor: true }]) {
			const w = new Vec3();
			trait.Process(Context(over), w, dt);
			expect(w.Z).toBe(0);
		}
	});

	it("StrafeAirControlTrait only acts in the air with input and below the cap", () => {
		const trait = new T.StrafeAirControlTrait();
		const ctx = Context({ WishDirection: wish(1, 0) });
		const v = new Vec3();
		trait.Process(ctx, v, dt);
		expect(v.X).toBeCloseTo(ctx.Profile.AirAcceleration * dt * ctx.Profile.AirMaxSpeed);

		const clamped = new Vec3(ctx.Profile.AirMaxSpeed - 0.001, 0, 0);
		trait.Process(ctx, clamped, 1);
		expect(clamped.X).toBeCloseTo(ctx.Profile.AirMaxSpeed);

		const capped = new Vec3(ctx.Profile.AirMaxSpeed + 1, 0, 0);
		trait.Process(ctx, capped, dt);
		expect(capped.X).toBe(ctx.Profile.AirMaxSpeed + 1);

		for (const over of [{ IsOnFloor: true, WishDirection: wish(1, 0) }, {}]) {
			const w = new Vec3();
			trait.Process(Context(over), w, dt);
			expect(w.X).toBe(0);
		}
	});
});

describe("Hybrid traits", () => {
	it("HybridGroundTrait pulls horizontal velocity towards the wanted one (floor only)", () => {
		const trait = new T.HybridGroundTrait();
		const v = new Vec3(0, 4, 0);
		trait.Process(Context({ IsOnFloor: true, WishDirection: wish(1, 0) }), v, dt);
		expect(v.X).toBeCloseTo(7 * 20 * dt);
		expect(v.Y).toBe(4);

		const air = new Vec3();
		trait.Process(Context({ WishDirection: wish(1, 0) }), air, dt);
		expect(air.X).toBe(0);
	});

	it("HybridAirControlTrait steers in the air only with input", () => {
		const trait = new T.HybridAirControlTrait();
		const v = new Vec3();
		trait.Process(Context({ WishDirection: wish(0, -1) }), v, dt);
		expect(v.Z).toBeCloseTo(-5 * 3 * dt);

		for (const over of [{ IsOnFloor: true, WishDirection: wish(0, -1) }, {}]) {
			const w = new Vec3();
			trait.Process(Context(over), w, dt);
			expect(w.Z).toBe(0);
		}
	});
});

describe("Realistic traits", () => {
	it("GroundFrictionTrait brakes proportionally, ignores crawling speeds and the air", () => {
		const trait = new T.GroundFrictionTrait();
		const v = new Vec3(6, 2, 0);
		trait.Process(Context({ IsOnFloor: true }), v, dt);
		expect(v.X).toBeCloseTo(6 * (1 - 12 * dt));
		expect(v.Y).toBe(2);

		const crawl = new Vec3(0.0005, 0, 0);
		trait.Process(Context({ IsOnFloor: true }), crawl, dt);
		expect(crawl.X).toBe(0.0005);

		const air = new Vec3(6, 0, 0);
		trait.Process(Context(), air, dt);
		expect(air.X).toBe(6);

		const stopped = new Vec3(0.5, 0, 0);
		trait.Process(Context({ IsOnFloor: true }), stopped, 1);
		expect(stopped.X).toBe(0);
	});

	it("RealisticGroundAccelTrait accelerates up to the max speed, only on the floor with input", () => {
		const trait = new T.RealisticGroundAccelTrait();
		const v = new Vec3();
		trait.Process(Context({ IsOnFloor: true, WishDirection: wish(1, 0) }), v, dt);
		expect(v.X).toBeCloseTo(20 * dt);

		const clamped = new Vec3(6.99, 0, 0);
		trait.Process(Context({ IsOnFloor: true, WishDirection: wish(1, 0) }), clamped, 1);
		expect(clamped.X).toBeCloseTo(7);

		const full = new Vec3(9, 0, 0);
		trait.Process(Context({ IsOnFloor: true, WishDirection: wish(1, 0) }), full, dt);
		expect(full.X).toBe(9);

		for (const over of [{ WishDirection: wish(1, 0) }, { IsOnFloor: true }]) {
			const w = new Vec3();
			trait.Process(Context(over), w, dt);
			expect(w.X).toBe(0);
		}
	});

	it("SmoothStopTrait eases to a stop on the floor without input", () => {
		const trait = new T.SmoothStopTrait();
		expect(trait.StopLerpSpeed).toBe(10);
		const v = new Vec3(6, 1, 0);
		trait.Process(Context({ IsOnFloor: true }), v, dt);
		expect(v.X).toBeCloseTo(6 * (1 - 10 * dt));
		expect(v.Y).toBe(1);

		for (const over of [{ IsOnFloor: true, WishDirection: wish(1, 0) }, {}]) {
			const w = new Vec3(6, 0, 0);
			trait.Process(Context(over), w, dt);
			expect(w.X).toBe(6);
		}
	});

	it("ClampedAirControlTrait steers in the air only with input", () => {
		const trait = new T.ClampedAirControlTrait();
		const v = new Vec3();
		trait.Process(Context({ WishDirection: wish(1, 0) }), v, dt);
		expect(v.X).toBeCloseTo(5 * 3 * dt);

		for (const over of [{ IsOnFloor: true, WishDirection: wish(1, 0) }, {}]) {
			const w = new Vec3();
			trait.Process(Context(over), w, dt);
			expect(w.X).toBe(0);
		}
	});
});

describe("MovementTrait base class", () => {
	it("Pre/PostProcess are no-ops unless overridden", () => {
		class Noop extends MovementTrait { public override Process(): void { /* nothing */ } }
		const ctx = Context();
		const trait = new Noop();
		expect(() => { trait.PreProcess(ctx); trait.PostProcess(ctx); }).not.toThrow();
	});
});

describe("MovementMotor", () => {
	it("runs every trait's PreProcess, then every Process, then every PostProcess, in list order, with the delta injected", () => {
		const log: string[] = [];
		const make = (name: string) => ({
			PreProcess: (ctx: MovementContext) => log.push(`${name}.pre(delta=${ctx.Delta})`),
			Process: (_ctx: MovementContext, velocity: Vec3) => { velocity.X += 1; log.push(`${name}.process(x=${velocity.X})`); },
			PostProcess: () => log.push(`${name}.post`),
		});

		const motor = new MovementMotor([make("a"), make("b")]);
		motor.Simulate(0.25, Context());

		expect(log).toEqual(["a.pre(delta=0.25)", "b.pre(delta=0.25)", "a.process(x=1)", "b.process(x=2)", "a.post", "b.post"]);
		expect(motor.Velocity.X).toBe(2);
	});

	it("SetTraits swaps the behaviour", () => {
		const motor = new MovementMotor([]);
		motor.Simulate(dt, Context());
		expect(motor.Velocity.X).toBe(0);

		motor.SetTraits([new T.GravityTrait()]);
		motor.Simulate(1, Context());
		expect(motor.Velocity.Y).toBe(-20);
	});
});

describe("movement presets", () => {
	const names = (preset: MovementPreset): string[] => CreateMovementPreset(preset)!.Build().map((t) => t.constructor.name);

	it("each preset builds its documented trait list, in order", () => {
		expect(names(MovementPreset.Doom3)).toEqual(["Doom3JumpTrait", "Doom3FrictionTrait", "Doom3AccelerateTrait", "GravityTrait"]);
		expect(names(MovementPreset.Hybrid)).toEqual(["GravityTrait", "JumpTrait", "HybridGroundTrait", "HybridAirControlTrait"]);
		expect(names(MovementPreset.Quake)).toEqual(["GravityTrait", "JumpTrait", "GroundAccelerationTrait", "QuakeAirStrafeTrait", "NoFrictionTrait"]);
		expect(names(MovementPreset.QuakeStrafeDoom2016)).toEqual(["GravityTrait", "JumpTrait", "Doom3FrictionTrait", "Doom3GroundAccelTrait", "StrafeAirControlTrait"]);
		expect(names(MovementPreset.Realistic)).toEqual(["GravityTrait", "JumpTrait", "GroundFrictionTrait", "RealisticGroundAccelTrait", "SmoothStopTrait", "ClampedAirControlTrait"]);
	});

	it("Custom has no preset object", () => {
		expect(CreateMovementPreset(MovementPreset.Custom)).toBeNull();
	});

	it("each preset's default profile", () => {
		const profileOf = (preset: MovementPreset): MProfile => {
			const profile = new MProfile();
			CreateMovementPreset(preset)!.SetDefaultProfile(profile);
			return profile;
		};

		expect(profileOf(MovementPreset.Doom3).MaxSpeed).toBeCloseTo(76 * Doom3Constants.InchesToMeters);
		expect(profileOf(MovementPreset.Hybrid)).toMatchObject({ GroundAcceleration: 14, MaxSpeed: 6, AirMaxSpeed: 5, AirControl: 5, JumpHeight: 1.2, JumpBufferTime: 0.15, CoyoteTime: 0.15 });
		expect(profileOf(MovementPreset.Quake)).toMatchObject({ GroundAcceleration: 25, MaxSpeed: 7, AirAcceleration: 10, AirMaxSpeed: 0.7, JumpHeight: 1.5 });
		expect(profileOf(MovementPreset.QuakeStrafeDoom2016)).toMatchObject({ MaxSpeed: 7, AirAcceleration: 6, AirMaxSpeed: 9, JumpHeight: 1.4 });
		expect(profileOf(MovementPreset.Realistic)).toMatchObject({ GroundAcceleration: 20, MaxSpeed: 5, GroundFriction: 10, AirMaxSpeed: 4, AirControl: 1.5, JumpHeight: 1.2 });
	});

	it("the stock profile matches the Godot MProfile resource", () => {
		expect(new MProfile()).toMatchObject({
			GroundAcceleration: 20, MaxSpeed: 7, GroundFriction: 12, AirAcceleration: 8, AirMaxSpeed: 5, AirControl: 3,
			JumpHeight: 1.8, JumpBufferTime: 0.15, CoyoteTime: 0.12,
		});
	});

	it("a simulated second of the default preset: accelerate to the cap, jump, fall back and land", () => {
		const motor = new MovementMotor(CreateMovementPreset(MovementPreset.QuakeStrafeDoom2016)!.Build());
		const profile = new MProfile();
		CreateMovementPreset(MovementPreset.QuakeStrafeDoom2016)!.SetDefaultProfile(profile);

		let onFloor = true;
		for (let i = 0; i < 90; i++) motor.Simulate(dt, Context({ IsOnFloor: onFloor, WishDirection: wish(1, 0), Profile: profile }));
		expect(motor.Velocity.X).toBeGreaterThan(6.5);
		expect(motor.Velocity.X).toBeLessThanOrEqual(7.01);

		motor.Simulate(dt, Context({ IsOnFloor: onFloor, JumpRequested: true, Profile: profile }));
		expect(motor.Velocity.Y).toBeGreaterThan(5);

		onFloor = false;
		for (let i = 0; i < 120; i++) motor.Simulate(dt, Context({ IsOnFloor: false, Profile: profile }));
		expect(motor.Velocity.Y).toBeLessThan(-10);
	});
});
