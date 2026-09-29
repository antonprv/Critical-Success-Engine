// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// SUPERSEDED: App.ts no longer boots this class - it boots
// workers/Orchestrator.ts instead, which runs the engine split across
// render/physics/gamelogic/audio workers (see docs/THREADING_ARCHITECTURE.md).
// This file is kept only as a reference for the single-thread scene setup
// that RenderWorker.ts's init() now ports piece by piece; it is not part of
// the build's entry graph anymore and can be deleted once nothing in
// RenderWorker.ts/GameLogicWorker.ts still needs to be cross-checked
// against it.

import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, MeshBuilder } from "@babylonjs/core";
import "@babylonjs/loaders";

import { AssetLoader } from "./AssetLoader";

export interface GameLoadProgress {
	/** 0..1 while background assets are still streaming in. */
	backgroundFraction: number;
}

export class Game {
	private readonly _engine: Engine;
	private readonly _scene: Scene;
	public readonly AssetLoader: AssetLoader;

	public constructor(canvas: HTMLCanvasElement) {
		this._engine = new Engine(canvas, true);
		this._scene = new Scene(this._engine);
		this.AssetLoader = new AssetLoader(this._scene);

		const camera = new ArcRotateCamera(
			"Camera",
			Math.PI / 2,
			Math.PI / 2,
			3,
			Vector3.Zero(),
			this._scene
		);
		camera.attachControl(canvas, true);

		new HemisphericLight("light1", new Vector3(1, 1, 0), this._scene);

		// Placeholder "critical" content - swap for AssetLoader.AddMesh(...)
		// calls once there are real models to load first.
		MeshBuilder.CreateSphere("sphere", { diameter: 1 }, this._scene);

		window.addEventListener("resize", () => this._engine.resize());
	}

	/** Resolves once whatever was queued as "critical" is ready to show. */
	public async Start(onBackgroundProgress?: (progress: GameLoadProgress) => void): Promise<void> {
		await this.AssetLoader.LoadCriticalAsync();

		this._engine.runRenderLoop(() => this._scene.render());

		// Everything else streams in without blocking the render loop.
		this.AssetLoader.OnBackgroundProgress = (loaded, total) => {
			onBackgroundProgress?.({ backgroundFraction: total > 0 ? loaded / total : 1 });
		};
		this.AssetLoader.LoadBackgroundInBackground();

		if (__DEV__) {
			const { EnableInspectorToggle } = await import("./DebugTools");
			EnableInspectorToggle(this._scene);
		}
	}
}
