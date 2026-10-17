// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { DataStream, StreamLink } from "./DataStream.ts";

/**
 * The part of a MessagePort / Worker / DedicatedWorkerGlobalScope a link needs.
 */
export interface PortLike {
	postMessage( message: unknown, transfer: ArrayBuffer[] ): void;
	addEventListener(
		type: "message",
		listener: ( event: { data: unknown; } ) => void
	): void;
}

/**
 * A link over a worker boundary: each batch is posted with its buffer
 * transferred (no copy); anything on the port that isn't a batch is ignored,
 * so the port can carry other messages too.
 */
export function WorkerLink( port: PortLike ): StreamLink {
	return {
		Send: ( bytes ) => port.postMessage(
			bytes,
			[bytes.buffer as ArrayBuffer],
		),
		OnReceive: ( receive ) => port.addEventListener(
			"message",
			( event ) => {
				if ( event.data instanceof Uint8Array ) {
					receive( event.data );
				}
			},
		),
	};
}

/**
 * Joins two streams of the same thread directly (tests, or two halves of the
 * engine that should not know each other); `spy` sees every batch.
 */
export function LinkStreams(
	a: DataStream,
	b: DataStream,
	spy?: ( bytes: Uint8Array ) => void,
): void {
	// Connect hands over each side's receiver before anything can be sent.
	let toA!: ( bytes: Uint8Array ) => void;
	let toB!: ( bytes: Uint8Array ) => void;

	a.Connect( {
		Send: ( bytes ) => {
			spy?.( bytes );
			toB( bytes );
		},
		OnReceive: ( receive ) => {
			toA = receive;
		},
	} );
	b.Connect( {
		Send: ( bytes ) => {
			spy?.( bytes );
			toA( bytes );
		},
		OnReceive: ( receive ) => {
			toB = receive;
		},
	} );
}
