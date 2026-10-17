// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using CSEngine.DI;
using CSEngine.Messaging;
using System;

namespace CSEngine.Bridge
{
	/// <summary>
	/// The C# end of the bridge: proxies to what implements a contract in TypeScript, and the answers to TypeScript's
	/// calls of what implements one in C#.
	/// </summary>
	public sealed class ScriptBridge
	{
		/// <summary>No entity: the game's container on the other side.</summary>
		public const int NoEntity = -1;

		internal readonly MessagePackWriter Request = new();
		private readonly MessagePackWriter _response = new();
		private bool _serving;

		/// <summary>Sends a request to TypeScript and returns the answer (the browser's import, or a test's).</summary>
		public Func<byte[], byte[]> Send { get; set; } = _ => throw new BridgeException( "TypeScript is not connected" );

		/// <summary>
		/// The memory shared with TypeScript (see <see cref="SharedSlots"/>): calls whose messages fit cross through it.
		/// </summary>
		public SharedSlots Slots { get; } = new();

		/// <summary>
		/// Sends the request in an outgoing slot (depth, length) and returns the answer's length in the same slot, or -1
		/// when it didn't fit (then <see cref="TakeTypeScriptOverflow"/> has it). Null: requests go by <see cref="Send"/>.
		/// </summary>
		public Func<int, int, int>? SendSlot { get; set; }

		/// <summary>The answer that didn't fit its slot (after <see cref="SendSlot"/> said -1).</summary>
		public Func<byte[]> TakeTypeScriptOverflow { get; set; } = () => throw new BridgeException( "TypeScript has no answer waiting" );

		private int _outgoing;
		private byte[]? _overflow;

		/// <summary>What implements a contract (a type) in C# when TypeScript asks: on an entity, else the game's.</summary>
		public Func<Type, int, object?> Resolver { get; set; } = ( _, _ ) => null;

		/// <summary>The TypeScript implementation of a contract (a component of the entity, else the game's binding).</summary>
		public T TypeScript<T>( int entity = NoEntity ) where T : class => (T)TypeScript( typeof( T ), entity );

		public object TypeScript( Type type, int entity = NoEntity )
		{
			Contract contract = Contracts.Of( type );
			return contract.Proxy( new RemoteTarget( this, contract.Name, entity ) );
		}

		/// <summary>Runs a call from TypeScript (a MessagePack request) and answers it.</summary>
		public byte[] Serve( ReadOnlySpan<byte> request ) =>
			// the writer's buffer, not a copy: the caller copies it at once, and reads only the answer at its start
			Answer( request ).GetBuffer();

		/// <summary>
		/// Runs a call from TypeScript whose request is in an incoming slot; the answer goes into the same slot. Returns
		/// its length, or -1 when it didn't fit (then <see cref="TakeOverflow"/> has it).
		/// </summary>
		public int ServeSlot( int depth, int length )
		{
			MessagePackWriter answer = Answer( Slots.Incoming( depth )[ ..length ] );
			ReadOnlySpan<byte> written = answer.WrittenSpan;
			if ( written.Length > SharedSlots.SlotSize )
			{
				_overflow = written.ToArray();
				return -1;
			}
			// the request was read whole before the answer was written: the slot is free for it
			written.CopyTo( Slots.Incoming( depth ) );
			return written.Length;
		}

		/// <summary>The answer that didn't fit its slot (after <see cref="ServeSlot"/> said -1).</summary>
		public byte[] TakeOverflow()
		{
			byte[] overflow = _overflow ?? throw new BridgeException( "No answer is waiting" );
			_overflow = null;
			return overflow;
		}

		/// <summary>
		/// Sends a request to TypeScript: through an outgoing slot when it fits and TypeScript takes slots, else as a
		/// byte array. The answer, read in place.
		/// </summary>
		internal ReadOnlySpan<byte> Exchange( ReadOnlySpan<byte> request )
		{
			if ( SendSlot is null || request.Length > SharedSlots.SlotSize || _outgoing >= SharedSlots.Depths )
			{
				return Send( request.ToArray() );
			}
			int depth = _outgoing++;
			try
			{
				request.CopyTo( Slots.Outgoing( depth ) );
				int length = SendSlot( depth, request.Length );
				// read before anything else can use the slot: nothing runs between here and the reader
				return length >= 0 ? Slots.Outgoing( depth )[ ..length ] : TakeTypeScriptOverflow();
			}
			finally
			{
				_outgoing--;
			}
		}

		private MessagePackWriter Answer( ReadOnlySpan<byte> request )
		{
			// a nested call (C# calling TypeScript calling C#) answers on its own writer
			MessagePackWriter response = _serving ? new MessagePackWriter() : _response;
			bool outer = !_serving;
			_serving = true;
			try
			{
				MessagePackReader reader = new( request );
				reader.ReadArrayHeader();
				Contract contract = ContractNamed( reader.ReadStringBytes() );
				string name = contract.Name;
				int entity = checked((int)reader.ReadInteger());
				int method = checked((int)reader.ReadInteger());
				reader.ReadArrayHeader();
				object target = Resolver( contract.Type, entity )
					?? throw new BridgeException( $"nothing in C# implements {name}{( entity == NoEntity ? "" : $" on entity {entity}" )} (a component, or a binding in an installer)" );
				response.Reset();
				response.WriteArrayHeader( 2 );
				response.WriteBoolean( true );
				contract.Dispatch( target, method, ref reader, response );
			}
			catch ( Exception error )
			{
				response.Reset();
				response.WriteArrayHeader( 2 );
				response.WriteBoolean( false );
				response.WriteString( error is BridgeException ? error.Message : $"{error.GetType().Name}: {error.Message}" );
			}
			finally
			{
				_serving = !outer;
			}
			return response;
		}

		/// <summary>The contract a request names: the last one asked for again is matched on its bytes (no string made).</summary>
		private Contract ContractNamed( ReadOnlySpan<byte> name )
		{
			if ( _lastName is not null && name.SequenceEqual( _lastName ) )
			{
				return _lastContract!;
			}
			string text = System.Text.Encoding.UTF8.GetString( name );
			Contract contract = Contracts.Find( text ) ?? throw new BridgeException( $"C# doesn't know the contract {text} (is its .contract.cs in the project?)" );
			_lastName = name.ToArray();
			_lastContract = contract;
			return contract;
		}

		private byte[]? _lastName;
		private Contract? _lastContract;
	}

	/// <summary>
	/// Fills a field with the TypeScript implementation of a contract: a TypeScript component of the same entity marked
	/// <c>@Implements</c> it, else what the game's TypeScript container binds to it.
	/// <code>[FromTypeScript] private IRound _round = null!;</code>
	/// </summary>
	public sealed class FromTypeScriptAttribute : InjectAttribute
	{
		public override object? Resolve( Container container, Type type, object target ) =>
			container.Resolve<ScriptBridge>().TypeScript( type, target is Component component ? component.Entity.Id : ScriptBridge.NoEntity );
	}

	public static class BridgeBindings
	{
		/// <summary>
		/// Binds a contract to whatever implements it in the game's TypeScript (a proxy calling it):
		/// <c>builder.Bind&lt;IRound&gt;().FromTypeScript();</c>
		/// </summary>
		public static BindingBuilder<T> FromTypeScript<T>( this BindingBuilder<T> builder ) where T : class =>
			builder.FromFactory( container => container.Resolve<ScriptBridge>().TypeScript<T>() );
	}
}