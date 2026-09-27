// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { InputEvtType } from "../Common/CommonEnums";
import type { InputEvent, MainToGameLogicMessage } from "../Protocol/GameLogicProtocol";
import type { MainToRenderMessage } from "../Protocol/RenderProtocol";
import type { GameWorkers } from "./GameWorkers";

/**
 * The DOM event listeners that only exist on the main thread: window
 * resize, keyboard/pointer input, and the one-time gesture needed to unlock
 * AudioPlayer's AudioContext. Forwards everything into the right worker (or,
 * for audio, straight into AudioPlayer) via GameWorkers - holds no game
 * state and runs no simulation of its own.
 */
export class DomInputBridge {
	private readonly _workers: GameWorkers;
	private readonly _canvas: HTMLCanvasElement;

	public constructor(workers: GameWorkers, canvas: HTMLCanvasElement) {
		this._workers = workers;
		this._canvas = canvas;

		this.WireDomEvents();
	}

	private WireDomEvents(): void {
		window.addEventListener("resize", () => {
			const message: MainToRenderMessage = {
				type: "resize",
				width: this._canvas.clientWidth,
				height: this._canvas.clientHeight,
				devicePixelRatio: window.devicePixelRatio,
			};
			this._workers.RenderWorker.postMessage(message);
		});

		window.addEventListener("keydown", (event) =>
			this.SendInput({ kind: InputEvtType.KeyDown, code: event.code }));

		window.addEventListener("keyup", (event) =>
			this.SendInput({ kind: InputEvtType.KeyUp, code: event.code }));

		this._canvas.addEventListener("pointerdown", (event) => {
			this._canvas.setPointerCapture(event.pointerId);
			this.SendInput({ kind: InputEvtType.PointerDown, button: event.button });
		});
		this._canvas.addEventListener("pointerup", (event) =>
			this.SendInput({ kind: InputEvtType.PointerUp, button: event.button })
		);
		this._canvas.addEventListener("pointermove", (event) => {
			this.SendInput({
				kind: InputEvtType.PointerMove, dx: event.movementX, dy: event.movementY
			});
		});

		// AudioContext can only be created/resumed from a real user gesture on the
		// main thread's window - AudioPlayer owns the actual context now (see its
		// doc comment for why that moved out of AudioWorker), so this nudges it directly.
		const unlockOnce = () => {
			this._workers.AudioPlayer.Resume();
			window.removeEventListener("pointerdown", unlockOnce);
			window.removeEventListener("keydown", unlockOnce);
		};
		window.addEventListener("pointerdown", unlockOnce);
		window.addEventListener("keydown", unlockOnce);
	}

	private SendInput(event: InputEvent): void {
		const message: MainToGameLogicMessage = { type: "input", event };
		this._workers.GameLogicWorker.postMessage(message);
	}
}
