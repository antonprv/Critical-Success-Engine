// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { beforeEach, describe, expect, it } from "vitest";

import { CreateRegistry, Harness } from "./Harness";
import { SceneRegistry } from "../Source/Engine/Scenes/SceneRegistry";
import { Component } from "../Source/Engine/Core/Component";
import { Comp, Ent } from "../Source/Engine/Core/EntityManifest";
import { Coin, CoinHuntState, GameRules } from "../Source/Game/Scripts/CoinHunt";
import { MoverComponent } from "../Source/Engine/Components/Mover/MoverComponent";
import { PhysOpType, PhysState, RenderMsg, RendOpType, UiMsg } from "../Source/Workers/Common/CommonEnums";


describe("GameLogicRuntime", () => {
	let harness: Harness;

	beforeEach(() => {
		harness = new Harness(CreateRegistry());
	});

	it("loads the first scene, spawns its bodies and meshes, and hands control to the UI", async () => {
		await harness.BootToScene();

		expect(harness.UiMessages(UiMsg.Scenes)).toHaveLength(1);
		expect(harness.UiMessages(UiMsg.LoadFinished)).toHaveLength(1);
		expect(harness.runtime.Context.Scenes.CurrentSceneId).toBe("bouncing-ball");

		const spawns = harness.AllPhysicsCommands().filter((c) => c.operation === PhysOpType.SpawnBody);
		expect(spawns.length).toBe(2); // ground + ball
		expect(harness.render.sent.filter((m) => (m as { operation: RendOpType; }).operation === RendOpType.SpawnEntity)).toHaveLength(2);
	});

	it("when the physics wasm fails to load, boot does not wait for it: the scene loads at once, with a warning", async () => {
		void harness.runtime.Boot();
		harness.render.Receive({ type: RenderMsg.Ready });
		harness.physics.Receive({ state: PhysState.Failed, message: "dotnet.js 404" });
		await harness.Pump();

		expect(harness.runtime.Context.Scenes.CurrentSceneId).toBe("bouncing-ball");
		expect(harness.runtime.Context.Physics.Failed).toBe(true);
		expect(harness.UiMessages(UiMsg.Toast).some((t) => String(t["message"]).includes("Physics failed to load"))).toBe(true);
		expect(harness.physics.sent).toHaveLength(0); // nothing is posted to a worker that will never answer

		// Scene switching keeps working (rendering + scripts), also without waiting for acks that cannot come.
		harness.ui.Receive({ type: UiMsg.LoadScene, sceneId: "character-test" });
		await harness.Pump();
		expect(harness.runtime.Context.Scenes.CurrentSceneId).toBe("character-test");
	});

	it("runs Awake for everything before any Start, and hooks top to bottom", async () => {
		const log: string[] = [];
		class Probe extends Component {
			public Tag = "";
			public override Awake(): void { log.push(`awake:${this.Tag}`); }
			public override Start(): void { log.push(`start:${this.Tag}`); }
			public override Update(): void { log.push(`update:${this.Tag}`); }
			public override OnPhysicsUpdate(): void { log.push(`physics:${this.Tag}`); }
			public override OnDestroy(): void { log.push(`destroy:${this.Tag}`); }
		}

		const registry = new SceneRegistry().Register({
			id: "probe", name: "Probe", description: "", entities: [
				Ent("A", [Comp(Probe, { Tag: "A1" }), Comp(Probe, { Tag: "A2" })]),
				Ent("B", [Comp(Probe, { Tag: "B1" })]),
			],
		});
		harness = new Harness(registry);
		await harness.BootToScene();

		expect(log).toEqual(["awake:A1", "awake:A2", "awake:B1", "start:A1", "start:A2", "start:B1"]);

		log.length = 0;
		harness.render.Receive({ type: RenderMsg.FrameRequest, frameId: 1 });
		expect(log).toEqual(["update:A1", "update:A2", "update:B1"]);

		log.length = 0;
		harness.Step([]);
		expect(log).toEqual(["physics:A1", "physics:A2", "physics:B1"]);

		log.length = 0;
		harness.runtime.Context.World.FindByName("A")!.Destroy();
		harness.Step([]);
		expect(log).toContain("physics:B1");
		expect(log).toContain("destroy:A1");
		expect(log).toContain("destroy:A2");
		expect(log.indexOf("destroy:A1")).toBeLessThan(log.indexOf("destroy:A2"));
	});

	it("answers frame requests with poses and the camera", async () => {
		await harness.BootToScene();
		harness.ClearSent();

		harness.render.Receive({ type: RenderMsg.FrameRequest, frameId: 7 });

		const frame = harness.render.sent[0] as { operation: RendOpType; frameId: number; entityCount: number; camera: unknown; };
		expect(frame.operation).toBe(RendOpType.Frame);
		expect(frame.frameId).toBe(7);
		expect(frame.entityCount).toBe(2);
		expect(frame.camera).not.toBeNull();
	});

	it("switches scenes: wipes both worlds, destroys old entities, builds the new ones, finishes loading", async () => {
		await harness.BootToScene();
		harness.ClearSent();

		harness.ui.Receive({ type: UiMsg.LoadScene, sceneId: "character-test" });
		await harness.Pump();

		expect(harness.runtime.Context.Scenes.CurrentSceneId).toBe("character-test");
		expect(harness.runtime.Context.World.FindByName("Ball")).toBeUndefined();
		expect(harness.runtime.Context.World.FindByName("Player")).toBeDefined();

		const operations = harness.render.sent.map((m) => (m as { operation: RendOpType; }).operation);
		expect(operations).toContain(RendOpType.ClearScene);

		const commands = harness.AllPhysicsCommands();
		// The old scene's per-body RemoveBody commands are dropped on purpose (the whole world is rebuilt anyway), so the
		// very first thing physics hears is the reset - nothing from the old scene can reach the new world.
		expect(commands[0]?.operation).toBe(PhysOpType.ResetWorld);
		expect(commands.some((c) => c.operation === PhysOpType.RemoveBody)).toBe(false);
		expect(harness.UiMessages(UiMsg.LoadFinished)).toHaveLength(2);
	});

	describe("character test scene", () => {
		beforeEach(async () => {
			await harness.BootToScene();
			harness.ui.Receive({ type: UiMsg.LoadScene, sceneId: "character-test" });
			await harness.Pump();
			harness.ui.Receive({ type: UiMsg.SetCapture, enabled: true });
			harness.ClearSent();
		});

		const player = (): number => harness.runtime.Context.World.FindByName("Player")!.Id;

		it("turns WASD into a MoveCharacter command (camera-relative, accelerating on the ground)", () => {
			harness.runtime.HandleInput({ kind: 0, code: "KeyW" }); // InputEvtType.KeyDown

			harness.Step([{ id: player(), pos: [0, 1.2, 8] }], [{ id: player(), onFloor: true }]);

			const move = harness.AllPhysicsCommands().find((c) => c.operation === PhysOpType.MoveCharacter);
			expect(move).toBeDefined();
			if (move?.operation !== PhysOpType.MoveCharacter) return;

			expect(move.entityId).toBe(player());
			expect(move.velocity[2]).toBeLessThan(0); // forward is -Z
			expect(Math.abs(move.velocity[0])).toBeLessThan(1e-9);
		});

		it("feeds the plane-clipped velocity from the snapshot back into the next move", () => {
			harness.runtime.HandleInput({ kind: 0, code: "KeyW" });
			harness.Step([{ id: player(), pos: [0, 1.2, 8] }], [{ id: player(), onFloor: true }]);
			harness.ClearSent();

			// The simulation says the character hit a wall and was slowed to a crawl along +X.
			harness.runtime.HandleInput({ kind: 1, code: "KeyW" });
			harness.Step([{ id: player(), pos: [0, 1.2, 8] }], [{ id: player(), onFloor: true, velocity: [0.5, 0, 0] }]);

			const move = harness.AllPhysicsCommands().find((c) => c.operation === PhysOpType.MoveCharacter);
			if (move?.operation !== PhysOpType.MoveCharacter) throw new Error("no move");
			// No input now, so only Doom3-style friction acts on the *clipped* velocity (0.5 -> less than 0.5, not the old forward speed).
			expect(Math.abs(move.velocity[2])).toBeLessThan(1e-6);
			expect(move.velocity[0]).toBeLessThanOrEqual(0.5);
		});

		it("applies gravity in the air and fires a jump from the ground", () => {
			harness.Step([{ id: player(), pos: [0, 5, 8] }], [{ id: player(), onFloor: false }]);
			let move = harness.AllPhysicsCommands().find((c) => c.operation === PhysOpType.MoveCharacter);
			if (move?.operation !== PhysOpType.MoveCharacter) throw new Error("no move");
			expect(move.velocity[1]).toBeLessThan(0);

			harness.ClearSent();
			harness.runtime.HandleInput({ kind: 0, code: "Space" });
			harness.Step([{ id: player(), pos: [0, 1.2, 8] }], [{ id: player(), onFloor: true }]);
			move = harness.AllPhysicsCommands().find((c) => c.operation === PhysOpType.MoveCharacter);
			if (move?.operation !== PhysOpType.MoveCharacter) throw new Error("no move");
			expect(move.velocity[1]).toBeGreaterThan(5);
		});

		it("dispatches trigger overlaps to the zone (toast) and ignores input while not captured", () => {
			const pad = harness.runtime.Context.World.FindByName("Trigger Pad")!;
			harness.Step([{ id: player(), pos: [0, 1.2, 8] }], [{ id: player(), onFloor: true }], [player(), pad.Id, 1]);

			const toast = harness.UiMessages(UiMsg.Toast);
			expect(toast.some((t) => String(t["message"]).includes("entered Trigger Pad"))).toBe(true);

			harness.ui.Receive({ type: UiMsg.SetCapture, enabled: false });
			harness.runtime.HandleInput({ kind: 0, code: "KeyW" });
			harness.ClearSent();
			harness.Step([{ id: player(), pos: [0, 1.2, 8] }], [{ id: player(), onFloor: true }]);
			const move = harness.AllPhysicsCommands().find((c) => c.operation === PhysOpType.MoveCharacter);
			if (move?.operation !== PhysOpType.MoveCharacter) throw new Error("no move");
			expect(move.velocity[2]).toBe(0);
		});
	});

	describe("coin hunt sample game", () => {
		const game = (): GameRules => harness.runtime.Context.World.FindByName("Game")!.GetComponent(GameRules)!;
		const coins = () => harness.runtime.Context.World.FindByTag("coin");
		const player = (): number => harness.runtime.Context.World.FindByName("Player")!.Id;

		beforeEach(async () => {
			await harness.BootToScene();
			harness.ui.Receive({ type: UiMsg.LoadScene, sceneId: "coin-hunt" });
			await harness.Pump();
			harness.ui.Receive({ type: UiMsg.SetCapture, enabled: true });
			harness.ClearSent();
		});

		/** The physics worker reports "player started overlapping coin X". */
		const touch = (coinId: number): void =>
			harness.Step([{ id: player(), pos: [0, 1.2, 8] }], [{ id: player(), onFloor: true }], [player(), coinId, 1]);

		it("starts with all coins counted and the clock running", () => {
			expect(coins()).toHaveLength(9);
			expect(game().Total).toBe(9);
			expect(game().Collected).toBe(0);
			expect(game().State).toBe(CoinHuntState.Playing);
		});

		it("collects a coin on touch: counts it, removes the entity and its trigger body", () => {
			const coin = coins()[0]!;
			touch(coin.Id);

			expect(game().Collected).toBe(1);
			expect(coin.IsDestroyed).toBe(true);
			expect(coins()).toHaveLength(8);
			expect(harness.AllPhysicsCommands().some((c) => c.operation === PhysOpType.RemoveBody && c.entityId === coin.Id)).toBe(true);
		});

		it("ignores things that are not the player (a crate or bullet drifting through a coin)", () => {
			const world = harness.runtime.Context.World;
			const coin = coins()[0]!;
			const intruder = world.FindByName("Floor")!; // any entity without the "player" tag
			harness.Step([], [], [intruder.Id, coin.Id, 1]);

			expect(game().Collected).toBe(0);
			expect(coin.IsDestroyed).toBe(false);
		});

		it("wins when the last coin is collected, and says so on the HUD and in a toast", async () => {
			for (const coin of coins()) touch(coin.Id);

			expect(game().State).toBe(CoinHuntState.Won);
			expect(game().Collected).toBe(9);
			expect(harness.UiMessages(UiMsg.Toast).some((t) => String(t["message"]).includes("All coins collected"))).toBe(true);

			harness.render.Receive({ type: RenderMsg.FrameRequest, frameId: 1 }); // OnUIUpdate publishes the HUD
			expect(game().State).toBe(CoinHuntState.Won);
		});

		it("loses when the clock runs out, and R rebuilds the whole scene", async () => {
			// Not "0.001 s left + wait a bit": a frame's dt comes from the wall clock and can be ~0 in a fast test run.
			game().TimeLeft = 0;
			harness.render.Receive({ type: RenderMsg.FrameRequest, frameId: 1 });
			expect(game().State).toBe(CoinHuntState.Lost);

			const oldGame = game();
			harness.runtime.HandleInput({ kind: 0, code: "KeyR" });
			harness.render.Receive({ type: RenderMsg.FrameRequest, frameId: 3 });
			await harness.Pump();

			expect(game()).not.toBe(oldGame);
			expect(game().State).toBe(CoinHuntState.Playing);
			expect(game().Collected).toBe(0);
			expect(coins()).toHaveLength(9);
		});

		it("respawns the player (and clears momentum) when they fall off the arena", () => {
			const playerEntity = harness.runtime.Context.World.FindByName("Player")!;
			harness.Step([{ id: playerEntity.Id, pos: [3, -20, 3] }], [{ id: playerEntity.Id, onFloor: false, velocity: [0, -40, 0] }]);

			const mover = playerEntity.GetComponent(MoverComponent)!;
			expect(harness.AllPhysicsCommands().some((c) => c.operation === PhysOpType.SetPose && c.entityId === playerEntity.Id)).toBe(true);
			expect(playerEntity.Transform.Position.Y).toBeCloseTo(1.2);
			// The tick's MoveCharacter starts from zero velocity + one tick of gravity, not from the -40 m/s fall.
			const move = harness.AllPhysicsCommands().find((c) => c.operation === PhysOpType.MoveCharacter);
			if (move?.operation !== PhysOpType.MoveCharacter) throw new Error("no move");
			expect(move.velocity[1]).toBeGreaterThan(-1);
			expect(mover.IsOnFloor).toBe(false);
			void Coin;
		});
	});
});
