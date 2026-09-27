// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { DomInputBridge } from "./OrchestratorUtils/DomInputBridge";
import { GameWorkers } from "./OrchestratorUtils/GameWorkers";

/**
 * Composition root for the four-worker engine. Holds no game state and runs
 * no simulation of its own - if you find yourself adding gameplay logic
 * here, it belongs in GameLogicWorker.ts instead. See GameWorkers for the
 * worker/channel wiring and DomInputBridge for the main-thread DOM side.
 */
export class Orchestrator {
	private readonly _workers: GameWorkers;
	private readonly _inputBridge: DomInputBridge;

	public constructor(canvas: HTMLCanvasElement, devMode: boolean) {
		this._workers = new GameWorkers(canvas, devMode);
		this._inputBridge = new DomInputBridge(this._workers, canvas);
	}

	/** Call once on page teardown (SPA navigation away, hot-reload, etc). */
	public Dispose(): void {
		this._workers.Dispose();
	}
}
