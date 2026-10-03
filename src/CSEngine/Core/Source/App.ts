// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// This file intentionally has NO static import of @babylonjs/*. The entry chunk only carries Vue + Quasar (the UI that
// shows the loading screen); the heavy engine lives in workers, which fetch Babylon / the physics wasm themselves,
// off this thread, while the loading overlay is already visible.

import { CreateUi } from "./Ui/CreateUi";
import { UiStore } from "./Ui/UiStore";
import { Logger } from "./Logging/Logger";

// Main-thread only - flushes buffered logs to Tools/LogServer.mjs on a timer and
// on tab close (no-op off localhost). See Logger.ts.
Logger.SetupAutoFlush();

const canvas = document.createElement("canvas");
canvas.style.width = "100%";
canvas.style.height = "100%";
canvas.style.display = "block";
canvas.style.outline = "none";
canvas.id = "gameCanvas";
document.body.appendChild(canvas);

const uiMount = document.createElement("div");
uiMount.id = "ui";
document.body.appendChild(uiMount);

// Vue + Quasar take over from the static first-paint splash in index.html.
const store = new UiStore();
CreateUi(store, uiMount);
document.getElementById("boot-splash")?.remove();

async function Boot(): Promise<void> {
	store.State.loading.label = "Starting workers…";
	store.State.loading.fraction = 0.02;

	// Orchestrator's own module graph is tiny; the real network+parse cost happens inside the workers.
	const { Orchestrator } = await import("./Workers/Orchestrator");
	new Orchestrator(canvas, __DEV__, store);

	// From here on the loading screen is driven by UiWorker (scene loading progress), not by this file.
}

Boot().catch((error) => {
	Logger.LogException(error);
	store.State.loading.label = "Failed to start. Please refresh.";
});
