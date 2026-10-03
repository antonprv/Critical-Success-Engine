// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { GameLogicMsg, InputEvtType, RenderMsg } from "../Common/CommonEnums";
import type { InputEvent, MainToGameLogicMessage } from "../Protocol/GameLogicProtocol";
import type { MainToRenderMessage } from "../Protocol/RenderProtocol";
import type { GameWorkers } from "./GameWorkers";

/** Main-thread DOM listeners (resize, keyboard, pointer, the audio-unlock gesture), forwarded to the workers. */
export class DomInputBridge {
	private readonly _workers: GameWorkers;
	private readonly _canvas: HTMLCanvasElement;

	public constructor(workers: GameWorkers, canvas: HTMLCanvasElement) {
		this._workers = workers;
		this._canvas = canvas;

		this.WireResize();
		this.WireKeyboard();
		this.WirePointer();
		this.WireAudioUnlock();
	}

	private WireResize(): void {
		window.addEventListener("resize", () => {
			const message: MainToRenderMessage = {
				type: RenderMsg.Resize,
				width: this._canvas.clientWidth,
				height: this._canvas.clientHeight,
				devicePixelRatio: window.devicePixelRatio,
			};
			this._workers.RenderWorker.postMessage(message);
		});
	}

	private WireKeyboard(): void {
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
	}

	private WirePointer(): void {
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
	}

	/** Browsers only let audio start after a user gesture: the first click or key press resumes the AudioContext. */
	private WireAudioUnlock(): void {
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
		const message: MainToGameLogicMessage = { type: GameLogicMsg.Input, event };
		this._workers.GameLogicWorker.postMessage(message);
	}
}
