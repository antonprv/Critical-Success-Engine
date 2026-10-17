// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using CSEngine.Bridge;
using CSEngine.Messaging;
using System.Numerics;
using TemplateProject;
using Xunit;

namespace CSEngine.Scripting.Tests
{
	/// <summary>The templates' C# components (src/Templates/*/Source/Scripts/*.cs), driven as the engine drives them.</summary>
	public class TemplateScriptsTests
	{
		private static ScriptHost NewHost()
		{
			ScriptHost host = new ScriptHost();
			host.Registry.Register( typeof( TemplateProject.BallWatcher ).Assembly );
			return host;
		}

		private static ScriptResults Run( ScriptHost host, CommandWriter commands ) => ScriptResults.Read( host.Run( commands.ToArray() ) );

		/// <summary>A TypeScript stream linked to the host: what it publishes, C# gets with the next phase, and back.</summary>
		private sealed class TypeScript
		{
			public readonly DataStream Stream = new();
			public readonly List<byte[]> Outgoing = new();
			private Action<byte[]>? _receive;

			public TypeScript()
			{
				Stream.Connect( new DelegateLink( Outgoing.Add, receive => _receive = receive ) );
			}

			/// <summary>Takes C#'s batches.</summary>
			public void Receive( ScriptResults results ) => results.StreamBatches.ForEach( batch => _receive!( batch ) );

			/// <summary>Adds what TypeScript has for C# to the commands.</summary>
			public CommandWriter Send( CommandWriter commands )
			{
				Stream.Flush();
				Outgoing.ForEach( batch => commands.Stream( batch ) );
				Outgoing.Clear();
				return commands;
			}
		}

		[Fact]
		public void BallWatcherShowsTheHeightAndPublishesLandingsOnTheGroundOnly()
		{
			ScriptHost host = NewHost();
			TypeScript ts = new();
			List<Dictionary<string, object?>> landings = new();
			ts.Stream.Subscribe<Dictionary<string, object?>>( "Ball.Landed", landings.Add );
			ts.Receive( Run( host, ts.Send( new CommandWriter()
				.Create( 1, 5, "Ball", "BallWatcher", new Dictionary<string, object?> { [ "HudKey" ] = "h" } )
				.Lifecycle( 1, Lifecycle.Awake )
				.Lifecycle( 1, Lifecycle.Start ) ) ) );

			ScriptResults results = Run( host, new CommandWriter().Transforms( (5, new Vector3( 0, 4.25f, 0 ), Quaternion.Identity) ).Hook( Hook.UIUpdate, 0.1f ) );
			Assert.Equal( "Ball height: 4.3 m", results.Hud[ "h" ] );
			Run( host, new CommandWriter().Transforms( (5, new Vector3( 0, 1, 0 ), Quaternion.Identity) ).Hook( Hook.UIUpdate, 0.1f ) );
			ts.Receive( Run( host, new CommandWriter()
				.Event( 1, OverlapEvent.CollisionEnter, 9, "Wall" )
				.Event( 1, OverlapEvent.CollisionEnter, 8, "Ground" )
				.Event( 1, OverlapEvent.CollisionEnter, 8, "Ground" ) ) );
			Assert.Equal( 2, landings.Count );
			Assert.Equal( 1L, landings[ 0 ][ "Count" ] );
			Assert.Equal( 4.25, (double)landings[ 0 ][ "Height" ]!, 3 );
			Assert.Equal( 0.0, (double)landings[ 1 ][ "Height" ]! ); // the highest point since the last landing
		}

		[Fact]
		public void TriggerTallyCountsEntriesOnTheHud()
		{
			ScriptHost host = NewHost();
			ScriptResults results = Run( host, new CommandWriter()
				.Create( 1, 5, "Pad", "TriggerTally", null )
				.Lifecycle( 1, Lifecycle.Start ) );
			Assert.Equal( "Trigger pad: entered 0 times", results.Hud[ "pad.tally" ] );
			results = Run( host, new CommandWriter().Event( 1, OverlapEvent.TriggerEnter, 2, "Player" ) );
			Assert.Equal( "Trigger pad: entered 1 time", results.Hud[ "pad.tally" ] );
			results = Run( host, new CommandWriter().Event( 1, OverlapEvent.TriggerExit, 2, "Player" ).Event( 1, OverlapEvent.TriggerEnter, 2, "Player" ) );
			Assert.Equal( "Trigger pad: entered 2 times", results.Hud[ "pad.tally" ] );
		}

		[Fact]
		public void WalkMilestonesCongratulatesAndPublishesEveryMilestoneWalked()
		{
			ScriptHost host = NewHost();
			TypeScript ts = new();
			List<Dictionary<string, object?>> milestones = new();
			ts.Stream.Subscribe<Dictionary<string, object?>>( "Player.Milestone", milestones.Add );
			// TypeScript's subscription reaches C# with the commands
			Run( host, ts.Send( new CommandWriter() )
				.Create( 1, 5, "Player", "WalkMilestones", new Dictionary<string, object?> { [ "MilestoneMeters" ] = 10L } )
				.Transforms( (5, new Vector3( 0, 1, 0 ), Quaternion.Identity) )
				.Lifecycle( 1, Lifecycle.Start ) );
			List<string> toasts = new();
			for ( int step = 1; step <= 25; step++ )
			{
				// a metre a step along X, bouncing up and down: only X and Z count
				ScriptResults results = Run( host, new CommandWriter().Transforms( (5, new Vector3( step, step % 2 * 3, 0 ), Quaternion.Identity) ).Hook( Hook.PhysicsUpdate, 0.02f ) );
				ts.Receive( results );
				toasts.AddRange( results.Toasts );
			}
			Assert.Equal( new[] { "10 m walked!", "20 m walked!" }, toasts );
			Assert.Equal( new[] { 10L, 20L }, milestones.Select( m => (long)m[ "Meters" ]! ) );
		}

		[Fact]
		public void VisitTimerTimesTheTourFromTheTypeScriptPads()
		{
			ScriptHost host = NewHost();
			TypeScript ts = new();
			// C#'s subscription reaches TypeScript with the results
			ts.Receive( Run( host, ts.Send( new CommandWriter().Create( 1, 5, "Rules", "VisitTimer", null ).Lifecycle( 1, Lifecycle.Start ) ) ) );

			ts.Stream.Publish( "Pad.Visited", new Dictionary<string, object?> { [ "Pad" ] = "A", [ "Visited" ] = 1L, [ "Total" ] = 2L } );
			ScriptResults first = Run( host, ts.Send( new CommandWriter().Time( 10, 1, 1 ) ) );
			Assert.Empty( first.Toasts );
			ts.Stream.Publish( "Pad.Visited", new Dictionary<string, object?> { [ "Pad" ] = "B", [ "Visited" ] = 2L, [ "Total" ] = 2L } );
			ScriptResults last = Run( host, ts.Send( new CommandWriter().Time( 22.5, 2, 2 ) ) );
			Assert.Equal( new[] { "All 2 pads in 12.5 s" }, last.Toasts );
		}

		[Fact]
		public void StreakTrackerCountsCoinsPickedUpCloseTogether()
		{
			ScriptHost host = NewHost();
			TypeScript ts = new();
			// TypeScript's side of the bridge: GameRules is the round (IRound) on the "Game" entity
			Round round = new();
			ScriptBridge typeScript = new() { Resolver = ( type, entity ) => type == typeof( IRound ) && entity == 5 ? round : null, Send = request => host.Call( request ) };
			host.Bridge.Send = request => typeScript.Serve( request );
			List<Dictionary<string, object?>> streaks = new();
			ts.Stream.Subscribe<Dictionary<string, object?>>( "Coin.Streak", streaks.Add );
			ts.Receive( Run( host, ts.Send( new CommandWriter().Create( 1, 5, "Game", "StreakTracker", null ).Lifecycle( 1, Lifecycle.Start ) ) ) );
			ts.Receive( Run( host, ts.Send( new CommandWriter() ) ) );

			List<string> toasts = new();
			foreach ( double time in new[] { 1.0, 2.0, 4.5, 9.0, 10.0 } )
			{
				round.Left--;
				ts.Stream.Publish( "Coin.Collected", new Dictionary<string, object?> { [ "Coin" ] = $"Coin {time}" } );
				ScriptResults results = Run( host, ts.Send( new CommandWriter().Time( time, 1, 1 ) ) );
				ts.Receive( results );
				toasts.AddRange( results.Toasts );
			}
			// the wording is the installer's StreakWording; the coins left come from TypeScript
			Assert.Equal( new[] { "Streak x2! 3 to go", "Streak x3! 2 to go", "Streak x2!" }, toasts );
			Assert.Equal( new[] { 2L, 3L, 2L }, streaks.Select( s => (long)s[ "Count" ]! ) );
			// TypeScript asking the C# component for the best streak (@FromCSharp in GameRules)
			Assert.Equal( 3, typeScript.TypeScript<IStreaks>( 5 ).Best() );
		}

		private sealed class Round : IRound
		{
			public int Left = 5;

			public int CoinsLeft() => Left;

			public double SecondsLeft() => 30;
		}
	}
}