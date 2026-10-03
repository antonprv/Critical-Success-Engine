// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { RegisterGameScenes } from "../Game/GameScenes";
import { Logger } from "../Logging/Logger";
import { GameLogicRuntime } from "../Engine/Runtime/GameLogicRuntime";
import { SceneRegistry } from "../Engine/Scenes/SceneRegistry";
import type { MainToGameLogicMessage } from "./Protocol/GameLogicProtocol";

/**
 * Thin shell: receives the four ports from the main thread, hands them to GameLogicRuntime (which is where everything
 * interesting lives, and which is testable without a worker), and forwards input events.
 */

// Own static buffer per realm - App.ts's timer doesn't flush this one.
Logger.SetupAutoFlush();

const registry = new SceneRegistry();
RegisterGameScenes(registry);

let runtime: GameLogicRuntime | null = null;

self.onmessage = (event: MessageEvent<MainToGameLogicMessage>) => {
	const message = event.data;
	if (message.type === "init") {
		runtime = new GameLogicRuntime(
			{ render: message.renderPort, physics: message.physicsPort, audio: message.audioPort, ui: message.uiPort },
			registry
		);
		void runtime.Boot().catch((error) => Logger.LogException(error, "[GameLogicWorker] boot failed:"));
	} else {
		runtime?.HandleMainMessage(message);
	}
};
