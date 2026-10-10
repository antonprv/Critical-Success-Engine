// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ChannelHub } from "../../Engine/Core/Channels";
import { Notify } from "quasar";
import type { UiActions, UiStore } from "../../Ui/UiStore";
import type { MainToUiMessage, UiToMainMessage } from "../Protocol/UiProtocol";
import type { GameWorkers } from "./GameWorkers";
import { UiMsg } from "../Common/CommonEnums";

/**
 * Main-thread end of the UI worker: applies its state patches to the Vue store, and turns the DOM facts only the main
 * thread can know (pointer lock changes) into messages for it. Pointer lock itself is also requested here - the browser
 * insists on doing that from the main thread.
 */
export class UiBridge implements UiActions {
	private readonly _workers: GameWorkers;
	private readonly _canvas: HTMLCanvasElement;
	private readonly _store: UiStore;
	/** The touch scheme is on: no pointer lock to ask for. */
	private _touch = false;
	private readonly _channels: ChannelHub;

	public constructor(workers: GameWorkers, canvas: HTMLCanvasElement, store: UiStore, channels: ChannelHub = new ChannelHub()) {
		this._workers = workers;
		this._canvas = canvas;
		this._store = store;
		store.Actions = this;

		workers.UiWorker.onmessage = (event: MessageEvent<UiToMainMessage>) => this.OnMessage(event.data);
		// Plugins on the page (the UI host) talk to their game-side halves through the UI worker.
		this._channels = channels;
		channels.Connect((channel, payload) => workers.UiWorker.postMessage({ type: UiMsg.Channel, channel, payload }));

		document.addEventListener("pointerlockchange", () => {
			this.Send({ type: UiMsg.PointerLock, locked: document.pointerLockElement === this._canvas });
		});
		document.addEventListener("pointerlockerror", () => this.Send({ type: UiMsg.PointerLockFailed }));
		// Esc while playing a free-cursor scene: no pointer lock for the browser to release, so the page asks for the menu.
		window.addEventListener("keydown", (event) => {
			const state = this._store.State;
			if (event.code === "Escape" && (state.cursor === "free" || this._touch) && !state.menu.visible && !state.loading.visible) this.Send({ type: UiMsg.Pause });
		});
	}

	private Send(message: MainToUiMessage): void {
		this._workers.UiWorker.postMessage(message);
	}

	private OnMessage(message: UiToMainMessage): void {
		switch (message.type) {
			case UiMsg.State:
				this._store.ApplyPatch(message.patch);
				break;
			case UiMsg.RequestPointerLock:
				this.RequestPointerLock();
				break;
			case UiMsg.ExitPointerLock:
				document.exitPointerLock();
				break;
			case UiMsg.Channel:
				this._channels.Deliver(message.channel, message.payload);
				break;
			case UiMsg.Toast:
				Notify.create({ message: message.message, color: "grey-9", textColor: "grey-3" });
				break;
		}
	}

	/** Browsers refuse without a recent user gesture (and for a short while after Esc): that surfaces as pointer-lock-failed. */
	private RequestPointerLock(): void {
		try {
			const result = this._canvas.requestPointerLock() as unknown;
			if (result instanceof Promise) {
				result.catch(() => this.Send({ type: UiMsg.PointerLockFailed }));
			}
		} catch {
			this.Send({ type: UiMsg.PointerLockFailed });
		}
	}

	//#region UiActions (called by Vue components)

	public Resume(): void {
		// Straight from the click handler: this call is the user gesture the browser requires. A free-cursor scene
		// doesn't take the mouse.
		if (this._store.State.cursor !== "free" && !this._touch) this.RequestPointerLock();
		this.Send({ type: UiMsg.Resume });
	}

	public Pause(): void {
		this.Send({ type: UiMsg.Pause });
	}

	public SetTouchMode(enabled: boolean): void {
		this._touch = enabled;
		this.Send({ type: UiMsg.SetTouch, enabled });
	}

	public SelectScene(sceneId: string): void {
		this.Send({ type: UiMsg.SelectScene, sceneId });
	}

	//#endregion
}
