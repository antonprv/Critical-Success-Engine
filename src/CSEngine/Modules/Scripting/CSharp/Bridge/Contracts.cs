// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// C# and TypeScript calling each other through contracts, declared once in .contract files (the engine's contract
// compiler writes the C# side next to them and registers each contract here when the game's assembly loads). A call
// is a MessagePack array [contract, entity, method, args] answered with [true, value] or [false, error]; both runtimes
// share one thread, so it is a plain synchronous call either way. The TypeScript side: Modules/Scripting/Source/Bridge.ts.

using CSEngine.Messaging;
using System;
using System.Collections.Generic;
using System.Numerics;

namespace CSEngine.Bridge
{
	/// <summary>Runs a call from the other side on an implementation: reads the arguments, writes the result.</summary>
	public delegate void Dispatcher<in T>( T target, int method, ref MessagePackReader args, MessagePackWriter result );

	/// <summary>A failed call across: the other side's error, or a contract nothing implements.</summary>
	public sealed class BridgeException : Exception
	{
		public BridgeException( string message ) : base( message )
		{
		}
	}

	/// <summary>The contracts both languages know (each registered by its generated code).</summary>
	public static class Contracts
	{
		private static readonly Dictionary<string, Contract> _byName = new();
		private static readonly Dictionary<Type, Contract> _byType = new();

		/// <summary>Registers a contract: its name, how to call the other side, how to run the other side's calls.</summary>
		public static void Register<T>( string name, Func<RemoteTarget, T> proxy, Dispatcher<T> dispatch ) where T : class
		{
			Contract contract = new( name, typeof( T ), target => proxy( target ),
				( object target, int method, ref MessagePackReader args, MessagePackWriter result ) => dispatch( (T)target, method, ref args, result ) );
			_byName[ name ] = contract;
			_byType[ typeof( T ) ] = contract;
		}

		internal static Contract? Find( string name ) => _byName.GetValueOrDefault( name );

		internal static Contract Of( Type type ) =>
			_byType.GetValueOrDefault( type )
			?? throw new BridgeException( $"{type.Name} is not a contract both languages know: declare it in a .contract file" );
	}

	internal sealed class Contract
	{
		public Contract( string name, Type type, Func<RemoteTarget, object> proxy, Dispatcher<object> dispatch )
		{
			Name = name;
			Type = type;
			Proxy = proxy;
			Dispatch = dispatch;
		}

		public string Name { get; }

		public Type Type { get; }

		public Func<RemoteTarget, object> Proxy { get; }

		public Dispatcher<object> Dispatch { get; }
	}

	/// <summary>What a generated proxy calls through: a contract on the TypeScript side (of an entity, or the game's).</summary>
	public sealed class RemoteTarget
	{
		private readonly ScriptBridge _bridge;
		private readonly string _contract;

		/// <summary>The start of every request, the same each time: [4-array, contract, entity].</summary>
		private readonly byte[] _header;

		internal RemoteTarget( ScriptBridge bridge, string contract, int entity )
		{
			_bridge = bridge;
			_contract = contract;
			MessagePackWriter header = new();
			header.WriteArrayHeader( 4 );
			header.WriteString( contract );
			header.WriteInteger( entity );
			_header = header.WrittenSpan.ToArray();
		}

		/// <summary>Starts a call: returns the writer for its <paramref name="count"/> arguments.</summary>
		public MessagePackWriter Begin( int method, int count )
		{
			MessagePackWriter writer = _bridge.Request;
			writer.Reset();
			writer.WriteRaw( _header );
			writer.WriteInteger( method );
			writer.WriteArrayHeader( count );
			return writer;
		}

		/// <summary>Sends the call; returns the result (MessagePack) or throws the other side's error.</summary>
		public ReadOnlySpan<byte> Call()
		{
			ReadOnlySpan<byte> response = _bridge.Exchange( _bridge.Request.WrittenSpan );
			MessagePackReader reader = new( response );
			reader.ReadArrayHeader();
			if ( !reader.ReadBoolean() )
			{
				throw new BridgeException( $"TypeScript {_contract}: {reader.Read()}" );
			}
			return response[ reader.Offset.. ];
		}
	}

	/// <summary>Helpers of the generated code: how values cross.</summary>
	public static class Wire
	{
		public delegate T Reader<out T>( ref MessagePackReader reader );

		public static T[] ReadArray<T>( ref MessagePackReader reader, Reader<T> read )
		{
			T[] items = new T[ reader.ReadArrayHeader() ];
			for ( int i = 0; i < items.Length; i++ )
			{
				items[ i ] = read( ref reader );
			}
			return items;
		}

		public static byte[] ReadBytes( ref MessagePackReader reader ) =>
			reader.Read() as byte[] ?? throw new FormatException( "Expected bytes" );

		public static Vector3 ReadVector3( ref MessagePackReader reader )
		{
			reader.ReadArrayHeader();
			return new Vector3( (float)reader.ReadDouble(), (float)reader.ReadDouble(), (float)reader.ReadDouble() );
		}

		public static Quaternion ReadQuaternion( ref MessagePackReader reader )
		{
			reader.ReadArrayHeader();
			return new Quaternion( (float)reader.ReadDouble(), (float)reader.ReadDouble(), (float)reader.ReadDouble(), (float)reader.ReadDouble() );
		}

		public static void WriteVector3( MessagePackWriter writer, Vector3 value )
		{
			writer.WriteArrayHeader( 3 );
			writer.WriteDouble( value.X );
			writer.WriteDouble( value.Y );
			writer.WriteDouble( value.Z );
		}

		public static void WriteQuaternion( MessagePackWriter writer, Quaternion value )
		{
			writer.WriteArrayHeader( 4 );
			writer.WriteDouble( value.X );
			writer.WriteDouble( value.Y );
			writer.WriteDouble( value.Z );
			writer.WriteDouble( value.W );
		}
	}
}