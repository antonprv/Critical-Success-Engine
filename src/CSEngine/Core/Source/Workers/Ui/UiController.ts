// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { CursorMode } from "../../Engine/Core/EntityManifest";
import {
	CreateInitialUiState,
	type GameLogicToUiMessage,
	type MainToUiMessage,
	type UiState,
	type UiToGameLogicMessage,
	type UiToMainMessage,
} from "../Protocol/UiProtocol";
import { MenuMode, UiMsg } from "../Common/CommonEnums";

export const enum UiPhase {
	/** Waiting for the first scene to finish loading. */
	Booting = 0,
	/** A scene is being (un)loaded; the loading overlay is up. */
	Loading,
	/** Scene is ready, the pointer lock request is in flight. */
	AwaitingLock,
	/** Pointer is locked, the game has input. */
	Playing,
	/** Pointer is free: the menu is up. */
	Menu,
}

/**
 * The UI state machine, run in UiWorker. No DOM and no worker globals, so it is unit-tested directly.
 *
 *   boot -> loading -> load-finished -> request pointer lock
 *     lock granted -> playing;   lock refused -> start menu (browsers need a click)
 *   Esc (lock lost) -> paused menu;   pick a scene -> loading -> request pointer lock again
 */
export class UiController {
	private readonly _toMain: (message: UiToMainMessage) => void;
	private readonly _toGameLogic: (message: UiToGameLogicMessage) => void;

	private readonly _state: UiState = CreateInitialUiState();
	private _phase: UiPhase = UiPhase.Booting;
	private _touch = false;
	private _hasPlayed = false;
	/** Whether the browser currently holds the pointer lock for us (as last reported by the main thread). */
	private _locked = false;

	public constructor(toMain: (message: UiToMainMessage) => void, toGameLogic: (message: UiToGameLogicMessage) => void) {
		this._toMain = toMain;
		this._toGameLogic = toGameLogic;
		this.PushState({ loading: this._state.loading, menu: this._state.menu, hud: this._state.hud });
	}

	public get Phase(): UiPhase { return this._phase; }
	public get State(): Readonly<UiState> { return this._state; }

	//#region From GameLogic

	public OnGameLogicMessage(message: GameLogicToUiMessage): void {
		switch (message.type) {
			case UiMsg.Channel:
				this._toMain(message); // a plugin's message: passed on as it is
				break;

			case UiMsg.Scenes:
				this._state.menu = { ...this._state.menu, scenes: message.scenes };
				this.PushState({ menu: this._state.menu });
				break;

			case UiMsg.LoadProgress:
				if (this._phase !== UiPhase.Booting) this._phase = UiPhase.Loading;
				this._state.loading = { visible: true, label: message.label, fraction: message.fraction };
				this.PushState({ loading: this._state.loading });
				break;

			case UiMsg.LoadFinished:
				this.OnLoadFinished(message.sceneId, message.cursor ?? "locked");
				break;

			case UiMsg.LoadFailed:
				this.OnLoadFailed(message.message);
				break;

			case UiMsg.Hud:
				this._state.hud = { ...this._state.hud, lines: message.lines };
				this.PushState({ hud: this._state.hud });
				break;

			case UiMsg.Bars:
				this._state.hud = { ...this._state.hud, bars: message.bars };
				this.PushState({ hud: this._state.hud });
				break;

			case UiMsg.Toast:
				this._toMain({ type: UiMsg.Toast, message: message.message });
				break;
		}
	}

	private OnLoadFinished(sceneId: string, cursor: CursorMode): void {
		this._state.loading = { visible: false, label: "", fraction: 1 };
		this._state.menu = { ...this._state.menu, currentSceneId: sceneId, visible: false };
		this._state.cursor = cursor;
		this.PushState({ loading: this._state.loading, menu: this._state.menu, cursor });
		if (cursor === "free" || this._touch) {
			// The cursor stays visible: nothing to ask the browser for. A mouse still held from the last scene goes.
			if (this._locked) this._toMain({ type: UiMsg.ExitPointerLock });
			if (this._hasPlayed) this.PlayWithFreeCursor();
			else this.ShowMenu(MenuMode.Start);
			return;
		}
		if (this._locked) {
			// A script reloaded the scene (e.g. "press R to restart") and the pointer never left the game:
			// there is nothing to request, and no lock-change event will come - go straight back to playing.
			this._phase = UiPhase.Playing;
		} else {
			this._phase = UiPhase.AwaitingLock;
			this._toMain({ type: UiMsg.RequestPointerLock });
		}
	}

	private OnLoadFailed(reason: string): void {
		this._state.loading = { visible: false, label: "", fraction: 0 };
		this.ShowMenu(this._hasPlayed ? MenuMode.Paused : MenuMode.Start);
		this.PushState({ loading: this._state.loading });
		this._toMain({ type: UiMsg.Toast, message: `Failed to load: ${reason}` });
	}

	//#endregion

	//#region From the main thread (DOM events)

	public OnMainMessage(message: MainToUiMessage): void {
		switch (message.type) {
			case UiMsg.Channel:
				this._toGameLogic(message);
				break;

			case UiMsg.Init:
				break; // handled by the worker shell

			case UiMsg.PointerLock:
				if (message.locked) this.OnLockAcquired();
				else this.OnLockLost();
				break;

			case UiMsg.PointerLockFailed:
				// Nothing to do while a scene is loading; the next load-finished asks again.
				if (this._phase === UiPhase.AwaitingLock || this._phase === UiPhase.Playing) {
					this.ShowMenu(this._hasPlayed ? MenuMode.Paused : MenuMode.Start);
				}
				break;

			case UiMsg.SelectScene:
				if (this._phase === UiPhase.Loading || this._phase === UiPhase.Booting) return;
				this._phase = UiPhase.Loading;
				this._toGameLogic({ type: UiMsg.SetCapture, enabled: false });
				this._state.menu = { ...this._state.menu, visible: false };
				this._state.loading = { visible: true, label: "Loading…", fraction: 0 };
				this.PushState({ menu: this._state.menu, loading: this._state.loading });
				this._toGameLogic({ type: UiMsg.LoadScene, sceneId: message.sceneId });
				break;

			case UiMsg.Resume:
				// A free-cursor scene just goes on. Otherwise the main thread already asked the browser for the lock inside
				// the click handler (that is the user gesture the browser demands); if refused, "pointer-lock-failed" comes.
				if (this.Free && this._phase === UiPhase.Menu) this.PlayWithFreeCursor();
				break;

			case UiMsg.SetTouch:
				// The touch scheme plays every scene without taking the mouse (a phone has no pointer lock).
				this._touch = message.enabled;
				if (message.enabled && this._locked) this._toMain({ type: UiMsg.ExitPointerLock });
				break;

			case UiMsg.Pause:
				// Esc in a free-cursor scene: there is no pointer lock for the browser to release, so the page says so.
				if (this.Free && this._phase === UiPhase.Playing) {
					this._toGameLogic({ type: UiMsg.SetCapture, enabled: false });
					this.ShowMenu(MenuMode.Paused);
				}
				break;
		}
	}

	private OnLockAcquired(): void {
		this._locked = true;
		this._phase = UiPhase.Playing;
		this._hasPlayed = true;
		this._state.menu = { ...this._state.menu, visible: false };
		this.PushState({ menu: this._state.menu });
		this._toGameLogic({ type: UiMsg.SetCapture, enabled: true });
	}

	private OnLockLost(): void {
		this._locked = false;
		if (this.Free) return; // let go on purpose (a free-cursor scene, the touch scheme): not a pause
		this._toGameLogic({ type: UiMsg.SetCapture, enabled: false });
		if (this._phase === UiPhase.Playing) this.ShowMenu(MenuMode.Paused);
	}

	//#endregion

	/** The game plays without taking the mouse: a free-cursor scene, or the touch scheme. */
	private get Free(): boolean { return this._state.cursor === "free" || this._touch; }

	private PlayWithFreeCursor(): void {
		this._phase = UiPhase.Playing;
		this._hasPlayed = true;
		this._state.menu = { ...this._state.menu, visible: false };
		this.PushState({ menu: this._state.menu });
		this._toGameLogic({ type: UiMsg.SetCapture, enabled: true });
	}

	private ShowMenu(mode: MenuMode): void {
		this._phase = UiPhase.Menu;
		this._state.menu = { ...this._state.menu, visible: true, mode };
		this.PushState({ menu: this._state.menu });
	}

	private PushState(patch: Partial<UiState>): void {
		this._toMain({ type: UiMsg.State, patch });
	}
}
