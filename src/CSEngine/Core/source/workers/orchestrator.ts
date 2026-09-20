// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type {
	InputEvent,
	MainToAudioMessage,
	MainToGameLogicMessage,
	MainToPhysicsMessage,
	MainToRenderMessage,
} from "./protocol";

/**
 * Owns exactly four things: the four Worker instances, the DOM event
 * listeners that only exist on the main thread, resize handling, and the
 * one-time wiring of who-talks-to-whom. It holds no game state and runs no
 * simulation of its own - if you find yourself adding gameplay logic here,
 * it belongs in gamelogic.worker.ts instead.
 *
 * Channel layout (see protocol.ts for message shapes on each):
 *
 *   main --------- render.worker      (canvas transfer, resize, dev toggles)
 *   main --------- physics.worker     (lifecycle only: init/pause)
 *   main --------- gamelogic.worker   (input events)
 *   main --------- audio.worker       (lifecycle + unlock)
 *   physics.worker <-----> gamelogic.worker   (direct port: transforms/events out, spawn/impulse commands in)
 *   gamelogic.worker <---> render.worker      (direct port: scene diffs)
 *   gamelogic.worker <---> audio.worker       (direct port: play-sound)
 */
export class Orchestrator {
	private readonly renderWorker: Worker;
	private readonly physicsWorker: Worker;
	private readonly gameLogicWorker: Worker;
	private readonly audioWorker: Worker;

	private readonly canvas: HTMLCanvasElement;

	public constructor(canvas: HTMLCanvasElement, devMode: boolean) {
		this.canvas = canvas;

		// `new URL(..., import.meta.url)` is understood natively by both webpack 5
		// and Vite as "bundle this file as its own worker chunk" - no extra config.
		this.renderWorker = new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" });
		this.physicsWorker = new Worker(new URL("./physics.worker.ts", import.meta.url), { type: "module" });
		this.gameLogicWorker = new Worker(new URL("./gamelogic.worker.ts", import.meta.url), { type: "module" });
		this.audioWorker = new Worker(new URL("./audio.worker.ts", import.meta.url), { type: "module" });

		this.wireWorkers(devMode);
		this.wireDomEvents();
	}

	private wireWorkers(devMode: boolean): void {
		const physicsGameLogicChannel = new MessageChannel();
		const gameLogicRenderChannel = new MessageChannel();
		const gameLogicAudioChannel = new MessageChannel();

		const offscreenCanvas = this.canvas.transferControlToOffscreen();

		const renderInit: MainToRenderMessage = {
			type: "init",
			canvas: offscreenCanvas,
			gameLogicPort: gameLogicRenderChannel.port2,
			devMode,
			width: this.canvas.clientWidth,
			height: this.canvas.clientHeight,
			devicePixelRatio: window.devicePixelRatio,
		};
		this.renderWorker.postMessage(renderInit, [offscreenCanvas, gameLogicRenderChannel.port2]);

		const physicsInit: MainToPhysicsMessage = {
			type: "init",
			gameLogicPort: physicsGameLogicChannel.port1,
			gravity: [0, -20, 0],
			fixedTimestepMs: 1000 / 60,
		};
		this.physicsWorker.postMessage(physicsInit, [physicsGameLogicChannel.port1]);

		const gameLogicInit: MainToGameLogicMessage = {
			type: "init",
			renderPort: gameLogicRenderChannel.port1,
			physicsPort: physicsGameLogicChannel.port2,
			audioPort: gameLogicAudioChannel.port1,
		};
		this.gameLogicWorker.postMessage(gameLogicInit, [
			gameLogicRenderChannel.port1,
			physicsGameLogicChannel.port2,
			gameLogicAudioChannel.port1,
		]);

		const audioInit: MainToAudioMessage = { type: "init", gameLogicPort: gameLogicAudioChannel.port2 };
		this.audioWorker.postMessage(audioInit, [gameLogicAudioChannel.port2]);
	}

	private wireDomEvents(): void {
		window.addEventListener("resize", () => {
			const message: MainToRenderMessage = {
				type: "resize",
				width: this.canvas.clientWidth,
				height: this.canvas.clientHeight,
				devicePixelRatio: window.devicePixelRatio,
			};
			this.renderWorker.postMessage(message);
		});

		window.addEventListener("keydown", (event) => this.sendInput({ kind: "keydown", code: event.code }));
		window.addEventListener("keyup", (event) => this.sendInput({ kind: "keyup", code: event.code }));

		this.canvas.addEventListener("pointerdown", (event) => {
			this.canvas.setPointerCapture(event.pointerId);
			this.sendInput({ kind: "pointerdown", button: event.button });
		});
		this.canvas.addEventListener("pointerup", (event) =>
			this.sendInput({ kind: "pointerup", button: event.button })
		);
		this.canvas.addEventListener("pointermove", (event) => {
			this.sendInput({ kind: "pointermove", dx: event.movementX, dy: event.movementY });
		});

		// AudioContext can only be created/resumed from a real user gesture on the
		// main thread's window - the worker owns the context itself (where the
		// browser allows it) but still needs this nudge to leave "suspended".
		const unlockOnce = () => {
			const message: MainToAudioMessage = { type: "unlock" };
			this.audioWorker.postMessage(message);
			window.removeEventListener("pointerdown", unlockOnce);
			window.removeEventListener("keydown", unlockOnce);
		};
		window.addEventListener("pointerdown", unlockOnce);
		window.addEventListener("keydown", unlockOnce);
	}

	private sendInput(event: InputEvent): void {
		const message: MainToGameLogicMessage = { type: "input", event };
		this.gameLogicWorker.postMessage(message);
	}

	/** Call once on page teardown (SPA navigation away, hot-reload, etc). */
	public dispose(): void {
		this.renderWorker.terminate();
		this.physicsWorker.terminate();
		this.gameLogicWorker.terminate();
		this.audioWorker.terminate();
	}
}
