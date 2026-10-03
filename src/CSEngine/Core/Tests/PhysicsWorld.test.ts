// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { beforeEach, describe, expect, it } from "vitest";

import { PhysicsWorld } from "../Source/Workers/Physics/PhysicsWorld";
import type { PhysicsBridgeExports } from "../Source/Workers/Physics/PhysicsBridgeContract";
import { PhysBodyType, PhysObjectKind, PhysOpType, PhysShape, PhysState } from "../Source/Workers/Common/CommonEnums";
import type { PhysicsCommand, PhysicsToGameLogicMessage } from "../Source/Workers/Protocol/PhysicsGameLogicProtocol";
import { BODY_STRIDE, CHARACTER_STRIDE } from "../Source/Workers/Protocol/TransformProtocol";

/** Just enough of the wasm bridge to observe what PhysicsWorld asks of it. */
class FakeBridge {
	public calls: { name: string; args: (number | boolean)[]; }[] = [];
	private _nextId = 1;
	public readonly poses = new Map<number, number[]>();
	public readonly linearVelocities = new Map<number, number[]>();
	public stepSnapshot: number[] = [];
	public hullOffset = [0, 0, 0];
	public moveResult = [0, 0, 0, 1, 0, 1, 0, 0, 1, 2, 3];

	private Record(name: string, args: (number | boolean)[]): void { this.calls.push({ name, args }); }
	public Calls(name: string): (number | boolean)[][] { return this.calls.filter((c) => c.name === name).map((c) => c.args); }

	public CreateWorld = (...args: (number | boolean)[]): void => this.Record("CreateWorld", args);
	public AddBoxShape = (...a: number[]): number => { this.Record("AddBoxShape", a); return this._nextId++; };
	public AddSphereShape = (...a: number[]): number => { this.Record("AddSphereShape", a); return this._nextId++; };
	public AddCapsuleShape = (...a: number[]): number => { this.Record("AddCapsuleShape", a); return this._nextId++; };
	public AddConvexHullShape = (_points: number[], _mass: number): number[] => [this._nextId++, ...this.hullOffset];

	public AddDynamicBody = (...a: number[]): number => { const id = this._nextId++; this.poses.set(id, a.slice(1, 8)); this.Record("AddDynamicBody", a); return id; };
	public AddKinematicBody = (...a: number[]): number => { const id = this._nextId++; this.poses.set(id, a.slice(1, 8)); this.Record("AddKinematicBody", a); return id; };
	public AddStaticBody = (...a: number[]): number => { this.Record("AddStaticBody", a); return this._nextId++; };

	public GetBodyPose = (id: number): number[] => this.poses.get(id) ?? [0, 0, 0, 0, 0, 0, 1];
	public SetBodyPose = (id: number, ...pose: number[]): void => { this.poses.set(id, pose); this.Record("SetBodyPose", [id, ...pose]); };
	public GetLinearVelocity = (id: number): number[] => this.linearVelocities.get(id) ?? [0, 0, 0];
	public SetLinearVelocity = (id: number, ...v: number[]): void => { this.linearVelocities.set(id, v); this.Record("SetLinearVelocity", [id, ...v]); };
	public SetAngularVelocity = (id: number, ...v: number[]): void => this.Record("SetAngularVelocity", [id, ...v]);
	public SetAwakeState = (): void => undefined;

	public MoveCharacter = (...a: number[]): number[] => { this.Record("MoveCharacter", a); return this.moveResult; };
	public Step = (dt: number): number[] => { this.Record("Step", [dt]); return this.stepSnapshot; };
	public GetLastOverlapEvents = (): number[] => [];
}

const ZeroTransform: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 1];

describe("PhysicsWorld (physics worker side)", () => {
	let bridge: FakeBridge;
	let world: PhysicsWorld;
	let replies: PhysicsToGameLogicMessage[];

	const apply = (...commands: PhysicsCommand[]): void => world.ApplyCommands(commands, (m) => replies.push(m));

	beforeEach(() => {
		bridge = new FakeBridge();
		world = new PhysicsWorld(bridge as unknown as PhysicsBridgeExports);
		world.CreateWorld({ gravity: [0, -20, 0] });
		replies = [];
	});

	it("passes world settings through with the C# defaults", () => {
		expect(bridge.Calls("CreateWorld")[0]).toEqual([0, -20, 0, 8, 1, false, 0.8, 2]);
	});

	it("caches primitive shapes but not hulls", () => {
		const box = { shape: PhysShape.Box as const, size: [1, 1, 1] as [number, number, number] };
		for (const entityId of [1, 2]) {
			apply({ operation: PhysOpType.SpawnBody, entityId, bodyType: PhysBodyType.Static, shape: box, transform: ZeroTransform, layer: 1, mask: -1, objectKind: PhysObjectKind.Solid });
		}
		expect(bridge.Calls("AddBoxShape")).toHaveLength(1);
	});

	it("derives kinematic velocity from the pose delta and teleports the pose", () => {
		const shape = { shape: PhysShape.Box as const, size: [4, 0.4, 4] as [number, number, number] };
		apply({ operation: PhysOpType.SpawnBody, entityId: 5, bodyType: PhysBodyType.Kinematic, shape, transform: ZeroTransform, layer: 1, mask: -1, objectKind: PhysObjectKind.Solid });
		const bodyId = bridge.Calls("AddKinematicBody").length ? 2 : 0; // shape id 1, body id 2

		apply({ operation: PhysOpType.SetKinematicPose, entityId: 5, transform: [0, 0.5, 0, 0, 0, 0, 1] });
		world.Step(0.5);

		expect(bridge.Calls("SetLinearVelocity").find((c) => c[0] === bodyId)).toEqual([bodyId, 0, 1, 0]); // 0.5 m in 0.5 s
		expect(bridge.Calls("SetBodyPose").find((c) => c[0] === bodyId)?.slice(1, 4)).toEqual([0, 0.5, 0]);
	});

	it("moves a character: sweeps from the body pose, reports floor state and clipped velocity", () => {
		const capsule = { shape: PhysShape.Capsule as const, radius: 0.5, cylinderLength: 1 };
		apply({ operation: PhysOpType.SpawnBody, entityId: 9, bodyType: PhysBodyType.Kinematic, shape: capsule, transform: [1, 2, 3, 0, 0, 0, 1], layer: 2, mask: -1, objectKind: PhysObjectKind.Character });

		apply({ operation: PhysOpType.MoveCharacter, entityId: 9, velocity: [0, 0, -5], layer: 2, mask: -1 });
		const result = world.Step(1 / 60);

		const call = bridge.Calls("MoveCharacter")[0]!;
		expect(call.slice(1, 7)).toEqual([1, 2, 3, 0, 0, -5]); // pose + velocity
		expect(call.slice(8, 12)).toEqual([0.5, 1, 2, -1]);     // radius, cylinderLength, layer, mask
		expect(call.slice(12)).toEqual([4, 0.015, 46, 0.08]);   // CharacterMoveOptions defaults

		const c = new Float64Array(result.characters);
		expect(result.characterCount).toBe(1);
		expect(Array.from(c.slice(0, CHARACTER_STRIDE))).toEqual([9, 1, 0, 1, 0, 0, 1, 2, 3]); // id, floor, normal, ground, velocity
	});

	it("reports a character at its own authoritative position, not the integrated body pose", () => {
		const capsule = { shape: PhysShape.Capsule as const, radius: 0.5, cylinderLength: 1 };
		apply({ operation: PhysOpType.SpawnBody, entityId: 9, bodyType: PhysBodyType.Kinematic, shape: capsule, transform: [0, 1, 0, 0, 0, 0, 1], layer: 2, mask: -1, objectKind: PhysObjectKind.Character });
		const bodyId = 2; // capsule shape id 1, body id 2

		// MoveCharacter says the character ends at x = 1. Bepu then integrates the kinematic body by its velocity, so the
		// body pose after Step() is further along (x = 1.5) - reporting THAT would make the character move twice per tick.
		bridge.moveResult = [1, 1, 0, 1, 0, 1, 0, 0, 30, 0, 0];
		apply({ operation: PhysOpType.MoveCharacter, entityId: 9, velocity: [30, 0, 0], layer: 2, mask: -1 });
		bridge.stepSnapshot = [bodyId, 1.5, 1, 0, 0, 0, 0, 1, ...new Array(6).fill(0)];
		const result = world.Step(1 / 60);
		expect(Array.from(new Float64Array(result.bodies).slice(0, 4))).toEqual([9, 1, 1, 0]);

		// And the next move starts from x = 1 (own position), not from the integrated pose.
		apply({ operation: PhysOpType.MoveCharacter, entityId: 9, velocity: [0, 0, 0], layer: 2, mask: -1 });
		world.Step(1 / 60);
		expect(bridge.Calls("MoveCharacter")[1]![1]).toBe(1);
	});

	it("forwards all six velocity components of a body snapshot", () => {
		const box = { shape: PhysShape.Box as const, size: [1, 1, 1] as [number, number, number] };
		apply({ operation: PhysOpType.SpawnBody, entityId: 4, bodyType: PhysBodyType.Dynamic, shape: box, transform: ZeroTransform, layer: 1, mask: -1, objectKind: PhysObjectKind.Solid, mass: 1 });
		bridge.stepSnapshot = [2, 0, 0, 0, 0, 0, 0, 1, /* linear */ 1, 2, 3, /* angular */ 4, 5, 6];
		const result = world.Step(1 / 60);
		expect(Array.from(new Float64Array(result.bodies).slice(0, BODY_STRIDE))).toEqual([4, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 4, 5, 6]);
	});

	it("carries a character along with the moving platform it stood on last tick", () => {
		const capsule = { shape: PhysShape.Capsule as const, radius: 0.5, cylinderLength: 1 };
		const box = { shape: PhysShape.Box as const, size: [4, 0.4, 4] as [number, number, number] };
		apply({ operation: PhysOpType.SpawnBody, entityId: 1, bodyType: PhysBodyType.Kinematic, shape: box, transform: ZeroTransform, layer: 1, mask: -1, objectKind: PhysObjectKind.Solid });
		apply({ operation: PhysOpType.SpawnBody, entityId: 2, bodyType: PhysBodyType.Kinematic, shape: capsule, transform: [0, 1, 0, 0, 0, 0, 1], layer: 2, mask: -1, objectKind: PhysObjectKind.Character });

		// Tick 1: character lands on entity 1 (ground id in the result).
		bridge.moveResult = [0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0];
		apply({ operation: PhysOpType.MoveCharacter, entityId: 2, velocity: [0, 0, 0], layer: 2, mask: -1 });
		world.Step(0.1);

		// The platform now moves at 2 m/s along +X; tick 2 must shift the sweep's start position by 2 * dt.
		const platformBodyId = 2; // shape 1, body 2 (box); capsule shape 3, body 4
		bridge.linearVelocities.set(platformBodyId, [2, 0, 0]);
		apply({ operation: PhysOpType.MoveCharacter, entityId: 2, velocity: [0, 0, 0], layer: 2, mask: -1 });
		world.Step(0.1);

		const second = bridge.Calls("MoveCharacter")[1]!;
		expect(second[1]).toBeCloseTo(0.2, 6); // started at x = 0, carried 2 m/s * 0.1 s
	});

	it("undoes a convex hull's centroid offset when reporting poses", () => {
		bridge.hullOffset = [0, 0.25, 0];
		const hull = { shape: PhysShape.ConvexHull as const, points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] };
		apply({ operation: PhysOpType.SpawnBody, entityId: 3, bodyType: PhysBodyType.Dynamic, shape: hull, transform: [0, 1, 0, 0, 0, 0, 1], layer: 1, mask: -1, objectKind: PhysObjectKind.Solid, mass: 1 });

		// The body was created at source origin + offset...
		expect(bridge.Calls("AddDynamicBody")[0]!.slice(1, 4)).toEqual([0, 1.25, 0]);

		// ...and the snapshot reports the origin again, not the centroid.
		const bodyId = 2; // hull shape id 1, body id 2
		bridge.stepSnapshot = [bodyId, 0, 1.25, 0, 0, 0, 0, 1, ...new Array(6).fill(0)];
		const result = world.Step(1 / 60);
		const view = new Float64Array(result.bodies);
		expect(result.bodyCount).toBe(1);
		expect(view.length).toBe(BODY_STRIDE);
		expect(Array.from(view.slice(0, 4))).toEqual([3, 0, 1, 0]);
	});

	it("answers sync markers in order, after the commands queued before them", () => {
		apply({ operation: PhysOpType.Sync, token: 42 });
		expect(replies).toEqual([{ state: PhysState.SyncAck, token: 42 }]);
	});
});
