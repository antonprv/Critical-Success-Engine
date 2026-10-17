// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** Something to stop: a subscription, a link. Disposing twice is harmless. */
export interface Disposable {
	Dispose(): void;
}

type Next<T> = ( value: T ) => void;
type Fail = ( error: unknown ) => void;
type Producer<T> = ( next: Next<T>, error: Fail ) => () => void;

/** A subscription that runs its teardown once. */
export class Subscription implements Disposable {
	private _teardown: ( () => void ) | null;

	public constructor( teardown: () => void ) {
		this._teardown = teardown;
	}

	public get Disposed(): boolean {
		return this._teardown === null;
	}

	public Dispose(): void {
		const teardown = this._teardown;
		this._teardown = null;
		teardown?.();
	}
}

const Rethrow: Fail = ( error ) => {
	throw error;
};

/**
 * A stream of values in the manner of R3 (Cysharp's Rx for games): operators
 * build a chain of plain functions on Subscribe - no subjects, no schedulers,
 * nothing allocated per value. Values arrive synchronously.
 */
export class Observable<T> {
	private readonly _produce: Producer<T>;

	private constructor( produce: Producer<T> ) {
		this._produce = produce;
	}

	/**
	 * Values from any source: `subscribe(next)` starts it and returns what
	 * stops it.
	 */
	public static From<T>(
		subscribe: ( next: Next<T> ) => () => void,
	): Observable<T> {
		return new Observable<T>( ( next ) => subscribe( next ) );
	}

	/** Every value of every source, as they come. */
	public static Merge<T>( ...sources: Observable<T>[] ): Observable<T> {
		return new Observable<T>( ( next, error ) => {
			const teardowns = sources.map(
				( source ) => source._produce( next, error ),
			);

			return () => teardowns.forEach( ( teardown ) => teardown() );
		} );
	}

	/**
	 * Starts receiving. An exception in an operator or in `next` goes to
	 * `error`, or is thrown when there is none.
	 */
	public Subscribe( next: Next<T>, error: Fail = Rethrow ): Subscription {
		const guarded: Next<T> = ( value ) => {
			try {
				next( value );
			}
			catch ( e ) {
				error( e );
			}
		};

		return new Subscription( this._produce( guarded, error ) );
	}

	public Where( predicate: ( value: T ) => boolean ): Observable<T> {
		return this.Pipe( ( value, next ) => {
			if ( predicate( value ) ) {
				next( value );
			}
		} );
	}

	public Select<R>( selector: ( value: T ) => R ): Observable<R> {
		return this.Pipe<R>( ( value, next ) => next( selector( value ) ) );
	}

	/** Drops values equal (Object.is) to the one before. */
	public DistinctUntilChanged(): Observable<T> {
		return new Observable<T>( ( next, error ) => {
			let has = false;
			let last: T | undefined;

			return this.Pipe<T>( ( value, emit ) => {
				if ( !has || !Object.is( value, last ) ) {
					has = true;
					last = value;
					emit( value );
				}
			} )._produce( next, error );
		} );
	}

	public Skip( count: number ): Observable<T> {
		return new Observable<T>( ( next, error ) => {
			let skipped = 0;

			return this._produce( ( value ) => {
				if ( skipped < count ) {
					skipped++;
				}
				else {
					next( value );
				}
			}, error );
		} );
	}

	/** The first `count` values, then lets go of the source. */
	public Take( count: number ): Observable<T> {
		return new Observable<T>( ( next, error ) => {
			let taken = 0;
			let teardown: ( () => void ) | null = null;
			let ended = count <= 0;

			const end = () => {
				ended = true;
				teardown?.();
				teardown = null;
			};

			if ( ended ) {
				return () => {
				};
			}
			const stop = this._produce( ( value ) => {
				if ( ended ) {
					return;
				}
				taken++;
				next( value );
				if ( taken >= count ) {
					end();
				}
			}, error );

			if ( ended ) {
				// the source delivered `count` values while subscribing
				stop();
			}
			else {
				teardown = stop;
			}
			return end;
		} );
	}

	/**
	 * An operator: `step` gets each value and the next stage; exceptions go to
	 * `error`.
	 */
	private Pipe<R>( step: ( value: T, next: Next<R> ) => void ): Observable<
		R
	> {
		return new Observable<R>(
			( next, error ) => this._produce( ( value ) => {
				try {
					step( value, next );
				}
				catch ( e ) {
					error( e );
				}
			}, error ),
		);
	}
}
