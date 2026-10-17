// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import { watch, type WatchStopHandle } from "vue";
import LoadingText from "../../Content/EngineLoading.ui.json?raw";
import PauseMenuText from "../../Content/EnginePauseMenu.ui.json?raw";
import SettingsText from "../../Content/EngineSettings.ui.json?raw";
import ControlsText from "../../Content/EngineControls.ui.json?raw";
import HintsText from "../../Content/EngineHints.ui.json?raw";
import ToastsText from "../../Content/EngineToasts.ui.json?raw";
import TouchText from "../../Content/EngineTouch.ui.json?raw";
import { Actions } from "../Documents/Graph";
import { ParseLayout, type UiLayout } from "../Documents/Layout";
import type { UiDocument } from "../Documents/UiDocument";
import type { UiManager, UiManagerOptions } from "../Documents/UiManager";
import { Task } from "@cse/task";

/** The engine's own screens: UI documents a project can replace by giving its own documents these Ids. */
export const EngineMenuId = "EnginePauseMenu";
export const EngineLoadingId = "EngineLoading";
export const EngineSettingsId = "EngineSettings";
export const EngineControlsId = "EngineControls";
/** The game's hints (the HUD's lines and bars), top left. */
export const EngineHintsId = "EngineHints";
/** Toasts, bottom right. */
export const EngineToastsId = "EngineToasts";
/** Where the touch controls are (TouchControls reads it, arranging writes it). */
export const EngineTouchId = "EngineTouch";
export const EngineDocuments: Record<string, string> = {
	[EngineMenuId]: PauseMenuText, [EngineLoadingId]: LoadingText, [EngineSettingsId]: SettingsText, [EngineControlsId]: ControlsText,
	[EngineHintsId]: HintsText, [EngineToastsId]: ToastsText, [EngineTouchId]: TouchText,
};

/** The project's documents, and the engine's screens it doesn't replace (read from the engine, not the project). */
export function WithEngineDocuments(project: Pick<UiManagerOptions, "Manifest" | "Load">): Pick<UiManagerOptions, "Manifest" | "Load"> {
	const own = new Set(project.Manifest.Documents.map((d) => d.Id));
	const engine = Object.keys(EngineDocuments).filter((id) => !own.has(id)).map((id) => ({ Id: id, Path: `engine:${id}`, Script: "" }));
	return {
		Manifest: { ...project.Manifest, Documents: [...project.Manifest.Documents, ...engine] },
		Load: (path) => (path.startsWith("engine:") ? Task.FromResult(EngineDocuments[path.slice("engine:".length)]!) : project.Load(path)),
	};
}

/** A document of the project (or the engine's) by its Id, read and parsed; null when the manifest has no such Id. */
export async function LoadDocument(documents: Pick<UiManagerOptions, "Manifest" | "Load">, id: string): Promise<UiLayout | null> {
	const entry = documents.Manifest.Documents.find((document) => document.Id === id);
	return entry ? ParseLayout(await documents.Load(entry.Path)) : null;
}

type Scene = { id: string; name: string; description: string; };

/** What the page offers (Core's PageUi): its menu and loading state, the game's title, the player's actions. */
export interface EnginePage {
	readonly State: {
		loading: { visible: boolean; label: string; fraction: number; };
		menu: { visible: boolean; mode: unknown; scenes: Scene[]; currentSceneId: string | null; };
		hud: { visible: boolean; lines: string[]; bars: { id: string; label: string; value: number; }[]; };
		toasts?: string[];
	};
	readonly Title: string;
	Resume(): void;
	SelectScene(sceneId: string): void;
	IsStartMenu(): boolean;
	UseDocumentScreens(): void;
	/** The touch scheme's pause, and the scheme on or off (the game doesn't take the mouse then). */
	Pause(): void;
	SetTouchMode(enabled: boolean): void;
}

/**
 * Draws the engine's menu and loading screen as UI documents, following the page's state: the loading screen while
 * something loads, the menu (Play or Resume, the scenes) while the game waits. The player's clicks call the page's
 * actions from the click itself (taking the mouse needs a user gesture).
 */
export class EngineScreens {
	private _queue: Task = Task.CompletedTask;
	private _scenes: Scene[] = [];
	private _closingMenu = false;
	private readonly _stops: (WatchStopHandle | (() => void))[] = [];

	public constructor(private readonly _manager: UiManager, private readonly _page: EnginePage, private readonly _openSettings: () => void = () => undefined) {
		_page.UseDocumentScreens();
		this._stops.push(_manager.Events.On("shown", (id, document) => { if (id === EngineMenuId) this.WireMenu(document); }));
		// The menu window's close box: the player closed the menu, back to the game (not when the page closed it).
		this._stops.push(_manager.Events.On("hidden", (id) => { if (id === EngineMenuId && !this._closingMenu) _page.Resume(); }));
		const { loading, menu, hud } = _page.State;
		this._stops.push(watch(() => [loading.visible, loading.label, loading.fraction], () => this.Enqueue(() => this.DrawLoading()), { immediate: true }));
		this._stops.push(watch(() => [menu.visible, menu.mode, menu.scenes, menu.currentSceneId], () => this.Enqueue(() => this.DrawMenu()), { immediate: true }));
		this._stops.push(watch(() => [hud.visible, hud.lines, hud.bars, menu.visible, loading.visible], () => this.Enqueue(() => this.DrawHints()), { immediate: true, deep: true }));
		this._stops.push(watch(() => _page.State.toasts, () => this.Enqueue(() => this.DrawToasts()), { immediate: true, deep: true }));
	}

	public Dispose(): void {
		for (const stop of this._stops.splice(0)) stop();
	}

	private Enqueue(draw: () => Promise<void>): void {
		this._queue = this._queue.then(draw).catch((error: Error) => console.error(`[UI] ${error.message}`));
	}

	private async DrawLoading(): Promise<void> {
		const { loading } = this._page.State;
		if (!loading.visible) {
			this._manager.Hide(EngineLoadingId);
			return;
		}
		const screen = await this._manager.Show(EngineLoadingId);
		screen.Controller<{ SetValue(value: number): void; }>("Progress").SetValue(FMath.Round(loading.fraction * 100));
		Actions.SetText(screen, "Status", loading.label);
	}

	private async DrawMenu(): Promise<void> {
		const { menu } = this._page.State;
		if (!menu.visible) {
			this._closingMenu = true;
			this._manager.Hide(EngineMenuId);
			this._closingMenu = false;
			return;
		}
		const screen = await this._manager.Show(EngineMenuId);
		const start = this._page.IsStartMenu();
		Actions.SetText(screen, "MenuWindow", this._page.Title);
		Actions.SetText(screen, "Heading", start ? "Ready" : "Paused");
		Actions.SetText(screen, "PlayButton", start ? "Play" : "Resume");
		Actions.SetText(screen, "Hint", start ? "Click Play to take control of the mouse." : "Mouse released. Resume to keep playing, or pick another scene.");
		this._scenes = [...menu.scenes];
		// One line per scene: its name, whether it is the one playing, what it is.
		screen.Controller<{ SetItems(items: { text: string; }[]): void; }>("Scenes").SetItems(this._scenes.map((scene) => {
			const name = scene.id === menu.currentSceneId ? `${scene.name} (current)` : scene.name;
			return { text: scene.description ? `${name} - ${scene.description}` : name };
		}));
	}

	/** The HUD's lines (and bars, as "label: 40%") while the game plays. */
	private async DrawHints(): Promise<void> {
		const { hud, menu, loading } = this._page.State;
		const lines = [...hud.lines, ...hud.bars.map((bar) => `${bar.label}: ${FMath.Round(bar.value * 100)}%`)];
		if (!hud.visible || menu.visible || loading.visible || lines.length === 0) {
			this._manager.Hide(EngineHintsId);
			return;
		}
		const hints = await this._manager.Show(EngineHintsId);
		hints.Controller<{ SetItems(items: { text: string; }[]): void; }>("Lines").SetItems(lines.map((text) => ({ text })));
	}

	/** The toasts showing now (the page drops each after a while). */
	private async DrawToasts(): Promise<void> {
		const toasts = this._page.State.toasts ?? [];
		if (toasts.length === 0) {
			this._manager.Hide(EngineToastsId);
			return;
		}
		const shown = await this._manager.Show(EngineToastsId);
		shown.Controller<{ SetItems(items: { text: string; }[]): void; }>("Toasts").SetItems(toasts.map((text) => ({ text })));
	}

	private WireMenu(screen: UiDocument): void {
		screen.On("PlayButton", "click", () => this._page.Resume());
		screen.On("SettingsButton", "click", () => this._openSettings());
		screen.On("Scenes", "selection-change", (indices) => {
			const scene = this._scenes[(indices as number[])[0]!];
			if (scene) this._page.SelectScene(scene.id);
		});
	}
}
