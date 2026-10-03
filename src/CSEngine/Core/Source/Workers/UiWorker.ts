// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../Logging/Logger";
import { UiController } from "./Ui/UiController";
import type { GameLogicToUiMessage, MainToUiMessage, UiToGameLogicMessage, UiToMainMessage } from "./Protocol/UiProtocol";

// Own static buffer per realm - App.ts's timer doesn't flush this one.
Logger.SetupAutoFlush();

// lib is "dom" only here (no "webworker"), so `self` is typed as Window and its postMessage overload wants a
// targetOrigin - narrow to the worker signature we actually have at runtime.
const mainThread = self as unknown as { postMessage(message: UiToMainMessage): void; };

let controller: UiController | null = null;

self.onmessage = (event: MessageEvent<MainToUiMessage>) => {
	const message = event.data;
	if (message.type === "init") {
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
