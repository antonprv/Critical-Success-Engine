// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System.Text.Json;

using Xunit;

namespace CSEngine.Messaging.Tests
{
	/// <summary>The C# codec on the vectors the TypeScript one is checked against: the same bytes both ways.</summary>
	public class MessagePackTests
	{
		public static IEnumerable<object[]> Vectors()
		{
			using JsonDocument document = JsonDocument.Parse( File.ReadAllText( Path.Combine( AppContext.BaseDirectory, "Vectors.json" ) ) );
			foreach ( JsonElement vector in document.RootElement.GetProperty( "vectors" ).EnumerateArray() )
			{
				yield return new object[] { vector.GetProperty( "name" ).GetString()!, vector.GetProperty( "value" ).GetRawText(), vector.GetProperty( "hex" ).GetString()! };
			}
		}

		/// <summary>The vectors' JSON value as the codec's value model ($bin, $f64 markers).</summary>
		private static object? ToValue( JsonElement json )
		{
			switch ( json.ValueKind )
			{
			case JsonValueKind.Null:
				return null;
			case JsonValueKind.True:
				return true;
			case JsonValueKind.False:
				return false;
			case JsonValueKind.String:
				return json.GetString();
			case JsonValueKind.Number:
				string text = json.GetRawText();
				return text.Contains( '.' ) || text.Contains( 'e' ) || text.Contains( 'E' ) ? json.GetDouble() : (object)json.GetInt64();
			case JsonValueKind.Array:
				return json.EnumerateArray().Select( ToValue ).ToList();
			default:
				if ( json.TryGetProperty( "$bin", out JsonElement bin ) )
				{
					return Convert.FromHexString( bin.GetString()! );
				}
				if ( json.TryGetProperty( "$f64", out JsonElement f64 ) )
				{
					return f64.GetDouble();
				}
				Dictionary<string, object?> map = new();
				foreach ( JsonProperty property in json.EnumerateObject() )
				{
					map[ property.Name ] = ToValue( property.Value );
				}
				return map;
			}
		}

		private static string Hex( byte[] bytes ) => Convert.ToHexString( bytes ).ToLowerInvariant();

		[Theory]
		[MemberData( nameof( Vectors ) )]
		public void EncodesTheVector( string name, string json, string hex )
		{
			using JsonDocument value = JsonDocument.Parse( json );
			Assert.Equal( hex, Hex( MessagePack.Encode( ToValue( value.RootElement ) ) ) );
		}

		[Theory]
		[MemberData( nameof( Vectors ) )]
		public void DecodesTheVector( string name, string json, string hex )
		{
			using JsonDocument value = JsonDocument.Parse( json );
			object? expected = ToValue( value.RootElement );
			object? actual = MessagePack.Decode( Convert.FromHexString( hex ) );
			Assert.True( MessagePack.ValueEquals( expected, actual ), name );
		}

		[Fact]
		public void SixtyFourBitIntegersAndFloats()
		{
			Assert.Equal( "cf8000000000000000", Hex( MessagePack.Encode( 9223372036854775808UL ) ) );
			Assert.Equal( "d38000000000000000", Hex( MessagePack.Encode( long.MinValue ) ) );
			Assert.Equal( 9223372036854775808UL, MessagePack.Decode( Convert.FromHexString( "cf8000000000000000" ) ) );
			Assert.Equal( long.MinValue, MessagePack.Decode( Convert.FromHexString( "d38000000000000000" ) ) );
			Assert.Equal( 5L, MessagePack.Decode( Convert.FromHexString( "cf0000000000000005" ) ) );
			// a float is float32 (exact, and half the size); TypeScript reads it as a number
			Assert.Equal( "ca3fc00000", Hex( MessagePack.Encode( 1.5f ) ) );
			Assert.Equal( 1.5, MessagePack.Decode( Convert.FromHexString( "ca3fc00000" ) ) );
			Assert.Equal( "05", Hex( MessagePack.Encode( 5 ) ) );
			Assert.Equal( "05", Hex( MessagePack.Encode( (byte)5 ) ) );
			Assert.Equal( "fb", Hex( MessagePack.Encode( (short)-5 ) ) );
			Assert.Equal( "d0db", Hex( MessagePack.Encode( (short)-37 ) ) );
			Assert.Equal( "cdffff", Hex( MessagePack.Encode( (ushort)65535 ) ) );
			Assert.Equal( "ceffffffff", Hex( MessagePack.Encode( uint.MaxValue ) ) );
			Assert.Equal( "d080", Hex( MessagePack.Encode( (sbyte)-128 ) ) );
		}

		[Fact]
		public void ThirtyTwoBitLengths()
		{
			string big = new string( 'y', 70000 );
			Assert.Equal( "db00011170", Hex( MessagePack.Encode( big )[ ..5 ] ) );
			Assert.Equal( big, MessagePack.Decode( MessagePack.Encode( big ) ) );
			Assert.Equal( "c600011170", Hex( MessagePack.Encode( new byte[ 70000 ] )[ ..5 ] ) );
			List<object?> list = Enumerable.Repeat<object?>( 0L, 70000 ).ToList();
			Assert.Equal( "dd00011170", Hex( MessagePack.Encode( list )[ ..5 ] ) );
			Dictionary<string, object?> map = Enumerable.Range( 0, 70000 ).ToDictionary( i => $"k{i}", i => (object?)(long)i );
			Assert.Equal( "df00011170", Hex( MessagePack.Encode( map )[ ..5 ] ) );
			Assert.True( MessagePack.ValueEquals( map, MessagePack.Decode( MessagePack.Encode( map ) ) ) );
			Assert.Equal( "A", MessagePack.Decode( Convert.FromHexString( "db0000000141" ) ) );
			Assert.Equal( new byte[] { 1 }, MessagePack.Decode( Convert.FromHexString( "c60000000101" ) ) );
		}

		[Fact]
		public void RefusesWhatItCantRepresent()
		{
			Assert.Throws<NotSupportedException>( () => MessagePack.Encode( new object() ) );
			Assert.Throws<NotSupportedException>( () => MessagePack.Decode( Convert.FromHexString( "d401" ) ) );
			Assert.Throws<FormatException>( () => MessagePack.Decode( Convert.FromHexString( "810101" ) ) );
			Assert.Throws<FormatException>( () => MessagePack.Decode( Convert.FromHexString( "a341" ) ) );
			Assert.Throws<FormatException>( () => MessagePack.Decode( Array.Empty<byte>() ) );
			Assert.Throws<FormatException>( () => MessagePack.Decode( Convert.FromHexString( "c0c0" ) ) );
		}

		[Fact]
		public void TheWriterAndReaderWorkInPlace()
		{
			MessagePackWriter writer = new MessagePackWriter( 4 );
			writer.WriteArrayHeader( 2 );
			writer.WriteString( "Hit" );
			writer.WriteMapHeader( 1 );
			writer.WriteString( "Amount" );
			writer.WriteDouble( 3 );
			writer.WriteBinary( new byte[] { 9 } );
			writer.WriteNil();
			writer.WriteBoolean( false );
			writer.WriteInteger( -1 );
			byte[] bytes = writer.WrittenSpan.ToArray();

			MessagePackReader reader = new MessagePackReader( bytes );
			Assert.Equal( 2, reader.ReadArrayHeader() );
			Assert.Equal( "Hit", reader.ReadString() );
			Assert.Equal( 1, reader.ReadMapHeader() );
			Assert.Equal( "Amount", reader.ReadString() );
			Assert.Equal( 3.0, reader.ReadDouble() );
			Assert.Equal( new byte[] { 9 }, reader.Read() );
			Assert.True( reader.TryReadNil() );
			Assert.False( reader.ReadBoolean() );
			Assert.False( reader.Done );
			Assert.Equal( -1L, reader.ReadInteger() );
			Assert.True( reader.Done );

			writer.Reset();
			Assert.Equal( 0, writer.WrittenSpan.Length );
			writer.Write( "again" );
			Assert.Equal( "again", MessagePack.Decode( writer.WrittenSpan.ToArray() ) );

			Assert.Throws<FormatException>( () => new MessagePackReader( new byte[] { 0xc0 } ).ReadString() );
			Assert.Throws<FormatException>( () => new MessagePackReader( new byte[] { 0xc0 } ).ReadInteger() );
			Assert.Throws<FormatException>( () => new MessagePackReader( new byte[] { 0xc0 } ).ReadDouble() );
			Assert.Throws<FormatException>( () => new MessagePackReader( new byte[] { 0xc0 } ).ReadBoolean() );
			Assert.Throws<FormatException>( () => new MessagePackReader( new byte[] { 0xc0 } ).ReadArrayHeader() );
			Assert.Throws<FormatException>( () => new MessagePackReader( new byte[] { 0xc0 } ).ReadMapHeader() );
			Assert.False( new MessagePackReader( new byte[] { 0x01 } ).TryReadNil() );
			Assert.Equal( 2.0, new MessagePackReader( new byte[] { 0x02 } ).ReadDouble() );
		}

		[Fact]
		public void TypedReadsTakeEveryEncodingOfTheirTypeWithoutBoxing()
		{
			MessagePackWriter writer = new MessagePackWriter();
			long[] integers = { 0, 127, -1, -32, -33, 200, -200, 40_000, -40_000, 3_000_000_000, -3_000_000_000, long.MaxValue, long.MinValue };
			foreach ( long integer in integers )
			{
				writer.WriteInteger( integer );
			}
			writer.WriteUnsigned( 5 );
			writer.WriteDouble( 1.5 );
			writer.WriteSingle( 2.5f );
			writer.WriteInteger( 7 );
			writer.WriteBoolean( true );
			string[] texts = { "short", new string( 'a', 40 ), new string( 'b', 300 ), new string( 'c', 70_000 ) };
			foreach ( string text in texts )
			{
				writer.WriteString( text );
			}
			writer.WriteString( "Game.IRound" );

			MessagePackReader reader = new MessagePackReader( writer.WrittenSpan );
			foreach ( long integer in integers )
			{
				Assert.Equal( integer, reader.ReadInteger() );
			}
			Assert.Equal( 5L, reader.ReadInteger() );
			Assert.Equal( 1.5, reader.ReadDouble() );
			Assert.Equal( 2.5, reader.ReadDouble() );
			Assert.Equal( 7.0, reader.ReadDouble() );
			Assert.True( reader.ReadBoolean() );
			foreach ( string text in texts )
			{
				Assert.Equal( text, reader.ReadString() );
			}
			Assert.Equal( "Game.IRound"u8.ToArray(), reader.ReadStringBytes().ToArray() );
			Assert.True( reader.Done );

			// past long.MaxValue is not an integer here
			writer.Reset();
			writer.WriteUnsigned( ulong.MaxValue );
			Assert.Equal( "Expected an integer", Assert.Throws<FormatException>( () => new MessagePackReader( writer.WrittenSpan.ToArray() ).ReadInteger() ).Message );
			Assert.Throws<FormatException>( () => new MessagePackReader( new byte[] { 0xc3 } ).ReadStringBytes().ToArray() );
		}

		[Fact]
		public void TheWritersBufferStartsWithWhatWasWritten()
		{
			MessagePackWriter writer = new MessagePackWriter( 8 );
			writer.WriteString( "ok" );
			byte[] buffer = writer.GetBuffer();
			Assert.True( buffer.Length >= writer.WrittenSpan.Length );
			Assert.Equal( writer.WrittenSpan.ToArray(), buffer[ ..writer.WrittenSpan.Length ] );
		}
	}
}