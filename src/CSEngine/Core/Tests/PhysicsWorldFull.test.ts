// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { PhysicsWorld } from "../Source/Workers/Physics/PhysicsWorld";
import type { PhysicsBridgeExports } from "../Source/Workers/Physics/PhysicsBridgeContract";
import { PhysBodyType, PhysObjectKind, PhysOpType, PhysQueryType, PhysShape, PhysState } from "../Source/Workers/Common/CommonEnums";
import type { PhysicsCommand, PhysicsShapeDescriptor, PhysicsToGameLogicMessage } from "../Source/Workers/Protocol/PhysicsGameLogicProtocol";
import { BODY_STRIDE } from "../Source/Workers/Protocol/TransformProtocol";
import { SilenceConsole } from "./helpers";

type Fn = ReturnType<typeof vi.fn>;
type FakeBridge = Record<keyof PhysicsBridgeExports, Fn>;

function MakeBridge(): FakeBridge {
	let id = 1;
	const next = (): number => id++;
	return {
		CreateWorld: vi.fn(), DestroyWorld: vi.fn(),
		AddBoxShape: vi.fn(next), AddSphereShape: vi.fn(next), AddCapsuleShape: vi.fn(next), AddCylinderShape: vi.fn(next),
		AddConvexHullShape: vi.fn(() => [next(), 0, 0, 0]), AddTriangleMeshShape: vi.fn(next),
		AddDynamicBody: vi.fn(next), AddKinematicBody: vi.fn(next), AddStaticBody: vi.fn(next),
		RemoveBody: vi.fn(), RemoveStatic: vi.fn(), BodyExists: vi.fn(() => true),
		GetBodyPose: vi.fn(() => [0, 0, 0, 0, 0, 0, 1]), SetBodyPose: vi.fn(),
		SetAwakeState: vi.fn(), GetAwakeState: vi.fn(() => true),
		GetLinearVelocity: vi.fn(() => [0, 0, 0]), SetLinearVelocity: vi.fn(),
		GetAngularVelocity: vi.fn(() => [0, 0, 0]), SetAngularVelocity: vi.fn(),
		ApplyImpulse: vi.fn(),
		MoveCharacter: vi.fn(() => [0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0]),
		SweepProjectile: vi.fn(() => [1, 1, 2, 3, 4, 5, 6, 0, 1, 0, 7]),
		SweepSphereCast: vi.fn(() => [1, 1, 2, 3, 4, 5, 6, 0, 1, 0, 9, 8]),
		Step: vi.fn(() => []), GetLastOverlapEvents: vi.fn(() => []),
	} as FakeBridge;
}

const Identity: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 1];
const Box: PhysicsShapeDescriptor = { shape: PhysShape.Box, size: [1, 1, 1] };
const Capsule: PhysicsShapeDescriptor = { shape: PhysShape.Capsule, radius: 0.5, cylinderLength: 1 };

function Setup() {
	const bridge = MakeBridge();
	const world = new PhysicsWorld(bridge as unknown as PhysicsBridgeExports);
	world.CreateWorld({ gravity: [0, -20, 0] });
	const replies: PhysicsToGameLogicMessage[] = [];
	const apply = (...commands: PhysicsCommand[]): void => world.ApplyCommands(commands, (m) => replies.push(m));
	const spawn = (entityId: number, bodyType: PhysBodyType, shape: PhysicsShapeDescriptor = Box, extra: Partial<Extract<PhysicsCommand, { operation: PhysOpType.SpawnBody; }>> = {}): void =>
		apply({ operation: PhysOpType.SpawnBody, entityId, bodyType, shape, transform: Identity, layer: 1, mask: -1, objectKind: PhysObjectKind.Solid, ...extra });
	return { bridge, world, replies, apply, spawn };
}

describe("PhysicsWorld (physics worker side) - everything the commands can do", () => {
	it("counts steps", () => {
		const { world } = Setup();
		expect(world.StepIndex).toBe(0);
		world.Step(1 / 60);
		world.Step(1 / 60);
		expect(world.StepIndex).toBe(2);
	});

	it("a command that throws is logged and the rest of the batch still runs", () => {
		const log = SilenceConsole();
		const { bridge, apply } = Setup();
		bridge.AddBoxShape!.mockImplementationOnce(() => { throw new Error("native crash"); });

		apply(
			{ operation: PhysOpType.SpawnBody, entityId: 1, bodyType: PhysBodyType.Static, shape: Box, transform: Identity, layer: 1, mask: -1, objectKind: PhysObjectKind.Solid },
			{ operation: PhysOpType.Sync, token: 5 },
		);
		expect(log.error).toHaveBeenCalled();
		expect(String(log.error.mock.calls[0]![0])).toContain("native crash");
	});

	describe("bodies", () => {
		it("static and dynamic bodies are removed through the right bridge call; unknown ids are ignored", () => {
			const { bridge, apply, spawn } = Setup();
			spawn(1, PhysBodyType.Static);
			spawn(2, PhysBodyType.Dynamic, Box, { mass: 2 });

			apply({ operation: PhysOpType.RemoveBody, entityId: 1 }, { operation: PhysOpType.RemoveBody, entityId: 2 }, { operation: PhysOpType.RemoveBody, entityId: 99 });
			expect(bridge.RemoveStatic).toHaveBeenCalledTimes(1);
			expect(bridge.RemoveBody).toHaveBeenCalledTimes(1);
		});

		it("spawning an entity id twice replaces the old body", () => {
			const { bridge, spawn } = Setup();
			spawn(1, PhysBodyType.Dynamic);
			spawn(1, PhysBodyType.Dynamic);
			expect(bridge.RemoveBody).toHaveBeenCalledTimes(1);
			expect(bridge.AddDynamicBody).toHaveBeenCalledTimes(2);
		});

		it("a dynamic body without a mass defaults to 1; continuous detection is passed through", () => {
			const { bridge, spawn } = Setup();
			spawn(1, PhysBodyType.Dynamic);
			spawn(2, PhysBodyType.Dynamic, Box, { mass: 5, continuousDetection: true });
			expect(bridge.AddDynamicBody!.mock.calls[0]![8]).toBe(1);
			expect(bridge.AddDynamicBody!.mock.calls[0]![13]).toBe(false);
			expect(bridge.AddDynamicBody!.mock.calls[1]![8]).toBe(5);
			expect(bridge.AddDynamicBody!.mock.calls[1]![13]).toBe(true);
		});

		it("SetPose teleports dynamic/kinematic bodies (and a character's own position); statics and unknown ids are ignored", () => {
			const { bridge, apply, spawn } = Setup();
			spawn(1, PhysBodyType.Static);
			spawn(2, PhysBodyType.Kinematic, Capsule, { objectKind: PhysObjectKind.Character });
			apply(
				{ operation: PhysOpType.SetPose, entityId: 1, transform: Identity },
				{ operation: PhysOpType.SetPose, entityId: 99, transform: Identity },
				{ operation: PhysOpType.SetPose, entityId: 2, transform: [4, 5, 6, 0, 0, 0, 1] },
			);
			expect(bridge.SetBodyPose).toHaveBeenCalledTimes(1);
			expect(bridge.SetBodyPose!.mock.calls[0]!.slice(1, 4)).toEqual([4, 5, 6]);

			apply({ operation: PhysOpType.MoveCharacter, entityId: 2, velocity: [0, 0, 0], layer: 1, mask: -1 });
		});

		it("velocity, angular velocity, impulse and awake commands wake the body first and ignore unknown / static ids", () => {
			const { bridge, apply, spawn } = Setup();
			spawn(1, PhysBodyType.Dynamic);
			spawn(2, PhysBodyType.Static);

			apply(
				{ operation: PhysOpType.SetLinearVelocity, entityId: 1, velocity: [1, 2, 3] },
				{ operation: PhysOpType.SetAngularVelocity, entityId: 1, velocity: [4, 5, 6] },
				{ operation: PhysOpType.ApplyImpulse, entityId: 1, impulse: [7, 8, 9], offset: [1, 1, 1] },
				{ operation: PhysOpType.SetAwake, entityId: 1, awake: false },
			);
			expect(bridge.SetLinearVelocity).toHaveBeenCalledWith(expect.any(Number), 1, 2, 3);
			expect(bridge.SetAngularVelocity).toHaveBeenCalledWith(expect.any(Number), 4, 5, 6);
			expect(bridge.ApplyImpulse).toHaveBeenCalledWith(expect.any(Number), 7, 8, 9, 1, 1, 1);
			expect(bridge.SetAwakeState).toHaveBeenCalledTimes(4); // woken three times, then told to sleep
			expect(bridge.SetAwakeState!.mock.calls.at(-1)![1]).toBe(false);

			bridge.SetAwakeState!.mockClear();
			apply(
				{ operation: PhysOpType.SetLinearVelocity, entityId: 2, velocity: [1, 1, 1] },
				{ operation: PhysOpType.SetLinearVelocity, entityId: 99, velocity: [1, 1, 1] },
				{ operation: PhysOpType.SetAngularVelocity, entityId: 99, velocity: [1, 1, 1] },
				{ operation: PhysOpType.ApplyImpulse, entityId: 99, impulse: [1, 1, 1], offset: [0, 0, 0] },
				{ operation: PhysOpType.SetAwake, entityId: 99, awake: true },
			);
			expect(bridge.SetAwakeState).not.toHaveBeenCalled();
		});

		it("a move command for something that is not a character is ignored", () => {
			const { bridge, apply, spawn, world } = Setup();
			spawn(1, PhysBodyType.Dynamic);
			apply({ operation: PhysOpType.MoveCharacter, entityId: 1, velocity: [1, 0, 0], layer: 1, mask: -1 });
			world.Step(1 / 60);
			expect(bridge.MoveCharacter).not.toHaveBeenCalled();
		});
	});

	describe("shapes", () => {
		it("builds every kind, caching only the primitive ones", () => {
			const { bridge, spawn } = Setup();
			const sphere: PhysicsShapeDescriptor = { shape: PhysShape.Sphere, radius: 1 };
			const cylinder: PhysicsShapeDescriptor = { shape: PhysShape.Cylinder, radius: 1, height: 2 };
			const hull: PhysicsShapeDescriptor = { shape: PhysShape.ConvexHull, points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] };
			const mesh: PhysicsShapeDescriptor = { shape: PhysShape.TriangleMesh, vertices: [0, 0, 0, 1, 0, 0, 0, 0, 1], scale: [2, 2, 2] };

			for (const [i, shape] of [sphere, sphere, cylinder, cylinder, Capsule, Capsule, hull, hull].entries()) spawn(i + 1, PhysBodyType.Static, shape);
			spawn(20, PhysBodyType.Static, mesh);
			spawn(21, PhysBodyType.Static, mesh);

			expect(bridge.AddSphereShape).toHaveBeenCalledTimes(1);
			expect(bridge.AddCylinderShape).toHaveBeenCalledTimes(1);
			expect(bridge.AddCapsuleShape).toHaveBeenCalledTimes(1);
			expect(bridge.AddConvexHullShape).toHaveBeenCalledTimes(2);
			expect(bridge.AddTriangleMeshShape).toHaveBeenCalledTimes(2);
			expect(bridge.AddTriangleMeshShape!.mock.calls[0]).toEqual([mesh.shape === PhysShape.TriangleMesh ? mesh.vertices : [], 2, 2, 2]);
		});
	});

	describe("queries", () => {
		it("sphere sweep: with and without an entity to exclude (an unknown one excludes nothing)", () => {
			const { bridge, apply, spawn, replies } = Setup();
			spawn(1, PhysBodyType.Dynamic);
			const query = (excludeEntityId?: number): PhysicsCommand => ({
				operation: PhysOpType.Query, queryId: 1,
				query: { type: PhysQueryType.SweepSphere, origin: [0, 1, 0], direction: [0, 0, -1], maxDistance: 10, radius: 0.1, layer: -1, mask: -1, ...(excludeEntityId !== undefined ? { excludeEntityId } : {}) },
			});

			apply(query(), query(1), query(99));
			expect(bridge.SweepSphereCast!.mock.calls.map((c) => c[10])).toEqual([0, expect.any(Number), 0]);
			expect(replies[0]).toEqual({
				state: PhysState.QueryResult, queryId: 1,
				result: { hit: true, position: [1, 2, 3], point: [4, 5, 6], normal: [0, 1, 0], distance: 9, hitEntityId: 8 },
			});
		});

		it("projectile sweep: an unknown projectile reports a miss at its own position", () => {
			const { bridge, apply, spawn, replies } = Setup();
			spawn(1, PhysBodyType.Kinematic, Box, { objectKind: PhysObjectKind.Projectile });
			const sweep = (entityId: number): PhysicsCommand => ({
				operation: PhysOpType.Query, queryId: entityId,
				query: { type: PhysQueryType.SweepProjectile, entityId, position: [1, 2, 3], velocity: [0, 0, -50], dt: 0.1, radius: 0.1, layer: 4, mask: 1 },
			});

			apply(sweep(1), sweep(99));
			expect(bridge.SweepProjectile).toHaveBeenCalledTimes(1);
			expect(replies[0]).toMatchObject({ result: { hit: true, position: [1, 2, 3], point: [4, 5, 6], hitEntityId: 7 } });
			expect(replies[1]).toMatchObject({ result: { hit: false, position: [1, 2, 3], hitEntityId: 0 } });
		});

		it("awake state of a body, or false for an unknown one", () => {
			const { bridge, apply, spawn, replies } = Setup();
			spawn(1, PhysBodyType.Dynamic);
			bridge.GetAwakeState!.mockReturnValueOnce(false);
			apply(
				{ operation: PhysOpType.Query, queryId: 1, query: { type: PhysQueryType.AwakeState, entityId: 1 } },
				{ operation: PhysOpType.Query, queryId: 2, query: { type: PhysQueryType.AwakeState, entityId: 99 } },
			);
			expect(replies.map((r) => (r as { result: unknown; }).result)).toEqual([{ awake: false }, { awake: false }]);
		});
	});

	it("ResetWorld recreates the bridge world and forgets every body", () => {
		const { bridge, apply, spawn, world } = Setup();
		spawn(1, PhysBodyType.Dynamic);
		apply({ operation: PhysOpType.ResetWorld, settings: { gravity: [0, -5, 0], velocityIterations: 4, substeps: 2, frictionCoefficient: 0.5, maximumRecoveryVelocity: 3 } });

		expect(bridge.CreateWorld).toHaveBeenLastCalledWith(0, -5, 0, 4, 2, false, 0.5, 3);
		apply({ operation: PhysOpType.SetLinearVelocity, entityId: 1, velocity: [1, 1, 1] });
		expect(bridge.SetLinearVelocity).not.toHaveBeenCalled();
		bridge.Step!.mockReturnValueOnce([2, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]); // the old body id, no longer known
		expect(world.Step(1 / 60).bodyCount).toBe(0);
	});

	describe("stepping", () => {
		it("reports overlap events as an Int32Array, or null when nothing changed", () => {
			const { bridge, world } = Setup();
			expect(world.Step(1 / 60).overlaps).toBeNull();

			bridge.GetLastOverlapEvents!.mockReturnValueOnce([3, 4, 1, 3, 5, 0]);
			const overlaps = world.Step(1 / 60).overlaps!;
			expect(overlaps).toBeInstanceOf(Int32Array);
			expect(Array.from(overlaps)).toEqual([3, 4, 1, 3, 5, 0]);
		});

		it("derives a kinematic body's velocities from the pose delta (angular via the quaternion log) and teleports it", () => {
			const { bridge, apply, spawn, world } = Setup();
			spawn(1, PhysBodyType.Kinematic);
			const quarterTurn = Math.SQRT1_2;
			apply({ operation: PhysOpType.SetKinematicPose, entityId: 1, transform: [0, 0, 2, 0, quarterTurn, 0, quarterTurn] }); // 90 degrees about Y, 2 m along Z
			world.Step(0.5);

			expect(bridge.SetLinearVelocity).toHaveBeenCalledWith(expect.any(Number), 0, 0, 4);
			const omega = bridge.SetAngularVelocity!.mock.calls[0]!.slice(1) as number[];
			expect(omega[0]).toBeCloseTo(0);
			expect(omega[1]).toBeCloseTo(Math.PI); // 90 degrees in 0.5 s
			expect(bridge.SetBodyPose!.mock.calls.at(-1)!.slice(1, 4)).toEqual([0, 0, 2]);

			// The same pose again: no movement -> zero velocities (the "tiny rotation" branch of the log).
			apply({ operation: PhysOpType.SetKinematicPose, entityId: 1, transform: [0, 0, 2, 0, quarterTurn, 0, quarterTurn] });
			world.Step(0.5);
			expect(bridge.SetLinearVelocity!.mock.calls.at(-1)!.slice(1)).toEqual([0, 0, 0]);
			expect(bridge.SetAngularVelocity!.mock.calls.at(-1)!.slice(1)).toEqual([0, 0, 0]);
		});

		it("takes the short way round when the target quaternion is on the other hemisphere", () => {
			const { bridge, apply, spawn, world } = Setup();
			spawn(1, PhysBodyType.Kinematic);
			const half = Math.SQRT1_2;
			apply({ operation: PhysOpType.SetKinematicPose, entityId: 1, transform: [0, 0, 0, 0, -half, 0, -half] }); // same rotation as +half, negated
			world.Step(1);
			const omega = bridge.SetAngularVelocity!.mock.calls[0]!.slice(1) as number[];
			expect(omega[1]).toBeCloseTo(Math.PI / 2); // +90 degrees in one second - not the long way round (-270 degrees)
		});

		it("a zero-length step derives nothing; a dynamic body (no previous pose) gets zero linear velocity", () => {
			const { bridge, apply, spawn, world } = Setup();
			spawn(1, PhysBodyType.Kinematic);
			spawn(2, PhysBodyType.Dynamic);
			apply({ operation: PhysOpType.SetKinematicPose, entityId: 1, transform: [9, 9, 9, 0, 0, 0, 1] });
			world.Step(0);
			expect(bridge.SetLinearVelocity).not.toHaveBeenCalled();

			apply({ operation: PhysOpType.SetKinematicPose, entityId: 2, transform: [9, 9, 9, 0, 0, 0, 1] });
			world.Step(1);
			expect(bridge.SetLinearVelocity).toHaveBeenCalledWith(expect.any(Number), 9, 9, 9); // kinematic 1's pending pose is applied by this step too
		});

		it("snapshot rows for bodies that vanished are dropped; the row layout is 14 doubles", () => {
			const { bridge, spawn, world } = Setup();
			spawn(1, PhysBodyType.Dynamic);
			bridge.Step!.mockReturnValueOnce([98, ...new Array(13).fill(0), 99, ...new Array(13).fill(0)]); // two body ids nobody registered
			const step = world.Step(1 / 60);
			expect(step.bodyCount).toBe(0);
			expect(new Float64Array(step.bodies).length).toBe(2 * BODY_STRIDE);
		});
	});

	describe("character moves", () => {
		function Character() {
			const t = Setup();
			t.spawn(10, PhysBodyType.Kinematic, Capsule, { objectKind: PhysObjectKind.Character, transform: [0, 1, 0, 0, 0, 0, 1] });
			return t;
		}
		const move = (v: [number, number, number] = [0, 0, -5]): PhysicsCommand => ({ operation: PhysOpType.MoveCharacter, entityId: 10, velocity: v, layer: 2, mask: -1, options: { skinWidth: 0.05 } });

		it("passes the merged options (defaults + overrides) and consumes each command exactly once", () => {
			const { bridge, apply, world } = Character();
			apply(move());
			world.Step(1 / 60);
			world.Step(1 / 60);
			expect(bridge.MoveCharacter).toHaveBeenCalledTimes(1);
			expect(bridge.MoveCharacter!.mock.calls[0]!.slice(12)).toEqual([4, 0.05, 46, 0.08]);
		});

		it("reports a character that is airborne, and a zero-length step leaves its body without velocity", () => {
			const { bridge, apply, world } = Character();
			bridge.MoveCharacter!.mockReturnValueOnce([0, 5, 0, 0, 0, 1, 0, 0, 1, 2, 3]);
			apply(move());
			const step = world.Step(0);
			expect(new Float64Array(step.characters)[1]).toBe(0);
			expect(bridge.SetLinearVelocity!.mock.calls.at(-1)!.slice(1)).toEqual([0, 0, 0]);
		});

		it("is carried by a moving ground body, but not by a static one, an unknown one, or when airborne", () => {
			const { bridge, apply, spawn, world } = Character();
			spawn(20, PhysBodyType.Kinematic);       // a moving platform
			spawn(21, PhysBodyType.Static);          // level geometry
			const stand = (ground: number, onFloor = 1): void => {
				bridge.MoveCharacter!.mockReturnValueOnce([0, 1, 0, onFloor, 0, 1, 0, ground, 0, 0, 0]);
				apply(move([0, 0, 0]));
				world.Step(0.1);
			};
			const carried = (): number => bridge.MoveCharacter!.mock.calls.at(-1)![1] as number;
			bridge.GetLinearVelocity!.mockImplementation(() => [5, 0, 0]);

			stand(20);        // standing on the platform
			apply(move([0, 0, 0])); world.Step(0.1);
			expect(carried()).toBeCloseTo(0.5); // x moved by 5 m/s * 0.1 s before the sweep

			stand(21);        // now on static geometry
			apply(move([0, 0, 0])); world.Step(0.1);
			expect(carried()).toBeCloseTo(0);

			stand(999);       // on something that no longer exists
			apply(move([0, 0, 0])); world.Step(0.1);
			expect(carried()).toBeCloseTo(0);

			stand(20, 0);     // "on" the platform but airborne
			apply(move([0, 0, 0])); world.Step(0.1);
			expect(carried()).toBeCloseTo(0);
		});
	});

	it("answers Sync markers", () => {
		const { apply, replies } = Setup();
		apply({ operation: PhysOpType.Sync, token: 3 });
		expect(replies).toEqual([{ state: PhysState.SyncAck, token: 3 }]);
	});
});
