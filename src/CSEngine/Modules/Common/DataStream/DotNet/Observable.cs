// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System;

namespace CSEngine.Messaging
{
	/// <summary>A subscription that runs its teardown once.</summary>
	public sealed class Subscription : IDisposable
	{
		private Action? _teardown;

		public Subscription( Action teardown )
		{
			_teardown = teardown;
		}

		public bool Disposed => _teardown is null;

		public void Dispose()
		{
			Action? teardown = _teardown;
			_teardown = null;
			teardown?.Invoke();
		}
	}

	/// <summary>
	/// A stream of values in the manner of R3 (the twin of Source/Observable.ts): operators build a chain of delegates on
	/// Subscribe, values arrive synchronously.
	/// </summary>
	public sealed class Observable<T>
	{
		private readonly Func<Action<T>, Action<Exception>, Action> _produce;

		internal Observable( Func<Action<T>, Action<Exception>, Action> produce )
		{
			_produce = produce;
		}

		/// <summary>Starts receiving. An exception in an operator or in <paramref name="next"/> goes to <paramref name="error"/>, or is thrown when there is none.</summary>
		public IDisposable Subscribe( Action<T> next, Action<Exception>? error = null )
		{
			Action<Exception> fail = error ?? Rethrow;
			return new Subscription( _produce( value =>
			{
				try
				{
					next( value );
				}
				catch ( Exception e ) when ( error is not null )
				{
					fail( e );
				}
			}, fail ) );
		}

		public Observable<T> Where( Func<T, bool> predicate ) => Pipe<T>( ( value, next ) =>
		{
			if ( predicate( value ) )
			{
				next( value );
			}
		} );

		public Observable<TResult> Select<TResult>( Func<T, TResult> selector ) => Pipe<TResult>( ( value, next ) => next( selector( value ) ) );

		/// <summary>Drops values equal to the one before.</summary>
		public Observable<T> DistinctUntilChanged() => new Observable<T>( ( next, error ) =>
		{
			bool has = false;
			T last = default!;
			return _produce( value =>
			{
				if ( !has || !Equals( value, last ) )
				{
					has = true;
					last = value;
					next( value );
				}
			}, error );
		} );

		public Observable<T> Skip( int count ) => new Observable<T>( ( next, error ) =>
		{
			int skipped = 0;
			return _produce( value =>
			{
				if ( skipped < count )
				{
					skipped++;
				}
				else
				{
					next( value );
				}
			}, error );
		} );

		/// <summary>The first <paramref name="count"/> values, then lets go of the source.</summary>
		public Observable<T> Take( int count ) => new Observable<T>( ( next, error ) =>
		{
			if ( count <= 0 )
			{
				return () => { };
			}
			int taken = 0;
			bool ended = false;
			Action? teardown = null;
			void End()
			{
				ended = true;
				teardown?.Invoke();
				teardown = null;
			}
			Action stop = _produce( value =>
			{
				if ( ended )
				{
					return;
				}
				taken++;
				next( value );
				if ( taken >= count )
				{
					End();
				}
			}, error );
			if ( ended )
			{
				stop();
			}
			else
			{
				teardown = stop;
			}
			return End;
		} );

		internal Action Produce( Action<T> next, Action<Exception> error ) => _produce( next, error );

		private Observable<TResult> Pipe<TResult>( Action<T, Action<TResult>> step ) => new Observable<TResult>( ( next, error ) => _produce( value =>
		{
			try
			{
				step( value, next );
			}
			catch ( Exception e )
			{
				error( e );
			}
		}, error ) );

		private static void Rethrow( Exception error ) => System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw( error );
	}

	public static class Observable
	{
		/// <summary>Values from any source: <paramref name="subscribe"/> starts it and returns what stops it.</summary>
		public static Observable<T> From<T>( Func<Action<T>, Action> subscribe ) => new Observable<T>( ( next, _ ) => subscribe( next ) );

		/// <summary>Every value of every source, as they come.</summary>
		public static Observable<T> Merge<T>( params Observable<T>[] sources ) => new Observable<T>( ( next, error ) =>
		{
			Action[] teardowns = Array.ConvertAll( sources, source => source.Produce( next, error ) );
			return () => Array.ForEach( teardowns, teardown => teardown() );
		} );
	}
}