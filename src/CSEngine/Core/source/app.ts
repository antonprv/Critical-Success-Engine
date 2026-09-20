// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// This file intentionally has NO static import of @babylonjs/*.
// That keeps the entry chunk tiny (a few KB) so it parses and runs
// instantly; the heavy engine is fetched via import() below, while the
// loading screen is already visible and its own progress is animating.

const canvas = document.createElement("canvas");
canvas.style.width = "100%";
canvas.style.height = "100%";
canvas.id = "gameCanvas";
document.body.appendChild(canvas);

const loadingEl = document.getElementById("loading");
const loadingBarEl = document.getElementById("loading-bar");

function setLoadingLabel(text: string): void {
    if (loadingEl) {
        loadingEl.querySelector(".loading-label")!.textContent = text;
    }
}

function setLoadingFraction(fraction: number): void {
    if (loadingBarEl) {
        loadingBarEl.style.width = `${Math.round(fraction * 100)}%`;
    }
}

function hideLoadingScreen(): void {
    loadingEl?.classList.add("loading-hidden");
    setTimeout(() => loadingEl?.remove(), 300);
}

async function boot(): Promise<void> {
    setLoadingLabel("Loading engine…");

    // Babylon itself now only ever gets parsed inside render.worker, so this
    // dynamic import is just for Orchestrator's own (tiny) module graph -
    // the actual Babylon/physics-wasm network+parse cost happens off this
    // thread entirely once the workers spin up below.
    const { Orchestrator } = await import("./workers/orchestrator");

    setLoadingLabel("Starting workers…");
    new Orchestrator(canvas, __DEV__);

    // TODO: this no longer tracks AssetLoader's real background-loading
    // progress the way the old single-thread Game.ts did, because
    // AssetLoader now runs inside render.worker (see render.worker.ts).
    // Wire a "loading-progress" message from render.worker up through
    // gamelogic.worker -> orchestrator -> here (mirroring how "ready" already
    // travels) if you want the progress bar back; for now the loading
    // screen just hides once the workers have been told to start.
    setLoadingFraction(1);
    hideLoadingScreen();
}

boot().catch((error) => {
    console.error("Failed to start game", error);
    setLoadingLabel("Failed to load. Please refresh.");
});
