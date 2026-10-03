// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { vi } from "vitest";
import type { EngineContext, TimeInfo } from "../Source/Engine/Core/EngineContext";
import type { EntityWorld } from "../Source/Engine/Core/EntityWorld";
import { AudioService } from "../Source/Engine/Services/AudioService";
import { InputService } from "../Source/Engine/Services/InputService";
import { PhysicsService } from "../Source/Engine/Services/PhysicsService";
import { RenderService } from "../Source/Engine/Services/RenderService";
import { UiService } from "../Source/Engine/Services/UiService";
import { InputEvtType, PhysState } from "../Source/Workers/Common/CommonEnums";
import type { PhysicsCommand, PhysicsToGameLogicMessage } from "../Source/Workers/Protocol/PhysicsGameLogicProtocol";
import { BODY_STRIDE, CHARACTER_STRIDE } from "../Source/Workers/Protocol/TransformProtocol";
import { FakePort } from "./Harness";
import { MakeWorld } from "./helpers";

type Tuple3 = [number, number, number];

export interface BodySnapshot { id: number; pos: Tuple3; quat?: [number, number, number, number]; linear?: Tuple3; angular?: Tuple3; }
export interface CharacterSnapshot { id: number; onFloor: boolean; ground?: number; velocity?: Tuple3; normal?: Tuple3; }

/** The message PhysicsWorker would post for one step. */
export function StepMessage(bodies: BodySnapshot[] = [], characters: CharacterSnapshot[] = [], overlaps: number[] | null = null): PhysicsToGameLogicMessage {
	const bodyBuffer = new Float64Array(bodies.length * BODY_STRIDE);
	bodies.forEach((b, i) => bodyBuffer.set([b.id, ...b.pos, ...(b.quat ?? [0, 0, 0, 1]), ...(b.linear ?? [0, 0, 0]), ...(b.angular ?? [0, 0, 0])], i * BODY_STRIDE));

	const characterBuffer = new Float64Array(characters.length * CHARACTER_STRIDE);
	characters.forEach((c, i) => characterBuffer.set([c.id, c.onFloor ? 1 : 0, ...(c.normal ?? [0, 1, 0]), c.ground ?? 0, ...(c.velocity ?? [0, 0, 0])], i * CHARACTER_STRIDE));

	return {
		state: PhysState.Step, step: 0,
		bodyCount: bodies.length, bodies: bodyBuffer.buffer,
		characterCount: characters.length, characters: characterBuffer.buffer,
		overlaps: overlaps ? new Int32Array(overlaps) : null,
	};
}

/** The real engine services over fake ports + a real EntityWorld: components run exactly as in the game, and every message they send is recorded. */
export function MakeEngine() {
	const ports = { physics: new FakePort(), render: new FakePort(), ui: new FakePort(), audio: new FakePort() };
	const time: TimeInfo = { Delta: 1 / 60, FixedDelta: 1 / 60, Elapsed: 0, FrameCount: 0, PhysicsStepCount: 0, RenderAlpha: 0 };
	const scenes = { CurrentSceneId: "test" as string | null, IsLoading: false, Load: vi.fn(() => Promise.resolve()) };
	const physics = new PhysicsService(ports.physics as never);
	const input = new InputService();

	const { engine, world } = MakeWorld({
		Physics: physics,
		Render: new RenderService(ports.render as never),
		Input: input,
		Ui: new UiService(ports.ui as never),
		Audio: new AudioService(ports.audio as never),
		Scenes: scenes as never,
		Time: time,
	});

	let physicsSeen = 0;

	return {
		engine: engine as EngineContext, world: world as EntityWorld, ports, time, scenes, physics, input,

		/** Flushes queued physics commands and returns every command sent since the previous call. */
		commands(): PhysicsCommand[] {
			physics.Flush();
			const batches = ports.physics.sent.slice(physicsSeen) as { commands: PhysicsCommand[]; }[];
			physicsSeen = ports.physics.sent.length;
			return batches.flatMap((batch) => batch.commands);
		},

		/** Feeds a physics step to the services, then runs the same hooks the runtime runs for a step. */
		step(bodies: BodySnapshot[] = [], characters: CharacterSnapshot[] = [], overlaps: number[] | null = null, dt = 1 / 60): void {
			physics.HandleMessage(StepMessage(bodies, characters, overlaps));
			world.FlushLifecycle();
			world.RunPhysicsSync();
			world.RunPhysicsUpdate(dt);
			input.EndPhysicsStep();
			world.FlushDestroyed();
		},

		/** One rendered frame's hooks. */
		frame(dt = 1 / 60): void {
			time.Delta = dt;
			world.FlushLifecycle();
			world.RunInputUpdate(input, dt);
			world.RunUpdate(dt);
			world.RunUiUpdate(engine.Ui, dt);
			world.FlushDestroyed();
			input.EndFrame();
		},

		/** Everything the UI service has sent. */
		uiMessages: (type: string) => (ports.ui.sent as { type: string; }[]).filter((m) => m.type === type) as unknown as Record<string, unknown>[],

		press(code: string): void { input.Handle({ kind: InputEvtType.KeyDown, code }); },
		release(code: string): void { input.Handle({ kind: InputEvtType.KeyUp, code }); },
	};
}

export type TestEngine = ReturnType<typeof MakeEngine>;
