// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import {
	CancellationToken, CancellationTokenSource, OperationCanceledError,
	PlayerLoop, Task, TaskCompletionSource, TaskStatus,
} from "../Source/Index.ts";

describe( "Task: a Promise to everything that expects one", () => {
	it(
		"is awaited, and a Promise API takes it (all, race, resolve, then "
			+ "chains)",
		async () => {
			const source = new TaskCompletionSource<number>();
			setTimeout( () => source.TrySetResult( 41 ), 0 );
			expect( await source.Task ).toBe( 41 );

			// assignable where a Promise is expected
			const asPromise: Promise<number> = Task.FromResult( 2 );
			expect( await Promise.all( [asPromise, Task.FromResult( 3 )] ) )
				.toEqual( [2, 3] );
			expect(
				await Promise.race(
					[new Task<number>(), Task.FromResult( 7 )],
				),
			).toBe( 7 );
			expect( await Promise.resolve( Task.FromResult( "x" ) ) )
				.toBe( "x" );
			expect(
				await Task.FromResult( 1 ).then( ( v ) => v + 1 )
					.then( ( v ) => Task.FromResult( v * 10 ) ),
			).toBe( 20 );
			expect( String( Task.CompletedTask ) ).toBe( "[object Task]" );
		},
	);

	it(
		"rejects like a Promise: catch, finally, rethrow, await throws",
		async () => {
			const failed = Task.FromError<number>( new Error( "nope" ) );
			await expect( failed ).rejects.toThrow( "nope" );
			expect( await failed.catch( ( e: Error ) => e.message ) )
				.toBe( "nope" );
			const finished = vi.fn();
			await expect( failed.finally( finished ) ).rejects
				.toThrow( "nope" );
			expect( finished ).toHaveBeenCalled();
			expect( await Task.FromResult( 5 ).finally( finished ) ).toBe( 5 );
			await expect( Task.FromResult( 1 ).then( () => {
				throw new Error( "inside" );
			} ) ).rejects.toThrow( "inside" );
			await expect( failed.then( ( v ) => v, ( e: Error ) => {
				throw new Error( `again: ${ e.message }` );
			} ) ).rejects.toThrow( "again: nope" );
			// a then without handlers passes the outcome through
			expect( await Task.FromResult( 9 ).then() ).toBe( 9 );
			await expect( failed.then() ).rejects.toThrow( "nope" );
			// a finally that throws replaces the outcome
			await expect( Task.FromResult( 1 ).finally( () => {
				throw new Error( "finally" );
			} ) ).rejects.toThrow( "finally" );
		},
	);

	it(
		"Task.From adopts a Promise (or any thenable); a Task is returned as "
			+ "is",
		async () => {
			expect( await Task.From( Promise.resolve( 3 ) ) ).toBe( 3 );
			await expect(
				Task.From( Promise.reject( new Error( "p" ) ) ),
			).rejects
				.toThrow( "p" );
			const task = Task.FromResult( 1 );
			expect( Task.From( task ) ).toBe( task );
			expect( await Task.From( 8 ) ).toBe( 8 );
		},
	);
} );

describe( "Task: what a Promise can't do", () => {
	it(
		"continuations run as soon as it completes, synchronously - no "
			+ "microtask",
		() => {
			const source = new TaskCompletionSource<string>();
			const got: string[] = [];
			source.Task.OnCompleted(
				( task ) => got.push( `first ${ task.Result }` ),
			);
			source.Task.OnCompleted(
				( task ) => got.push( `second ${ task.Result }` ),
			);
			source.TrySetResult( "done" );
			expect( got ).toEqual( ["first done", "second done"] );
			// on a completed task: right away
			source.Task.OnCompleted( () => got.push( "late" ) );
			expect( got.at( -1 ) ).toBe( "late" );
			// a then on a completed task runs synchronously too
			let ran = false;
			void Task.FromResult( 1 ).then( () => {
				ran = true;
			} );
			expect( ran ).toBe( true );
		},
	);

	it( "tells its state, its result and its error without awaiting", () => {
		const source = new TaskCompletionSource<number>();
		expect( source.Task.Status ).toBe( TaskStatus.Pending );
		expect( source.Task.IsCompleted ).toBe( false );
		expect( () => source.Task.Result ).toThrow( "not completed" );
		expect( source.TrySetResult( 4 ) ).toBe( true );
		expect( source.TrySetResult( 5 ) ).toBe( false ); // once only
		expect( source.TrySetError( new Error() ) ).toBe( false );
		expect( source.Task.Status ).toBe( TaskStatus.Succeeded );
		expect( source.Task.Result ).toBe( 4 );

		const failed = Task.FromError( new Error( "bad" ) );
		expect( failed.Status ).toBe( TaskStatus.Faulted );
		expect( ( failed.Error as Error ).message ).toBe( "bad" );
		expect( () => failed.Result ).toThrow( "bad" );
		failed.catch( () => {
		} );
	} );

	it( "WhenAll and WhenAny, of tasks and promises", async () => {
		expect(
			await Task.WhenAll(
				[Task.FromResult( 1 ), Promise.resolve( 2 ), 3],
			),
		).toEqual( [1, 2, 3] );
		expect( await Task.WhenAll( [] ) ).toEqual( [] );
		await expect(
			Task.WhenAll(
				[Task.FromResult( 1 ), Task.FromError( new Error( "one" ) )],
			),
		).rejects.toThrow( "one" );
		const slow = new TaskCompletionSource<string>();
		expect( await Task.WhenAny( [slow.Task, Task.FromResult( "fast" )] ) )
			.toBe( "fast" );
		await expect(
			Task.WhenAny( [Task.FromError( new Error( "first" ) ), slow.Task] ),
		).rejects.toThrow( "first" );
		slow.TrySetResult( "late" ); // nobody minds any more
	} );
} );

describe( "cancellation", () => {
	it(
		"a token says when it is canceled, runs what registered, once; a "
			+ "canceled task rejects with OperationCanceledError",
		async () => {
			const tokens = new CancellationTokenSource();
			const token = tokens.Token;
			const heard = vi.fn();
			const registration = token.Register( heard );
			const removed = vi.fn();
			token.Register( removed ).Dispose();
			expect( token.IsCancellationRequested ).toBe( false );
			expect( () => token.ThrowIfCancellationRequested() ).not.toThrow();
			tokens.Cancel();
			tokens.Cancel();
			expect( heard ).toHaveBeenCalledTimes( 1 );
			expect( removed ).not.toHaveBeenCalled();
			registration.Dispose();
			expect( token.IsCancellationRequested ).toBe( true );
			expect( () => token.ThrowIfCancellationRequested() )
				.toThrow( OperationCanceledError );
			// registering after the fact runs at once
			const late = vi.fn();
			token.Register( late ).Dispose();
			expect( late ).toHaveBeenCalled();

			const source = new TaskCompletionSource<number>( token );
			expect( source.Task.Status ).toBe( TaskStatus.Canceled );
			await expect( source.Task ).rejects
				.toBeInstanceOf( OperationCanceledError );
			expect( CancellationToken.None.IsCancellationRequested )
				.toBe( false );
			expect( Task.FromCanceled().Status ).toBe( TaskStatus.Canceled );
			Task.FromCanceled().catch( () => {
			} );
		},
	);

	it(
		"a source canceled while pending cancels its task; TrySetCanceled says "
			+ "if it did",
		async () => {
			const tokens = new CancellationTokenSource();
			const source = new TaskCompletionSource<number>( tokens.Token );
			tokens.Cancel();
			await expect( source.Task ).rejects.toThrow( "canceled" );
			expect( source.TrySetCanceled() ).toBe( false );
			const plain = new TaskCompletionSource<number>();
			expect( plain.TrySetCanceled() ).toBe( true );
			plain.Task.catch( () => {
			} );
		},
	);
} );

describe( "the player loop: waiting in frames and game time", () => {
	it(
		"NextFrame, DelayFrames and Delay complete on the loop's ticks, in "
			+ "game seconds",
		() => {
			const loop = new PlayerLoop();
			const next = Task.NextFrame( CancellationToken.None, loop );
			const three = Task.DelayFrames( 3, CancellationToken.None, loop );
			const second = Task.Delay( 1, CancellationToken.None, loop );
			const now = Task.DelayFrames( 0, CancellationToken.None, loop );
			expect( now.IsCompleted ).toBe( true );
			expect( loop.Pending ).toBe( 3 );
			loop.Tick( 0.4 );
			expect( next.IsCompleted ).toBe( true );
			expect( three.IsCompleted ).toBe( false );
			loop.Tick( 0.4 );
			loop.Tick( 0.4 );
			expect( three.IsCompleted ).toBe( true );
			expect( second.IsCompleted ).toBe( true );
			expect( loop.Pending ).toBe( 0 );
			expect( loop.Frame ).toBe( 3 );
			expect( loop.Time ).toBeCloseTo( 1.2 );
		},
	);

	it(
		"a canceled wait stops waiting and rejects; tasks made during a tick "
			+ "wait for the next",
		async () => {
			const loop = new PlayerLoop();
			const tokens = new CancellationTokenSource();
			const wait = Task.Delay( 10, tokens.Token, loop );
			let chained: Task | null = null;
			const first = Task.NextFrame( CancellationToken.None, loop );
			first.OnCompleted( () => {
				chained = Task.NextFrame( CancellationToken.None, loop );
			} );
			loop.Tick( 0.1 );
			expect( chained!.IsCompleted ).toBe( false );
			loop.Tick( 0.1 );
			expect( chained!.IsCompleted ).toBe( true );
			tokens.Cancel();
			await expect( wait ).rejects
				.toBeInstanceOf( OperationCanceledError );
			// the canceled wait doesn't count, though it is still listed
			expect( loop.Pending ).toBe( 0 );
			loop.Tick( 20 );
			expect( loop.Pending ).toBe( 0 );
			// an already canceled token: canceled at once
			expect( Task.NextFrame( tokens.Token, loop ).Status )
				.toBe( TaskStatus.Canceled );
			Task.NextFrame( tokens.Token, loop ).catch( () => {
			} );
		},
	);

	it( "the default loop is the one the engine ticks", () => {
		const next = Task.NextFrame();
		PlayerLoop.Default.Tick( 1 / 60 );
		expect( next.IsCompleted ).toBe( true );
		expect( Task.Delay( 0 ).IsCompleted ).toBe( true );
	} );
} );
