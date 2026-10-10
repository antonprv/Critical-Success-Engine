// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * Named message channels between this thread and the other side (the game logic worker and the main thread): plugins
 * talk over them without the engine knowing their messages. Posts made before the thread is connected wait.
 */
export class ChannelHub {
	private _send: ((channel: string, payload: unknown) => void) | null = null;
	private readonly _waiting: [string, unknown][] = [];
	private readonly _handlers = new Map<string, Set<(payload: unknown) => void>>();

	public get Connected(): boolean { return this._send !== null; }

	/** The engine connects the thread's transport; anything posted before goes out now, in order. */
	public Connect(send: (channel: string, payload: unknown) => void): void {
		this._send = send;
		for (const [channel, payload] of this._waiting.splice(0)) send(channel, payload);
	}

	public Post(channel: string, payload: unknown): void {
		if (this._send) this._send(channel, payload);
		else this._waiting.push([channel, payload]);
	}

	/** Subscribes to a channel; returns the unsubscribe function. */
	public On(channel: string, handler: (payload: unknown) => void): () => void {
		const handlers = this._handlers.get(channel) ?? new Set();
		handlers.add(handler);
		this._handlers.set(channel, handlers);
		return () => handlers.delete(handler);
	}

	/** Called by the engine with what arrived from the other side. */
	public Deliver(channel: string, payload: unknown): void {
		for (const handler of [...(this._handlers.get(channel) ?? [])]) handler(payload);
	}
}
