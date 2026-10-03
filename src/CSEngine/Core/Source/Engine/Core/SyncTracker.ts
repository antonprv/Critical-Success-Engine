// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * Round-trip markers over an ordered MessagePort: post `{ token }`, the other side echoes it back after processing
 * everything that was queued before it. Because a port is FIFO, once the ack is here every earlier command has been
 * applied - that is how scene loading knows the physics/render worlds are really clean before it spawns anything.
 */
export class SyncTracker {
	private _nextToken = 1;
	private readonly _waiting = new Map<number, () => void>();

	public Begin(send: (token: number) => void): Promise<void> {
		const token = this._nextToken++;
		const promise = new Promise<void>((resolve) => this._waiting.set(token, resolve));
		send(token);
		return promise;
	}

	public Acknowledge(token: number): void {
		this._waiting.get(token)?.();
		this._waiting.delete(token);
	}
}

/** Resolves with `undefined` instead of hanging forever when the other side never answers (e.g. wasm failed to load). */
export function WithTimeout(promise: Promise<void>, milliseconds: number): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const timer = setTimeout(() => resolve(false), milliseconds);
		void promise.then(() => {
			clearTimeout(timer);
			resolve(true);
		});
	});
}
