// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { DataAssets } from "../Engine/Data/DataAsset";
import type EngineModule from "../Engine/EngineModule";
import { ModuleManager } from "../Engine/Modules/ModuleManager";
import { InitEngine } from "../Engine/Modules/Plugins";
import { IndexedDbBackend, SettingsStorage } from "../Engine/Storage/SettingsStorage";
import { GameLogicRuntime } from "../Engine/Runtime/GameLogicRuntime";
import { Logger } from "../Logging/Logger";
import { EngineModules, GameProject, InstalledPlugins } from "../Project";
import type { MainToGameLogicMessage } from "./Protocol/GameLogicProtocol";
import { GameLogicMsg } from "./Common/CommonEnums";

/**
 * Thin shell: starts this thread's modules (the engine, then the project with the game as its primary module), receives
 * the four ports from the main thread, hands them to GameLogicRuntime once the modules are up, and forwards messages.
 */

// Own static buffer per realm - App.ts's timer doesn't flush this one.
Logger.SetupAutoFlush();

const modules = ModuleManager.Get();
for (const module of EngineModules) modules.Register(module);
// What the player chose (settings, rebound controls), kept between sessions: IndexedDB, one database per project.
const storage = new SettingsStorage(new IndexedDbBackend(`cse:${GameProject.Name}`));
const started = Promise.all([InitEngine(GameProject, InstalledPlugins, modules), storage.Open()]).then(([{ Errors, Failures }]) => {
	for (const error of Errors) Logger.LogError(`[GameLogicWorker] ${error}`);
	for (const failure of Failures) Logger.LogError(`[GameLogicWorker] Module "${failure.Name}" failed to load: ${failure.Reason}`);
	if (storage.Problem) Logger.LogWarning(`[GameLogicWorker] The player's settings are kept in memory only (${storage.Problem})`);
	return modules.GetModuleChecked<EngineModule>("Engine");
});

let runtime: GameLogicRuntime | null = null;
/** Messages that arrive after Init, while the modules are still starting: delivered in order once the runtime exists. */
let waiting: MainToGameLogicMessage[] | null = null;

self.onmessage = (event: MessageEvent<MainToGameLogicMessage>) => {
	const message = event.data;
	if (message.type === GameLogicMsg.Init) {
		waiting = [];
		void started.then(async (engine) => {
			// The project's data assets sit next to the page: fetch them all before the game starts. One that can't be
			// read is logged by name (and names itself again when the game asks for it).
			const base = message.baseUrl;
			const urls = Object.fromEntries(Object.entries(engine.ProjectData).map(([id, url]) => [id, base ? new URL(url, base).href : url]));
			const data = new DataAssets(urls, async (url) => {
				const response = await fetch(url);
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return response.text();
			});
			await data.Preload().catch((error: Error) => Logger.LogError(`[GameLogicWorker] ${error.message}`));
			runtime = new GameLogicRuntime({ render: message.renderPort, physics: message.physicsPort, audio: message.audioPort, ui: message.uiPort }, engine.Scenes, engine.Channels, engine.ProjectInput, storage, data);
			for (const queued of waiting!.splice(0)) runtime.HandleMainMessage(queued);
			return runtime.Boot();
		}).catch((error) => Logger.LogException(error, "[GameLogicWorker] boot failed:"));
	} else if (runtime) {
		runtime.HandleMainMessage(message);
	} else {
		waiting?.push(message);
	}
};
