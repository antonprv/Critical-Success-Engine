// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";

import { Component } from "../Source/Engine/Core/Component";
import { CollisionLayer } from "../Source/Engine/Core/CollisionLayer";
import type { EngineContext } from "../Source/Engine/Core/EngineContext";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { EntityWorld } from "../Source/Engine/Core/EntityWorld";
import { MeshForShape, Meshes, Shapes } from "../Source/Engine/Core/Shapes";
import { SyncTracker, WithTimeout } from "../Source/Engine/Core/SyncTracker";
import { Transform } from "../Source/Engine/Core/Transform";
import { SceneRegistry } from "../Source/Engine/Scenes/SceneRegistry";
import { Quat } from "../Source/Engine/Math/Quat";
import { Vec3 } from "../Source/Engine/Math/Vec3";
import { PhysShape, RendMesh } from "../Source/Workers/Common/CommonEnums";

function CreateWorld(): EntityWorld {
	const context = {} as { World?: EntityWorld; };
	const world = new EntityWorld(context as EngineContext);
	context.World = world;
	return world;
}

class Probe extends Component {
	public static Log: string[] = [];
	public Name = "";
	public Boom = false;
	public override Awake(): void { Probe.Log.push(`awake ${this.Name}`); }
	public override Start(): void { Probe.Log.push(`start ${this.Name}`); }
	public override Update(): void { Probe.Log.push(`update ${this.Name}`); if (this.Boom) throw new Error("boom"); }
	public override OnPhysicsUpdate(): void { Probe.Log.push(`physics ${this.Name}`); }
	public override OnTriggerEnter(): void { Probe.Log.push(`trigger-enter ${this.Name}`); }
	public override OnTriggerExit(): void { Probe.Log.push(`trigger-exit ${this.Name}`); }
	public override OnCollisionEnter(): void { Probe.Log.push(`collision-enter ${this.Name}`); }
	public override OnCollisionExit(): void { Probe.Log.push(`collision-exit ${this.Name}`); }
	public override OnDestroy(): void { Probe.Log.push(`destroy ${this.Name}`); }
}

describe("CollisionLayer", () => {
	it("has distinct bits and an all-bits value that survives the int32 bridge", () => {
		expect(CollisionLayer.None).toBe(0);
		const bits = [CollisionLayer.World, CollisionLayer.Character, CollisionLayer.Projectile, CollisionLayer.Trigger, CollisionLayer.Prop, CollisionLayer.Debris];
		expect(new Set(bits).size).toBe(bits.length);
		expect(CollisionLayer.All | 0).toBe(-1);
		expect(bits.every((bit) => (bit & CollisionLayer.All) === bit)).toBe(true);
	});
});

describe("Transform", () => {
	it("keeps the previous pose of physics-driven entities and interpolates between them", () => {
		const t = new Transform();
		t.PushPhysicsPose(new Vec3(0, 0, 0), Quat.Identity());
		t.PushPhysicsPose(new Vec3(10, 0, 0), Quat.FromAxisAngle(Vec3.Up(), Math.PI / 2));
		expect(t.IsPhysicsDriven).toBe(true);

		const out = new Float64Array(7);
		t.WriteInterpolated(0.5, out, 0);
		expect(out[0]).toBeCloseTo(5);
		expect(out[4]).toBeCloseTo(Math.sin(Math.PI / 8)); // halfway to 90 degrees about Y -> 45 degrees
	});

	it("script-driven transforms are written as they are", () => {
		const t = new Transform();
		t.Position.Set(1, 2, 3);
		t.Rotation.Set(0, 0, 1, 0);
		const out = new Float64Array(9);
		t.WriteInterpolated(0.3, out, 2);
		expect(Array.from(out.subarray(2))).toEqual([1, 2, 3, 0, 0, 1, 0]);
	});

	it("Teleport snaps both poses (optionally with a rotation); ToFlat exports", () => {
		const t = new Transform();
		t.PushPhysicsPose(new Vec3(5, 5, 5), Quat.Identity());
		t.Teleport(new Vec3(1, 2, 3));
		expect(t.PreviousPosition.ToTuple()).toEqual([1, 2, 3]);
		expect(t.Rotation.ToTuple()).toEqual([0, 0, 0, 1]);

		t.Teleport(new Vec3(1, 2, 3), new Quat(0, 1, 0, 0));
		expect(t.PreviousRotation.ToTuple()).toEqual([0, 1, 0, 0]);
		expect(t.ToFlat()).toEqual([1, 2, 3, 0, 1, 0, 0]);
	});
});

describe("EntityWorld", () => {
	it("spawns entities from manifests: position, rotation, tags, components in order", () => {
		const world = CreateWorld();
		const entity = world.Spawn(Ent("Hero", [Comp(Probe, { Name: "a" }), Comp(Probe, { Name: "b" })], {
			position: [1, 2, 3], rotation: [0, 1, 0, 0], tags: ["x", "y"],
		}));

		expect(entity.Transform.Position.ToTuple()).toEqual([1, 2, 3]);
		expect(entity.Transform.Rotation.ToTuple()).toEqual([0, 1, 0, 0]);
		expect([...entity.Tags]).toEqual(["x", "y"]);
		expect(entity.Components.map((c) => (c as Probe).Name)).toEqual(["a", "b"]);
		expect(world.Count).toBe(1);
		expect(world.Entities).toHaveLength(1);
		expect(world.Get(entity.Id)).toBe(entity);
		expect(world.FindByName("Hero")).toBe(entity);
		expect(world.FindByTag("x")).toEqual([entity]);
		expect(world.FindByName("nobody")).toBeUndefined();
		expect(world.FindByTag("nothing")).toEqual([]);
	});

	it("Comp/Ent helpers build manifests with and without props", () => {
		expect(Comp(Probe)).toEqual({ type: Probe });
		expect(Comp(Probe, { Name: "n" })).toEqual({ type: Probe, props: { Name: "n" } });
		expect(Ent("E", [])).toEqual({ name: "E", components: [] });
		expect(Ent("E", [], { tags: ["t"] })).toEqual({ name: "E", components: [], tags: ["t"] });
	});

	it("runs Awake for all before Start for all, and hooks top to bottom", () => {
		Probe.Log = [];
		const world = CreateWorld();
		world.Spawn(Ent("A", [Comp(Probe, { Name: "a1" }), Comp(Probe, { Name: "a2" })]));
		world.Spawn(Ent("B", [Comp(Probe, { Name: "b1" })]));
		world.FlushLifecycle();
		expect(Probe.Log).toEqual(["awake a1", "awake a2", "awake b1", "start a1", "start a2", "start b1"]);

		Probe.Log = [];
		world.RunUpdate(0.016);
		world.RunPhysicsUpdate(0.016);
		expect(Probe.Log).toEqual(["update a1", "update a2", "update b1", "physics a1", "physics a2", "physics b1"]);
	});

	it("skips disabled components, inactive entities and components that have not started", () => {
		Probe.Log = [];
		const world = CreateWorld();
		const off = world.Spawn(Ent("Off", [Comp(Probe, { Name: "disabled" })]));
		const inactive = world.Spawn(Ent("Inactive", [Comp(Probe, { Name: "inactive" })]));
		world.FlushLifecycle();
		off.Components[0]!.Enabled = false;
		inactive.Active = false;
		world.Spawn(Ent("Fresh", [Comp(Probe, { Name: "fresh" })])); // not flushed: Start has not run
		Probe.Log = [];

		world.RunUpdate(0.016);
		world.RunPhysicsSync();
		expect(Probe.Log).toEqual([]);
	});

	it("a throwing hook is logged and does not stop the others", () => {
		Probe.Log = [];
		const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const world = CreateWorld();
		world.Spawn(Ent("A", [Comp(Probe, { Name: "bad", Boom: true }), Comp(Probe, { Name: "good" })]));
		world.FlushLifecycle();
		Probe.Log = [];

		world.RunUpdate(0.016);

		expect(Probe.Log).toEqual(["update bad", "update good"]);
		expect(errors).toHaveBeenCalledTimes(1);
		expect(String(errors.mock.calls[0]![0])).toContain("Probe.Update threw on entity \"A\"");
	});

	it("destroys at the end of a pass, runs OnDestroy once, and forgets the entity", () => {
		Probe.Log = [];
		const world = CreateWorld();
		const entity = world.Spawn(Ent("Doomed", [Comp(Probe, { Name: "d" })], { tags: ["t"] }));
		const other = world.Spawn(Ent("Other", []));
		world.FlushLifecycle();
		Probe.Log = [];

		entity.Destroy();
		entity.Destroy(); // twice is harmless
		expect(entity.IsDestroyed).toBe(true);
		expect(Probe.Log).toEqual([]); // deferred
		expect(world.FindByName("Doomed")).toBeUndefined();
		expect(world.FindByTag("t")).toEqual([]);

		world.FlushDestroyed();
		world.FlushDestroyed(); // nothing queued: no-op
		expect(Probe.Log).toEqual(["destroy d"]);
		expect(world.Get(entity.Id)).toBeUndefined();
		expect(world.Entities).toEqual([other]);
	});

	it("an entity destroyed before it was ever awoken does not run OnDestroy, Awake or Start", () => {
		Probe.Log = [];
		const world = CreateWorld();
		world.Spawn(Ent("Never", [Comp(Probe, { Name: "n" })])).Destroy();
		world.FlushLifecycle();
		world.FlushDestroyed();
		expect(Probe.Log).toEqual([]);
	});

	it("entities spawned during Awake/Start are brought up in the same flush", () => {
		const events: string[] = [];
		class Spawner extends Component {
			public override Awake(): void { events.push("spawner awake"); this.Engine.World.Spawn(Ent("Child", [Comp(Child)])); }
			public override Start(): void { events.push("spawner start"); }
		}
		class Child extends Component {
			public override Awake(): void { events.push("child awake"); }
			public override Start(): void { events.push("child start"); }
		}

		const context = {} as { World?: EntityWorld; };
		const world = new EntityWorld(context as EngineContext);
		context.World = world;
		world.Spawn(Ent("Parent", [Comp(Spawner)]));
		world.FlushLifecycle();

		expect(events).toEqual(["spawner awake", "child awake", "spawner start", "child start"]);
	});

	it("DestroyAll tears everything down at once, including entities queued but not yet awake", () => {
		Probe.Log = [];
		const world = CreateWorld();
		world.Spawn(Ent("A", [Comp(Probe, { Name: "a" })]));
		world.FlushLifecycle();
		world.Spawn(Ent("Pending", [Comp(Probe, { Name: "pending" })]));
		Probe.Log = [];

		world.DestroyAll();

		expect(Probe.Log).toEqual(["destroy a"]);
		expect(world.Count).toBe(0);
		expect(world.Renderables.size).toBe(0);
		world.FlushLifecycle(); // the cleared queues must not resurrect anything
		expect(Probe.Log).toEqual(["destroy a"]);
	});

	it("dispatches overlaps to both sides with the right callback, skipping inactive and destroyed ones", () => {
		Probe.Log = [];
		const world = CreateWorld();
		const a = world.Spawn(Ent("A", [Comp(Probe, { Name: "a" })]));
		const b = world.Spawn(Ent("B", [Comp(Probe, { Name: "b" })]));
		world.FlushLifecycle();
		Probe.Log = [];

		world.DispatchOverlap(a, b, true, true);
		world.DispatchOverlap(a, b, false, true);
		world.DispatchOverlap(a, b, true, false);
		world.DispatchOverlap(a, b, false, false);
		expect(Probe.Log).toEqual([
			"trigger-enter a", "trigger-enter b", "trigger-exit a", "trigger-exit b",
			"collision-enter a", "collision-enter b", "collision-exit a", "collision-exit b",
		]);

		Probe.Log = [];
		b.Active = false;
		world.DispatchOverlap(a, b, true, true);
		expect(Probe.Log).toEqual(["trigger-enter a"]);

		a.Components[0]!.Enabled = false;
		Probe.Log = [];
		world.DispatchOverlap(a, b, true, true);
		expect(Probe.Log).toEqual([]);
	});

	it("component helpers: GetComponent(s), RequireComponent and the throw on a missing one", () => {
		class Other extends Component {}
		const world = CreateWorld();
		const entity = world.Spawn(Ent("E", [Comp(Probe, { Name: "1" }), Comp(Probe, { Name: "2" })]));

		expect(entity.GetComponent(Probe)).toBe(entity.Components[0]);
		expect(entity.GetComponents(Probe)).toHaveLength(2);
		expect(entity.GetComponent(Other)).toBeUndefined();
		expect(entity.RequireComponent(Probe)).toBe(entity.Components[0]);
		expect(() => entity.RequireComponent(Other)).toThrow(/has no Other/);
		expect(entity.Engine.World).toBe(world);
		expect(entity.Components[0]!.Transform).toBe(entity.Transform);
		expect(entity.Components[0]!.Engine).toBe(entity.Engine);
	});
});

describe("Shapes and Meshes", () => {
	it("builds collider descriptors with Godot's conventions", () => {
		expect(Shapes.Box(1, 2, 3)).toEqual({ shape: PhysShape.Box, size: [1, 2, 3] });
		expect(Shapes.Sphere(0.5)).toEqual({ shape: PhysShape.Sphere, radius: 0.5 });
		expect(Shapes.Capsule(0.5, 2)).toEqual({ shape: PhysShape.Capsule, radius: 0.5, cylinderLength: 1 });
		expect(Shapes.Capsule(0.5, 0.5)).toEqual({ shape: PhysShape.Capsule, radius: 0.5, cylinderLength: 0.01 }); // never degenerate
		expect(Shapes.Cylinder(1, 2)).toEqual({ shape: PhysShape.Cylinder, radius: 1, height: 2 });
		expect(Shapes.ConvexHull([0, 0, 0])).toEqual({ shape: PhysShape.ConvexHull, points: [0, 0, 0] });
		expect(Shapes.TriangleMesh([1, 2, 3])).toEqual({ shape: PhysShape.TriangleMesh, vertices: [1, 2, 3], scale: [1, 1, 1] });
		expect(Shapes.TriangleMesh([1, 2, 3], [2, 2, 2])).toMatchObject({ scale: [2, 2, 2] });
	});

	it("builds visual meshes", () => {
		expect(Meshes.Box(1, 2, 3)).toEqual({ shape: RendMesh.Box, size: [1, 2, 3] });
		expect(Meshes.Sphere(0.5)).toEqual({ shape: RendMesh.Sphere, diameter: 1 });
		expect(Meshes.Capsule(0.5, 2)).toEqual({ shape: RendMesh.Capsule, radius: 0.5, height: 2 });
		expect(Meshes.Cylinder(1, 3)).toEqual({ shape: RendMesh.Cylinder, diameter: 2, height: 3 });
		expect(Meshes.Triangles([0, 0, 0])).toEqual({ shape: RendMesh.Triangles, vertices: [0, 0, 0] });
	});

	it("derives the matching visual from every collider shape", () => {
		expect(MeshForShape(Shapes.Box(1, 2, 3))).toEqual(Meshes.Box(1, 2, 3));
		expect(MeshForShape(Shapes.Sphere(2))).toEqual(Meshes.Sphere(2));
		expect(MeshForShape(Shapes.Capsule(0.5, 2))).toEqual(Meshes.Capsule(0.5, 2));
		expect(MeshForShape(Shapes.Cylinder(1, 3))).toEqual(Meshes.Cylinder(1, 3));
		expect(MeshForShape(Shapes.TriangleMesh([0, 0, 0, 1, 0, 0, 0, 1, 0], [2, 3, 4]))).toEqual(Meshes.Triangles([0, 0, 0, 2, 0, 0, 0, 3, 0]));
	});

	it("draws a convex hull as outward-facing triangles that cover the whole point cloud", () => {
		// A unit tetrahedron around the origin: 4 faces = 4 triangles = 36 numbers.
		const points = [1, 1, 1, 1, -1, -1, -1, 1, -1, -1, -1, 1];
		const mesh = MeshForShape(Shapes.ConvexHull(points));
		expect(mesh?.shape).toBe(RendMesh.Triangles);
		const vertices = (mesh as { vertices: number[]; }).vertices;
		expect(vertices).toHaveLength(36);

		for (let i = 0; i < vertices.length; i += 9) {
			const a = new Vec3(vertices[i]!, vertices[i + 1]!, vertices[i + 2]!);
			const b = new Vec3(vertices[i + 3]!, vertices[i + 4]!, vertices[i + 5]!);
			const c = new Vec3(vertices[i + 6]!, vertices[i + 7]!, vertices[i + 8]!);
			const normal = b.Sub(a).Cross(c.Sub(a));
			expect(normal.Dot(a)).toBeGreaterThan(0); // counter-clockwise seen from outside: normal points away from the centre
		}
	});

	it("a hull with coplanar points still produces a closed, non-empty surface (a cube: 12 triangles)", () => {
		const corners: number[] = [];
		for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push(x, y, z);
		const vertices = (MeshForShape(Shapes.ConvexHull(corners)) as { vertices: number[]; }).vertices;
		expect(vertices.length / 9).toBeGreaterThanOrEqual(12);
	});

	it("degenerate point clouds (collinear) give no triangles instead of crashing", () => {
		const vertices = (MeshForShape(Shapes.ConvexHull([0, 0, 0, 1, 0, 0, 2, 0, 0])) as { vertices: number[]; }).vertices;
		expect(vertices).toEqual([]);
	});
});

describe("SyncTracker and WithTimeout", () => {
	it("resolves a Begin() when its token comes back, and ignores unknown tokens", async () => {
		const tracker = new SyncTracker();
		const sent: number[] = [];
		const first = tracker.Begin((token) => sent.push(token));
		const second = tracker.Begin((token) => sent.push(token));
		expect(sent).toEqual([1, 2]);

		tracker.Acknowledge(99); // unknown
		tracker.Acknowledge(2);
		await second;
		tracker.Acknowledge(1);
		await first;
	});

	it("WithTimeout reports whether the promise finished in time", async () => {
		vi.useFakeTimers();
		try {
			const quick = WithTimeout(Promise.resolve(), 1000);
			await vi.advanceTimersByTimeAsync(0);
			await expect(quick).resolves.toBe(true);

			const never = WithTimeout(new Promise<void>(() => undefined), 1000);
			await vi.advanceTimersByTimeAsync(1001);
			await expect(never).resolves.toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("SceneRegistry", () => {
	const scene = (id: string) => ({ id, name: id, description: "", entities: [] });

	it("keeps registration order, finds scenes by id, and refuses duplicates", () => {
		const registry = new SceneRegistry();
		expect(registry.First).toBeUndefined();
		expect(registry.All).toEqual([]);

		registry.Register(scene("a")).Register(scene("b"));
		expect(registry.First?.id).toBe("a");
		expect(registry.All.map((s) => s.id)).toEqual(["a", "b"]);
		expect(registry.Get("b")?.id).toBe("b");
		expect(registry.Get("zzz")).toBeUndefined();
		expect(() => registry.Register(scene("a"))).toThrow(/already registered/);
	});
});
