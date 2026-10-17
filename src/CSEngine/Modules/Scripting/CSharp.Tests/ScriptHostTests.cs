// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using CSEngine.Messaging;
using System.Numerics;
using Xunit;

namespace CSEngine.Scripting.Tests
{
	/// <summary>A component written the way a game's script is.</summary>
	public sealed class Spinner : Component
	{
		public float Speed = 1;
		public string Label { get; set; } = "";
		public static readonly List<string> Calls = new();

		public override void Awake() => Calls.Add( $"Awake {Entity.Name} {Speed} {Label}" );

		public override void Start() => Calls.Add( $"Start {Entity.Name}" );

		public override void Update( float dt )
		{
			Calls.Add( $"Update {dt}" );
			Transform.Position += new Vector3( Speed * dt, 0, 0 );
		}

		public override void OnPhysicsUpdate( float dt ) => Calls.Add( $"Physics {dt}" );

		public override void OnInputUpdate( Input input, float dt )
		{
			if ( input.ActionJustPressed( "Jump" ) )
			{
				Calls.Add( $"Jump {input.ActionValue( "Throttle" )} {input.MoveVector}" );
			}
		}

		public override void OnUIUpdate( float dt ) => Engine.Ui.SetHud( "spin", $"{Transform.Position.X}" );

		public override void OnTriggerEnter( Entity other ) => Calls.Add( $"TriggerEnter {other.Name}" );

		public override void OnTriggerExit( Entity other ) => Calls.Add( $"TriggerExit {other.Name}" );

		public override void OnCollisionEnter( Entity other ) => Calls.Add( $"CollisionEnter {other.Id}" );

		public override void OnCollisionExit( Entity other ) => Calls.Add( $"CollisionExit {other.Id}" );

		public override void OnEnable() => Calls.Add( "Enable" );

		public override void OnDisable() => Calls.Add( "Disable" );

		public override void OnDestroy() => Calls.Add( "Destroy" );
	}

	public sealed class Collector : Component
	{
		public int Collected;

		public override void Start() => Engine.Stream.Subscribe<Coin>( "Coin.Collected", coin => Collected += coin.Value );

		public override void OnTriggerEnter( Entity other )
		{
			Engine.Stream.Publish( "Coin.Collected", new Coin( 5, other.Name ) );
			Engine.Ui.Toast( $"Collected {other.Name}" );
			Engine.Log.Info( "collected" );
			Entity.Destroy();
		}
	}

	public sealed record Coin( int Value, string Name );

	public sealed class Faulty : Component
	{
		public override void Update( float dt ) => throw new InvalidOperationException( "broken" );
	}

	public abstract class NotAComponent : Component
	{
	}

	/// <summary>The host the TypeScript runtime drives (Core/Source/Engine/Scripting): commands in, results out.</summary>
	public class ScriptHostTests
	{
		private static ScriptHost NewHost()
		{
			Spinner.Calls.Clear();
			ScriptHost host = new ScriptHost();
			host.Registry.Register( typeof( ScriptHostTests ).Assembly );
			return host;
		}

		private static ScriptResults Run( ScriptHost host, CommandWriter commands ) => ScriptResults.Read( host.Run( commands.ToArray() ) );

		[Fact]
		public void FindsTheComponentsOfAGameAssembly()
		{
			ScriptRegistry registry = new ScriptRegistry();
			registry.Register( typeof( ScriptHostTests ).Assembly );
			Assert.Equal( typeof( Spinner ), registry.Find( "Spinner" ) );
			Assert.Equal( typeof( Spinner ), registry.Find( "CSEngine.Scripting.Tests.Spinner" ) );
			Assert.Null( registry.Find( "NotAComponent" ) );
			Assert.Null( registry.Find( "Nothing" ) );
			Assert.Contains( "Collector", registry.Names );
		}

		[Fact]
		public void RunsTheLifecycleInTheOrderTheCommandsGiveIt()
		{
			ScriptHost host = NewHost();
			CommandWriter commands = new CommandWriter()
				.Create( 1, 10, "Wheel", "Spinner", new Dictionary<string, object?> { [ "Speed" ] = 2.0, [ "Label" ] = "w" } )
				.Lifecycle( 1, Lifecycle.Awake )
				.Lifecycle( 1, Lifecycle.Start )
				.Transforms( (10, new Vector3( 1, 2, 3 ), Quaternion.Identity) )
				.Hook( Hook.Update, 0.5f )
				.Hook( Hook.PhysicsUpdate, 0.02f );
			ScriptResults results = Run( host, commands );

			Assert.Equal( new[] { "Awake Wheel 2 w", "Start Wheel", "Update 0.5", "Physics 0.02" }, Spinner.Calls );
			// the transform it moved goes back
			(int entity, Vector3 position, Quaternion rotation) = Assert.Single( results.Transforms );
			Assert.Equal( 10, entity );
			Assert.Equal( new Vector3( 2, 2, 3 ), position );
			Assert.Equal( Quaternion.Identity, rotation );

			// untouched transforms are not sent back
			Assert.Empty( Run( host, new CommandWriter().Hook( Hook.PhysicsUpdate, 0.02f ) ).Transforms );
		}

		[Fact]
		public void EventsInputUiEnableAndDestroy()
		{
			ScriptHost host = NewHost();
			Run( host, new CommandWriter().Create( 1, 10, "Wheel", "Spinner", null ).Lifecycle( 1, Lifecycle.Awake ) );
			Spinner.Calls.Clear();

			ScriptResults results = Run( host, new CommandWriter()
				.Event( 1, OverlapEvent.TriggerEnter, 20, "Coin" )
				.Event( 1, OverlapEvent.TriggerExit, 20, "Coin" )
				.Event( 1, OverlapEvent.CollisionEnter, 21, "Wall" )
				.Event( 1, OverlapEvent.CollisionExit, 21, "Wall" )
				.Input( new[] { "Jump", "Fire" }, new[] { "Jump" }, new Dictionary<string, double> { [ "Throttle" ] = 0.5 }, 1, 0 )
				.Hook( Hook.InputUpdate, 0.1f )
				.Hook( Hook.UIUpdate, 0.1f )
				.Enabled( 1, false )
				.Hook( Hook.Update, 0.1f ) // disabled: skipped
				.Enabled( 1, true )
				.Destroy( 1 ) );

			Assert.Equal( new[] { "TriggerEnter Coin", "TriggerExit Coin", "CollisionEnter 21", "CollisionExit 21", "Jump 0.5 <1, 0>", "Disable", "Enable", "Destroy" }, Spinner.Calls );
			Assert.Equal( "0", results.Hud[ "spin" ] );
			// a destroyed component gets nothing more
			Run( host, new CommandWriter().Hook( Hook.Update, 1 ).Destroy( 1 ) );
			Assert.Equal( 8, Spinner.Calls.Count );
		}

		[Fact]
		public void ComponentsTalkThroughTheDataStreamAndAskTheEngineForThings()
		{
			ScriptHost host = NewHost();
			Run( host, new CommandWriter()
				.Create( 1, 10, "Player", "Collector", null )
				.Lifecycle( 1, Lifecycle.Awake )
				.Lifecycle( 1, Lifecycle.Start ) );

			// TypeScript subscribed to Coin.Collected: [[0, "Coin.Collected"]]
			ScriptResults results = Run( host, new CommandWriter()
				.Stream( Convert.FromHexString( "9192" + "00" + "ae" + Convert.ToHexString( "Coin.Collected"u8 ) ) )
				.Event( 1, OverlapEvent.TriggerEnter, 30, "Gold" ) );

			Collector collector = (Collector)host.Components[ 1 ];
			Assert.Equal( 5, collector.Collected ); // its own subscription, synchronously
			Assert.Equal( new[] { "Collected Gold" }, results.Toasts );
			Assert.Equal( new[] { 10 }, results.DestroyedEntities );
			Assert.Contains( results.Logs, log => log.Level == LogLevel.Info && log.Text == "collected" );

			// and the message went to TypeScript as plain data, in the stream batch
			DataStream typescript = new DataStream();
			List<Dictionary<string, object?>> got = new();
			typescript.Subscribe<Dictionary<string, object?>>( "Coin.Collected", got.Add );
			Action<byte[]>? receive = null;
			typescript.Connect( new DelegateLink( _ => { }, r => receive = r ) );
			receive!( Assert.Single( results.StreamBatches ) );
			Assert.Equal( 5L, got[ 0 ][ "Value" ] );
			Assert.Equal( "Gold", got[ 0 ][ "Name" ] );
		}

		[Fact]
		public void AFailingComponentIsReportedAndTheOthersRun()
		{
			ScriptHost host = NewHost();
			ScriptResults results = Run( host, new CommandWriter()
				.Create( 1, 10, "Bad", "Faulty", null )
				.Create( 2, 11, "Good", "Spinner", null )
				.Create( 3, 12, "Ghost", "NoSuchScript", null )
				.Hook( Hook.Update, 1 ) );
			Assert.Contains( "Update 1", Spinner.Calls );
			Assert.Contains( results.Errors, e => e.Component == 1 && e.Message.Contains( "broken" ) );
			Assert.Contains( results.Errors, e => e.Component == 3 && e.Message.Contains( "NoSuchScript" ) );
			Assert.Throws<FormatException>( () => host.Run( new byte[] { 0x91, 0x91, 0x63 } ) );
		}

		[Fact]
		public void TimeAndEntitiesAreSharedAcrossComponents()
		{
			ScriptHost host = NewHost();
			Run( host, new CommandWriter()
				.Create( 1, 10, "Wheel", "Spinner", null )
				.Create( 2, 10, "Wheel", "Collector", null )
				.Time( 12.5, 3, 7 )
				.Hook( Hook.Update, 0.25f ) );
			Spinner spinner = (Spinner)host.Components[ 1 ];
			Assert.Same( spinner.Entity, host.Components[ 2 ].Entity );
			Assert.Same( host.Components[ 2 ], spinner.Entity.GetComponent<Collector>() );
			Assert.Null( spinner.Entity.GetComponent<Faulty>() );
			Assert.Equal( 12.5, spinner.Engine.Time.Elapsed );
			Assert.Equal( 3, spinner.Engine.Time.FrameCount );
			Assert.Equal( 7, spinner.Engine.Time.PhysicsStepCount );
			Assert.Equal( 0.25f, spinner.Engine.Time.Delta );
			Assert.Same( host.Engine.World.Find( "Wheel" ), spinner.Entity );
			Assert.Null( host.Engine.World.Find( "Nobody" ) );
		}
	}
}