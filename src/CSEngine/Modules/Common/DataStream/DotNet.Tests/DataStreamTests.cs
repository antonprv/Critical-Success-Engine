// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Numerics;

using Xunit;

namespace CSEngine.Messaging.Tests
{
	public sealed class Damage
	{
		public float Amount;
		public string Source { get; set; } = "";
	}

	public sealed record Hit( int Id, Vector3 At, string[] Tags );

	public enum Team
	{
		Red,
		Blue,
	}

	public sealed class Squad
	{
		public Team Team;
		public List<int> Members = new();
		public Dictionary<string, double> Scores = new();
		public Damage? Last;
		public int? Optional;
	}

	/// <summary>The C# DataStream: the same behaviour as the TypeScript one (Tests/DataStream.test.ts).</summary>
	public class DataStreamTests
	{
		[Fact]
		public void TagsAreInterned()
		{
			DataTag<Damage> damage = DataTag.For<Damage>( "Test.Damage" );
			Assert.Same( damage, DataTag.For<Damage>( "Test.Damage" ) );
			Assert.Equal( "Test.Damage", damage.ToString() );
			Assert.NotEqual( damage.Id, DataTag.For<int>( "Test.Other" ).Id );
			// one name, one id, whatever type a subscriber reads it as
			Assert.Equal( damage.Id, DataTag.For<Dictionary<string, object?>>( "Test.Damage" ).Id );
		}

		[Fact]
		public void DeliversSynchronouslyInOrderToEveryTagSubscriber()
		{
			DataStream stream = new DataStream();
			List<string> got = new();
			stream.Subscribe<Damage>( "Damage", d => got.Add( $"a:{d.Amount}" ) );
			stream.Subscribe( DataTag.For<Damage>( "Damage" ), d => got.Add( $"b:{d.Source}" ) );
			stream.Subscribe<int>( "Heal", _ => got.Add( "heal" ) );
			stream.Publish( "Damage", new Damage { Amount = 5, Source = "Trap" } );
			stream.Publish( "Nobody", 1 );
			Assert.Equal( new[] { "a:5", "b:Trap" }, got );
			Assert.Equal( 2, stream.SubscriberCount( "Damage" ) );
			Assert.Equal( 0, stream.SubscriberCount( "Nothing" ) );
		}

		[Fact]
		public void SubscriptionsEndEvenDuringADelivery()
		{
			DataStream stream = new DataStream();
			List<int> got = new();
			IDisposable? second = null;
			IDisposable first = stream.Subscribe<int>( "T", v =>
			{
				got.Add( v );
				second!.Dispose();
			} );
			second = stream.Subscribe<int>( "T", v => got.Add( -v ) );
			stream.Publish( "T", 1 );
			first.Dispose();
			first.Dispose();
			stream.Publish( "T", 2 );
			Assert.Equal( new[] { 1 }, got );

			IDisposable? late = null;
			IDisposable? once = null;
			once = stream.Subscribe<int>( "U", _ =>
			{
				late ??= stream.Subscribe<int>( "U", v => got.Add( v * 10 ) );
				once!.Dispose();
			} );
			stream.Publish( "U", 3 );
			stream.Publish( "U", 4 );
			Assert.Equal( new[] { 1, 40 }, got );
		}

		[Fact]
		public void AThrowingSubscriberDoesNotStopTheOthers()
		{
			List<Exception> errors = new();
			DataStream stream = new DataStream( errors.Add );
			bool after = false;
			stream.Subscribe<int>( "T", _ => throw new InvalidOperationException( "boom" ) );
			stream.Subscribe<int>( "T", _ => after = true );
			stream.Publish( "T", 1 );
			Assert.True( after );
			Assert.Equal( "boom", errors[ 0 ].Message );
		}

		[Fact]
		public void PostQueuesInARingAndFlushDeliversInOrder()
		{
			DataStream stream = new DataStream( queueCapacity: 2 );
			List<int> got = new();
			stream.Subscribe<int>( "N", n =>
			{
				got.Add( n );
				if ( n == 1 )
				{
					stream.Post( "N", 100 );
				}
			} );
			for ( int i = 1; i <= 5; i++ )
			{
				stream.Post( "N", i );
			}
			Assert.Empty( got );
			Assert.Equal( 5, stream.Pending );
			stream.Flush();
			Assert.Equal( new[] { 1, 2, 3, 4, 5, 100 }, got );

			got.Clear();
			for ( int round = 0; round < 6; round++ )
			{
				stream.Post( "N", 10 + round );
				stream.Post( "N", 20 + round );
				stream.Flush();
			}
			Assert.Equal( new[] { 10, 20, 11, 21, 12, 22, 13, 23, 14, 24, 15, 25 }, got );

			stream.Post( "N", 1 );
			stream.Clear();
			stream.Flush();
			stream.Publish( "N", 2 );
			Assert.Equal( 12, got.Count );
		}

		[Fact]
		public void ObservableOperatorsLikeR3()
		{
			DataStream stream = new DataStream();
			List<string> got = new();
			IDisposable subscription = stream.Observe<Damage>( "Damage" )
				.Where( d => d.Amount > 0 )
				.Select( d => d.Source )
				.DistinctUntilChanged()
				.Skip( 1 )
				.Take( 2 )
				.Subscribe( got.Add );
			foreach ( (float amount, string source) in new[] { (1f, "a"), (0f, "zero"), (2f, "b"), (3f, "b"), (4f, "c"), (5f, "d") } )
			{
				stream.Publish( "Damage", new Damage { Amount = amount, Source = source } );
			}
			Assert.Equal( new[] { "b", "c" }, got );
			Assert.Equal( 0, stream.SubscriberCount( "Damage" ) );
			subscription.Dispose();

			List<int> merged = new();
			IDisposable both = Observable.Merge( stream.Observe<int>( "A" ), stream.Observe<int>( "B" ) ).Subscribe( merged.Add );
			stream.Publish( "A", 1 );
			stream.Publish( "B", 2 );
			both.Dispose();
			stream.Publish( "A", 3 );
			Assert.Equal( new[] { 1, 2 }, merged );

			List<Exception> errors = new();
			stream.Observe<int>( "E" ).Select<int>( _ => throw new InvalidOperationException( "select" ) ).Subscribe( _ => { }, errors.Add );
			stream.Publish( "E", 1 );
			Assert.Equal( "select", errors[ 0 ].Message );
			stream.Observe<int>( "T0" ).Take( 0 ).Subscribe( _ => throw new Exception() ).Dispose();
			stream.Publish( "T0", 1 );
		}

		[Fact]
		public void ReactivePropertyGivesTheCurrentValueThenChanges()
		{
			ReactiveProperty<int> health = new ReactiveProperty<int>( 100 );
			List<int> got = new();
			IDisposable subscription = health.Subscribe( got.Add );
			health.Value = 90;
			health.Value = 90;
			health.Value = 80;
			subscription.Dispose();
			health.Value = 70;
			Assert.Equal( new[] { 100, 90, 80 }, got );

			DataStream stream = new DataStream();
			List<int> published = new();
			stream.Subscribe<int>( "Score", published.Add );
			ReactiveProperty<int> score = new ReactiveProperty<int>( 0 ).PublishTo( stream, "Score" );
			score.Value = 10;
			score.Dispose();
			score.Value = 20;
			Assert.Equal( new[] { 10 }, published );
		}

		[Fact]
		public void TypedMessagesMapToAndFromPlainData()
		{
			// what TypeScript sends: plain objects, numbers, arrays
			byte[] bytes = MessagePack.Encode( new Dictionary<string, object?>
			{
				[ "Id" ] = 7L,
				[ "At" ] = new Dictionary<string, object?> { [ "X" ] = 1.5, [ "Y" ] = 2L, [ "Z" ] = 0L },
				[ "Tags" ] = new List<object?> { "fire", "crit" },
			} );
			Hit hit = MessageMapper.Read<Hit>( bytes );
			Assert.Equal( 7, hit.Id );
			Assert.Equal( new Vector3( 1.5f, 2, 0 ), hit.At );
			Assert.Equal( new[] { "fire", "crit" }, hit.Tags );

			Squad squad = new Squad
			{
				Team = Team.Blue,
				Members = { 1, 2 },
				Scores = { [ "kills" ] = 3.5 },
				Last = new Damage { Amount = 2, Source = "Ice" },
			};
			Squad back = MessageMapper.Read<Squad>( MessageMapper.Write( squad ) );
			Assert.Equal( Team.Blue, back.Team );
			Assert.Equal( new[] { 1, 2 }, back.Members );
			Assert.Equal( 3.5, back.Scores[ "kills" ] );
			Assert.Equal( "Ice", back.Last!.Source );
			Assert.Null( back.Optional );

			// what it looks like on the TypeScript side
			Dictionary<string, object?> plain = (Dictionary<string, object?>)MessagePack.Decode( MessageMapper.Write( squad ) )!;
			Assert.Equal( 1L, plain[ "Team" ] );
			Assert.Equal( "Ice", ( (Dictionary<string, object?>)plain[ "Last" ]! )[ "Source" ] );

			// names match ignoring case; missing members keep their defaults; unknown ones are ignored
			Damage loose = MessageMapper.Convert<Damage>( new Dictionary<string, object?> { [ "amount" ] = 4L, [ "Extra" ] = true } );
			Assert.Equal( 4f, loose.Amount );
			Assert.Equal( "", loose.Source );
			Assert.Equal( Team.Red, MessageMapper.Convert<Team>( "Red" ) );
			Assert.Equal( 3, MessageMapper.Convert<int>( 3.0 ) );
			Assert.Equal( 5, MessageMapper.Convert<int?>( 5L ) );
			Assert.Null( MessageMapper.Convert<string>( null ) );
			Assert.Equal( new[] { 1.5, 2 }, MessageMapper.Convert<double[]>( new List<object?> { 1.5, 2L } ) );
			Assert.Throws<FormatException>( () => MessageMapper.Convert<int>( "x" ) );
		}

		[Fact]
		public void LinkedStreamsCarryTypedMessagesOnlyToSubscribedTags()
		{
			DataStream csharp = new DataStream();
			DataStream other = new DataStream();
			int batches = 0;
			DataStream.Link( csharp, other, _ => batches++ );

			List<Damage> got = new();
			IDisposable subscription = other.Subscribe<Damage>( "Damage", got.Add );
			other.Flush();
			csharp.Publish( "Damage", new Damage { Amount = 5, Source = "Trap" } );
			csharp.Publish( "Unwatched", 1 );
			Assert.Empty( got );
			csharp.Flush();
			Assert.Single( got );
			Assert.Equal( "Trap", got[ 0 ].Source );

			// a subscriber reading the same tag as plain data
			List<Dictionary<string, object?>> raw = new();
			other.Subscribe<Dictionary<string, object?>>( "Damage", raw.Add );
			csharp.Publish( "Damage", new Damage { Amount = 1, Source = "x" } );
			csharp.Flush();
			Assert.Equal( "x", raw[ 0 ][ "Source" ] );

			subscription.Dispose();
			Assert.True( batches > 0 );
		}

		[Fact]
		public void TheBatchFormatIsTheTypeScriptOne()
		{
			// [[0, "T"]] then [[2, "T", 7]], exactly what Source/DataStream.ts writes and reads
			List<byte[]> sent = new();
			Action<byte[]>? receive = null;
			DataStream stream = new DataStream();
			stream.Connect( new DelegateLink( sent.Add, r => receive = r ) );
			List<int> got = new();
			stream.Subscribe<int>( "T", got.Add );
			stream.Flush();
			Assert.Equal( "919200a154", Convert.ToHexString( sent[ 0 ] ).ToLowerInvariant() );

			receive!( Convert.FromHexString( "919200a154" ) ); // the other side subscribes to T
			stream.Publish( "T", 7 );
			stream.Flush();
			Assert.Equal( "919302a15407", Convert.ToHexString( sent[ 1 ] ).ToLowerInvariant() );
			receive( Convert.FromHexString( "919302a15409" ) );
			Assert.Equal( new[] { 7, 9 }, got );
			receive( Convert.FromHexString( "919201a154" ) ); // withdrawn
			stream.Publish( "T", 8 );
			stream.Flush();
			Assert.Equal( 2, sent.Count );

			Assert.Throws<FormatException>( () => receive( Convert.FromHexString( "919207a154" ) ) );
			Assert.Throws<FormatException>( () => receive( Convert.FromHexString( "9109" ) ) );
			stream.Disconnect();
			stream.Subscribe<int>( "Z", _ => { } );
			stream.Flush();
			Assert.Equal( 2, sent.Count );
		}
	}
}