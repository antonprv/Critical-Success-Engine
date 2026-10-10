// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ModuleInterface, ModuleManager } from "@cse/core/modules";
import { GameUi, type UiChannels } from "./GameUi";

export { GameUi, UiChannel } from "./GameUi";
export { LoadingScreen, type LoadingScreenParts } from "./LoadingScreen";

/** The UI plugin's game-thread module: it gives game scripts their GameUi (through GetGameUi). */
export default class GameUiModule extends ModuleInterface {
	public Ui!: GameUi;

	public override StartupModule(): void {
		this.Ui = new GameUi(ModuleManager.Get().GetModuleChecked<ModuleInterface & { Channels: UiChannels; }>("Engine").Channels);
	}
}

/** The game's UI: show documents by their manifest Id, change their widgets, hear their events. */
export function GetGameUi(): GameUi {
	return ModuleManager.Get().GetModuleChecked<GameUiModule>("UIGame").Ui;
}
