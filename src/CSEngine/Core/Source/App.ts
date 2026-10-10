// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// This file intentionally has NO static import of @babylonjs/*. The entry chunk only carries Vue + Quasar (the UI that
// shows the loading screen); the heavy engine lives in workers, which fetch Babylon / the physics wasm themselves,
// off this thread, while the loading overlay is already visible.

import type EngineModule from "./Engine/EngineModule";
import { ModuleManager, ModuleThread } from "./Engine/Modules/ModuleManager";
import { InitEngine } from "./Engine/Modules/Plugins";
import { EngineModules, GameProject, InstalledPlugins } from "./Project";
import { CreateUi } from "./Ui/CreateUi";
import { LinkPageUi } from "./Engine/Core/PageUi";
import { GameTitle } from "./Ui/Branding";
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
// The page's menu and loading screen, for the plugin that draws them (the UI plugin, as UI documents).
LinkPageUi(store, GameTitle);
// Keep the player's settings as long as the browser allows: ask for persistent storage (best effort, no headers needed;
// only the page may ask). Safari still clears a site's storage after 7 days of use without visiting it.
void navigator.storage?.persist?.().then((granted) => Logger.LogInfo(`[App] Persistent storage ${granted ? "granted" : "not granted"}`), () => undefined);
CreateUi(store, uiMount);
document.getElementById("boot-splash")?.remove();

async function Boot(): Promise<void> {
	store.State.loading.label = "Starting workers…";
	store.State.loading.fraction = 0.02;

	// The page is a thread of its own: its modules (the engine, plugins' page halves such as the UI host) start here.
	const modules = ModuleManager.Initialize({ Thread: ModuleThread.Main });
	for (const module of EngineModules) modules.Register(module);
	const { Errors, Failures } = await InitEngine(GameProject, InstalledPlugins, modules);
	for (const error of Errors) Logger.LogError(`[App] ${error}`);
	for (const failure of Failures) Logger.LogError(`[App] Module "${failure.Name}" failed to load: ${failure.Reason}`);

	// Orchestrator's own module graph is tiny; the real network+parse cost happens inside the workers.
	const { Orchestrator } = await import("./Workers/Orchestrator");
	new Orchestrator(canvas, __DEV__, store, modules.GetModuleChecked<EngineModule>("Engine").Channels);

	// From here on the loading screen is driven by UiWorker (scene loading progress), not by this file.
}

Boot().catch((error) => {
	Logger.LogException(error);
	store.State.loading.label = "Failed to start. Please refresh.";
});
