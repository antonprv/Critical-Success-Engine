// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../Logging/Logger";
import { UiController } from "./Ui/UiController";
import type { GameLogicToUiMessage, MainToUiMessage, UiToGameLogicMessage, UiToMainMessage } from "./Protocol/UiProtocol";
import { UiMsg } from "./Common/CommonEnums";
import { WorkerScope } from "./Common/WorkerScope";

// Own static buffer per realm - App.ts's timer doesn't flush this one.
Logger.SetupAutoFlush();

const mainThread = WorkerScope();

let controller: UiController | null = null;

self.onmessage = (event: MessageEvent<MainToUiMessage>) => {
	const message = event.data;
	if (message.type === UiMsg.Init) {
		const gameLogicPort = message.gameLogicPort;
		const created = new UiController(
			(m: UiToMainMessage) => mainThread.postMessage(m),
			(m: UiToGameLogicMessage) => gameLogicPort.postMessage(m)
		);
		controller = created;
		gameLogicPort.onmessage = (e: MessageEvent<GameLogicToUiMessage>) => created.OnGameLogicMessage(e.data);
	} else {
		controller?.OnMainMessage(message);
	}
};
