// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Task, TaskCompletionSource, TaskStatus } from "@cse/task";

/**
 * Round-trip markers over an ordered MessagePort: post `{ token }`, the other
 * side echoes it back after processing everything that was queued before it.
 * Because a port is FIFO, once the ack is here every earlier command has been
 * applied - that is how scene loading knows the physics/render worlds are
 * really clean before it spawns anything.
 */
export class SyncTracker {
	private _nextToken = 1;

	private readonly _waiting = new Map<number, TaskCompletionSource>();

	public Begin( send: ( token: number ) => void ): Task {
		const token = this._nextToken++;
		const source = new TaskCompletionSource();
		this._waiting.set( token, source );
		send( token );
		return source.Task;
	}

	public Acknowledge( token: number ): void {
		this._waiting.get( token )?.TrySetResult();
		this._waiting.delete( token );
	}
}

/**
 * Resolves with `undefined` instead of hanging forever when the other side
 * never answers (e.g. wasm failed to load).
 */
export function WithTimeout(
	task: PromiseLike<void>,
	milliseconds: number,
): Task<boolean> {
	const source = new TaskCompletionSource<boolean>();
	const timer = setTimeout(
		() => source.TrySetResult( false ),
		milliseconds,
	);

	Task.From( task ).OnCompleted( ( done ) => {
		if ( done.Status === TaskStatus.Succeeded ) {
			clearTimeout( timer );
			source.TrySetResult( true );
		}
	} );
	return source.Task;
}
