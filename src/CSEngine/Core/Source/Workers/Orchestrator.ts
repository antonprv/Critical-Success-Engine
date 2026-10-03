// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { UiStore } from "../Ui/UiStore";
import { DomInputBridge } from "./OrchestratorUtils/DomInputBridge";
import { GameWorkers } from "./OrchestratorUtils/GameWorkers";
import { UiBridge } from "./OrchestratorUtils/UiBridge";

/** Composition root of the five workers. Holds no game state: gameplay belongs in GameLogicWorker. */
export class Orchestrator {
	private readonly _workers: GameWorkers;
	private readonly _inputBridge: DomInputBridge;
	private readonly _uiBridge: UiBridge;

	public constructor(canvas: HTMLCanvasElement, devMode: boolean, uiStore: UiStore) {
		this._workers = new GameWorkers(canvas, devMode);
		this._inputBridge = new DomInputBridge(this._workers, canvas);
		this._uiBridge = new UiBridge(this._workers, canvas, uiStore);
	}

	/** Call once on page teardown (SPA navigation away, hot-reload, etc). */
	public Dispose(): void {
		this._workers.Dispose();
	}
}
