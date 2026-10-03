// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * The parts of a worker's global scope the engine uses. The project is typed against the DOM lib, where `self` is a
 * Window (whose postMessage wants a targetOrigin), so worker code reads `self` through this instead of casting it.
 * `addEventListener` and `OfflineAudioContext` are optional: not every realm has them.
 */
export interface WorkerGlobal {
	postMessage(message: unknown, transfer?: Transferable[]): void;
	addEventListener?(type: string, listener: () => void): void;
	OfflineAudioContext?: typeof OfflineAudioContext;
}

export function WorkerScope(): WorkerGlobal {
	return self as unknown as WorkerGlobal;
}
