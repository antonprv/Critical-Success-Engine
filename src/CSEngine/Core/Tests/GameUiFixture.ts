// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ChannelHub } from "../Source/Engine/Core/Channels";
import { LoadingPhase, ModuleInterface, ModuleManager, ModuleThread, ModuleType } from "../Source/Engine/Modules/ModuleManager";

/**
 * The UI plugin's game-thread half, loaded for tests that run game code using GetGameUi(): its commands (what the page
 * would do) are collected in UiCommands.
 */
export const UiCommands: unknown[] = [];

class TestEngine extends ModuleInterface {
	public readonly Channels = new ChannelHub();
}

const modules = ModuleManager.Get();
if (!modules.QueryModule("UIGame")) {
	const descriptor = { Type: ModuleType.Runtime, LoadingPhase: LoadingPhase.Default, Thread: ModuleThread.Any };
	modules.Register({ ...descriptor, Name: "Engine", Load: async () => ({ default: TestEngine }) });
	modules.Register({ ...descriptor, Name: "UIGame", Dependencies: ["Engine"], Load: () => import("@cse/ui/game") });
	(await modules.LoadModuleChecked<TestEngine>("Engine")).Channels.Connect((_channel, payload) => UiCommands.push(payload));
	await modules.LoadModuleChecked("UIGame");
}
