// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { DataStream } from "./DataStream.ts";
import type { TagLike } from "./DataTag.ts";
import {
	Observable,
	type Disposable,
	type Subscription,
} from "./Observable.ts";

/**
 * A value that says when it changes (R3's ReactiveProperty): a subscriber gets
 * the current value at once, then every change; setting an equal value
 * (Object.is) is not a change. `PublishTo` puts the changes on a DataStream tag
 * too, so a HUD, a save system or a C# script can follow it without a
 * reference to its owner.
 */
export class ReactiveProperty<T> implements Disposable {
	private _value: T;

	private readonly _handlers = new Set<( value: T ) => void>();

	private _publish: ( ( value: T ) => void ) | null = null;

	public constructor( value: T ) {
		this._value = value;
	}

	public get Value(): T {
		return this._value;
	}

	public set Value( value: T ) {
		if ( Object.is( value, this._value ) ) {
			return;
		}
		this._value = value;
		for ( const handler of [...this._handlers] ) {
			handler( value );
		}
		this._publish?.( value );
	}

	public Subscribe( handler: ( value: T ) => void ): Subscription {
		return this.Observe().Subscribe( handler );
	}

	public Observe(): Observable<T> {
		return Observable.From<T>( ( next ) => {
			this._handlers.add( next );
			next( this._value );
			return () => this._handlers.delete( next );
		} );
	}

	/** Publishes every change on `tag` of `stream`; returns this. */
	public PublishTo( stream: DataStream, tag: TagLike<T> ): this {
		this._publish = ( value ) => stream.Publish( tag, value );
		return this;
	}

	/** Stops publishing and drops the subscribers. */
	public Dispose(): void {
		this._publish = null;
		this._handlers.clear();
	}
}
