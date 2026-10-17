// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Task, TaskCompletionSource } from "@cse/task";

import { Logger } from "../../Logging/Logger";
import type { EngineContext } from "../Core/EngineContext";
import type { SceneManifest } from "../Core/EntityManifest";
import { WithTimeout } from "../Core/SyncTracker";
import type { SceneRegistry } from "./SceneRegistry";
import { DefaultGravity } from "../../Workers/Common/EngineConstants";

/**
 * Loads one scene at a time. Unloading cannot race: destroy every entity, have
 * physics and render wipe their worlds and wait for both acks (the ports are
 * FIFO), spawn the new scene, then report finished so the UI hands control
 * back.
 */
export class SceneManager {
	private readonly _registry: SceneRegistry;

	private _engine!: EngineContext;

	private _currentId: string | null = null;

	private _loading = false;

	public constructor( registry: SceneRegistry ) {
		this._registry = registry;
	}

	/**
	 * Two-phase construction: the context owns the manager, the manager needs
	 * the context.
	 */
	public Attach( engine: EngineContext ): void {
		this._engine = engine;
	}

	public get CurrentSceneId(): string | null {
		return this._currentId;
	}

	/**
	 * While true the runtime skips scripts and physics snapshots (the world is
	 * being rebuilt).
	 */
	/**
	 * Called as a scene starts loading, after the last one is gone (the game
	 * logic runtime makes the scene's DI container here).
	 */
	public OnBeginScene: ( ( manifest: SceneManifest ) => void ) | null = null;

	public get IsLoading(): boolean {
		return this._loading;
	}

	public async Load( sceneId: string ): Promise<void> {
		if ( this._loading ) {
			return;
		}

		const manifest = this._registry.Get( sceneId );

		if ( !manifest ) {
			this._engine.Ui.LoadFailed(
				sceneId,
				`Unknown scene "${ sceneId }".`,
			);
			return;
		}

		this._loading = true;
		try {
			await this.Unload( sceneId );
			this.OnBeginScene?.( manifest );
			await this.ResetSubsystems( sceneId, manifest );
			// The project's input manifest this scene plays with (a project of
			// several games switches here); else the default.
			const input = manifest.input ?? this._engine.Input.System.Default;

			if ( input ) {
				this._engine.Input.System.UseManifest( input );
			}
			await this.WaitForSdf( sceneId, manifest );
			await this.SpawnEntities( sceneId, manifest );
			await this.StartScripts( sceneId, manifest );
		} catch ( error ) {
			Logger.LogException(
				error,
				`[SceneManager] loading "${ sceneId }" failed:`,
			);
			this._engine.Ui.LoadFailed(
				sceneId,
				error instanceof Error ? error.message : String( error ),
			);
		} finally {
			this._loading = false;
		}
	}

	private async Unload( sceneId: string ): Promise<void> {
		this._engine.Ui.LoadProgress(
			sceneId,
			`Unloading ${ this._currentId ?? "previous scene" }…`,
			0.05,
		);
		await Yield();
		this._engine.World.DestroyAll();
		this._engine.Ui.ClearHud();
		// the scene's own settings go with it (the player's values stay)
		this._engine.Settings.ClearScene();
	}

	/**
	 * Physics and render wipe their worlds; their acks (FIFO ports) mean
	 * nothing from the old scene is still queued.
	 */
	private async ResetSubsystems(
		sceneId: string,
		manifest: SceneManifest,
	): Promise<void> {
		this._engine.Ui.LoadProgress(
			sceneId,
			"Resetting physics and renderer…",
			0.2,
		);
		this._engine.Render.ClearScene();
		this._engine.Render.MainCamera = null;
		// the SDF worker starts on the new world (its chunks carry the scene's
		// epoch: render and physics drop the old scene's)
		this._engine.Sdf.Load( manifest.sdf ?? null );
		this._engine.Render.SetEnvironment(
			manifest.clearColor ?? [0.08, 0.1, 0.14],
		);

		const resets = Task.WhenAll( [
			this._engine.Physics.ResetWorld(
				{ gravity: manifest.gravity ?? [...DefaultGravity] },
			),
			this._engine.Render.Sync(),
		] ).then( () => undefined );

		// Physics never answers if its wasm module failed to load - don't hang
		// the loading screen forever.
		if ( !( await WithTimeout( resets, 10_000 ) ) ) {
			Logger.LogWarning(
				"[SceneManager] physics/render did not acknowledge the reset "
					+ `in time; continuing "${ sceneId }" anyway.`,
			);
		}
	}

	/**
	 * Bodies must not spawn before the ground they stand on: waits until the
	 * SDF worker has meshed the area around the scene's start (it is meshed
	 * for physics and render together).
	 */
	private async WaitForSdf(
		sceneId: string,
		manifest: SceneManifest,
	): Promise<void> {
		if ( !manifest.sdf ) {
			return;
		}
		this._engine.Ui.LoadProgress(
			sceneId,
			"Building the SDF world…",
			0.25,
		);
		if ( !( await WithTimeout( this._engine.Sdf.WhenMeshed(), 30_000 ) ) ) {
			Logger.LogWarning(
				"[SceneManager] the SDF world was not meshed in time; "
					+ `continuing "${ sceneId }" anyway.`,
			);
		}
		if ( this._engine.Sdf.LoadError !== null ) {
			Logger.LogWarning(
				`[SceneManager] "${ sceneId }": the SDF world failed to load: `
					+ this._engine.Sdf.LoadError,
			);
		}
	}

	private async SpawnEntities(
		sceneId: string,
		manifest: SceneManifest,
	): Promise<void> {
		const total = manifest.entities.length;

		for ( let i = 0; i < total; i++ ) {
			this._engine.World.Spawn( manifest.entities[i]! );
			if ( i % 8 === 7 ) {
				this._engine.Ui.LoadProgress(
					sceneId,
					`Creating entities (${ i + 1 }/${ total })…`,
					0.3 + 0.6 * ( ( i + 1 ) / total ),
				);
				await Yield();
			}
		}
	}

	private async StartScripts(
		sceneId: string,
		manifest: SceneManifest,
	): Promise<void> {
		this._engine.Ui.LoadProgress( sceneId, "Starting scripts…", 0.95 );
		await Yield();
		this._engine.World.FlushLifecycle();
		this._engine.Physics.Flush();

		this._currentId = sceneId;
		this._engine.Ui.LoadProgress( sceneId, "Done", 1 );
		this._engine.Ui.LoadFinished( sceneId, manifest.cursor ?? "locked" );
	}
}

/**
 * Lets queued messages (progress updates) actually leave before the next chunk
 * of synchronous work.
 */
function Yield(): Task {
	const source = new TaskCompletionSource();
	setTimeout( () => source.TrySetResult(), 0 );
	return source.Task;
}
