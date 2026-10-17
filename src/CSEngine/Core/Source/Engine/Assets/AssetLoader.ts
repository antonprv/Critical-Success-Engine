// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Task, TaskCompletionSource } from "@cse/task";

import { AssetsManager } from "@babylonjs/core/Misc/assetsManager";
import type { Scene } from "@babylonjs/core/scene";

import { Logger } from "../../Logging/Logger";

export const enum AssetPriority {
	/**
	 * Needed for the first playable frame; awaited before the loading screen
	 * hides.
	 */
	Critical = 0,
	/** Streams in after the game is playable. */
	Background,
}

/**
 * Two-tier asset loading over Babylon's AssetsManager: Critical assets are
 * awaited before the loading screen hides (`LoadCriticalAsync`), Background
 * assets stream in afterwards (`LoadBackgroundInBackground`,
 * `OnBackgroundProgress`).
 */
export class AssetLoader {
	private readonly _scene: Scene;

	private readonly _critical: AssetsManager;

	private readonly _background: AssetsManager;

	public OnBackgroundProgress?: ( loaded: number, total: number ) => void;

	public OnBackgroundIdle?: () => void;

	public constructor( scene: Scene ) {
		this._scene = scene;

		this._critical = new AssetsManager( scene );
		this._critical.useDefaultLoadingScreen = false;

		this._background = new AssetsManager( scene );
		this._background.useDefaultLoadingScreen = false;
		this._background.onProgress = ( remaining, total ) => {
			this.OnBackgroundProgress?.( total - remaining, total );
		};
		this._background.onFinish = () => this.OnBackgroundIdle?.();
	}

	/**
	 * Registers a glTF/glb mesh on a tier; call the tier's load method once all
	 * its tasks are added.
	 */
	public AddMesh(
		priority: AssetPriority,
		taskName: string,
		rootUrl: string,
		sceneFilename: string,
		onLoaded?: (
			meshes: import( "@babylonjs/core/Meshes/abstractMesh" )
			.AbstractMesh[],
		) => void,
	): void {
		const manager = priority === AssetPriority.Critical
			? this._critical
			: this._background;
		const task = manager.addMeshTask(
			taskName,
			"",
			rootUrl,
			sceneFilename,
		);
		task.onSuccess = ( t ) => onLoaded?.( t.loadedMeshes );
		task.onError = ( t, message, exception ) => Logger.LogException(
			exception ?? message,
			`[AssetLoader] failed to load ${ t.name }: ${ message }`,
		);
	}

	/**
	 * Registers a texture task on the given tier.
	 */
	public AddTexture(
		priority: AssetPriority,
		taskName: string,
		url: string,
		onLoaded?: (
			texture: import( "@babylonjs/core/Materials/Textures/texture" )
			.Texture,
		) => void,
	): void {
		const manager = priority === AssetPriority.Critical
			? this._critical
			: this._background;
		const task = manager.addTextureTask( taskName, url );
		task.onSuccess = ( t ) => onLoaded?.( t.texture );
		task.onError = ( t, message, exception ) => Logger.LogException(
			exception ?? message,
			`[AssetLoader] failed to load ${ t.name }: ${ message }`,
		);
	}

	/** Awaited before the loading screen is hidden - keep this list short. */
	public LoadCriticalAsync(): Task {
		const source = new TaskCompletionSource();
		this._critical.onFinish = () => source.TrySetResult();
		this._critical.onTaskError = ( task ) => source.TrySetError(
			new Error( `Critical asset failed: ${ task.name }` ),
		);
		this._critical.load();
		return source.Task;
	}

	/** Fire-and-forget - call once the game is already playable. */
	public LoadBackgroundInBackground(): void {
		this._background.load();
	}
}
