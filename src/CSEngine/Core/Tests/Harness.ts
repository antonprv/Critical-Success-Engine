// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Shared test harness: runs the real GameLogicRuntime against fake ports, playing the part of the render, physics, audio
// and UI workers (answering their sync markers, posting physics snapshots).

import type { DataAssets } from "../Source/Engine/Data/DataAsset";
import type { SettingsStorage } from "../Source/Engine/Storage/SettingsStorage";
import type { ProjectInput } from "../Source/Engine/Input/InputActions";
import { GamesSampleData, HarnessInput } from "./InputFixture";
import "./GameUiFixture"; // the scenes' games use the UI plugin (Coin Hunt's HUD)
import type { ChannelHub } from "../Source/Engine/Core/Channels";
import { GameLogicRuntime } from "../Source/Engine/Runtime/GameLogicRuntime";
import { SceneRegistry } from "../Source/Engine/Scenes/SceneRegistry";
import { BouncingBallScene } from "../../../Templates/Blank/Source/Scenes/BouncingBallScene";
import { CoinHuntScene } from "../../../Templates/CoinHunt/Source/Scenes/CoinHuntScene";
import { CharacterTestScene } from "../../../Templates/FirstPerson/Source/Scenes/CharacterTestScene";
import { ThirdPersonScene } from "../../../Templates/ThirdPerson/Source/Scenes/ThirdPersonScene";
import { TopDownScene } from "../../../Templates/TopDown/Source/Scenes/TopDownScene";
import { PhysOpType, PhysState, RenderMsg, RendOpType, UiMsg } from "../Source/Workers/Common/CommonEnums";
import type { PhysicsCommand } from "../Source/Workers/Protocol/PhysicsGameLogicProtocol";
import { BODY_STRIDE, CHARACTER_STRIDE } from "../Source/Workers/Protocol/TransformProtocol";

/** A MessagePort stand-in: records what the runtime posts, lets the test push messages in. */
export class FakePort {
	public readonly sent: unknown[] = [];
	public onmessage: ((event: { data: unknown; }) => void) | null = null;
	public postMessage(message: unknown): void { this.sent.push(message); }
	public Receive(data: unknown): void { this.onmessage?.({ data }); }
}

export const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export class Harness {
	public readonly render = new FakePort();
	public readonly physics = new FakePort();
	public readonly audio = new FakePort();
	public readonly ui = new FakePort();
	public readonly runtime: GameLogicRuntime;

	private _physicsSeen = 0;
	private _renderSeen = 0;

	public constructor(registry: SceneRegistry, channels?: ChannelHub, input: ProjectInput = HarnessInput(), storage?: SettingsStorage, data: DataAssets = GamesSampleData()) {
		this.runtime = new GameLogicRuntime(
			{ render: this.render as never, physics: this.physics as never, audio: this.audio as never, ui: this.ui as never },
			registry,
			channels,
			input,
			storage,
			data,
		);
	}

	/** Plays the part of the render + physics workers: answers every Sync marker so scene loading can proceed. */
	public async Pump(): Promise<void> {
		for (let i = 0; i < 20; i++) {
			await tick();
			for (; this._physicsSeen < this.physics.sent.length; this._physicsSeen++) {
				for (const command of this.PhysicsBatch(this._physicsSeen)) {
					if (command.operation === PhysOpType.Sync) this.physics.Receive({ state: PhysState.SyncAck, token: command.token });
				}
			}
			for (; this._renderSeen < this.render.sent.length; this._renderSeen++) {
				const message = this.render.sent[this._renderSeen] as { operation: RendOpType; token?: number; };
				if (message.operation === RendOpType.Sync) this.render.Receive({ type: RenderMsg.SyncAck, token: message.token });
			}
		}
	}

	private PhysicsBatch(index: number): PhysicsCommand[] {
		return (this.physics.sent[index] as { commands: PhysicsCommand[]; }).commands;
	}

	/** Forget everything recorded so far (also rewinds the pump's read cursors, which index into the recorded lists). */
	public ClearSent(): void {
		this.physics.sent.length = 0;
		this.render.sent.length = 0;
		this._physicsSeen = 0;
		this._renderSeen = 0;
	}

	public AllPhysicsCommands(): PhysicsCommand[] {
		return this.physics.sent.flatMap((_, i) => this.PhysicsBatch(i));
	}

	public UiMessages(type: UiMsg): { type: UiMsg; [key: string]: unknown; }[] {
		return (this.ui.sent as { type: UiMsg; }[]).filter((m) => m.type === type);
	}

	public async BootToScene(): Promise<void> {
		void this.runtime.Boot();
		this.render.Receive({ type: RenderMsg.Ready });
		this.physics.Receive({ state: PhysState.Ready });
		await this.Pump();
	}

	/** One physics step snapshot with the given bodies/characters, as PhysicsWorker would post it. */
	public Step(
		bodies: { id: number; pos: [number, number, number]; }[],
		characters: { id: number; onFloor: boolean; ground?: number; velocity?: [number, number, number]; }[] = [],
		overlaps: number[] | null = null
	): void {
		const bodyBuffer = new Float64Array(bodies.length * BODY_STRIDE);
		bodies.forEach((b, i) => {
			bodyBuffer.set([b.id, ...b.pos, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0], i * BODY_STRIDE);
		});
		const characterBuffer = new Float64Array(characters.length * CHARACTER_STRIDE);
		characters.forEach((c, i) => {
			characterBuffer.set([c.id, c.onFloor ? 1 : 0, 0, 1, 0, c.ground ?? 0, ...(c.velocity ?? [0, 0, 0])], i * CHARACTER_STRIDE);
		});

		this.physics.Receive({
			state: PhysState.Step,
			step: 0,
			bodyCount: bodies.length,
			bodies: bodyBuffer.buffer,
			characterCount: characters.length,
			characters: characterBuffer.buffer,
			overlaps: overlaps ? new Int32Array(overlaps) : null,
		});
	}
}

export function CreateRegistry(): SceneRegistry {
	const registry = new SceneRegistry();
	// The Games Sample project's scenes, in its order (see Samples/GamesSample.cseproject).
	registry.Register(BouncingBallScene).Register(CharacterTestScene).Register(CoinHuntScene).Register(ThirdPersonScene).Register(TopDownScene);
	return registry;
}

