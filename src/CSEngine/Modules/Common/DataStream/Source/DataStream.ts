// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { DataTag, TagOf, type TagLike } from "./DataTag.ts";
import { MessagePackReader, MessagePackWriter } from "./MessagePack.ts";
import { Observable, Subscription } from "./Observable.ts";

type Handler = ( value: unknown ) => void;

/**
 * The other side of a stream: another worker, the main thread, or the .NET
 * runtime (C# scripts). Batches of MessagePack go both ways.
 */
export interface StreamLink {
	Send( bytes: Uint8Array ): void;
	/**
	 * Called once on connect with the function that takes the other side's
	 * batches.
	 */
	OnReceive( receive: ( bytes: Uint8Array ) => void ): void;
}

export interface DataStreamOptions {
	/** Where exceptions thrown by subscribers go (default: console.error). */
	OnError?: ( error: unknown ) => void;
	/** The starting size of the Post queue's ring buffer (it grows). */
	QueueCapacity?: number;
}

// What a batch entry says, as its first element.
const Announce = 0;
const Withdraw = 1;
const Message = 2;

/**
 * Subscribers of one tag: a dense array whose removed slots are null until the
 * delivery in progress ends.
 */
interface Listeners {
	Handlers: ( Handler | null )[];
	Live: number;
	Dirty: boolean;
}

/**
 * Tagged messages: anything publishes on a tag, anything subscribes to a tag,
 * and none of them knows the others (DataStream plan, after R3).
 *
 * - `Publish` delivers synchronously to the tag's subscribers, in subscription
 *   order; `Post` queues (a ring buffer) and `Flush` delivers the queue, once a
 *   frame.
 * - `Observe` gives an {@link Observable} with R3-style operators.
 * - `Connect` joins another stream (a worker, C#): a message crosses only to
 *   tags the other side subscribes to, encoded as MessagePack and sent in one
 *   batch per Flush. Values are plain data (numbers, strings, arrays, objects,
 *   bytes); C# sees them as its own types.
 */
export class DataStream {
	private readonly _listeners: ( Listeners | undefined )[] = [];

	private _delivering = 0;

	private readonly _dirty: Listeners[] = [];

	private readonly _onError: ( error: unknown ) => void;

	// The Post queue: a ring of (tag, value) pairs.
	private _queueTags: DataTag<unknown>[];

	private _queueValues: unknown[];

	private _head = 0;

	private _count = 0;

	// The link to the other side.
	private _link: StreamLink | null = null;

	private readonly _remote = new Set<number>();

	private readonly _out = new MessagePackWriter();

	private _outCount = 0;

	private readonly _batch = new MessagePackWriter();

	public constructor( options: DataStreamOptions = {} ) {
		this._onError = options.OnError
			?? ( ( error ) => console.error(
				"DataStream subscriber failed:",
				error,
			) );
		const capacity = options.QueueCapacity ?? 64;
		this._queueTags = new Array<DataTag<unknown>>( capacity );
		this._queueValues = new Array<unknown>( capacity );
	}

	/** Messages posted and not flushed yet. */
	public get Pending(): number {
		return this._count;
	}

	public SubscriberCount( tag: TagLike<unknown> ): number {
		return this._listeners[TagOf( tag ).Id]?.Live ?? 0;
	}

	/**
	 * Delivers `value` now to the tag's subscribers (and, at the next Flush, to
	 * the other side's).
	 */
	public Publish<T>( tag: TagLike<T>, value: T ): void {
		const resolved = TagOf( tag );
		this.Deliver( resolved.Id, value );
		if ( this._remote.has( resolved.Id ) ) {
			this.Enqueue( Message, resolved.Name, value );
		}
	}

	/** Queues `value`; Flush delivers it, in order. */
	public Post<T>( tag: TagLike<T>, value: T ): void {
		if ( this._count === this._queueTags.length ) {
			this.GrowQueue();
		}
		const index = ( this._head + this._count ) % this._queueTags.length;
		this._queueTags[index] = TagOf( tag ) as DataTag<unknown>;
		this._queueValues[index] = value;
		this._count++;
	}

	/**
	 * Delivers the queue (messages posted meanwhile included) and sends the
	 * other side what it asked for.
	 */
	public Flush(): void {
		while ( this._count > 0 ) {
			const tag = this._queueTags[this._head]!;
			const value = this._queueValues[this._head];
			this._queueValues[this._head] = undefined;
			this._head = ( this._head + 1 ) % this._queueTags.length;
			this._count--;
			this.Publish( tag, value );
		}
		if ( this._link && this._outCount > 0 ) {
			this._batch.Reset();
			this._batch.WriteArrayHeader( this._outCount );
			this._batch.WriteRaw( this._out.Bytes );
			this._out.Reset();
			this._outCount = 0;
			this._link.Send( this._batch.Bytes.slice() );
		}
	}

	public Subscribe<T>(
		tag: TagLike<T>,
		handler: ( value: T ) => void,
	): Subscription {
		const resolved = TagOf( tag );
		let listeners = this._listeners[resolved.Id];

		if ( !listeners ) {
			listeners = { Handlers: [], Live: 0, Dirty: false };
			this._listeners[resolved.Id] = listeners;
		}
		const stored = handler as Handler;
		listeners.Handlers.push( stored );
		listeners.Live++;
		if ( listeners.Live === 1 && this._link ) {
			this.Enqueue( Announce, resolved.Name );
		}

		// (a Subscription runs this once)
		return new Subscription( () => {
			const index = listeners.Handlers.indexOf( stored );
			listeners.Live--;
			if ( this._delivering > 0 ) {
				listeners.Handlers[index] = null;
				if ( !listeners.Dirty ) {
					listeners.Dirty = true;
					this._dirty.push( listeners );
				}
			}
			else {
				listeners.Handlers.splice( index, 1 );
			}
			if ( listeners.Live === 0 && this._link ) {
				this.Enqueue( Withdraw, resolved.Name );
			}
		} );
	}

	/** The tag's messages as an Observable. */
	public Observe<T>( tag: TagLike<T> ): Observable<T> {
		return Observable.From<T>( ( next ) => {
			const subscription = this.Subscribe( tag, next );

			return () => subscription.Dispose();
		} );
	}

	/**
	 * Joins the other side: from now on it hears the tags it subscribes to, and
	 * this stream the ones it does.
	 */
	public Connect( link: StreamLink ): void {
		this._link = link;
		link.OnReceive( ( bytes ) => this.Receive( bytes ) );
		this._listeners.forEach( ( listeners, id ) => {
			if ( listeners && listeners.Live > 0 ) {
				this.Enqueue( Announce, DataTag.ById( id ).Name );
			}
		} );
	}

	public Disconnect(): void {
		this._link = null;
		this._remote.clear();
		this._out.Reset();
		this._outCount = 0;
	}

	/** Drops every subscriber and every queued message (the link stays). */
	public Clear(): void {
		this._listeners.length = 0;
		this._queueValues.fill( undefined );
		this._head = 0;
		this._count = 0;
	}

	private Deliver( id: number, value: unknown ): void {
		const listeners = this._listeners[id];

		if ( !listeners || listeners.Live === 0 ) {
			return;
		}
		const handlers = listeners.Handlers;
		const length = handlers.length;
		this._delivering++;
		try {
			for ( let i = 0; i < length; i++ ) {
				const handler = handlers[i];

				if ( handler ) {
					try {
						handler( value );
					}
					catch ( error ) {
						this._onError( error );
					}
				}
			}
		}
		finally {
			this._delivering--;
			if ( this._delivering === 0 && this._dirty.length > 0 ) {
				for ( const dirty of this._dirty.splice( 0 ) ) {
					dirty.Handlers = dirty.Handlers.filter(
						( handler ) => handler !== null,
					);
					dirty.Dirty = false;
				}
			}
		}
	}

	private Enqueue( kind: number, name: string, value?: unknown ): void {
		this._out.WriteArrayHeader( kind === Message ? 3 : 2 );
		this._out.WriteNumber( kind );
		this._out.WriteString( name );
		if ( kind === Message ) {
			this._out.Write( value );
		}
		this._outCount++;
	}

	private Receive( bytes: Uint8Array ): void {
		try {
			const reader = new MessagePackReader( bytes );
			const count = reader.ReadArrayHeader();

			for ( let i = 0; i < count; i++ ) {
				reader.ReadArrayHeader();
				const kind = reader.ReadNumber();
				const tag = TagOf( reader.ReadString() );

				if ( kind === Announce ) {
					this._remote.add( tag.Id );
				}
				else if ( kind === Withdraw ) {
					this._remote.delete( tag.Id );
				}
				else if ( kind === Message ) {
					// from the other side: delivered here, never sent back
					this.Deliver( tag.Id, reader.Read() );
				}
				else {
					throw new TypeError( `unknown entry kind ${ kind }` );
				}
			}
		}
		catch ( error ) {
			throw new Error(
				"DataStream: malformed batch from the other side "
					+ `(${ String( error ) })`,
			);
		}
	}

	private GrowQueue(): void {
		const capacity = this._queueTags.length * 2;
		const tags = new Array<DataTag<unknown>>( capacity );
		const values = new Array<unknown>( capacity );

		for ( let i = 0; i < this._count; i++ ) {
			const index = ( this._head + i ) % this._queueTags.length;
			tags[i] = this._queueTags[index]!;
			values[i] = this._queueValues[index];
		}
		this._queueTags = tags;
		this._queueValues = values;
		this._head = 0;
	}
}
