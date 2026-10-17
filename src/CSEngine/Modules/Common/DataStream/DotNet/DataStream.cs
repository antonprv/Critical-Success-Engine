// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;

namespace CSEngine.Messaging
{
	/// <summary>The other side of a stream (TypeScript, another runtime): batches of MessagePack go both ways.</summary>
	public interface IStreamLink
	{
		void Send( byte[] bytes );

		/// <summary>Called once on connect with what takes the other side's batches.</summary>
		void OnReceive( Action<byte[]> receive );
	}

	/// <summary>A link made of two delegates.</summary>
	public sealed class DelegateLink : IStreamLink
	{
		private readonly Action<byte[]> _send;
		private readonly Action<Action<byte[]>> _onReceive;

		public DelegateLink( Action<byte[]> send, Action<Action<byte[]>> onReceive )
		{
			_send = send;
			_onReceive = onReceive;
		}

		public void Send( byte[] bytes ) => _send( bytes );

		public void OnReceive( Action<byte[]> receive ) => _onReceive( receive );
	}

	/// <summary>
	/// Tagged messages, the twin of Source/DataStream.ts: anything publishes on a tag, anything subscribes to a tag, and
	/// none of them knows the others. <see cref="Publish{T}(DataTag{T}, T)"/> delivers synchronously; <see cref="Post{T}(string, T)"/>
	/// queues (a ring buffer) and <see cref="Flush"/> delivers the queue and sends the other side, in one MessagePack
	/// batch, the messages on tags it subscribed to. A subscriber reads a message as its own type: values cross as plain
	/// data and <see cref="MessageMapper"/> makes them the subscriber's class, struct or record.
	/// </summary>
	public sealed class DataStream
	{
		private const DynamicallyAccessedMemberTypes Members =
			DynamicallyAccessedMemberTypes.PublicFields | DynamicallyAccessedMemberTypes.PublicProperties |
			DynamicallyAccessedMemberTypes.PublicConstructors;

		private const int Announce = 0;
		private const int Withdraw = 1;
		private const int Message = 2;

		private abstract class Listener
		{
			public abstract void InvokeBoxed( object? value );
		}

		private sealed class Listener<T> : Listener
		{
			public readonly Action<T> Handler;

			public Listener( Action<T> handler )
			{
				Handler = handler;
			}

			[UnconditionalSuppressMessage( "Trimming", "IL2091", Justification = "T is annotated where the listener is made (Subscribe)." )]
			public override void InvokeBoxed( object? value ) => Handler( value is T typed ? typed : MessageMapper.Convert<T>( value ) );
		}

		private sealed class Listeners
		{
			public readonly List<Listener?> Items = new();
			public int Live;
			public bool Dirty;
		}

		private Listeners?[] _listeners = new Listeners?[ 16 ];
		private int _delivering;
		private readonly List<Listeners> _dirty = new();
		private readonly Action<Exception> _onError;

		private int[] _queueTags;
		private object?[] _queueValues;
		private int _head;
		private int _count;

		private IStreamLink? _link;
		private readonly HashSet<int> _remote = new();
		private readonly MessagePackWriter _out = new();
		private int _outCount;
		private readonly MessagePackWriter _batch = new();

		/// <param name="onError">Where exceptions thrown by subscribers go (default: the console).</param>
		/// <param name="queueCapacity">The starting size of the Post queue's ring buffer (it grows).</param>
		public DataStream( Action<Exception>? onError = null, int queueCapacity = 64 )
		{
			_onError = onError ?? ( error => Console.Error.WriteLine( $"DataStream subscriber failed: {error}" ) );
			_queueTags = new int[ queueCapacity ];
			_queueValues = new object?[ queueCapacity ];
		}

		/// <summary>Messages posted and not flushed yet.</summary>
		public int Pending => _count;

		public int SubscriberCount( string tag ) => ListenersOf( DataTag.IdOf( tag ) )?.Live ?? 0;

		/// <summary>Delivers <paramref name="value"/> now to the tag's subscribers (and, at the next Flush, to the other side's).</summary>
		public void Publish<T>( DataTag<T> tag, T value )
		{
			Listeners? listeners = ListenersOf( tag.Id );
			if ( listeners is not null && listeners.Live > 0 )
			{
				Deliver( listeners, value );
			}
			if ( _remote.Contains( tag.Id ) )
			{
				Enqueue( Message, tag.Name, value );
			}
		}

		public void Publish<T>( string tag, T value ) => Publish( DataTag.For<T>( tag ), value );

		/// <summary>Queues <paramref name="value"/>; <see cref="Flush"/> delivers it, in order.</summary>
		public void Post<T>( string tag, T value )
		{
			if ( _count == _queueTags.Length )
			{
				GrowQueue();
			}
			int index = ( _head + _count ) % _queueTags.Length;
			_queueTags[ index ] = DataTag.IdOf( tag );
			_queueValues[ index ] = value;
			_count++;
		}

		/// <summary>Delivers the queue (messages posted meanwhile included) and sends the other side what it asked for.</summary>
		public void Flush()
		{
			while ( _count > 0 )
			{
				int id = _queueTags[ _head ];
				object? value = _queueValues[ _head ];
				_queueValues[ _head ] = null;
				_head = ( _head + 1 ) % _queueTags.Length;
				_count--;
				Listeners? listeners = ListenersOf( id );
				if ( listeners is not null && listeners.Live > 0 )
				{
					DeliverBoxed( listeners, value );
				}
				if ( _remote.Contains( id ) )
				{
					Enqueue( Message, DataTag.NameOf( id ), value );
				}
			}
			if ( _link is not null && _outCount > 0 )
			{
				_batch.Reset();
				_batch.WriteArrayHeader( _outCount );
				_batch.WriteRaw( _out.WrittenSpan );
				_out.Reset();
				_outCount = 0;
				_link.Send( _batch.WrittenSpan.ToArray() );
			}
		}

		public IDisposable Subscribe<[DynamicallyAccessedMembers( Members )] T>( DataTag<T> tag, Action<T> handler )
		{
			if ( tag.Id >= _listeners.Length )
			{
				Array.Resize( ref _listeners, Math.Max( tag.Id + 1, _listeners.Length * 2 ) );
			}
			Listeners listeners = _listeners[ tag.Id ] ??= new Listeners();
			Listener<T> listener = new Listener<T>( handler );
			listeners.Items.Add( listener );
			listeners.Live++;
			if ( listeners.Live == 1 && _link is not null )
			{
				Enqueue( Announce, tag.Name, null );
			}
			// (a Subscription runs this once)
			return new Subscription( () =>
			{
				int index = listeners.Items.IndexOf( listener );
				listeners.Live--;
				if ( _delivering > 0 )
				{
					listeners.Items[ index ] = null;
					if ( !listeners.Dirty )
					{
						listeners.Dirty = true;
						_dirty.Add( listeners );
					}
				}
				else
				{
					listeners.Items.RemoveAt( index );
				}
				if ( listeners.Live == 0 && _link is not null )
				{
					Enqueue( Withdraw, tag.Name, null );
				}
			} );
		}

		public IDisposable Subscribe<[DynamicallyAccessedMembers( Members )] T>( string tag, Action<T> handler ) => Subscribe( DataTag.For<T>( tag ), handler );

		/// <summary>The tag's messages as an <see cref="Observable{T}"/>.</summary>
		public Observable<T> Observe<[DynamicallyAccessedMembers( Members )] T>( string tag ) => Observable.From<T>( next =>
		{
			IDisposable subscription = Subscribe( tag, next );
			return subscription.Dispose;
		} );

		/// <summary>Joins the other side: from now on it hears the tags it subscribes to, and this stream the ones it does.</summary>
		public void Connect( IStreamLink link )
		{
			_link = link;
			link.OnReceive( Receive );
			for ( int id = 0; id < _listeners.Length; id++ )
			{
				if ( _listeners[ id ] is { Live: > 0 } )
				{
					Enqueue( Announce, DataTag.NameOf( id ), null );
				}
			}
		}

		public void Disconnect()
		{
			_link = null;
			_remote.Clear();
			_out.Reset();
			_outCount = 0;
		}

		/// <summary>Drops every subscriber and every queued message (the link stays).</summary>
		public void Clear()
		{
			Array.Clear( _listeners );
			Array.Clear( _queueValues );
			_head = 0;
			_count = 0;
		}

		/// <summary>Joins two streams of this runtime directly; <paramref name="spy"/> sees every batch.</summary>
		public static void Link( DataStream a, DataStream b, Action<byte[]>? spy = null )
		{
			Action<byte[]> toA = null!;
			Action<byte[]> toB = null!;
			a.Connect( new DelegateLink( bytes =>
			{
				spy?.Invoke( bytes );
				toB( bytes );
			}, receive => toA = receive ) );
			b.Connect( new DelegateLink( bytes =>
			{
				spy?.Invoke( bytes );
				toA( bytes );
			}, receive => toB = receive ) );
		}

		private Listeners? ListenersOf( int id ) => id < _listeners.Length ? _listeners[ id ] : null;

		private void Deliver<T>( Listeners listeners, T value )
		{
			List<Listener?> items = listeners.Items;
			int length = items.Count;
			_delivering++;
			try
			{
				for ( int i = 0; i < length; i++ )
				{
					Listener? listener = items[ i ];
					if ( listener is null )
					{
						continue;
					}
					try
					{
						if ( listener is Listener<T> typed )
						{
							typed.Handler( value );
						}
						else
						{
							listener.InvokeBoxed( value );
						}
					}
					catch ( Exception error )
					{
						_onError( error );
					}
				}
			}
			finally
			{
				EndDelivery();
			}
		}

		private void DeliverBoxed( Listeners listeners, object? value )
		{
			List<Listener?> items = listeners.Items;
			int length = items.Count;
			_delivering++;
			try
			{
				for ( int i = 0; i < length; i++ )
				{
					try
					{
						items[ i ]?.InvokeBoxed( value );
					}
					catch ( Exception error )
					{
						_onError( error );
					}
				}
			}
			finally
			{
				EndDelivery();
			}
		}

		private void EndDelivery()
		{
			_delivering--;
			if ( _delivering == 0 && _dirty.Count > 0 )
			{
				foreach ( Listeners dirty in _dirty )
				{
					dirty.Items.RemoveAll( item => item is null );
					dirty.Dirty = false;
				}
				_dirty.Clear();
			}
		}

		private void Enqueue( int kind, string name, object? value )
		{
			_out.WriteArrayHeader( kind == Message ? 3 : 2 );
			_out.WriteInteger( kind );
			_out.WriteString( name );
			if ( kind == Message )
			{
				MessageMapper.WriteValue( _out, value );
			}
			_outCount++;
		}

		private void Receive( byte[] bytes )
		{
			try
			{
				MessagePackReader reader = new MessagePackReader( bytes );
				int count = reader.ReadArrayHeader();
				for ( int i = 0; i < count; i++ )
				{
					reader.ReadArrayHeader();
					long kind = reader.ReadInteger();
					int id = DataTag.IdOf( reader.ReadString() );
					switch ( kind )
					{
					case Announce:
						_remote.Add( id );
						break;
					case Withdraw:
						_remote.Remove( id );
						break;
					case Message:
						// from the other side: delivered here, never sent back
						object? value = reader.Read();
						Listeners? listeners = ListenersOf( id );
						if ( listeners is not null && listeners.Live > 0 )
						{
							DeliverBoxed( listeners, value );
						}
						break;
					default:
						throw new FormatException( $"unknown entry kind {kind}" );
					}
				}
			}
			catch ( Exception error ) when ( error is not FormatException { Source: "DataStream" } )
			{
				throw new FormatException( $"DataStream: malformed batch from the other side ({error.Message})", error ) { Source = "DataStream" };
			}
		}

		private void GrowQueue()
		{
			int capacity = _queueTags.Length * 2;
			int[] tags = new int[ capacity ];
			object?[] values = new object?[ capacity ];
			for ( int i = 0; i < _count; i++ )
			{
				int index = ( _head + i ) % _queueTags.Length;
				tags[ i ] = _queueTags[ index ];
				values[ i ] = _queueValues[ index ];
			}
			_queueTags = tags;
			_queueValues = values;
			_head = 0;
		}
	}
}