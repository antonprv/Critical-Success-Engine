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

		// While the pointer is locked the page belongs to the game: swallow keys the browser would act on (Space scrolls,
		// Tab moves focus, ...). Escape is never delivered while locked - the browser eats it to release the lock.
		window.addEventListener("keydown", (event) => {
			if (event.repeat) return;
			if (this.IsLocked) event.preventDefault();
			this.SendInput({ kind: InputEvtType.KeyDown, code: event.code });
		});

		window.addEventListener("keyup", (event) => {
			if (this.IsLocked) event.preventDefault();
			this.SendInput({ kind: InputEvtType.KeyUp, code: event.code });
		});

		// Anything held when focus or the lock goes away would otherwise stay "pressed" forever.
		window.addEventListener("blur", () => this.SendInput({ kind: InputEvtType.ReleaseAll }));
		document.addEventListener("pointerlockchange", () => this.SendInput({ kind: InputEvtType.ReleaseAll }));
		this._canvas.addEventListener("contextmenu", (event) => event.preventDefault());

		// Pointer events only reach the canvas while it has the pointer lock (the menu overlay covers it otherwise).
		this._canvas.addEventListener("pointerdown", (event) => {
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

	private get IsLocked(): boolean {
		return document.pointerLockElement === this._canvas;
	}

	private SendInput(event: InputEvent): void {
		const message: MainToGameLogicMessage = { type: "input", event };
		this._workers.GameLogicWorker.postMessage(message);
	}
}
