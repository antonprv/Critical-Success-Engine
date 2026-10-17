// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System;
using System.Collections.Generic;

namespace CSEngine.Messaging
{
	/// <summary>
	/// A value that says when it changes (the twin of Source/ReactiveProperty.ts): a subscriber gets the current value at
	/// once, then every change; an equal value is not a change. <see cref="PublishTo"/> also puts the changes on a tag.
	/// </summary>
	public sealed class ReactiveProperty<T> : IDisposable
	{
		private T _value;
		private readonly List<Action<T>> _handlers = new();
		private Action<T>? _publish;

		public ReactiveProperty( T value )
		{
			_value = value;
		}

		public T Value
		{
			get => _value;
			set
			{
				if ( EqualityComparer<T>.Default.Equals( value, _value ) )
				{
					return;
				}
				_value = value;
				foreach ( Action<T> handler in _handlers.ToArray() )
				{
					handler( value );
				}
				_publish?.Invoke( value );
			}
		}

		public IDisposable Subscribe( Action<T> handler ) => Observe().Subscribe( handler );

		public Observable<T> Observe() => Observable.From<T>( next =>
		{
			_handlers.Add( next );
			next( _value );
			return () => _handlers.Remove( next );
		} );

		/// <summary>Publishes every change on <paramref name="tag"/> of <paramref name="stream"/>; returns this.</summary>
		public ReactiveProperty<T> PublishTo( DataStream stream, string tag )
		{
			_publish = value => stream.Publish( tag, value );
			return this;
		}

		public void Dispose()
		{
			_publish = null;
			_handlers.Clear();
		}
	}
}