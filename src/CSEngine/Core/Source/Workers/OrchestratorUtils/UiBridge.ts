// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Notify } from "quasar";
import type { UiActions, UiStore } from "../../Ui/UiStore";
import type { MainToUiMessage, UiToMainMessage } from "../Protocol/UiProtocol";
import type { GameWorkers } from "./GameWorkers";

/**
 * Main-thread end of the UI worker: applies its state patches to the Vue store, and turns the DOM facts only the main
 * thread can know (pointer lock changes) into messages for it. Pointer lock itself is also requested here - the browser
 * insists on doing that from the main thread.
 */
export class UiBridge implements UiActions {
	private readonly _workers: GameWorkers;
	private readonly _canvas: HTMLCanvasElement;
	private readonly _store: UiStore;

	public constructor(workers: GameWorkers, canvas: HTMLCanvasElement, store: UiStore) {
		this._workers = workers;
		this._canvas = canvas;
		this._store = store;
		store.Actions = this;

		workers.UiWorker.onmessage = (event: MessageEvent<UiToMainMessage>) => this.OnMessage(event.data);

		document.addEventListener("pointerlockchange", () => {
			this.Send({ type: "pointer-lock", locked: document.pointerLockElement === this._canvas });
		});
		document.addEventListener("pointerlockerror", () => this.Send({ type: "pointer-lock-failed" }));
	}

	private Send(message: MainToUiMessage): void {
		this._workers.UiWorker.postMessage(message);
	}

	private OnMessage(message: UiToMainMessage): void {
		switch (message.type) {
			case "state":
				this._store.ApplyPatch(message.patch);
				break;
			case "request-pointer-lock":
				this.RequestPointerLock();
				break;
			case "exit-pointer-lock":
				document.exitPointerLock();
				break;
			case "toast":
				Notify.create({ message: message.message, color: "grey-9", textColor: "grey-3" });
				break;
		}
	}

	/** Browsers refuse without a recent user gesture (and for a short while after Esc): that surfaces as pointer-lock-failed. */
	private RequestPointerLock(): void {
		try {
			const result = this._canvas.requestPointerLock() as unknown;
			if (result instanceof Promise) {
				result.catch(() => this.Send({ type: "pointer-lock-failed" }));
			}
		} catch {
			this.Send({ type: "pointer-lock-failed" });
		}
	}

	//#region UiActions (called by Vue components)

	public Resume(): void {
		// Straight from the click handler: this call is the user gesture the browser requires.
		this.RequestPointerLock();
		this.Send({ type: "resume" });
	}

	public SelectScene(sceneId: string): void {
		this.Send({ type: "select-scene", sceneId });
	}

	//#endregion
}
