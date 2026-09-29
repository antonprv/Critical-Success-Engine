// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ArcRotateCamera, Engine, HemisphericLight, Scene, Vector3 } from "@babylonjs/core";
import "@babylonjs/loaders";

import { AssetLoader } from "../../Game/AssetLoader";

/**
 * Owns the Babylon Engine/Scene pair and their placeholder camera/light -
 * nothing here knows about entities, meshes-per-entity bookkeeping, or the
 * gamelogic message protocol (see EntityMeshRegistry for that side).
 *
 * KNOWN LIMITATION: Babylon's Inspector (scene.debugLayer) manipulates the
 * DOM directly (creates its own overlay elements) and needs `document`,
 * which doesn't exist inside a worker. DebugTools.EnableInspectorToggle
 * (from ../../game/DebugTools) is NOT called here for that reason - see
 * docs/THREADING_ARCHITECTURE.md "Dev tooling" for the options if you want
 * it back (the practical one: keep a non-worker fallback render path for
 * `pnpm dev`, and only use the worker split in real builds).
 */
export class RenderScene {
	private readonly _engine: Engine;
	private readonly _scene: Scene;

	public readonly AssetLoader: AssetLoader;

	public constructor(canvas: OffscreenCanvas, width: number, height: number, devicePixelRatio: number) {
		// Must happen before the Engine reads the canvas size: OffscreenCanvas keeps its 300x150 default otherwise.
		canvas.width = Math.max(1, Math.round(width * devicePixelRatio));
		canvas.height = Math.max(1, Math.round(height * devicePixelRatio));

		this._engine = new Engine(canvas as unknown as HTMLCanvasElement, true, undefined, true);
		this._scene = new Scene(this._engine);
		this.AssetLoader = new AssetLoader(this._scene);

		// Placeholder scene, ported as-is from the old Game.ts - swap for real
		// camera/lighting setup once GameLogicWorker is driving real entities.
		const camera = new ArcRotateCamera("Camera", -Math.PI / 2, Math.PI / 3, 15, new Vector3(0, 1, 0), this._scene);
		// No canvas.attachControl(): pointer input is captured on the main thread
		// (see DomInputBridge) and forwarded through GameLogicWorker instead, so
		// two things aren't fighting over the same pointer events.
		void camera;

		new HemisphericLight("light1", new Vector3(1, 1, 0), this._scene);
	}

	public get Scene(): Scene {
		return this._scene;
	}

	public RunRenderLoop(): void {
		this._engine.runRenderLoop(() => this._scene.render());
	}

	public Resize(width: number, height: number, devicePixelRatio: number): void {
		const canvas = this._engine.getRenderingCanvas();
		if (canvas) {
			canvas.width = Math.round(width * devicePixelRatio);
			canvas.height = Math.round(height * devicePixelRatio);
		}
		this._engine.resize();
	}
}
