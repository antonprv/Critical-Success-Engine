// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using CSEngine.Bridge;
using CSEngine.DI;
using Sample;
using Sample.Shared;
using System.Numerics;
using Xunit;

namespace CSEngine.Scripting.Tests
{
	/// <summary>The test contract's implementation: what either side may have.</summary>
	public sealed class Arena : IArena
	{
		public int Points;

		public void Add( int points ) => Points += points;

		public int Total() => Points;

		public Hit Echo( Hit hit ) => hit;

		public Place? Find( string? name, Team team ) =>
			name is null ? null : new Place { At = new Vector3( 1, 2, 3 ), Facing = new Quaternion( 0, 1, 0, 0 ), Name = $"{name} of {team}" };

		public int[] Count( double[][] values, bool flag ) => values.Select( row => flag ? row.Length : (int)row.Sum() ).ToArray();

		public void Fail( string message ) => throw new InvalidOperationException( message );
	}

	/// <summary>A C# service of the game, bound by its installer.</summary>
	public interface IReferee
	{
		string Call();
	}

	public sealed class Referee : IReferee
	{
		[Inject]
		private readonly ScriptEngine _engine = null!;

		public string Call() => $"referee at {_engine.Time.FrameCount}";
	}

	/// <summary>A game's installer: found in its assembly and installed by the host.</summary>
	public sealed class TestGameInstaller : Installer
	{
		public override void InstallBindings( ContainerBuilder builder )
		{
			builder.Bind<IReferee>().To<Referee>();
			builder.Bind<IEmpty>().FromTypeScript();
		}
	}

	/// <summary>A C# component that implements a contract (TypeScript reaches it on its entity) and uses the others.</summary>
	public sealed class ArenaKeeper : Component, IArena
	{
		[Inject]
		private readonly IReferee _referee = null!;

		[FromTypeScript]
		private readonly IArena _typeScriptArena = null!;

		public static string Log = "";

		private readonly Arena _own = new();

		public override void Awake() => Log = _referee.Call();

		public override void Update( float dt ) => Log = $"TypeScript total {_typeScriptArena.Total()}";

		public void Add( int points ) => _own.Add( points );

		public int Total() => _own.Total();

		public Hit Echo( Hit hit ) => hit;

		public Place? Find( string? name, Team team ) => _own.Find( name, team );

		public int[] Count( double[][] values, bool flag ) => _own.Count( values, flag );

		public void Fail( string message ) => _own.Fail( message );
	}

	public interface IUnbound
	{
	}

	public sealed class NeedyComponent : Component
	{
		public static bool Woke;

		[Inject]
		private readonly IUnbound _missing = null!;

		public override void Awake() => Woke = _missing is null;
	}

	public sealed class BridgeTests
	{
		/// <summary>Two bridges back to back: what one calls, the other serves (as TypeScript would).</summary>
		private static (ScriptBridge Caller, Arena Served, List<int> Entities) Pair()
		{
			ScriptBridge served = new();
			Arena arena = new();
			List<int> entities = new();
			served.Resolver = ( type, entity ) =>
			{
				entities.Add( entity );
				return type == typeof( IArena ) ? arena : null;
			};
			ScriptBridge caller = new() { Send = request => served.Serve( request ) };
			return (caller, arena, entities);
		}

		[Fact]
		public void EveryKindOfValueCrossesBothWays()
		{
			(ScriptBridge caller, Arena served, List<int> entities) = Pair();
			IArena arena = caller.TypeScript<IArena>( 7 );
			arena.Add( 5 );
			arena.Add( 2 );
			Assert.Equal( 7, arena.Total() );
			Assert.Equal( 7, served.Points );
			Assert.Equal( new[] { 7, 7, 7 }, entities );

			Hit hit = new()
			{
				Damage = 1.5f,
				Where = new Place { At = new Vector3( 4, 5, 6 ), Facing = Quaternion.Identity, Name = null },
				Tags = new[] { "fire", "ice" },
				Scores = new int?[] { 1, null, 3 },
				By = Team.Blue,
				Data = new byte[] { 1, 2, 3 },
				Next = new Hit { Damage = 2, By = null },
			};
			Hit back = arena.Echo( hit );
			Assert.Equal( 1.5f, back.Damage );
			Assert.Equal( new Vector3( 4, 5, 6 ), back.Where.At );
			Assert.Equal( Quaternion.Identity, back.Where.Facing );
			Assert.Null( back.Where.Name );
			Assert.Equal( hit.Tags, back.Tags );
			Assert.Equal( hit.Scores, back.Scores );
			Assert.Equal( Team.Blue, back.By );
			Assert.Equal( hit.Data, back.Data );
			Assert.Equal( 2, back.Next!.Damage );
			Assert.Null( back.Next.By );
			Assert.Null( back.Next.Next );
			Assert.Empty( back.Next.Tags );

			Place place = arena.Find( "Gate", Team.Red )!;
			Assert.Equal( ("Gate of Red", new Vector3( 1, 2, 3 ), new Quaternion( 0, 1, 0, 0 )), (place.Name, place.At, place.Facing) );
			Assert.Null( arena.Find( null, Team.Red ) );
			Assert.Equal( new[] { 2, 0 }, arena.Count( new[] { new[] { 1.0, 2.0 }, Array.Empty<double>() }, true ) );
			Assert.Equal( new[] { 3, 0 }, arena.Count( new[] { new[] { 1.0, 2.0 }, Array.Empty<double>() }, false ) );
		}

		/// <summary>The caller's outgoing slots wired to the served bridge's incoming ones, as TypeScript does it.</summary>
		private static void ThroughSlots( ScriptBridge caller, ScriptBridge served )
		{
			int depth = 0;
			byte[]? overflow = null;
			caller.SendSlot = ( slot, length ) =>
			{
				// "TypeScript": the request is in the caller's slot; it hands it to the served side's incoming slot
				caller.Slots.Outgoing( slot )[ ..length ].CopyTo( served.Slots.Incoming( depth ) );
				int answered = served.ServeSlot( depth++, length );
				depth--;
				byte[] answer = answered >= 0 ? served.Slots.Incoming( depth )[ ..answered ].ToArray() : served.TakeOverflow();
				if ( answer.Length > SharedSlots.SlotSize )
				{
					overflow = answer;
					return -1;
				}
				answer.CopyTo( caller.Slots.Outgoing( slot ) );
				return answer.Length;
			};
			caller.TakeTypeScriptOverflow = () => overflow!;
		}

		[Fact]
		public void CallsCrossThroughTheSharedSlotsAlike()
		{
			(ScriptBridge caller, Arena served, _) = Pair();
			ScriptBridge servedBridge = new() { Resolver = ( type, _ ) => type == typeof( IArena ) ? served : null };
			ThroughSlots( caller, servedBridge );
			IArena arena = caller.TypeScript<IArena>();
			arena.Add( 4 );
			Assert.Equal( 4, arena.Total() );
			Assert.Equal( "Gate of Blue", arena.Find( "Gate", Team.Blue )!.Name );
			// an answer larger than a slot comes the long way
			Hit big = new() { Data = new byte[ SharedSlots.SlotSize + 10 ] };
			Assert.Equal( big.Data.Length, arena.Echo( big ).Data.Length );
			// a request larger than a slot is sent as a byte array
			caller.Send = request => servedBridge.Serve( request );
			Assert.Equal( big.Data.Length, arena.Echo( big ).Data.Length );
			Assert.Equal( "No answer is waiting", Assert.Throws<BridgeException>( () => servedBridge.TakeOverflow() ).Message );
			Assert.Equal( "TypeScript has no answer waiting", Assert.Throws<BridgeException>( () => new ScriptBridge().TakeTypeScriptOverflow() ).Message );
		}

		[Fact]
		public void CallsNestedDeeperThanTheSlotsGoAsByteArrays()
		{
			int calls = 0;
			ScriptBridge a = new(), b = new();
			IArena Deeper( ScriptBridge self ) => new DeepArena( () => ++calls < 20 ? 1 + self.TypeScript<IArena>().Total() : 100 );
			a.Resolver = ( _, _ ) => Deeper( a );
			b.Resolver = ( _, _ ) => Deeper( b );
			ThroughSlots( a, b );
			ThroughSlots( b, a );
			a.Send = request => b.Serve( request );
			b.Send = request => a.Serve( request );
			// 19 nested calls each way: the first 8 levels through slots, the rest as arrays
			Assert.Equal( 119, a.TypeScript<IArena>().Total() );
		}

		private sealed class DeepArena : IArena
		{
			private readonly Func<int> _total;

			public DeepArena( Func<int> total ) => _total = total;

			public int Total() => _total();

			public void Add( int points )
			{
			}

			public Hit Echo( Hit hit ) => hit;

			public Place? Find( string? name, Team team ) => null;

			public int[] Count( double[][] values, bool flag ) => Array.Empty<int>();

			public void Fail( string message )
			{
			}
		}

		[Fact]
		public void ErrorsComeBackAsExceptions()
		{
			(ScriptBridge caller, _, _) = Pair();
			BridgeException failed = Assert.Throws<BridgeException>( () => caller.TypeScript<IArena>().Fail( "boom" ) );
			Assert.Equal( "TypeScript Sample.IArena: InvalidOperationException: boom", failed.Message );
			BridgeException missing = Assert.Throws<BridgeException>( () => caller.TypeScript<IReferee>() );
			Assert.Equal( "IReferee is not a contract both languages know: declare it in a .contract file", missing.Message );
			Assert.Equal( "TypeScript is not connected", Assert.Throws<BridgeException>( () => new ScriptBridge().TypeScript<IArena>().Total() ).Message );
			Assert.Equal( "String is not a contract both languages know: declare it in a .contract file", Assert.Throws<BridgeException>( () => caller.TypeScript( typeof( string ) ) ).Message );
		}

		[Fact]
		public void UnknownContractsAndMethodsAreReported()
		{
			ScriptBridge served = new() { Resolver = ( _, _ ) => new Arena() };
			Messaging.MessagePackWriter writer = new();
			string Answer( string contract, int method )
			{
				writer.Reset();
				writer.WriteArrayHeader( 4 );
				writer.WriteString( contract );
				writer.WriteInteger( ScriptBridge.NoEntity );
				writer.WriteInteger( method );
				writer.WriteArrayHeader( 0 );
				Messaging.MessagePackReader reader = new( served.Serve( writer.WrittenSpan ) );
				reader.ReadArrayHeader();
				return $"{reader.ReadBoolean()} {reader.Read()}";
			}
			Assert.Equal( "False C# doesn't know the contract Game.INothing (is its .contract.cs in the project?)", Answer( "Game.INothing", 0 ) );
			Assert.Equal( "False IArena has no method 99", Answer( "Sample.IArena", 99 ) );
			Assert.Equal( "True 0", Answer( "Sample.IArena", 1 ) );
			served.Resolver = ( _, _ ) => null;
			Assert.Equal( "False nothing in C# implements Sample.IArena (a component, or a binding in an installer)", Answer( "Sample.IArena", 1 ) );
		}

		[Fact]
		public void TheHostInjectsComponentsAndAnswersTypeScriptFromThem()
		{
			ScriptHost host = new();
			host.Registry.Register( typeof( BridgeTests ).Assembly );
			Arena typeScriptArena = new() { Points = 42 };
			// "TypeScript": answers C#'s calls with its own arena
			ScriptBridge typeScript = new() { Resolver = ( type, _ ) => type == typeof( IArena ) ? typeScriptArena : null, Send = request => host.Call( request ) };
			host.Bridge.Send = request => typeScript.Serve( request );

			ScriptResults results = ScriptResults.Read( host.Run( new CommandWriter()
				.Time( 1, 9, 0 )
				.Create( 1, 20, "Keeper", "ArenaKeeper", null )
				.Lifecycle( 1, Lifecycle.Awake )
				.Hook( Hook.Update, 0.016f )
				.ToArray() ) );
			Assert.Empty( results.Errors );
			Assert.Equal( "TypeScript total 42", ArenaKeeper.Log );

			// TypeScript calling the component on its entity, and the container's service
			IArena keeper = typeScript.TypeScript<IArena>( 20 );
			keeper.Add( 3 );
			Assert.Equal( 3, keeper.Total() );
			Assert.Same( host.Container.Resolve<IReferee>(), host.Container.Resolve<IReferee>() );
			Assert.Equal( "referee at 9", host.Container.Resolve<IReferee>().Call() );
			Assert.IsAssignableFrom<IEmpty>( host.Container.Resolve<IEmpty>() );
			// the answer is kept for the next calls - until the entity's components change
			Assert.Equal( 3, keeper.Total() );
			host.Run( new CommandWriter().Destroy( 1 ).ToArray() );
			Assert.Contains( "nothing in C# implements Sample.IArena on entity 20", Assert.Throws<BridgeException>( () => keeper.Total() ).Message );
			// an entity without one: the container (which has no IArena)
			Assert.Contains( "nothing in C# implements Sample.IArena on entity 5", Assert.Throws<BridgeException>( () => typeScript.TypeScript<IArena>( 5 ).Total() ).Message );
		}

		[Fact]
		public void AComponentWhoseFieldCantBeFilledIsReportedAndStillRuns()
		{
			ScriptHost host = new();
			host.Registry.Register( typeof( BridgeTests ).Assembly );
			ScriptResults results = ScriptResults.Read( host.Run( new CommandWriter()
				.Create( 1, 20, "Needy", "NeedyComponent", null )
				.Lifecycle( 1, Lifecycle.Awake ).ToArray() ) );
			Assert.Equal( (1, "InvalidOperationException: NeedyComponent._missing needs IUnbound, and nothing is bound to it"), results.Errors.Single() );
			Assert.True( NeedyComponent.Woke );
		}
	}
}