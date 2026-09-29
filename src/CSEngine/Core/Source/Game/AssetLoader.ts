// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { AssetsManager } from "@babylonjs/core/Misc/assetsManager";
import type { Scene } from "@babylonjs/core/scene";

import { Logger } from "../Logging/Logger";

/**
 * Two-tier asset streaming.
 *
 * - "critical": whatever is needed to render the first playable frame
 *   (e.g. the player model, the first level chunk). Loaded with
 *   `LoadCriticalAsync()`, which the caller awaits before hiding the
 *   loading screen.
 * - "background": everything else (later levels, ambience, extra
 *   skins). Kicked off with `LoadBackgroundInBackground()` right after
 *   the game becomes playable; it never blocks the render loop, and
 *   `OnBackgroundProgress` lets you show a small non-blocking indicator for it.
 *
 * This intentionally wraps Babylon's own `AssetsManager` rather than
 * replacing it - two separate managers (one per tier) is enough to
 * get independent progress tracking and independent "useDefaultLoadingScreen"
 * behavior for each.
 */
export class AssetLoader {
	private readonly _scene: Scene;
	private readonly _critical: AssetsManager;
	private readonly _background: AssetsManager;

	public OnBackgroundProgress?: (loaded: number, total: number) => void;
	public OnBackgroundIdle?: () => void;

	public constructor(scene: Scene) {
		this._scene = scene;

		this._critical = new AssetsManager(scene);
		this._critical.useDefaultLoadingScreen = false;

		this._background = new AssetsManager(scene);
		this._background.useDefaultLoadingScreen = false;
		this._background.onProgress = (remaining, total) => {
			this.OnBackgroundProgress?.(total - remaining, total);
		};
		this._background.onFinish = () => this.OnBackgroundIdle?.();
	}

	/**
	 * Registers a glTF/glb mesh task on the given tier. Callers add
	 * tasks, then call LoadCriticalAsync()/LoadBackgroundInBackground()
	 * once all tasks for that tier are registered.
	 *
	 * Example:
	 *   assetLoader.AddMesh("critical", "hero", "assets/models/", "hero.glb");
	 *   assetLoader.AddMesh("background", "level2", "assets/models/", "level2.glb");
	 */
	public AddMesh(
		priority: "critical" | "background",
		taskName: string,
		rootUrl: string,
		sceneFilename: string,
		onLoaded?: (meshes: import("@babylonjs/core/Meshes/abstractMesh").AbstractMesh[]) => void
	): void {
		const manager = priority === "critical" ? this._critical : this._background;
		const task = manager.addMeshTask(taskName, "", rootUrl, sceneFilename);
		task.onSuccess = (t) => onLoaded?.(t.loadedMeshes);
		task.onError = (t, message, exception) =>
			Logger.LogException(exception ?? message, `[AssetLoader] failed to load ${t.name}: ${message}`);
	}

	/**
	 * Registers a texture task on the given tier.
	 */
	public AddTexture(
		priority: "critical" | "background",
		taskName: string,
		url: string,
		onLoaded?: (texture: import("@babylonjs/core/Materials/Textures/texture").Texture) => void
	): void {
		const manager = priority === "critical" ? this._critical : this._background;
		const task = manager.addTextureTask(taskName, url);
		task.onSuccess = (t) => onLoaded?.(t.texture);
		task.onError = (t, message, exception) =>
			Logger.LogException(exception ?? message, `[AssetLoader] failed to load ${t.name}: ${message}`);
	}

	/** Awaited before the loading screen is hidden — keep this list short. */
	public LoadCriticalAsync(): Promise<void> {
		return new Promise((resolve, reject) => {
			this._critical.onFinish = () => resolve();
			this._critical.onTaskError = (task) =>
				reject(new Error(`Critical asset failed: ${task.name}`));
			this._critical.load();
		});
	}

	/** Fire-and-forget — call once the game is already playable. */
	public LoadBackgroundInBackground(): void {
		this._background.load();
	}
}
