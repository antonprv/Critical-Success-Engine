// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { AudioPlayer } from "../../Audio/AudioPlayer";
import type { MainToAudioMessage } from "../Protocol/AudioProtocol";
import type { MainToGameLogicMessage } from "../Protocol/GameLogicProtocol";
import type { MainToPhysicsMessage } from "../Protocol/PhysicsProtocol";
import type { MainToRenderMessage } from "../Protocol/RenderProtocol";
import type { MainToUiMessage } from "../Protocol/UiProtocol";
import { DefaultGravity, PhysicsFixedTimestepMs } from "../Common/EngineConstants";
import { UiMsg, RenderMsg, PhysicsMsg, GameLogicMsg, AudioMsg } from "../Common/CommonEnums";

/**
 * The five workers and their MessageChannel wiring. The main thread talks to every worker; GameLogic also has a direct
 * port to each of the others: Physics (commands, snapshots), Render (scene diffs, frames), Audio (play-sound) and
 * UI (scenes, progress, HUD in; load-scene, capture out).
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

	/** One MessageChannel per worker GameLogic talks to: port1 goes to GameLogic, port2 to the other worker. */
	private WireWorkers(canvas: HTMLCanvasElement, devMode: boolean): void {
		const render = new MessageChannel();
		const physics = new MessageChannel();
		const audio = new MessageChannel();
		const ui = new MessageChannel();

		this.InitRender(canvas, devMode, render.port2);
		this.InitPhysics(physics.port2);
		this.InitGameLogic(render.port1, physics.port1, audio.port1, ui.port1);
		this.InitAudio(audio.port2);
		this.InitUi(ui.port2);
	}

	private InitRender(canvas: HTMLCanvasElement, devMode: boolean, gameLogicPort: MessagePort): void {
		const offscreenCanvas = canvas.transferControlToOffscreen();
		const message: MainToRenderMessage = {
			type: RenderMsg.Init,
			canvas: offscreenCanvas,
			gameLogicPort,
			devMode,
			width: canvas.clientWidth,
			height: canvas.clientHeight,
			devicePixelRatio: window.devicePixelRatio,
		};
		this.RenderWorker.postMessage(message, [offscreenCanvas, gameLogicPort]);
	}

	private InitPhysics(gameLogicPort: MessagePort): void {
		const message: MainToPhysicsMessage = {
			type: PhysicsMsg.Init,
			gameLogicPort,
			settings: { gravity: [...DefaultGravity] },
			fixedTimestepMs: PhysicsFixedTimestepMs,
		};
		this.PhysicsWorker.postMessage(message, [gameLogicPort]);
	}

	private InitGameLogic(renderPort: MessagePort, physicsPort: MessagePort, audioPort: MessagePort, uiPort: MessagePort): void {
		const message: MainToGameLogicMessage = { type: GameLogicMsg.Init, renderPort, physicsPort, audioPort, uiPort };
		this.GameLogicWorker.postMessage(message, [renderPort, physicsPort, audioPort, uiPort]);
	}

	private InitAudio(gameLogicPort: MessagePort): void {
		const message: MainToAudioMessage = { type: AudioMsg.Init, gameLogicPort };
		this.AudioWorker.postMessage(message, [gameLogicPort]);
	}

	private InitUi(gameLogicPort: MessagePort): void {
		const message: MainToUiMessage = { type: UiMsg.Init, gameLogicPort };
		this.UiWorker.postMessage(message, [gameLogicPort]);
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
