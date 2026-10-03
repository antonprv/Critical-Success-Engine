// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../../Logging/Logger";
import type { EngineContext } from "../Core/EngineContext";
import { WithTimeout } from "../Core/SyncTracker";
import type { SceneRegistry } from "./SceneRegistry";

/**
 * Loads one scene at a time. Unloading is a full reset of all three worlds, in an order that cannot race:
 *
 *   1. destroy every entity (OnDestroy hooks run - bodies/meshes release themselves)
 *   2. tell physics and render to wipe their worlds, then wait for both acks - the ports are FIFO, so after the ack
 *      nothing from the old scene can arrive any more
 *   3. spawn the new scene's entities, run Awake/Start
 *   4. report finished -> UiWorker gives the player control back
 *
 * Scene content is described by a manifest (entity -> list of components, see EntityManifest.ts); this class has no
 * idea what any particular scene contains.
 */
export class SceneManager {
	private readonly _registry: SceneRegistry;
	private _engine!: EngineContext;

	private _currentId: string | null = null;
	private _loading = false;

	public constructor(registry: SceneRegistry) {
		this._registry = registry;
	}

	/** Two-phase construction: the context owns the manager, the manager needs the context. */
	public Attach(engine: EngineContext): void { this._engine = engine; }

	public get CurrentSceneId(): string | null { return this._currentId; }

	/** While true the runtime skips scripts and physics snapshots (the world is being rebuilt). */
	public get IsLoading(): boolean { return this._loading; }

	public async Load(sceneId: string): Promise<void> {
		if (this._loading) return;

		const manifest = this._registry.Get(sceneId);
		if (!manifest) {
			this._engine.Ui.LoadFailed(sceneId, `Unknown scene "${sceneId}".`);
			return;
		}

		this._loading = true;
		const ui = this._engine.Ui;

		try {
			ui.LoadProgress(sceneId, `Unloading ${this._currentId ?? "previous scene"}…`, 0.05);
			await Yield();

			this._engine.World.DestroyAll();
			this._engine.Ui.ClearHud();

			ui.LoadProgress(sceneId, "Resetting physics and renderer…", 0.2);
			this._engine.Render.ClearScene();
			this._engine.Render.MainCamera = null;
			this._engine.Render.SetEnvironment(manifest.clearColor ?? [0.08, 0.1, 0.14]);

			const resets = Promise.all([
				this._engine.Physics.ResetWorld({ gravity: manifest.gravity ?? [0, -20, 0] }),
				this._engine.Render.Sync(),
			]).then(() => undefined);
			// Physics never answers if its wasm module failed to load - don't hang the loading screen forever.
			if (!(await WithTimeout(resets, 10_000))) {
				Logger.LogWarning(`[SceneManager] physics/render did not acknowledge the reset in time; continuing "${sceneId}" anyway.`);
			}

			const total = manifest.entities.length;
			for (let i = 0; i < total; i++) {
				this._engine.World.Spawn(manifest.entities[i]!);
				if (i % 8 === 7) {
					ui.LoadProgress(sceneId, `Creating entities (${i + 1}/${total})…`, 0.3 + 0.6 * ((i + 1) / total));
					await Yield();
				}
			}

			ui.LoadProgress(sceneId, "Starting scripts…", 0.95);
			await Yield();
			this._engine.World.FlushLifecycle();
			this._engine.Physics.Flush();

			this._currentId = sceneId;
			ui.LoadProgress(sceneId, "Done", 1);
			ui.LoadFinished(sceneId);
		} catch (error) {
			Logger.LogException(error, `[SceneManager] loading "${sceneId}" failed:`);
			ui.LoadFailed(sceneId, error instanceof Error ? error.message : String(error));
		} finally {
			this._loading = false;
		}
	}
}

/** Lets queued messages (progress updates) actually leave before the next chunk of synchronous work. */
function Yield(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
