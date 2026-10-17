// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Tasks: the engine's alternative to Promises, after Cysharp's UniTask. A Task
// is a Promise to everything that expects one (await, Promise.all, a function
// typed to return a Promise), and on top of that:
//  - its continuations run the moment it completes, synchronously: no
//    microtask hop, no Promise allocated per step (OnCompleted is ~7x cheaper
//    than Promise.then in V8; awaiting a Task costs what awaiting a Promise
//    does);
//  - its state, result and error can be read without awaiting;
//  - it can wait in frames and game time (the engine's PlayerLoop), not timers;
//  - it can be canceled (CancellationToken).

export const enum TaskStatus {
	Pending = 0,
	Succeeded = 1,
	Faulted = 2,
	Canceled = 3,
}

/** What a canceled task rejects with. */
export class OperationCanceledError extends Error {
	public constructor( message = "The operation was canceled" ) {
		super( message );
		this.name = "OperationCanceledError";
	}
}

type Continuation<T> = ( task: Task<T> ) => void;

function IsThenable( value: unknown ): value is PromiseLike<unknown> {
	return value !== null
		&& ( typeof value === "object" || typeof value === "function" )
		&& typeof ( value as { then?: unknown; } ).then === "function";
}

export class Task<T = void> implements Promise<T> {
	private _status = TaskStatus.Pending;

	private _value: T | undefined = undefined;

	private _error: unknown = undefined;

	// the first continuation needs no array (most tasks have one)
	private _first: Continuation<T> | null = null;

	private _rest: Continuation<T>[] | null = null;

	public get [Symbol.toStringTag](): string {
		return "Task";
	}

	public get Status(): TaskStatus {
		return this._status;
	}

	public get IsCompleted(): boolean {
		return this._status !== TaskStatus.Pending;
	}

	/**
	 * The value it succeeded with; throws its error if it failed, and if it is
	 * still pending.
	 */
	public get Result(): T {
		if ( this._status === TaskStatus.Succeeded ) {
			return this._value as T;
		}
		if ( this._status === TaskStatus.Pending ) {
			throw new Error( "The task has not completed" );
		}
		throw this._error;
	}

	/** Why it failed (or was canceled); undefined otherwise. */
	public get Error(): unknown {
		return this._error;
	}

	/**
	 * Runs `continuation` when it completes (now, if it has): synchronously,
	 * with the task.
	 */
	public OnCompleted( continuation: Continuation<T> ): void {
		if ( this._status !== TaskStatus.Pending ) {
			continuation( this );
		}
		else if ( !this._first ) {
			this._first = continuation;
		}
		else {
			( this._rest ??= [] ).push( continuation );
		}
	}

	public then<TResult1 = T, TResult2 = never>(
		onFulfilled?: ( ( value: T ) => TResult1 | PromiseLike<TResult1> )
			| null,
		// (any, as Promise's own: a handler may name the error's type)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		onRejected?: ( ( reason: any ) => TResult2 | PromiseLike<TResult2> )
			| null,
	): Task<TResult1 | TResult2> {
		const next = new Task<TResult1 | TResult2>();

		this.OnCompleted( ( task ) => {
			const handler = task._status === TaskStatus.Succeeded
				? onFulfilled
				: onRejected;

			if ( !handler ) {
				next._Settle( task._status, task._value, task._error );
				return;
			}
			try {
				next._Adopt(
					( handler as ( value: unknown ) => unknown )(
						task._status === TaskStatus.Succeeded
							? task._value
							: task._error,
					),
				);
			}
			catch ( error ) {
				next._Settle( TaskStatus.Faulted, undefined, error );
			}
		} );
		return next;
	}

	public catch<TResult = never>(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		onRejected?: ( ( reason: any ) => TResult | PromiseLike<TResult> )
			| null,
	): Task<T | TResult> {
		return this.then( undefined, onRejected );
	}

	/**
	 * Runs `onFinally` either way (awaiting what it returns); keeps the outcome
	 * unless it throws.
	 */
	public finally( onFinally?: ( () => void ) | null ): Task<T> {
		return this.then(
			( value ) => Task.From( onFinally?.() ).then( () => value ),
			( error ) => Task.From( onFinally?.() ).then( () => {
				throw error;
			} ),
		);
	}

	/**
	 * Completes it (once; later calls are ignored), running the continuations.
	 * The engine's sources call this (TaskCompletionSource); returns whether it
	 * did.
	 */
	public _Settle(
		status: TaskStatus,
		value: unknown,
		error: unknown,
	): boolean {
		if ( this._status !== TaskStatus.Pending ) {
			return false;
		}
		this._status = status;
		this._value = value as T;
		this._error = error;
		const first = this._first;
		const rest = this._rest;
		this._first = null;
		this._rest = null;
		first?.( this );
		if ( rest ) {
			for ( const continuation of rest ) {
				continuation( this );
			}
		}
		return true;
	}

	/** Completes it with a value, or with what a thenable settles to. */
	public _Adopt( value: unknown ): void {
		if ( !IsThenable( value ) ) {
			this._Settle( TaskStatus.Succeeded, value, undefined );
		}
		else if ( value instanceof Task ) {
			( value as Task<unknown> ).OnCompleted(
				( task ) => this._Settle(
					task._status,
					task._value,
					task._error,
				),
			);
		}
		else {
			value.then(
				( result ) => this._Settle(
					TaskStatus.Succeeded,
					result,
					undefined,
				),
				( error: unknown ) => this._Settle(
					TaskStatus.Faulted,
					undefined,
					error,
				),
			);
		}
	}

	//#region Making tasks

	public static FromResult<T>( value: T ): Task<T> {
		const task = new Task<T>();
		task._Settle( TaskStatus.Succeeded, value, undefined );
		return task;
	}

	public static FromError<T = never>( error: unknown ): Task<T> {
		const task = new Task<T>();
		task._Settle( TaskStatus.Faulted, undefined, error );
		return task;
	}

	public static FromCanceled<T = never>(): Task<T> {
		const task = new Task<T>();
		task._Settle(
			TaskStatus.Canceled,
			undefined,
			new OperationCanceledError(),
		);
		return task;
	}

	/** A completed task (shared: a completed task never changes). */
	public static readonly CompletedTask: Task = Task.FromResult<void>(
		undefined,
	);

	/**
	 * A task of a value, a Promise or any thenable; a Task is returned as it
	 * is.
	 */
	public static From<T>( value: T | PromiseLike<T> ): Task<T> {
		if ( value instanceof Task ) {
			return value as Task<T>;
		}
		const task = new Task<T>();
		task._Adopt( value );
		return task;
	}

	/** Every value, in order, once all succeed; the first failure fails it. */
	public static WhenAll<T extends readonly unknown[] | []>(
		items: T,
	): Task<{ -readonly [P in keyof T]: Awaited<T[P]> }>;
	public static WhenAll<T>( items: Iterable<T | PromiseLike<T>> ): Task<T[]>;
	public static WhenAll<T>( items: Iterable<T | PromiseLike<T>> ): Task<T[]> {
		const tasks = [...items].map( ( item ) => Task.From( item ) );
		const all = new Task<T[]>();
		const values = new Array<T>( tasks.length );
		let left = tasks.length;

		if ( left === 0 ) {
			all._Settle( TaskStatus.Succeeded, values, undefined );
		}
		tasks.forEach( ( task, index ) => task.OnCompleted( ( done ) => {
			if ( done._status !== TaskStatus.Succeeded ) {
				all._Settle( done._status, undefined, done._error );
				return;
			}
			values[index] = done._value as T;
			if ( --left === 0 ) {
				all._Settle( TaskStatus.Succeeded, values, undefined );
			}
		} ) );
		return all;
	}

	/** The outcome of the first to complete. */
	public static WhenAny<T>( items: Iterable<T | PromiseLike<T>> ): Task<T> {
		const any = new Task<T>();

		for ( const item of items ) {
			Task.From( item )
				.OnCompleted(
					( done ) => any._Settle(
						done._status,
						done._value,
						done._error,
					),
				);
		}
		return any;
	}

	/** Completes on the loop's next frame. */
	public static NextFrame(
		token: CancellationToken = CancellationToken.None,
		loop: PlayerLoop = PlayerLoop.Default,
	): Task {
		return loop.Wait( 1, 0, token );
	}

	/** Completes after `frames` of the loop's frames (0: now). */
	public static DelayFrames(
		frames: number,
		token: CancellationToken = CancellationToken.None,
		loop: PlayerLoop = PlayerLoop.Default,
	): Task {
		return loop.Wait( frames, 0, token );
	}

	/** Completes after `seconds` of the loop's (game) time (0: now). */
	public static Delay(
		seconds: number,
		token: CancellationToken = CancellationToken.None,
		loop: PlayerLoop = PlayerLoop.Default,
	): Task {
		return loop.Wait( 0, seconds, token );
	}

	//#endregion
}

/** Something to stop: a registration. Disposing twice is harmless. */
export interface Disposable {
	Dispose(): void;
}

/**
 * Asks an operation to stop; it says whether it was asked, and runs what
 * registered when it is.
 */
export class CancellationToken {
	/** A token never canceled. */
	public static readonly None = new CancellationToken();

	private _canceled = false;

	private readonly _callbacks = new Set<() => void>();

	public get IsCancellationRequested(): boolean {
		return this._canceled;
	}

	public ThrowIfCancellationRequested(): void {
		if ( this._canceled ) {
			throw new OperationCanceledError();
		}
	}

	/**
	 * Runs `callback` when it is canceled (now, if it is); Dispose to stop
	 * listening.
	 */
	public Register( callback: () => void ): Disposable {
		if ( this._canceled ) {
			callback();
			return { Dispose: () => {
			} };
		}
		this._callbacks.add( callback );
		return { Dispose: () => this._callbacks.delete( callback ) };
	}

	/** Called by its CancellationTokenSource. */
	public _Cancel(): void {
		if ( this._canceled ) {
			return;
		}
		this._canceled = true;
		const callbacks = [...this._callbacks];
		this._callbacks.clear();
		for ( const callback of callbacks ) {
			callback();
		}
	}
}

export class CancellationTokenSource {
	public readonly Token = new CancellationToken();

	public Cancel(): void {
		this.Token._Cancel();
	}
}

/**
 * Makes a task and completes it from outside (what
 * `new Promise( ( resolve, reject ) => ... )` does).
 */
export class TaskCompletionSource<T = void> {
	public readonly Task = new Task<T>();

	private readonly _registration: Disposable | null = null;

	/**
	 * A token that, when canceled, cancels the task (if it is still pending).
	 */
	public constructor( token: CancellationToken = CancellationToken.None ) {
		if ( token !== CancellationToken.None ) {
			this._registration = token.Register( () => this.TrySetCanceled() );
		}
	}

	public TrySetResult( value: T ): boolean {
		return this.Done(
			this.Task._Settle( TaskStatus.Succeeded, value, undefined ),
		);
	}

	public TrySetError( error: unknown ): boolean {
		return this.Done(
			this.Task._Settle( TaskStatus.Faulted, undefined, error ),
		);
	}

	public TrySetCanceled(): boolean {
		return this.Done(
			this.Task._Settle(
				TaskStatus.Canceled,
				undefined,
				new OperationCanceledError(),
			),
		);
	}

	private Done( settled: boolean ): boolean {
		if ( settled ) {
			this._registration?.Dispose();
		}
		return settled;
	}
}

interface Waiter {
	Frame: number;
	Time: number;
	Source: TaskCompletionSource;
}

/**
 * The engine's frame clock for tasks (UniTask's PlayerLoop): Tick( dt ) once a
 * rendered frame advances frames and game time and completes the waits that
 * are due. The game logic runtime ticks the default one.
 */
export class PlayerLoop {
	public static readonly Default = new PlayerLoop();

	private _frame = 0;

	private _time = 0;

	private _waiters: Waiter[] = [];

	/** Frames ticked so far. */
	public get Frame(): number {
		return this._frame;
	}

	/** Game seconds ticked so far. */
	public get Time(): number {
		return this._time;
	}

	/** Waits not completed yet. */
	public get Pending(): number {
		return this._waiters.reduce(
			( count, waiter ) => count + ( waiter.Source.Task.IsCompleted
				? 0
				: 1 ),
			0,
		);
	}

	public Tick( dt: number ): void {
		this._frame++;
		this._time += dt;
		// waits made by continuations below wait for the next tick
		const due = this._waiters;
		this._waiters = [];
		for ( const waiter of due ) {
			if ( waiter.Source.Task.IsCompleted ) {
				continue;
			}
			if ( this._frame >= waiter.Frame
				&& this._time >= waiter.Time - 1e-9 ) {
				waiter.Source.TrySetResult();
			}
			else {
				this._waiters.push( waiter );
			}
		}
	}

	/**
	 * A task that completes once `frames` frames and `seconds` of game time
	 * have passed.
	 */
	public Wait(
		frames: number,
		seconds: number,
		token: CancellationToken,
	): Task {
		const source = new TaskCompletionSource( token );

		if ( !source.Task.IsCompleted ) {
			if ( frames <= 0 && seconds <= 0 ) {
				source.TrySetResult();
			}
			else {
				this._waiters.push(
					{
						Frame: this._frame + frames,
						Time: this._time + seconds,
						Source: source,
					},
				);
			}
		}
		return source.Task;
	}
}
