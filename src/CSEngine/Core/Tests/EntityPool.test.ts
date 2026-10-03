// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { MeshRenderer } from "../Source/Engine/Components/MeshRenderer";
import { RigidBody } from "../Source/Engine/Components/Physics/PhysicsBodies";
import { Projectile } from "../Source/Engine/Components/Physics/Projectile";
import { Component } from "../Source/Engine/Core/Component";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { Despawn, EntityPool, PooledEntity } from "../Source/Engine/Core/EntityPool";
import { Meshes, Shapes } from "../Source/Engine/Core/Shapes";
import { Vec3 } from "../Source/Engine/Math/Vec3";
import { BallGun, Lifetime } from "../Source/Game/GuideExamples/ComponentExamples";
import { Shooter } from "../Source/Game/Scripts/Scripts";
import { CameraComponent } from "../Source/Engine/Components/Camera/CameraComponent";
import { InputEvtType, PhysOpType, PhysState, RendOpType } from "../Source/Workers/Common/CommonEnums";
import { MakeEngine, type TestEngine } from "./engine";
import { SilenceConsole } from "./helpers";

class Probe extends Component {
	public readonly log: string[] = [];
	public override OnEnable(): void { this.log.push("enable"); }
	public override OnDisable(): void { this.log.push("disable"); }
}

const operations = (t: TestEngine) => t.commands().map((c) => c.operation);

describe("entity activation", () => {
	it("OnDisable / OnEnable run once per change, only for components that are awake", () => {
		const t = MakeEngine();
		const entity = t.world.Spawn(Ent("E", [Comp(Probe)]));
		const probe = entity.RequireComponent(Probe);

		entity.Active = false; // not awake yet: nothing to switch off
		entity.Active = true;
		expect(probe.log).toEqual([]);

		t.world.FlushLifecycle();
		entity.Active = false;
		entity.Active = false;
		entity.Active = true;
		expect(probe.log).toEqual(["disable", "enable"]);
		expect(entity.Active).toBe(true);
	});

	it("a hook that throws is logged and does not stop the other components", () => {
		const log = SilenceConsole();
		class Broken extends Component { public override OnDisable(): void { throw new Error("broken"); } }
		const t = MakeEngine();
		const entity = t.world.Spawn(Ent("E", [Comp(Broken), Comp(Probe)]));
		t.world.FlushLifecycle();

		entity.Active = false;
		expect(entity.RequireComponent(Probe).log).toEqual(["disable"]);
		expect(String(log.error.mock.calls[0]![0])).toContain("Broken.OnDisable");
	});

	it("an entity switched off during a pass skips the rest of its components in that pass", () => {
		const t = MakeEngine();
		const seen: string[] = [];
		class Off extends Component { public override Update(): void { seen.push("off"); this.Entity.Active = false; } }
		class After extends Component { public override Update(): void { seen.push("after"); } }
		t.world.Spawn(Ent("E", [Comp(Off), Comp(After)]));
		t.world.FlushLifecycle();
		t.frame();
		expect(seen).toEqual(["off"]);
	});

	it("a disabled mesh is hidden in the renderer and comes back as it was", () => {
		const t = MakeEngine();
		const shown = t.world.Spawn(Ent("Shown", [Comp(MeshRenderer, { Mesh: Meshes.Box(1, 1, 1) })]));
		const hidden = t.world.Spawn(Ent("Hidden", [Comp(MeshRenderer, { Mesh: Meshes.Box(1, 1, 1), Visible: false })]));
		const empty = t.world.Spawn(Ent("Empty", [Comp(MeshRenderer)]));
		t.world.FlushLifecycle();
		t.ports.render.sent.length = 0;

		shown.Active = false;
		hidden.Active = false;
		empty.Active = false;
		shown.Active = true;
		hidden.Active = true;
		empty.Active = true;

		expect(t.ports.render.sent).toEqual([
			{ operation: RendOpType.SetVisible, entityId: shown.Id, visible: false },
			{ operation: RendOpType.SetVisible, entityId: hidden.Id, visible: false },
			{ operation: RendOpType.SetVisible, entityId: shown.Id, visible: true },
			{ operation: RendOpType.SetVisible, entityId: hidden.Id, visible: false },
		]);
	});

	it("a disabled body leaves the simulation and comes back where its entity is now", () => {
		const t = MakeEngine();
		const ball = t.world.Spawn(Ent("Ball", [Comp(RigidBody, { Shape: Shapes.Sphere(1) })], { position: [0, 5, 0] }));
		t.world.FlushLifecycle();
		t.commands();

		ball.Active = false;
		expect(operations(t)).toEqual([PhysOpType.RemoveBody]);

		ball.Transform.Teleport(new Vec3(7, 8, 9));
		ball.Active = true;
		const spawn = t.commands().find((c) => c.operation === PhysOpType.SpawnBody) as { transform: number[]; };
		expect(spawn.transform.slice(0, 3)).toEqual([7, 8, 9]);
		expect(ball.Transform.PreviousPosition.ToTuple()).toEqual([7, 8, 9]); // no interpolation streak from the old spot
	});
});

describe("a character switched off and on", () => {
	it("gets a new capsule and is registered again, so move results reach it", async () => {
		const { CharacterBody } = await import("../Source/Engine/Components/Physics/CharacterBody");
		const t = MakeEngine();
		const hero = t.world.Spawn(Ent("Hero", [Comp(CharacterBody)], { position: [0, 1, 0] }));
		t.world.FlushLifecycle();
		hero.Active = false;
		hero.Active = true;
		t.commands();

		const body = hero.RequireComponent(CharacterBody);
		body.MoveAndSlide(1 / 60);
		t.step([{ id: hero.Id, pos: [0, 1, 0] }], [{ id: hero.Id, onFloor: true, velocity: [1, 0, 0] }]);
		expect(body.IsOnFloor).toBe(true);
		expect(body.Velocity.ToTuple()).toEqual([1, 0, 0]);
	});
});

describe("EntityPool", () => {
	const Bullet = () => Ent("Bullet", [Comp(Probe)]);

	it("spawns when it has nothing free, and hands back released entities instead of spawning again", () => {
		const t = MakeEngine();
		const pool = new EntityPool(t.world, Bullet, { MaxSize: 4 });

		const first = pool.Acquire(new Vec3(1, 2, 3));
		expect(first.Transform.Position.ToTuple()).toEqual([1, 2, 3]);
		expect(first.GetComponent(PooledEntity)?.Pool).toBe(pool);
		expect([pool.ActiveCount, pool.AvailableCount, pool.TotalCount]).toEqual([1, 0, 1]);
		t.world.FlushLifecycle();

		pool.Release(first);
		expect(first.Active).toBe(false);
		expect([pool.ActiveCount, pool.AvailableCount, pool.TotalCount]).toEqual([0, 1, 1]);

		const again = pool.Acquire(new Vec3(4, 5, 6));
		expect(again).toBe(first);
		expect(again.Active).toBe(true);
		expect(again.Transform.Position.ToTuple()).toEqual([4, 5, 6]);
		expect(again.RequireComponent(Probe).log).toEqual(["disable", "enable"]);
		expect(pool.TotalCount).toBe(1);
	});

	it("runs `prepare` before the entity wakes up or is switched back on", () => {
		const t = MakeEngine();
		const pool = new EntityPool(t.world, Bullet);
		const order: string[] = [];
		const fresh = pool.Acquire(new Vec3(), (e) => order.push(`prepare ${e.Name}, enabled log: ${e.RequireComponent(Probe).log.join(",")}`));
		t.world.FlushLifecycle();
		pool.Release(fresh);
		pool.Acquire(new Vec3(), (e) => order.push(`prepare again, enabled log: ${e.RequireComponent(Probe).log.join(",")}`));
		expect(order).toEqual(["prepare Bullet, enabled log: ", "prepare again, enabled log: disable"]);
	});

	it("at MaxSize it recycles the oldest active entity", () => {
		const t = MakeEngine();
		const pool = new EntityPool(t.world, Bullet, { MaxSize: 2 });
		const a = pool.Acquire(new Vec3());
		const b = pool.Acquire(new Vec3());
		t.world.FlushLifecycle();

		const c = pool.Acquire(new Vec3(9, 9, 9));
		expect(c).toBe(a);
		expect(c.Transform.Position.ToTuple()).toEqual([9, 9, 9]);
		expect([pool.ActiveCount, pool.TotalCount]).toEqual([2, 2]);
		expect(pool.Acquire(new Vec3())).toBe(b);
	});

	it("ignores a second release, entities from elsewhere, and forgets entities that were destroyed", () => {
		const t = MakeEngine();
		const pool = new EntityPool(t.world, Bullet);
		const a = pool.Acquire(new Vec3());
		t.world.FlushLifecycle();
		pool.Release(a);
		pool.Release(a);
		pool.Release(t.world.Spawn(Ent("Stranger", [])));
		expect([pool.ActiveCount, pool.AvailableCount]).toEqual([0, 1]);

		a.Destroy();
		t.world.FlushDestroyed();
		const b = pool.Acquire(new Vec3());
		expect(b).not.toBe(a);
		expect(pool.TotalCount).toBe(1);

		b.Destroy();
		t.world.FlushDestroyed();
		expect(pool.Acquire(new Vec3())).not.toBe(b); // a destroyed ACTIVE entity is not recycled either
	});

	it("defaults to 64 entities", () => {
		const t = MakeEngine();
		const pool = new EntityPool(t.world, Bullet);
		for (let i = 0; i < 70; i++) pool.Acquire(new Vec3());
		expect(pool.TotalCount).toBe(64);
	});

	it("Despawn returns pooled entities to their pool and destroys the rest", () => {
		const t = MakeEngine();
		const pool = new EntityPool(t.world, Bullet);
		const pooled = pool.Acquire(new Vec3());
		const plain = t.world.Spawn(Ent("Plain", []));
		t.world.FlushLifecycle();

		Despawn(pooled);
		Despawn(plain);
		expect(pooled.IsDestroyed).toBe(false);
		expect(pooled.Active).toBe(false);
		expect(pool.AvailableCount).toBe(1);
		expect(plain.IsDestroyed).toBe(true);
	});
});

describe("projectiles from a pool", () => {
	function Gun() {
		const t = MakeEngine();
		const pool = new EntityPool(t.world, () => Ent("Bullet", [Comp(Projectile, { Radius: 0.1, MaxLifetimeSeconds: 0.05 })]));
		const shoot = () => {
			const bullet = pool.Acquire(new Vec3(0, 1, 0), (e) => e.RequireComponent(Projectile).Velocity.Set(0, 0, -50));
			t.world.FlushLifecycle();
			return bullet;
		};
		const answer = async (hit: boolean) => {
			const query = t.commands().filter((c) => c.operation === PhysOpType.Query).at(-1) as { queryId: number; };
			t.physics.HandleMessage({ state: PhysState.QueryResult, queryId: query.queryId, result: { hit, position: [0, 1, -1], point: [0, 1, -1], normal: [0, 0, 1], hitEntityId: 0 } } as never);
			await Promise.resolve();
			await Promise.resolve();
		};
		return { t, pool, shoot, answer };
	}

	it("a hit returns the bullet to the pool instead of destroying it", async () => {
		const { t, pool, shoot, answer } = Gun();
		const bullet = shoot();
		t.step();
		await answer(true);
		expect(bullet.IsDestroyed).toBe(false);
		expect(bullet.Active).toBe(false);
		expect(pool.AvailableCount).toBe(1);
	});

	it("running out of lifetime returns it too, and a reused bullet starts its lifetime and sweeps afresh", async () => {
		const { t, pool, shoot } = Gun();
		const bullet = shoot();
		for (let i = 0; i < 4; i++) t.step();
		expect(bullet.Active).toBe(false);

		const again = shoot();
		expect(again).toBe(bullet);
		expect(again.RequireComponent(Projectile).Velocity.ToTuple()).toEqual([0, 0, -50]);
		t.commands();
		t.step();
		expect(t.commands().some((c) => c.operation === PhysOpType.Query)).toBe(true); // not stuck "resolved" or "in flight"
		expect(pool.ActiveCount).toBe(1);
	});

	it("an answer that belongs to the bullet's previous life is ignored", async () => {
		const { t, pool, shoot, answer } = Gun();
		const bullet = shoot();
		t.step();                     // a sweep goes out
		pool.Release(bullet);
		shoot();                      // same entity, new life
		await answer(true);           // the old answer arrives now
		expect(bullet.Active).toBe(true);
		expect(bullet.Transform.Position.ToTuple()).toEqual([0, 1, 0]);
	});
});

describe("sample shooters use pools", () => {
	function Player(component: typeof Shooter | typeof BallGun, props: Record<string, unknown> = {}) {
		const t = MakeEngine();
		t.world.Spawn(Ent("Camera", [Comp(CameraComponent, { TargetName: "Nobody" })], { position: [0, 2, 0] }));
		t.world.Spawn(Ent("Player", [Comp(component as typeof Shooter, props)]));
		t.world.FlushLifecycle();
		t.input.CapturePlayerInput = true;
		const click = (): void => {
			t.input.Handle({ kind: InputEvtType.PointerDown, button: 0 });
			t.frame();
			t.input.Handle({ kind: InputEvtType.PointerUp, button: 0 });
			t.world.FlushLifecycle();
		};
		const named = (name: string) => t.world.Entities.filter((e) => e.Name === name);
		return { t, click, named };
	}

	it("Shooter never has more than MaxBullets bullets, recycling the oldest", () => {
		const { click, named } = Player(Shooter, { MaxBullets: 3 });
		for (let i = 0; i < 5; i++) click();
		expect(named("Bullet")).toHaveLength(3);
		expect(named("Bullet").every((b) => b.Active)).toBe(true);
	});

	it("BallGun reuses a ball whose lifetime ran out, and throws it again from the camera", () => {
		const { t, click, named } = Player(BallGun);
		click();
		const ball = named("Thrown Ball")[0]!;
		ball.RequireComponent(Lifetime).Seconds = 0.5;
		t.frame(1);
		expect(ball.Active).toBe(false);

		t.commands();
		click();
		expect(named("Thrown Ball")).toEqual([ball]);
		expect(ball.Active).toBe(true);
		const sent = t.commands().map((c) => c.operation);
		expect(sent).toEqual([PhysOpType.SpawnBody, PhysOpType.SetLinearVelocity]); // body back, then the throw
	});

	it("Lifetime starts over when its entity comes back", () => {
		const t = MakeEngine();
		const entity = t.world.Spawn(Ent("Puff", [Comp(Lifetime, { Seconds: 1 })]));
		t.world.FlushLifecycle();
		t.frame(0.8);
		entity.Active = false;
		entity.Active = true;
		t.frame(0.8);
		expect(entity.IsDestroyed).toBe(false);
	});
});
