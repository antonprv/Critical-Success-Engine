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

    // First network/parse hit for Babylon happens here, after the
    // loading screen is already painted.
    const { Game } = await import("./game/Game");

    setLoadingLabel("Loading level…");
    const game = new Game(canvas);

    // Resolves once "critical" assets are ready — game is playable now,
    // even though background assets may still be streaming in.
    await game.start((progress) => {
        setLoadingLabel("Loading extra content…");
        setLoadingFraction(progress.backgroundFraction);
    });

    hideLoadingScreen();
}

boot().catch((error) => {
    console.error("Failed to start game", error);
    setLoadingLabel("Failed to load. Please refresh.");
});
