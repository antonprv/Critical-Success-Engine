// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** Event name -> argument list. */
export type EventMap = Record<string, unknown[]>;

type AnyHandler = (...args: unknown[]) => void;

/** Typed publish/subscribe. Every toolkit controller exposes one as `Events`. */
export class EventHub<E extends EventMap> {
	private readonly _handlers = new Map<keyof E, AnyHandler[]>();

	/** Subscribes and returns the function that unsubscribes. */
	public On<K extends keyof E>(event: K, handler: (...args: E[K]) => void): () => void {
		const stored = handler as unknown as AnyHandler;
		const list = this._handlers.get(event) ?? [];
		list.push(stored);
		this._handlers.set(event, list);
		return () => {
			const current = this._handlers.get(event)!;
			const index = current.indexOf(stored);
			if (index >= 0) current.splice(index, 1);
		};
	}

	public Once<K extends keyof E>(event: K, handler: (...args: E[K]) => void): () => void {
		const off = this.On(event, (...args) => {
			off();
			handler(...args);
		});
		return off;
	}

	public Emit<K extends keyof E>(event: K, ...args: E[K]): void {
		const list = this._handlers.get(event);
		if (!list) return;
		for (const handler of [...list]) handler(...args);
	}

	public ListenerCount(event: keyof E): number {
		return this._handlers.get(event)?.length ?? 0;
	}

	public Clear(): void {
		this._handlers.clear();
	}
}

/** Passed to "-ing" events (closing, selecting...): a subscriber may call Cancel() to stop the action. */
export class CancelableEvent {
	private _canceled = false;

	public get Canceled(): boolean { return this._canceled; }

	public Cancel(): void {
		this._canceled = true;
	}
}
