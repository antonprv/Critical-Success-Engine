// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * UI architecture, in one paragraph: Vue + Quasar need a DOM, and workers don't have one - the same constraint audio hits
 * (AudioContext lives on the main thread, see AudioPlayer). So, like audio, the UI is split in two:
 *
 *   - UiWorker owns the UI *state and logic*: what the menu/loading/HUD currently look like, the pause-menu state machine
 *     (pointer lock <-> menu <-> loading), coalescing/throttling of high-frequency HUD updates. Everything the DOM can't be
 *     blamed for.
 *   - The main thread only *renders* that state with Vue (reactive store fed by `UiToMainMessage`) and forwards DOM
 *     events back (`MainToUiMessage`). It holds no UI logic of its own.
 *
 * GameLogic never touches either of those directly - it only talks to UiWorker over its own port (`GameLogicToUiMessage`).
 */

export interface SceneInfo {
	id: string;
	name: string;
	description: string;
}

export interface UiLoadingState {
	visible: boolean;
	label: string;
	fraction: number;
}

export interface UiMenuState {
	visible: boolean;
	/** "start": nothing has captured the pointer yet ("click to play"); "paused": the user pressed Esc. */
	mode: "start" | "paused";
	scenes: SceneInfo[];
	currentSceneId: string | null;
}

/** A labelled progress bar on the HUD (health, stamina...). `value` is 0..1. */
export interface UiBar {
	id: string;
	label: string;
	value: number;
}

export interface UiHudState {
	visible: boolean;
	lines: string[];
	bars: UiBar[];
}

export interface UiState {
	loading: UiLoadingState;
	menu: UiMenuState;
	hud: UiHudState;
}

export function CreateInitialUiState(): UiState {
	return {
		loading: { visible: true, label: "Starting…", fraction: 0 },
		menu: { visible: false, mode: "start", scenes: [], currentSceneId: null },
		hud: { visible: true, lines: [], bars: [] },
	};
}

// GameLogic <-> UiWorker

export type GameLogicToUiMessage =
	| { type: "scenes"; scenes: SceneInfo[]; }
	| { type: "load-progress"; sceneId: string; label: string; fraction: number; }
	| { type: "load-finished"; sceneId: string; }
	| { type: "load-failed"; sceneId: string; message: string; }
	| { type: "hud"; lines: string[]; }
	| { type: "bars"; bars: UiBar[]; }
	| { type: "toast"; message: string; };

export type UiToGameLogicMessage =
	| { type: "load-scene"; sceneId: string; }
	| { type: "set-capture"; enabled: boolean; };

// main <-> UiWorker

export type MainToUiMessage =
	| { type: "init"; gameLogicPort: MessagePort; }
	/** document.pointerLockElement changed. */
	| { type: "pointer-lock"; locked: boolean; }
	/** requestPointerLock() was refused (no user gesture, or the browser's post-Esc cooldown). */
	| { type: "pointer-lock-failed"; }
	| { type: "select-scene"; sceneId: string; }
	| { type: "resume"; };

export type UiToMainMessage =
	| { type: "state"; patch: Partial<UiState>; }
	| { type: "request-pointer-lock"; }
	| { type: "exit-pointer-lock"; }
	| { type: "toast"; message: string; };
