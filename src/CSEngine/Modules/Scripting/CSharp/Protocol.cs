// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using CSEngine.Messaging;
using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.Numerics;

namespace CSEngine
{
	// The protocol between the TypeScript runtime (Core/Source/Engine/Scripting/ScriptProtocol.ts) and ScriptHost: one
	// call per phase, a MessagePack array of commands in, a map of results out. Both sides must change together.
	//
	// Commands (each an array, first element the kind):
	//   [0, component, entity, entityName, className, fields | nil]   Create
	//   [1, component, Lifecycle]                                     Awake / Start
	//   [2, Hook, dt]                                                 run a hook on every enabled component
	//   [3, component, OverlapEvent, otherEntity, otherName]          collision / trigger
	//   [4, component, enabled]                                       OnEnable / OnDisable
	//   [5, component]                                                Destroy (OnDestroy)
	//   [6, bin]                                                      transforms: float64 LE (entity, px, py, pz, qx, qy, qz, qw)*
	//   [7, bin]                                                      a DataStream batch from TypeScript
	//   [8, down[], justPressed[], { action: value }, moveX, moveY]   input
	//   [9, elapsed, frameCount, physicsStepCount]                    time
	// Results: { Transforms: bin, Stream: bin[], Toasts: string[], Hud: { key: text }, Logs: [level, text][],
	//            Destroy: entity[], Errors: [component, message][] }

	internal enum Command
	{
		Create,
		Lifecycle,
		Hook,
		Event,
		Enabled,
		Destroy,
		Transforms,
		Stream,
		Input,
		Time,
	}

	public enum Lifecycle
	{
		Awake,
		Start,
	}

	public enum Hook
	{
		InputUpdate,
		Update,
		UIUpdate,
		PhysicsUpdate,
	}

	public enum OverlapEvent
	{
		TriggerEnter,
		TriggerExit,
		CollisionEnter,
		CollisionExit,
	}

	/// <summary>Floats per transform record: entity, position (3), rotation (4).</summary>
	internal static class TransformRecord
	{
		public const int Stride = 8;

		public static void Write( Span<byte> destination, int entity, Vector3 position, Quaternion rotation )
		{
			ReadOnlySpan<double> values = stackalloc double[ Stride ] { entity, position.X, position.Y, position.Z, rotation.X, rotation.Y, rotation.Z, rotation.W };
			for ( int i = 0; i < Stride; i++ )
			{
				BinaryPrimitives.WriteDoubleLittleEndian( destination[ ( i * 8 ).. ], values[ i ] );
			}
		}

		public static (int Entity, Vector3 Position, Quaternion Rotation) Read( ReadOnlySpan<byte> source )
		{
			Span<double> v = stackalloc double[ Stride ];
			for ( int i = 0; i < Stride; i++ )
			{
				v[ i ] = BinaryPrimitives.ReadDoubleLittleEndian( source[ ( i * 8 ).. ] );
			}
			return ((int)v[ 0 ], new Vector3( (float)v[ 1 ], (float)v[ 2 ], (float)v[ 3 ] ), new Quaternion( (float)v[ 4 ], (float)v[ 5 ], (float)v[ 6 ], (float)v[ 7 ] ));
		}
	}

	/// <summary>Writes a command batch (what the TypeScript runtime sends; tests and tools use it too).</summary>
	public sealed class CommandWriter
	{
		private readonly MessagePackWriter _body = new();
		private int _count;

		public CommandWriter Create( int component, int entity, string entityName, string className, IDictionary<string, object?>? fields ) =>
			Add( 6, Command.Create, component, entity, entityName, className, fields );

		public CommandWriter Lifecycle( int component, Lifecycle kind ) => Add( 3, Command.Lifecycle, component, (int)kind );

		public CommandWriter Hook( Hook hook, float dt ) => Add( 3, Command.Hook, (int)hook, (double)dt );

		public CommandWriter Event( int component, OverlapEvent kind, int other, string otherName ) => Add( 5, Command.Event, component, (int)kind, other, otherName );

		public CommandWriter Enabled( int component, bool enabled ) => Add( 3, Command.Enabled, component, enabled );

		public CommandWriter Destroy( int component ) => Add( 2, Command.Destroy, component );

		public CommandWriter Transforms( params (int Entity, Vector3 Position, Quaternion Rotation)[] transforms )
		{
			byte[] bytes = new byte[ transforms.Length * TransformRecord.Stride * 8 ];
			for ( int i = 0; i < transforms.Length; i++ )
			{
				TransformRecord.Write( bytes.AsSpan( i * TransformRecord.Stride * 8 ), transforms[ i ].Entity, transforms[ i ].Position, transforms[ i ].Rotation );
			}
			return Add( 2, Command.Transforms, bytes );
		}

		public CommandWriter Stream( byte[] batch ) => Add( 2, Command.Stream, batch );

		public CommandWriter Input( string[] down, string[] justPressed, Dictionary<string, double> values, double moveX, double moveY )
		{
			Dictionary<string, object?> map = new();
			foreach ( KeyValuePair<string, double> entry in values )
			{
				map[ entry.Key ] = entry.Value;
			}
			return Add( 6, Command.Input, new List<object?>( down ), new List<object?>( justPressed ), map, moveX, moveY );
		}

		public CommandWriter Time( double elapsed, long frameCount, long physicsStepCount ) => Add( 4, Command.Time, elapsed, frameCount, physicsStepCount );

		public byte[] ToArray()
		{
			MessagePackWriter writer = new();
			writer.WriteArrayHeader( _count );
			writer.WriteRaw( _body.WrittenSpan );
			return writer.WrittenSpan.ToArray();
		}

		private CommandWriter Add( int length, Command command, params object?[] values )
		{
			_body.WriteArrayHeader( length );
			_body.WriteInteger( (int)command );
			foreach ( object? value in values )
			{
				_body.Write( value );
			}
			_count++;
			return this;
		}
	}

	/// <summary>What a phase gave back: written by the host, read by the TypeScript runtime (and by tests).</summary>
	public sealed class ScriptResults
	{
		public List<(int Entity, Vector3 Position, Quaternion Rotation)> Transforms { get; } = new();
		public List<byte[]> StreamBatches { get; } = new();
		public List<string> Toasts { get; } = new();
		public Dictionary<string, string> Hud { get; } = new();
		public List<(LogLevel Level, string Text)> Logs { get; } = new();
		public List<int> DestroyedEntities { get; } = new();
		public List<(int Component, string Message)> Errors { get; } = new();

		internal void Clear()
		{
			Transforms.Clear();
			StreamBatches.Clear();
			Toasts.Clear();
			Hud.Clear();
			Logs.Clear();
			DestroyedEntities.Clear();
			Errors.Clear();
		}

		internal void Write( MessagePackWriter writer )
		{
			writer.WriteMapHeader( 7 );
			writer.WriteString( "Transforms" );
			byte[] transforms = new byte[ Transforms.Count * TransformRecord.Stride * 8 ];
			for ( int i = 0; i < Transforms.Count; i++ )
			{
				TransformRecord.Write( transforms.AsSpan( i * TransformRecord.Stride * 8 ), Transforms[ i ].Entity, Transforms[ i ].Position, Transforms[ i ].Rotation );
			}
			writer.WriteBinary( transforms );
			writer.WriteString( "Stream" );
			writer.WriteArrayHeader( StreamBatches.Count );
			foreach ( byte[] batch in StreamBatches )
			{
				writer.WriteBinary( batch );
			}
			writer.WriteString( "Toasts" );
			writer.Write( Toasts );
			writer.WriteString( "Hud" );
			writer.WriteMapHeader( Hud.Count );
			foreach ( KeyValuePair<string, string> line in Hud )
			{
				writer.WriteString( line.Key );
				writer.WriteString( line.Value );
			}
			writer.WriteString( "Logs" );
			writer.WriteArrayHeader( Logs.Count );
			foreach ( (LogLevel level, string text) in Logs )
			{
				writer.WriteArrayHeader( 2 );
				writer.WriteInteger( (int)level );
				writer.WriteString( text );
			}
			writer.WriteString( "Destroy" );
			writer.Write( DestroyedEntities );
			writer.WriteString( "Errors" );
			writer.WriteArrayHeader( Errors.Count );
			foreach ( (int component, string message) in Errors )
			{
				writer.WriteArrayHeader( 2 );
				writer.WriteInteger( component );
				writer.WriteString( message );
			}
		}

		public static ScriptResults Read( ReadOnlySpan<byte> bytes )
		{
			Dictionary<string, object?> map = (Dictionary<string, object?>)MessagePack.Decode( bytes )!;
			ScriptResults results = new();
			byte[] transforms = (byte[])map[ "Transforms" ]!;
			for ( int offset = 0; offset < transforms.Length; offset += TransformRecord.Stride * 8 )
			{
				results.Transforms.Add( TransformRecord.Read( transforms.AsSpan( offset ) ) );
			}
			foreach ( object? batch in (List<object?>)map[ "Stream" ]! )
			{
				results.StreamBatches.Add( (byte[])batch! );
			}
			foreach ( object? toast in (List<object?>)map[ "Toasts" ]! )
			{
				results.Toasts.Add( (string)toast! );
			}
			foreach ( KeyValuePair<string, object?> line in (Dictionary<string, object?>)map[ "Hud" ]! )
			{
				results.Hud[ line.Key ] = (string)line.Value!;
			}
			foreach ( object? log in (List<object?>)map[ "Logs" ]! )
			{
				List<object?> entry = (List<object?>)log!;
				results.Logs.Add( ((LogLevel)(long)entry[ 0 ]!, (string)entry[ 1 ]!) );
			}
			foreach ( object? entity in (List<object?>)map[ "Destroy" ]! )
			{
				results.DestroyedEntities.Add( (int)(long)entity! );
			}
			foreach ( object? error in (List<object?>)map[ "Errors" ]! )
			{
				List<object?> entry = (List<object?>)error!;
				results.Errors.Add( ((int)(long)entry[ 0 ]!, (string)entry[ 1 ]!) );
			}
			return results;
		}
	}
}