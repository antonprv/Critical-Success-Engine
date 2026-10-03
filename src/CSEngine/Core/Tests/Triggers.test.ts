// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { afterEach, describe, expect, it, vi } from "vitest";
import { CollisionLayer } from "../Source/Engine/Core/CollisionLayer";
import type { Entity } from "../Source/Engine/Core/Entity";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { Shapes } from "../Source/Engine/Core/Shapes";
import { SimpleTriggerArea, TriggerArea } from "../Source/Engine/Components/Physics/TriggerAreas";
import { Quat } from "../Source/Engine/Math/Quat";
import { Vec3 } from "../Source/Engine/Math/Vec3";
import { PhysBodyType, PhysObjectKind, PhysOpType } from "../Source/Workers/Common/CommonEnums";
import { MakeEngine } from "./engine";
import { SilenceConsole } from "./helpers";

afterEach(() => vi.restoreAllMocks());

class Zone extends TriggerArea {
	public readonly entered: string[] = [];
	public readonly exited: string[] = [];
	protected override OnBodyEntered(body: Entity): void { this.entered.push(body.Name); }
	protected override OnBodyExited(body: Entity): void { this.exited.push(body.Name); }
}

describe("TriggerArea", () => {
	it("spawns a static trigger body on the Trigger layer that sees everything", () => {
		const t = MakeEngine();
		t.world.Spawn(Ent("Zone", [Comp(Zone, { Shape: Shapes.Box(2, 2, 2) })], { position: [1, 2, 3] }));
		t.world.FlushLifecycle();

		const spawn = t.commands().find((c) => c.operation === PhysOpType.SpawnBody);
		expect(spawn).toMatchObject({ bodyType: PhysBodyType.Static, objectKind: PhysObjectKind.Trigger, layer: CollisionLayer.Trigger, mask: CollisionLayer.All });
	});

	it("a moving trigger (BuildAsStatic = false) is kinematic and follows its entity every physics step", () => {
		const t = MakeEngine();
		const zone = t.world.Spawn(Ent("Zone", [Comp(Zone, { BuildAsStatic: false })], { position: [0, 0, 0] }));
		t.world.FlushLifecycle();
		expect(t.commands().find((c) => c.operation === PhysOpType.SpawnBody)).toMatchObject({ bodyType: PhysBodyType.Kinematic });

		zone.Transform.Position.Set(4, 5, 6);
		t.step();
		expect(t.commands().find((c) => c.operation === PhysOpType.SetPose)).toMatchObject({ entityId: zone.Id, transform: [4, 5, 6, 0, 0, 0, 1] });
	});

	it("a static trigger sends no pose updates", () => {
		const t = MakeEngine();
		t.world.Spawn(Ent("Zone", [Comp(Zone)]));
		t.world.FlushLifecycle();
		t.commands();
		t.step();
		expect(t.commands().some((c) => c.operation === PhysOpType.SetPose)).toBe(false);
	});

	it("reports each body once on entering and once on leaving, and tracks who is inside", () => {
		const t = MakeEngine();
		const zone = t.world.Spawn(Ent("Zone", [Comp(Zone)]));
		const a = t.world.Spawn(Ent("A", [])), b = t.world.Spawn(Ent("B", []));
		const component = zone.GetComponent(Zone)!;
		t.world.FlushLifecycle();

		component.OnTriggerEnter(a);
		component.OnTriggerEnter(a); // duplicate: ignored
		component.OnTriggerEnter(b);
		expect(component.entered).toEqual(["A", "B"]);
		expect([...component.BodiesInside]).toEqual([a.Id, b.Id]);

		component.OnTriggerExit(a);
		component.OnTriggerExit(a); // already gone: ignored
		expect(component.exited).toEqual(["A"]);
		expect([...component.BodiesInside]).toEqual([b.Id]);
	});

	it("the default OnBodyEntered/OnBodyExited do nothing", () => {
		const t = MakeEngine();
		const zone = t.world.Spawn(Ent("Zone", [Comp(TriggerArea)]));
		const other = t.world.Spawn(Ent("Other", []));
		const component = zone.GetComponent(TriggerArea)!;
		expect(() => { component.OnTriggerEnter(other); component.OnTriggerExit(other); }).not.toThrow();
	});
});

class Probe extends SimpleTriggerArea {
	public readonly events: string[] = [];
	protected override OnBodyEnter(): void { this.events.push("enter"); }
	protected override OnBodyExit(): void { this.events.push("exit"); }
}

function Arena(shape: Parameters<typeof Comp<Probe>>[1], rotation?: [number, number, number, number]) {
	const t = MakeEngine();
	const target = t.world.Spawn(Ent("Player", [], { position: [100, 0, 0] }));
	const area = t.world.Spawn(Ent("Area", [Comp(Probe, shape)], { position: [0, 0, 0], ...(rotation ? { rotation } : {}) }));
	t.world.FlushLifecycle();
	const probe = area.GetComponent(Probe)!;
	const moveTo = (x: number, y: number, z: number): void => { target.Transform.Position.Set(x, y, z); t.world.RunPhysicsUpdate(1 / 60); };
	return { t, target, probe, moveTo };
}

describe("SimpleTriggerArea", () => {
	it("box: enter and exit are reported as the target walks through", () => {
		const { probe, moveTo } = Arena({ Shape: Shapes.Box(2, 2, 2) });
		moveTo(5, 0, 0);
		expect(probe.IsInside).toBe(false);
		moveTo(0, 0, 0);
		expect(probe.IsInside).toBe(true);
		moveTo(0.5, 0.5, 0.5);
		moveTo(5, 0, 0);
		expect(probe.IsInside).toBe(false);
		expect(probe.events).toEqual(["enter", "exit"]);
	});

	it("a target that starts inside is inside without an event", () => {
		const { probe, moveTo } = Arena({ Shape: Shapes.Box(2, 2, 2) });
		moveTo(0, 0, 0);
		expect(probe.IsInside).toBe(true);
		expect(probe.events).toEqual([]);
	});

	it("does nothing until the target exists, and finds it later", () => {
		const t = MakeEngine();
		const area = t.world.Spawn(Ent("Area", [Comp(Probe, { Shape: Shapes.Box(2, 2, 2) })]));
		t.world.FlushLifecycle();
		expect(() => t.world.RunPhysicsUpdate(1 / 60)).not.toThrow();

		t.world.Spawn(Ent("Player", [], { position: [0, 0, 0] }));
		t.world.FlushLifecycle();
		t.world.RunPhysicsUpdate(1 / 60);
		expect(area.GetComponent(Probe)!.IsInside).toBe(true);
	});

	it("follows the area's own rotation", () => {
		// A 4 x 2 x 2 box turned 90 degrees about Y: its long side now runs along world Z.
		const { probe, moveTo } = Arena({ Shape: Shapes.Box(4, 2, 2) }, Quat.FromAxisAngle(Vec3.Up(), Math.PI / 2).ToTuple());
		moveTo(1.5, 0, 0);
		expect(probe.IsInside).toBe(false);
		moveTo(0, 0, 1.5);
		expect(probe.IsInside).toBe(true);
	});

	describe("a fast target that crosses the whole volume between two samples", () => {
		it("box: gets an enter immediately followed by an exit", () => {
			const { probe, moveTo } = Arena({ Shape: Shapes.Box(2, 2, 2) });
			moveTo(-5, 0, 0);
			moveTo(5, 0, 0);
			expect(probe.events).toEqual(["enter", "exit"]);
			expect(probe.IsInside).toBe(false);
		});

		it("box: a path that misses the volume reports nothing", () => {
			const { probe, moveTo } = Arena({ Shape: Shapes.Box(2, 2, 2) });
			moveTo(-5, 5, 0);
			moveTo(5, 5, 0);
			expect(probe.events).toEqual([]);
		});

		it("box: a path parallel to an axis and outside the slab misses (zero direction component)", () => {
			const { probe, moveTo } = Arena({ Shape: Shapes.Box(2, 2, 2) });
			moveTo(-5, 3, 0);
			moveTo(5, 3, 0);
			moveTo(-5, 3, 3);
			expect(probe.events).toEqual([]);
		});

		it("sphere: enter+exit through the middle, nothing when the path passes by", () => {
			const { probe, moveTo } = Arena({ Shape: Shapes.Sphere(1) });
			moveTo(-5, 0, 0);
			moveTo(5, 0, 0);
			expect(probe.events).toEqual(["enter", "exit"]);
			moveTo(-5, 3, 0);
			moveTo(5, 3, 0);
			expect(probe.events).toEqual(["enter", "exit"]);
			moveTo(5, 3, 0); // standing still outside: a zero-length path
			expect(probe.events).toEqual(["enter", "exit"]);
		});

		it("capsule: enter+exit through the middle, nothing when the path passes by", () => {
			const { probe, moveTo } = Arena({ Shape: Shapes.Capsule(0.5, 3) }); // 2 m of straight segment
			moveTo(-5, 0, 0);
			moveTo(5, 0, 0);
			expect(probe.events).toEqual(["enter", "exit"]);
			moveTo(-5, 4, 0);
			moveTo(5, 4, 0);
			expect(probe.events).toEqual(["enter", "exit"]);
		});
	});

	it("sphere and capsule containment", () => {
		const sphere = Arena({ Shape: Shapes.Sphere(1) });
		sphere.moveTo(0.9, 0, 0);
		expect(sphere.probe.IsInside).toBe(true);
		sphere.moveTo(1.1, 0, 0);
		expect(sphere.probe.IsInside).toBe(false);

		const capsule = Arena({ Shape: Shapes.Capsule(0.5, 3) });
		capsule.moveTo(0, 1.2, 0.3); // above the cylinder part, inside the cap
		expect(capsule.probe.IsInside).toBe(true);
		capsule.moveTo(0, 2.1, 0);   // beyond the cap
		expect(capsule.probe.IsInside).toBe(false);
	});

	it("an unsupported shape is reported as an error and never contains anything", () => {
		const log = SilenceConsole();
		const { probe, moveTo } = Arena({ Shape: Shapes.Cylinder(1, 2) });
		moveTo(0, 0, 0);
		moveTo(0, 0, 0);
		expect(probe.IsInside).toBe(false);
		expect(log.error).toHaveBeenCalled();
		expect(String(log.error.mock.calls[0]![0])).toContain("SimpleTriggerArea doesn't support this shape");
	});

	it("the default OnBodyEnter/OnBodyExit do nothing", () => {
		const t = MakeEngine();
		const target = t.world.Spawn(Ent("Player", [], { position: [5, 0, 0] }));
		t.world.Spawn(Ent("Area", [Comp(SimpleTriggerArea, { Shape: Shapes.Box(2, 2, 2) })]));
		t.world.FlushLifecycle();
		t.world.RunPhysicsUpdate(1 / 60);
		target.Transform.Position.Set(0, 0, 0);
		t.world.RunPhysicsUpdate(1 / 60);
		target.Transform.Position.Set(5, 0, 0);
		expect(() => t.world.RunPhysicsUpdate(1 / 60)).not.toThrow();
	});

	describe("segment geometry", () => {
		type Geometry = {
			SegmentIntersectsSphere(a: Vec3, b: Vec3, r: number): boolean;
			SegmentSegmentDistanceSquared(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number;
		};
		const geometry = SimpleTriggerArea as unknown as Geometry;
		const v = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z);

		it("sphere: zero-length segment inside / outside, a miss, a hit that ends inside", () => {
			expect(geometry.SegmentIntersectsSphere(v(0.5, 0, 0), v(0.5, 0, 0), 1)).toBe(true);
			expect(geometry.SegmentIntersectsSphere(v(3, 0, 0), v(3, 0, 0), 1)).toBe(false);
			expect(geometry.SegmentIntersectsSphere(v(-5, 3, 0), v(5, 3, 0), 1)).toBe(false);
			expect(geometry.SegmentIntersectsSphere(v(-5, 0, 0), v(0, 0, 0), 1)).toBe(true);
			expect(geometry.SegmentIntersectsSphere(v(-5, 0, 0), v(-3, 0, 0), 1)).toBe(false); // would hit if the line went on
		});

		it("segment-segment distance matches a brute-force minimum, including degenerate and parallel segments", () => {
			let seed = 12345;
			const random = (): number => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
			const point = (): Vec3 => v(random() * 10 - 5, random() * 10 - 5, random() * 10 - 5);
			const brute = (p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number => {
				let best = Infinity;
				for (let i = 0; i <= 80; i++) {
					const a = p1.Lerp(q1, i / 80);
					for (let j = 0; j <= 80; j++) best = Math.min(best, a.Sub(p2.Lerp(q2, j / 80)).LengthSq());
				}
				return best;
			};

			const pairs: [Vec3, Vec3, Vec3, Vec3][] = [
				[v(0, 0, 0), v(0, 0, 0), v(3, 4, 0), v(3, 4, 0)],       // both degenerate
				[v(0, 5, 0), v(0, 5, 0), v(0, 0, 0), v(0, 2, 0)],       // first degenerate
				[v(0, 0, 0), v(0, 2, 0), v(1, 1, 0), v(1, 1, 0)],       // second degenerate
				[v(0, 0, 0), v(0, 2, 0), v(1, 0, 0), v(1, 2, 0)],       // parallel
				[v(-1, 0, 0), v(1, 0, 0), v(0, -1, 1), v(0, 1, 1)],     // skew, crossing
			];
			for (let i = 0; i < 60; i++) pairs.push([point(), point(), point(), point()]);

			for (const [p1, q1, p2, q2] of pairs) {
				expect(geometry.SegmentSegmentDistanceSquared(p1, q1, p2, q2)).toBeCloseTo(brute(p1, q1, p2, q2), 1);
			}
		});
	});
});
