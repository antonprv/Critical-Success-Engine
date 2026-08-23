// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, MeshBuilder } from "@babylonjs/core";
import "@babylonjs/loaders";

import { AssetLoader } from "./AssetLoader";

export interface GameLoadProgress {
    /** 0..1 while background assets are still streaming in. */
    backgroundFraction: number;
}

export class Game {
    private readonly engine: Engine;
    private readonly scene: Scene;
    public readonly assetLoader: AssetLoader;

    constructor(canvas: HTMLCanvasElement) {
        this.engine = new Engine(canvas, true);
        this.scene = new Scene(this.engine);
        this.assetLoader = new AssetLoader(this.scene);

        const camera = new ArcRotateCamera(
            "Camera",
            Math.PI / 2,
            Math.PI / 2,
            2,
            Vector3.Zero(),
            this.scene
        );
        camera.attachControl(canvas, true);

        new HemisphericLight("light1", new Vector3(1, 1, 0), this.scene);

        // Placeholder "critical" content - swap for AssetLoader.addMesh(...)
        // calls once there are real models to load first.
        MeshBuilder.CreateSphere("sphere", { diameter: 1 }, this.scene);

        window.addEventListener("resize", () => this.engine.resize());
    }

    /** Resolves once whatever was queued as "critical" is ready to show. */
    public async start(onBackgroundProgress?: (p: GameLoadProgress) => void): Promise<void> {
        await this.assetLoader.loadCriticalAsync();

        this.engine.runRenderLoop(() => this.scene.render());

        // Everything else streams in without blocking the render loop.
        this.assetLoader.onBackgroundProgress = (loaded, total) => {
            onBackgroundProgress?.({ backgroundFraction: total > 0 ? loaded / total : 1 });
        };
        this.assetLoader.loadBackgroundInBackground();

        if (__DEV__) {
            const { enableInspectorToggle } = await import("./DebugTools");
            enableInspectorToggle(this.scene);
        }
    }
}
