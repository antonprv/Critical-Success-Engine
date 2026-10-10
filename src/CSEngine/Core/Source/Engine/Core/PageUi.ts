// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { MenuMode } from "../../Workers/Common/CommonEnums";
import type { UiState } from "../../Workers/Protocol/UiProtocol";

/**
 * The page's menu and loading screen, for a plugin that draws them (the UI plugin draws them as UI documents): their
 * state (kept by the UI worker, mirrored on the page), the game's title, and what the player can do. Resume and
 * SelectScene must be called from a click handler: taking the mouse needs a user gesture.
 */
export interface PageUi {
	readonly State: UiState;
	readonly Title: string;
	Resume(): void;
	SelectScene(sceneId: string): void;
	/** Whether the menu is the start one (Play) rather than the pause one (Resume). */
	IsStartMenu(): boolean;
	/** The touch scheme's pause button. */
	Pause(): void;
	/** The touch scheme on or off (on: the game doesn't take the mouse). */
	SetTouchMode(enabled: boolean): void;
	/** The plugin draws the menu and the loading screen from now on: the page's own ones step aside. */
	UseDocumentScreens(): void;
}

/** What the page links: its store (state + actions). */
interface PageStore {
	readonly State: UiState;
	Actions: { Resume(): void; SelectScene(sceneId: string): void; Pause(): void; SetTouchMode(enabled: boolean): void; };
}

let current: PageUi | null = null;

/** The page links its store at startup, before its modules load. */
export function LinkPageUi(store: PageStore, title: string): void {
	current = {
		State: store.State,
		Title: title,
		// The store's actions are set later (by the UI bridge): read them at the time of the click.
		Resume: () => store.Actions.Resume(),
		SelectScene: (sceneId) => store.Actions.SelectScene(sceneId),
		IsStartMenu: () => store.State.menu.mode === MenuMode.Start,
		Pause: () => store.Actions.Pause(),
		SetTouchMode: (enabled) => store.Actions.SetTouchMode(enabled),
		UseDocumentScreens: () => { store.State.documentScreens = true; },
	};
}

export function GetPageUi(): PageUi | null {
	return current;
}
