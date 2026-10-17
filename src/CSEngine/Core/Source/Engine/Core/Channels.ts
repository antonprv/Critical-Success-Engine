// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { MessagePackReader, MessagePackWriter } from "@cse/datastream";

/**
 * Named message channels between this thread and the other side (the game logic
 * worker and the main thread): plugins talk over them without the engine
 * knowing their messages. Posts made before the thread is connected wait.
 *
 * Across threads (ConnectBatched) the messages go in batches: everything
 * posted in one synchronous run (a frame's scripts, a click's handlers) is
 * one MessagePack buffer, one postMessage with the buffer transferred.
 * Payloads are plain data.
 */
export class ChannelHub {
	private _send: ( ( channel: string, payload: unknown ) => void )
		| null = null;

	private _sendBatch: ( ( batch: Uint8Array ) => void ) | null = null;

	private readonly _batch = new MessagePackWriter();

	private _batchCount = 0;

	private _flushScheduled = false;

	private readonly _waiting: [string, unknown][] = [];

	private readonly _handlers = new Map<
		string,
		Set<( payload: unknown ) => void>
	>();

	public get Connected(): boolean {
		return this._send !== null || this._sendBatch !== null;
	}

	/**
	 * Connects a transport of single messages (the same thread, tests);
	 * anything posted before goes out now, in order.
	 */
	public Connect(
		send: ( channel: string, payload: unknown ) => void,
	): void {
		this._send = send;
		for ( const [channel, payload] of this._waiting.splice( 0 ) ) {
			send( channel, payload );
		}
	}

	/**
	 * Connects a transport of batches (another thread); anything posted before
	 * goes out with the first batch.
	 */
	public ConnectBatched( send: ( batch: Uint8Array ) => void ): void {
		this._sendBatch = send;
		for ( const [channel, payload] of this._waiting.splice( 0 ) ) {
			this.Add( channel, payload );
		}
	}

	public Post( channel: string, payload: unknown ): void {
		if ( this._send ) {
			this._send( channel, payload );
		}
		else if ( this._sendBatch ) {
			this.Add( channel, payload );
		}
		else {
			this._waiting.push( [channel, payload] );
		}
	}

	/** Sends the batch so far now (the end of a frame). */
	public Flush(): void {
		if ( this._batchCount === 0 ) {
			return;
		}
		const body = this._batch.Bytes;
		const batch = new MessagePackWriter( body.length + 5 );
		batch.WriteArrayHeader( this._batchCount );
		batch.WriteRaw( body );
		this._batch.Reset();
		this._batchCount = 0;
		this._sendBatch!( batch.Bytes.slice() );
	}

	/** Subscribes to a channel; returns the unsubscribe function. */
	public On(
		channel: string,
		handler: ( payload: unknown ) => void,
	): () => void {
		const handlers = this._handlers.get( channel ) ?? new Set();
		handlers.add( handler );
		this._handlers.set( channel, handlers );
		return () => handlers.delete( handler );
	}

	/** Called by the engine with what arrived from the other side. */
	public Deliver( channel: string, payload: unknown ): void {
		for ( const handler of [...( this._handlers.get( channel ) ?? [] )] ) {
			handler( payload );
		}
	}

	/** Called by the engine with a batch from the other side. */
	public Receive( batch: Uint8Array ): void {
		const reader = new MessagePackReader( batch );
		const count = reader.ReadArrayHeader();

		for ( let i = 0; i < count; i++ ) {
			reader.ReadArrayHeader();
			const channel = reader.ReadString();
			this.Deliver( channel, reader.Read() );
		}
	}

	private Add( channel: string, payload: unknown ): void {
		this._batch.WriteArrayHeader( 2 );
		this._batch.WriteString( channel );
		this._batch.Write( payload );
		this._batchCount++;
		if ( !this._flushScheduled ) {
			this._flushScheduled = true;
			queueMicrotask( () => {
				this._flushScheduled = false;
				this.Flush();
			} );
		}
	}
}
