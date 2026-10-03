// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The code printed in docs/guides is real code under Source/Game/GuideExamples - these tests make sure it also runs.

import { describe, expect, it } from "vitest";

import { CollisionLayer } from "../Source/Engine/Core/CollisionLayer";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { Shapes } from "../Source/Engine/Core/Shapes";
import { CameraComponent } from "../Source/Engine/Components/Camera/CameraComponent";
import { MovementPreset } from "../Source/Engine/Components/Mover/MovementTypes";
import { MoverComponent } from "../Source/Engine/Components/Mover/MoverComponent";
import { RigidBody, StaticBody } from "../Source/Engine/Components/Physics/PhysicsBodies";
import { SceneRegistry } from "../Source/Engine/Scenes/SceneRegistry";
import { BallPitScene } from "../Source/Game/GuideExamples/BallPitScene";
import { BallGun, InitialVelocity } from "../Source/Game/GuideExamples/ComponentExamples";
import { Bumper, RangeFinder } from "../Source/Game/GuideExamples/PhysicsExamples";
import { TunedCamera, TunedPlayer, WindyMover } from "../Source/Game/GuideExamples/PlayerExamples";
import { PhysOpType, PhysState } from "../Source/Workers/Common/CommonEnums";
import { Harness } from "./Harness";

async function Boot(...entities: Parameters<SceneRegistry["Register"]>[0]["entities"]): Promise<Harness> {
	const harness = new Harness(new SceneRegistry().Register({ id: "t", name: "T", description: "", entities }));
	await harness.BootToScene();
	harness.ui.Receive({ type: "set-capture", enabled: true });
	harness.ClearSent();
	return harness;
}

describe("guide 02: the ball pit scene", () => {
	it("loads: 5 static boxes + 12 balls, each with a physics body and a mesh", async () => {
		const harness = new Harness(new SceneRegistry().Register(BallPitScene));
		await harness.BootToScene();

		const spawns = harness.AllPhysicsCommands().filter((c) => c.operation === PhysOpType.SpawnBody);
		expect(spawns).toHaveLength(17);
		expect(harness.runtime.Context.World.Entities.filter((e) => e.Name.startsWith("Ball "))).toHaveLength(12);
	});
});

describe("guide 03: components", () => {
	it("InitialVelocity: the body's spawn command is queued BEFORE the velocity command (that is why it uses Start)", async () => {
		const loaded = new Harness(new SceneRegistry().Register({
			id: "t", name: "T", description: "", entities: [Ent("Ball", [
				Comp(RigidBody, { Shape: Shapes.Sphere(0.5) }),
				Comp(InitialVelocity, { Velocity: [1, 2, 3] }),
			])],
		}));
		await loaded.BootToScene();

		const operations = loaded.AllPhysicsCommands().map((c) => c.operation);
		const spawn = operations.indexOf(PhysOpType.SpawnBody);
		const velocity = operations.indexOf(PhysOpType.SetLinearVelocity);
		expect(spawn).toBeGreaterThanOrEqual(0);
		expect(velocity).toBeGreaterThan(spawn);
	});

	it("BallGun: a click spawns a ball in front of the camera with its velocity applied after the body exists", async () => {
		const harness = await Boot(
			Ent("Camera", [Comp(CameraComponent, { TargetName: "Nobody" })], { position: [0, 2, 0] }),
			Ent("Gun", [Comp(BallGun, { Speed: 20 })]),
		);

		harness.runtime.HandleInput({ kind: 3, button: 0 }); // InputEvtType.PointerDown
		harness.render.Receive({ type: "frame-request", frameId: 1 }); // click handled; entity spawned
		harness.render.Receive({ type: "frame-request", frameId: 2 }); // its Awake/Start ran at the start of this frame

		const ball = harness.runtime.Context.World.FindByName("Thrown Ball");
		expect(ball).toBeDefined();
		const mine = harness.AllPhysicsCommands().filter((c) => "entityId" in c && c.entityId === ball!.Id);
		expect(mine.map((c) => c.operation)).toEqual([PhysOpType.SpawnBody, PhysOpType.SetLinearVelocity]);

		const velocity = mine[1];
		if (velocity?.operation !== PhysOpType.SetLinearVelocity) throw new Error("no velocity");
		expect(Math.hypot(...velocity.velocity)).toBeCloseTo(20, 5);
	});
});

describe("guide 04: physics", () => {
	it("Bumper pushes a rigid body that collides with it (and ignores things without one)", async () => {
		const harness = await Boot(
			Ent("Bumper", [Comp(StaticBody, { Shape: Shapes.Box(1, 1, 1) }), Comp(Bumper, { Strength: 10 })], { position: [0, 0, 0] }),
			Ent("Ball", [Comp(RigidBody, { Shape: Shapes.Sphere(0.5), Layer: CollisionLayer.Prop })], { position: [2, 0, 0] }),
		);
		const world = harness.runtime.Context.World;
		const bumper = world.FindByName("Bumper")!, ball = world.FindByName("Ball")!;

		harness.Step([{ id: ball.Id, pos: [2, 0, 0] }], [], [bumper.Id, ball.Id, 1]);

		const impulse = harness.AllPhysicsCommands().find((c) => c.operation === PhysOpType.ApplyImpulse);
		if (impulse?.operation !== PhysOpType.ApplyImpulse) throw new Error("no impulse");
		expect(impulse.entityId).toBe(ball.Id);
		expect(impulse.impulse[0]).toBeGreaterThan(5); // away from the bumper, towards +X
	});

	it("RangeFinder asks the physics worker a question and shows the answer on the HUD", async () => {
		const harness = await Boot(Ent("Finder", [Comp(RangeFinder)], { position: [0, 1, 0] }));
		const finder = harness.runtime.Context.World.FindByName("Finder")!;

		harness.Step([]);
		const query = harness.AllPhysicsCommands().find((c) => c.operation === PhysOpType.Query);
		if (query?.operation !== PhysOpType.Query) throw new Error("no query");

		// One question at a time: another tick before the answer sends nothing new.
		harness.Step([]);
		expect(harness.AllPhysicsCommands().filter((c) => c.operation === PhysOpType.Query)).toHaveLength(1);

		harness.physics.Receive({
			state: PhysState.QueryResult, queryId: query.queryId,
			result: { hit: true, position: [0, 1, -7], point: [0, 1, -7.5], normal: [0, 0, 1], distance: 7.5, hitEntityId: 0 },
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		harness.render.Receive({ type: "frame-request", frameId: 1 });

		const hud = (harness.UiMessages("hud") as unknown as { lines: string[]; }[]).flatMap((m) => m.lines);
		expect(hud).toContain("Range: 7.5 m");
		expect(finder.IsDestroyed).toBe(false);
	});
});

describe("guide 05: player and camera", () => {
	it("a tuned profile reaches the mover, and the camera takes its props", async () => {
		const harness = await Boot(TunedPlayer, TunedCamera);
		const mover = harness.runtime.Context.World.FindByName("Player")!.GetComponent(MoverComponent)!;
		const camera = harness.runtime.Context.World.FindByName("Camera")!.GetComponent(CameraComponent)!;

		expect(mover.Profile).toMatchObject({ MaxSpeed: 9, JumpHeight: 2.4, AirMaxSpeed: 10 });
		expect(mover.CurrentMode).toBe(MovementPreset.Hybrid);
		expect(camera).toMatchObject({ ThirdPerson: true, ArmLength: 6, FovDegrees: 80 });
	});

	it("WindyMover: a custom trait list = a preset's traits + wind that only blows in the air", async () => {
		const harness = await Boot(Ent("Player", [Comp(WindyMover, { InitialMode: MovementPreset.Custom })], { position: [0, 5, 0], tags: ["player"] }));
		const id = harness.runtime.Context.World.FindByName("Player")!.Id;

		harness.Step([{ id, pos: [0, 5, 0] }], [{ id, onFloor: false }]);
		let move = harness.AllPhysicsCommands().find((c) => c.operation === PhysOpType.MoveCharacter);
		if (move?.operation !== PhysOpType.MoveCharacter) throw new Error("no move");
		expect(move.velocity[0]).toBeGreaterThan(0); // pushed along +X
		expect(move.velocity[1]).toBeLessThan(0);    // and the preset's gravity still works

		harness.ClearSent();
		harness.Step([{ id, pos: [0, 1.2, 0] }], [{ id, onFloor: true, velocity: [0, 0, 0] }]);
		move = harness.AllPhysicsCommands().find((c) => c.operation === PhysOpType.MoveCharacter);
		if (move?.operation !== PhysOpType.MoveCharacter) throw new Error("no move");
		expect(move.velocity[0]).toBeCloseTo(0, 9); // on the ground: no wind
	});
});
