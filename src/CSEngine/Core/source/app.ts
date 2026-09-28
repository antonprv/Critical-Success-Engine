// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// This file intentionally has NO static import of @babylonjs/*.
// That keeps the entry chunk tiny (a few KB) so it parses and runs
// instantly; the heavy engine is fetched via import() below, while the
// loading screen is already visible and its own progress is animating.

import { LoadingScreen } from "./LoadingScreen";
import { Logger } from "./Logging/Logger";

// Main-thread only - flushes buffered logs to Tools/LogServer.mjs on a timer and
// on tab close (no-op off localhost). See Logger.ts.
Logger.SetupAutoFlush();

const canvas = document.createElement("canvas");
canvas.style.width = "100%";
canvas.style.height = "100%";
canvas.id = "gameCanvas";
document.body.appendChild(canvas);

const loadingScreen = new LoadingScreen();

async function Boot(): Promise<void> {
	loadingScreen.SetLabel("Loading engine…");

	// Babylon itself now only ever gets parsed inside RenderWorker, so this
	// dynamic import is just for Orchestrator's own (tiny) module graph -
	// the actual Babylon/physics-wasm network+parse cost happens off this
	// thread entirely once the workers spin up below.
	const { Orchestrator } = await import("./Workers/Orchestrator");

	loadingScreen.SetLabel("Starting workers…");
	new Orchestrator(canvas, __DEV__);

	// TODO: this no longer tracks AssetLoader's real background-loading
	// progress the way the old single-thread Game.ts did, because
	// AssetLoader now runs inside RenderWorker (see workers/render/RenderScene.ts).
	// Wire a "loading-progress" message from RenderWorker up through
	// GameLogicWorker -> Orchestrator -> here (mirroring how "ready" already
	// travels) if you want the progress bar back; for now the loading
	// screen just hides once the workers have been told to start.
	loadingScreen.SetFraction(1);
	loadingScreen.Hide();
}

Boot().catch((error) => {
	Logger.LogException(error);
	loadingScreen.SetLabel("Failed to load. Please refresh.");
});
