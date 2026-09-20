import { AssetsManager } from "@babylonjs/core/Misc/assetsManager";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Two-tier asset streaming.
 *
 * - "critical": whatever is needed to render the first playable frame
 *   (e.g. the player model, the first level chunk). Loaded with
 *   `loadCriticalAsync()`, which the caller awaits before hiding the
 *   loading screen.
 * - "background": everything else (later levels, ambience, extra
 *   skins). Kicked off with `loadBackgroundInBackground()` right after
 *   the game becomes playable; it never blocks the render loop, and
 *   `onProgress` lets you show a small non-blocking indicator for it.
 *
 * This intentionally wraps Babylon's own `AssetsManager` rather than
 * replacing it - two separate managers (one per tier) is enough to
 * get independent progress tracking and independent "useDefaultLoadingScreen"
 * behavior for each.
 */
export class AssetLoader {
    private readonly scene: Scene;
    private readonly critical: AssetsManager;
    private readonly background: AssetsManager;

    public onBackgroundProgress?: (loaded: number, total: number) => void;
    public onBackgroundIdle?: () => void;

    constructor(scene: Scene) {
        this.scene = scene;

        this.critical = new AssetsManager(scene);
        this.critical.useDefaultLoadingScreen = false;

        this.background = new AssetsManager(scene);
        this.background.useDefaultLoadingScreen = false;
        this.background.onProgress = (remaining, total) => {
            this.onBackgroundProgress?.(total - remaining, total);
        };
        this.background.onFinish = () => this.onBackgroundIdle?.();
    }

    /**
     * Registers a glTF/glb mesh task on the given tier. Callers add
     * tasks, then call loadCriticalAsync()/loadBackgroundInBackground()
     * once all tasks for that tier are registered.
     *
     * Example:
     *   assetLoader.addMesh("critical", "hero", "assets/models/", "hero.glb");
     *   assetLoader.addMesh("background", "level2", "assets/models/", "level2.glb");
     */
    public addMesh(
        priority: "critical" | "background",
        taskName: string,
        rootUrl: string,
        sceneFilename: string,
        onLoaded?: (meshes: import("@babylonjs/core/Meshes/abstractMesh").AbstractMesh[]) => void
    ): void {
        const manager = priority === "critical" ? this.critical : this.background;
        const task = manager.addMeshTask(taskName, "", rootUrl, sceneFilename);
        task.onSuccess = (t) => onLoaded?.(t.loadedMeshes);
        task.onError = (t, message, exception) =>
            console.error(`[AssetLoader] failed to load ${t.name}:`, message, exception);
    }

    /**
     * Registers a texture task on the given tier.
     */
    public addTexture(
        priority: "critical" | "background",
        taskName: string,
        url: string,
        onLoaded?: (texture: import("@babylonjs/core/Materials/Textures/texture").Texture) => void
    ): void {
        const manager = priority === "critical" ? this.critical : this.background;
        const task = manager.addTextureTask(taskName, url);
        task.onSuccess = (t) => onLoaded?.(t.texture);
        task.onError = (t, message, exception) =>
            console.error(`[AssetLoader] failed to load ${t.name}:`, message, exception);
    }

    /** Awaited before the loading screen is hidden — keep this list short. */
    public loadCriticalAsync(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.critical.onFinish = () => resolve();
            this.critical.onTaskError = (task) =>
                reject(new Error(`Critical asset failed: ${task.name}`));
            this.critical.load();
        });
    }

    /** Fire-and-forget — call once the game is already playable. */
    public loadBackgroundInBackground(): void {
        this.background.load();
    }
}
