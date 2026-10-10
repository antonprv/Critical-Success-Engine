// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { CursorMode } from "../../Engine/Core/EntityManifest";
import { MenuMode, type UiMsg } from "../Common/CommonEnums";
/**
 * Vue needs a DOM, so the UI is split like audio: UiWorker owns the state and logic (UiController), the main thread only
 * renders that state and forwards DOM events. GameLogic talks to UiWorker only.
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
	mode: MenuMode;
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
	/** The current scene's cursor: "free" scenes don't take the mouse (Resume doesn't ask for it, Esc pauses). */
	cursor: CursorMode;
	/** The page only: a plugin draws the menu and the loading screen (UI documents), so the page's own ones step aside. */
	documentScreens?: boolean;
}

export function CreateInitialUiState(): UiState {
	return {
		loading: { visible: true, label: "Starting…", fraction: 0 },
		menu: { visible: false, mode: MenuMode.Start, scenes: [], currentSceneId: null },
		hud: { visible: true, lines: [], bars: [] },
		cursor: "locked",
	};
}

// GameLogic <-> UiWorker

export type GameLogicToUiMessage =
	| { type: UiMsg.Scenes; scenes: SceneInfo[]; }
	| { type: UiMsg.LoadProgress; sceneId: string; label: string; fraction: number; }
	| { type: UiMsg.LoadFinished; sceneId: string; cursor?: CursorMode; }
	| { type: UiMsg.LoadFailed; sceneId: string; message: string; }
	| { type: UiMsg.Hud; lines: string[]; }
	| { type: UiMsg.Bars; bars: UiBar[]; }
	| { type: UiMsg.Toast; message: string; }
	| ChannelMessage;

/** A plugin's message on a named channel; the UI worker passes it on between the game logic worker and the page. */
export type ChannelMessage = { type: UiMsg.Channel; channel: string; payload: unknown; };

export type UiToGameLogicMessage =
	| { type: UiMsg.LoadScene; sceneId: string; }
	| { type: UiMsg.SetCapture; enabled: boolean; }
	| ChannelMessage;

// main <-> UiWorker

export type MainToUiMessage =
	| { type: UiMsg.Init; gameLogicPort: MessagePort; }
	/** document.pointerLockElement changed. */
	| { type: UiMsg.PointerLock; locked: boolean; }
	/** requestPointerLock() was refused (no user gesture, or the browser's post-Esc cooldown). */
	| { type: UiMsg.PointerLockFailed; }
	| { type: UiMsg.SelectScene; sceneId: string; }
	| { type: UiMsg.Resume; }
	| { type: UiMsg.Pause; }
	| { type: UiMsg.SetTouch; enabled: boolean; }
	| ChannelMessage;

export type UiToMainMessage =
	| { type: UiMsg.State; patch: Partial<UiState>; }
	| { type: UiMsg.RequestPointerLock; }
	| { type: UiMsg.ExitPointerLock; }
	| { type: UiMsg.Toast; message: string; }
	| ChannelMessage;
