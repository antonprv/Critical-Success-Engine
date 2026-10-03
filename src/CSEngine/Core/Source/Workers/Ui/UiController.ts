// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	CreateInitialUiState,
	type GameLogicToUiMessage,
	type MainToUiMessage,
	type UiState,
	type UiToGameLogicMessage,
	type UiToMainMessage,
} from "../Protocol/UiProtocol";

type Phase =
	/** Waiting for the first scene to finish loading. */
	| "booting"
	/** A scene is being (un)loaded; the loading overlay is up. */
	| "loading"
	/** Scene is ready, the pointer lock request is in flight. */
	| "awaiting-lock"
	/** Pointer is locked, the game has input. */
	| "playing"
	/** Pointer is free: the menu is up. */
	| "menu";

/**
 * The UI's brain, living in UiWorker so that Vue (main thread) only has to *draw* `UiState`: it decides which overlay is
 * visible, when the game gets the pointer, and what a click on a scene means. Pure logic over two message sinks - no DOM,
 * no worker globals - so it runs unchanged in a unit test.
 *
 * Flow:   boot -> loading -> (load-finished) -> request pointer lock
 *            lock granted  -> playing (menu hidden, game input on)
 *            lock refused  -> menu "start"  (browsers need a click to lock the pointer)
 *         Esc (browser drops the lock) -> menu "paused", game input off
 *         pick a scene -> loading -> (load-finished) -> request pointer lock again
 */
export class UiController {
	private readonly _toMain: (message: UiToMainMessage) => void;
	private readonly _toGameLogic: (message: UiToGameLogicMessage) => void;

	private readonly _state: UiState = CreateInitialUiState();
	private _phase: Phase = "booting";
	private _hasPlayed = false;
	/** Whether the browser currently holds the pointer lock for us (as last reported by the main thread). */
	private _locked = false;

	public constructor(toMain: (message: UiToMainMessage) => void, toGameLogic: (message: UiToGameLogicMessage) => void) {
		this._toMain = toMain;
		this._toGameLogic = toGameLogic;
		this.PushState({ loading: this._state.loading, menu: this._state.menu, hud: this._state.hud });
	}

	public get Phase(): Phase { return this._phase; }
	public get State(): Readonly<UiState> { return this._state; }

	//#region From GameLogic

	public OnGameLogicMessage(message: GameLogicToUiMessage): void {
		switch (message.type) {
			case "scenes":
				this._state.menu = { ...this._state.menu, scenes: message.scenes };
				this.PushState({ menu: this._state.menu });
				break;

			case "load-progress":
				if (this._phase !== "booting") this._phase = "loading";
				this._state.loading = { visible: true, label: message.label, fraction: message.fraction };
				this.PushState({ loading: this._state.loading });
				break;

			case "load-finished":
				this._state.loading = { visible: false, label: "", fraction: 1 };
				this._state.menu = { ...this._state.menu, currentSceneId: message.sceneId, visible: false };
				this.PushState({ loading: this._state.loading, menu: this._state.menu });
				if (this._locked) {
					// A script reloaded the scene (e.g. "press R to restart") and the pointer never left the game:
					// there is nothing to request, and no lock-change event will come - go straight back to playing.
					this._phase = "playing";
				} else {
					this._phase = "awaiting-lock";
					this._toMain({ type: "request-pointer-lock" });
				}
				break;

			case "load-failed":
				this._state.loading = { visible: false, label: "", fraction: 0 };
				this.ShowMenu(this._hasPlayed ? "paused" : "start");
				this.PushState({ loading: this._state.loading });
				this._toMain({ type: "toast", message: `Failed to load: ${message.message}` });
				break;

			case "hud":
				this._state.hud = { ...this._state.hud, lines: message.lines };
				this.PushState({ hud: this._state.hud });
				break;

			case "bars":
				this._state.hud = { ...this._state.hud, bars: message.bars };
				this.PushState({ hud: this._state.hud });
				break;

			case "toast":
				this._toMain({ type: "toast", message: message.message });
				break;
		}
	}

	//#endregion

	//#region From the main thread (DOM events)

	public OnMainMessage(message: MainToUiMessage): void {
		switch (message.type) {
			case "init":
				break; // handled by the worker shell

			case "pointer-lock":
				if (message.locked) this.OnLockAcquired();
				else this.OnLockLost();
				break;

			case "pointer-lock-failed":
				// Nothing to do while a scene is loading; the next load-finished asks again.
				if (this._phase === "awaiting-lock" || this._phase === "playing") {
					this.ShowMenu(this._hasPlayed ? "paused" : "start");
				}
				break;

			case "select-scene":
				if (this._phase === "loading" || this._phase === "booting") return;
				this._phase = "loading";
				this._toGameLogic({ type: "set-capture", enabled: false });
				this._state.menu = { ...this._state.menu, visible: false };
				this._state.loading = { visible: true, label: "Loading…", fraction: 0 };
				this.PushState({ menu: this._state.menu, loading: this._state.loading });
				this._toGameLogic({ type: "load-scene", sceneId: message.sceneId });
				break;

			case "resume":
				// The main thread already asked the browser for the lock inside the click handler (that is the user
				// gesture the browser demands); if it is refused we get "pointer-lock-failed" and the menu stays.
				break;
		}
	}

	private OnLockAcquired(): void {
		this._locked = true;
		this._phase = "playing";
		this._hasPlayed = true;
		this._state.menu = { ...this._state.menu, visible: false };
		this.PushState({ menu: this._state.menu });
		this._toGameLogic({ type: "set-capture", enabled: true });
	}

	private OnLockLost(): void {
		this._locked = false;
		this._toGameLogic({ type: "set-capture", enabled: false });
		if (this._phase === "playing") this.ShowMenu("paused");
	}

	//#endregion

	private ShowMenu(mode: "start" | "paused"): void {
		this._phase = "menu";
		this._state.menu = { ...this._state.menu, visible: true, mode };
		this.PushState({ menu: this._state.menu });
	}

	private PushState(patch: Partial<UiState>): void {
		this._toMain({ type: "state", patch });
	}
}
