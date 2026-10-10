// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { beforeEach, describe, expect, it } from "vitest";

import { CollisionLayer } from "../Source/Engine/Core/CollisionLayer";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { MeshForShape, Shapes } from "../Source/Engine/Core/Shapes";
import { SceneRegistry } from "../Source/Engine/Scenes/SceneRegistry";
import { MeshRenderer } from "../Source/Engine/Components/MeshRenderer";
import { MovementPreset, MProfile, type MovementContext } from "../Source/Engine/Components/Mover/MovementTypes";
import { KinematicBody } from "../Source/Engine/Components/Physics/PhysicsBodies";
import { Vec3 } from "../Source/Engine/Math/Vec3";
import { CrateSpawner, Door, DoubleJumpMover, DoubleJumpTrait, LaunchPad, Sprint } from "../Source/Engine/Gameplay/Recipes";
import { MoverComponent } from "../Source/Engine/Components/Mover/MoverComponent";
import { CharacterBody } from "../Source/Engine/Components/Physics/CharacterBody";
import { Harness, tick } from "./Harness";
import { PhysOpType, RenderMsg, UiMsg } from "../Source/Workers/Common/CommonEnums";

const DoorShape = Shapes.Box(4, 4, 0.4);

describe("recipes (guide 08)", () => {
	describe("Door + CrateSpawner in a scene", () => {
		let harness: Harness;

		beforeEach(async () => {
			const registry = new SceneRegistry().Register({
				id: "recipes", name: "Recipes", description: "",
				entities: [
					Ent("Player", [Comp(CharacterBody, { Radius: 0.5, Height: 2 })], { position: [0, 1, 20], tags: ["player"] }),
					Ent("Door", [
						Comp(MeshRenderer, { Mesh: MeshForShape(DoorShape) }),
						Comp(Door, { TriggerDistance: 4, OpenHeight: 3, Speed: 60 }), // fast, so a few steps are enough
						Comp(KinematicBody, { Shape: DoorShape, Layer: CollisionLayer.World }),
					], { position: [0, 2, 0] }),
					Ent("Spawner", [Comp(CrateSpawner, { IntervalSeconds: 0.01, MaxCrates: 2 })], { position: [5, 8, 5] }),
				],
			});
			harness = new Harness(registry);
			await harness.BootToScene();
			harness.ui.Receive({ type: UiMsg.SetCapture, enabled: true });
			harness.ClearSent();
		});

		const step = (playerPos: [number, number, number]): void => {
			const id = harness.runtime.Context.World.FindByName("Player")!.Id;
			harness.Step([{ id, pos: playerPos }], [{ id, onFloor: true }]);
		};
		const doorY = (): number => harness.runtime.Context.World.FindByName("Door")!.Transform.Position.Y;

		it("the door stays closed while the player is far and rises when they come close (and the body follows the transform)", () => {
			for (let i = 0; i < 3; i++) step([0, 1, 20]);
			expect(doorY()).toBeCloseTo(2);

			for (let i = 0; i < 5; i++) step([0, 1, 2]);
			expect(doorY()).toBeCloseTo(5); // closed 2 + OpenHeight 3

			const poses = harness.AllPhysicsCommands().filter((c) => c.operation === PhysOpType.SetKinematicPose);
			const last = poses[poses.length - 1];
			if (last?.operation !== PhysOpType.SetKinematicPose) throw new Error("door body never told the physics world");
			expect(last.transform[1]).toBeCloseTo(5); // Door listed before KinematicBody -> the body sees the NEW height

			for (let i = 0; i < 5; i++) step([0, 1, 20]);
			expect(doorY()).toBeCloseTo(2);
		});

		it("the spawner drops crates, and keeps at most MaxCrates alive", async () => {
			const crates = () => harness.runtime.Context.World.Entities.filter((e) => e.Name === "Crate" && !e.IsDestroyed);

			for (let i = 1; i <= 8; i++) {
				await tick();
				await new Promise((resolve) => setTimeout(resolve, 15));
				harness.render.Receive({ type: RenderMsg.FrameRequest, frameId: i });
			}
			expect(crates().length).toBeGreaterThan(0);
			expect(crates().length).toBeLessThanOrEqual(2);
		});
	});

	describe("DoubleJumpTrait", () => {
		const context = (over: Partial<MovementContext>): MovementContext => ({
			WishDirection: new Vec3(), JumpRequested: false, JumpConsumed: false, Delta: 1 / 60,
			IsOnFloor: false, Gravity: new Vec3(0, -20, 0), Profile: new MProfile(), ...over,
		});

		it("grants exactly MaxAirJumps jumps in the air and refills on the ground", () => {
			const trait = new DoubleJumpTrait();
			const velocity = new Vec3();

			trait.Process(context({ IsOnFloor: true }), velocity, 1 / 60); // landed: refill
			trait.Process(context({ JumpRequested: false }), velocity, 1 / 60);
			expect(velocity.Y).toBe(0); // no request, no jump

			const first = context({ JumpRequested: true });
			trait.Process(first, velocity, 1 / 60);
			expect(velocity.Y).toBeGreaterThan(5);
			expect(first.JumpConsumed).toBe(true);

			velocity.Y = -3;
			const second = context({ JumpRequested: true });
			trait.Process(second, velocity, 1 / 60);
			expect(velocity.Y).toBe(-3); // used up
			expect(second.JumpConsumed).toBe(false);

			trait.Process(context({ IsOnFloor: true }), velocity, 1 / 60); // landed again
			trait.Process(context({ JumpRequested: true }), velocity, 1 / 60);
			expect(velocity.Y).toBeGreaterThan(5);
		});

		it("does not steal a jump that another trait (ground / coyote jump) already consumed this tick", () => {
			const trait = new DoubleJumpTrait();
			trait.Process(context({ IsOnFloor: true }), new Vec3(), 1 / 60);

			const velocity = new Vec3(0, 8, 0);
			trait.Process(context({ JumpRequested: true, JumpConsumed: true }), velocity, 1 / 60);
			expect(velocity.Y).toBe(8);
		});

		it("DoubleJumpMover is a drop-in MoverComponent that uses the custom trait list", async () => {
			const registry = new SceneRegistry().Register({
				id: "dj", name: "DJ", description: "",
				entities: [Ent("Player", [Comp(DoubleJumpMover, { InitialMode: MovementPreset.Custom })], { position: [0, 5, 0], tags: ["player"] })],
			});
			const harness = new Harness(registry);
			await harness.BootToScene();
			harness.ui.Receive({ type: UiMsg.SetCapture, enabled: true });
			harness.ClearSent();

			const id = harness.runtime.Context.World.FindByName("Player")!.Id;
			harness.Step([{ id, pos: [0, 5, 0] }], [{ id, onFloor: false }]); // first tick: airborne, no result yet
			harness.runtime.HandleInput({ kind: 0, code: "Space" });
			harness.Step([{ id, pos: [0, 5, 0] }], [{ id, onFloor: false, velocity: [0, -2, 0] }]);

			const moves = harness.AllPhysicsCommands().filter((c) => c.operation === PhysOpType.MoveCharacter);
			const last = moves[moves.length - 1];
			if (last?.operation !== PhysOpType.MoveCharacter) throw new Error("no move");
			// Airborne, never grounded: the trait's air-jump budget starts at 0 until the first landing -> gravity only.
			expect(last.velocity[1]).toBeLessThan(0);
		});
	});

	describe("LaunchPad and Sprint with a real mover", () => {
		let harness: Harness;
		let player: number;
		let pad: number;

		beforeEach(async () => {
			const registry = new SceneRegistry().Register({
				id: "pad", name: "Pad", description: "",
				entities: [
					Ent("Player", [Comp(MoverComponent), Comp(Sprint, { Multiplier: 2 })], { position: [0, 1.2, 0], tags: ["player"] }),
					Ent("Pad", [Comp(LaunchPad, { Speed: 12, Shape: Shapes.Box(2, 0.5, 2) })], { position: [0, 0.1, 0] }),
				],
			});
			harness = new Harness(registry);
			await harness.BootToScene();
			harness.ui.Receive({ type: UiMsg.SetCapture, enabled: true });
			harness.ClearSent();
			player = harness.runtime.Context.World.FindByName("Player")!.Id;
			pad = harness.runtime.Context.World.FindByName("Pad")!.Id;
		});

		it("the pad launches the player upwards the tick they touch it", () => {
			harness.Step([{ id: player, pos: [0, 1.2, 0] }], [{ id: player, onFloor: true }]); // settle: one move result exists
			harness.ClearSent();

			harness.Step([{ id: player, pos: [0, 1.2, 0] }], [{ id: player, onFloor: true }], [player, pad, 1]);
			const move = harness.AllPhysicsCommands().find((c) => c.operation === PhysOpType.MoveCharacter);
			if (move?.operation !== PhysOpType.MoveCharacter) throw new Error("no move");
			expect(move.velocity[1]).toBeCloseTo(12, 5);
		});

		it("holding shift doubles the top speed", () => {
			const mover = harness.runtime.Context.World.FindByName("Player")!.GetComponent(MoverComponent)!;
			const normal = mover.Profile!.MaxSpeed;

			harness.runtime.HandleInput({ kind: 0, code: "ShiftLeft" });
			harness.render.Receive({ type: RenderMsg.FrameRequest, frameId: 1 });
			expect(mover.Profile!.MaxSpeed).toBeCloseTo(normal * 2);

			harness.runtime.HandleInput({ kind: 1, code: "ShiftLeft" });
			harness.render.Receive({ type: RenderMsg.FrameRequest, frameId: 2 });
			expect(mover.Profile!.MaxSpeed).toBeCloseTo(normal);
		});
	});
});
