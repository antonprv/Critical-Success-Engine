// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using CSEngine.Messaging;
using System.Collections.Generic;
using System.Numerics;

namespace CSEngine
{
	/// <summary>What a C# component reaches through <see cref="Component.Engine"/>.</summary>
	public sealed class ScriptEngine
	{
		internal readonly ScriptResults Results = new();

		internal ScriptEngine()
		{
			World = new World( this );
			Ui = new Ui( Results );
			Log = new Log( Results );
			Stream = new DataStream( error => Log.Error( $"DataStream subscriber failed: {error}" ) );
		}

		/// <summary>
		/// The DataStream shared with TypeScript: what C# publishes reaches TypeScript subscribers of the tag (and the
		/// other way round), as plain data on the other side and as your own types here.
		/// </summary>
		public DataStream Stream { get; }

		public TimeInfo Time { get; } = new();

		public World World { get; }

		public Ui Ui { get; }

		public Log Log { get; }

		/// <summary>The player's input as of the last input phase.</summary>
		public Input Input { get; } = new();
	}

	public sealed class TimeInfo
	{
		/// <summary>Seconds of the current phase (frame or physics step).</summary>
		public float Delta { get; internal set; }

		/// <summary>Seconds since the engine started.</summary>
		public double Elapsed { get; internal set; }

		public long FrameCount { get; internal set; }

		public long PhysicsStepCount { get; internal set; }
	}

	/// <summary>The game's HUD and toasts (the engine's UI shows them).</summary>
	public sealed class Ui
	{
		private readonly ScriptResults _results;

		internal Ui( ScriptResults results )
		{
			_results = results;
		}

		/// <summary>A short message (bottom right).</summary>
		public void Toast( string text ) => _results.Toasts.Add( text );

		/// <summary>A HUD line by key (top left); set it again to change it.</summary>
		public void SetHud( string key, string text ) => _results.Hud[ key ] = text;
	}

	public enum LogLevel
	{
		Info,
		Warning,
		Error,
	}

	/// <summary>The engine's log (the browser console and the log server).</summary>
	public sealed class Log
	{
		private readonly ScriptResults _results;

		internal Log( ScriptResults results )
		{
			_results = results;
		}

		public void Info( string text ) => _results.Logs.Add( (LogLevel.Info, text) );

		public void Warning( string text ) => _results.Logs.Add( (LogLevel.Warning, text) );

		public void Error( string text ) => _results.Logs.Add( (LogLevel.Error, text) );
	}

	/// <summary>The player's input: actions of the project's input manifest, as in TypeScript's InputService.</summary>
	public sealed class Input
	{
		internal HashSet<string> Down = new();
		internal HashSet<string> Pressed = new();
		internal Dictionary<string, double> Values = new();

		public bool IsActionDown( string action ) => Down.Contains( action );

		public bool ActionJustPressed( string action ) => Pressed.Contains( action );

		/// <summary>An axis action's value (0 when it is not one).</summary>
		public float ActionValue( string action ) => Values.TryGetValue( action, out double value ) ? (float)value : 0;

		/// <summary>The movement actions as a vector (x right, y forward).</summary>
		public Vector2 MoveVector { get; internal set; }
	}
}