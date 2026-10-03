// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { AudioPlayer } from "../../Audio/AudioPlayer";
import type { MainToAudioMessage } from "../Protocol/AudioProtocol";
import type { MainToGameLogicMessage } from "../Protocol/GameLogicProtocol";
import type { MainToPhysicsMessage } from "../Protocol/PhysicsProtocol";
import type { MainToRenderMessage } from "../Protocol/RenderProtocol";
import type { MainToUiMessage } from "../Protocol/UiProtocol";
import { PhysicsFixedTimestepMs } from "../Common/EngineConstants";

/**
 * Owns the five Worker instances and the one-time MessageChannel wiring of
 * who-talks-to-whom. Holds no DOM event listeners and no game state - see
 * DomInputBridge for the main-thread input side, and GameLogicWorker for the
 * simulation side.
 *
 * Channel layout (see the protocol/ folder for message shapes on each):
 *
 *   main --------- RenderWorker      (canvas transfer, resize, dev toggles)
 *   main --------- PhysicsWorker     (lifecycle only: init/pause)
 *   main --------- GameLogicWorker   (input events)
 *   main --------- AudioWorker       (lifecycle only: init; AudioWorker -> main carries resolved sounds to play, see AudioPlayer)
 *   main --------- UiWorker          (DOM events in, UI state patches out - Vue on the main thread only draws them, see UiBridge)
 *   PhysicsWorker <-----> GameLogicWorker   (direct port: batched commands in, step snapshots/query results out)
 *   GameLogicWorker <---> RenderWorker      (direct port: scene diffs, frame requests and frames)
 *   GameLogicWorker <---> AudioWorker       (direct port: play-sound)
 *   GameLogicWorker <---> UiWorker          (direct port: scene list/loading progress/HUD in, load-scene/capture out)
 */
export class GameWorkers {
	public readonly RenderWorker: Worker;
	public readonly PhysicsWorker: Worker;
	public readonly GameLogicWorker: Worker;
	public readonly AudioWorker: Worker;
	/** Same constraint audio hits (no DOM in workers): this one owns UI *state and logic*, the main thread only renders it. */
	public readonly UiWorker: Worker;
	/** Owns the real AudioContext that AudioWorker's resolved sounds actually play through. */
	public readonly AudioPlayer: AudioPlayer;

	public constructor(canvas: HTMLCanvasElement, devMode: boolean) {
		// `new URL(..., import.meta.url)` is understood natively by Vite as
		// "bundle this file as its own worker chunk" - no extra config.
		this.RenderWorker = new Worker(new URL("../RenderWorker.ts", import.meta.url), { type: "module" });
		this.PhysicsWorker = new Worker(new URL("../PhysicsWorker.ts", import.meta.url), { type: "module" });
		this.GameLogicWorker = new Worker(new URL("../GameLogicWorker.ts", import.meta.url), { type: "module" });
		this.AudioWorker = new Worker(new URL("../AudioWorker.ts", import.meta.url), { type: "module" });
		this.UiWorker = new Worker(new URL("../UiWorker.ts", import.meta.url), { type: "module" });
		this.AudioPlayer = new AudioPlayer(this.AudioWorker);

		this.WireWorkers(canvas, devMode);
	}

	private WireWorkers(canvas: HTMLCanvasElement, devMode: boolean): void {
		const physicsGameLogicChannel = new MessageChannel();
		const gameLogicRenderChannel = new MessageChannel();
		const gameLogicAudioChannel = new MessageChannel();
		const gameLogicUiChannel = new MessageChannel();

		const offscreenCanvas = canvas.transferControlToOffscreen();

		const renderInit: MainToRenderMessage = {
			type: "init",
			canvas: offscreenCanvas,
			gameLogicPort: gameLogicRenderChannel.port2,
			devMode,
			width: canvas.clientWidth,
			height: canvas.clientHeight,
			devicePixelRatio: window.devicePixelRatio,
		};
		this.RenderWorker.postMessage(renderInit, [offscreenCanvas, gameLogicRenderChannel.port2]);

		const physicsInit: MainToPhysicsMessage = {
			type: "init",
			gameLogicPort: physicsGameLogicChannel.port1,
			// Real gravity comes with each scene (ResetWorld on load); this is just what the very first world starts with.
			settings: { gravity: [0, -20, 0] },
			fixedTimestepMs: PhysicsFixedTimestepMs,
		};
		this.PhysicsWorker.postMessage(physicsInit, [physicsGameLogicChannel.port1]);

		const gameLogicInit: MainToGameLogicMessage = {
			type: "init",
			renderPort: gameLogicRenderChannel.port1,
			physicsPort: physicsGameLogicChannel.port2,
			audioPort: gameLogicAudioChannel.port1,
			uiPort: gameLogicUiChannel.port1,
		};
		this.GameLogicWorker.postMessage(gameLogicInit, [
			gameLogicRenderChannel.port1,
			physicsGameLogicChannel.port2,
			gameLogicAudioChannel.port1,
			gameLogicUiChannel.port1,
		]);

		const audioInit: MainToAudioMessage = { type: "init", gameLogicPort: gameLogicAudioChannel.port2 };
		this.AudioWorker.postMessage(audioInit, [gameLogicAudioChannel.port2]);

		const uiInit: MainToUiMessage = { type: "init", gameLogicPort: gameLogicUiChannel.port2 };
		this.UiWorker.postMessage(uiInit, [gameLogicUiChannel.port2]);
	}

	/** Call once on page teardown (SPA navigation away, hot-reload, etc). */
	public Dispose(): void {
		this.RenderWorker.terminate();
		this.PhysicsWorker.terminate();
		this.GameLogicWorker.terminate();
		this.AudioWorker.terminate();
		this.UiWorker.terminate();
	}
}
