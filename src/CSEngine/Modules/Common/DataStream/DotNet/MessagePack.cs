// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

using System;
using System.Buffers.Binary;
using System.Collections;
using System.Collections.Generic;
using System.Text;

namespace CSEngine.Messaging
{
	/// <summary>
	/// MessagePack (https://msgpack.org), the engine's binary format: what crosses between C# and TypeScript (DataStream).
	/// The TypeScript codec (../Source/MessagePack.ts) writes exactly the same bytes: both are checked against
	/// Tests/Vectors.json.
	/// <para>
	/// Values: null, bool, integers (the smallest format that holds them), float (float32), double (float64), string,
	/// byte[] (bin), lists (array) and string-keyed dictionaries (map). Decoding gives long (ulong past long.MaxValue),
	/// double, string, byte[], <see cref="List{T}"/> of object and <see cref="Dictionary{TKey,TValue}"/> of string to
	/// object.
	/// </para>
	/// </summary>
	public static class MessagePack
	{
		[ThreadStatic]
		private static MessagePackWriter? _writer;

		/// <summary>One value as MessagePack (a new array the caller owns).</summary>
		public static byte[] Encode( object? value )
		{
			MessagePackWriter writer = _writer ??= new MessagePackWriter();
			writer.Reset();
			writer.Write( value );
			return writer.WrittenSpan.ToArray();
		}

		/// <summary>The one value in <paramref name="bytes"/>; anything after it is an error.</summary>
		public static object? Decode( ReadOnlySpan<byte> bytes )
		{
			MessagePackReader reader = new MessagePackReader( bytes );
			object? value = reader.Read();
			if ( !reader.Done )
			{
				throw new FormatException( $"MessagePack: {bytes.Length - reader.Offset} byte(s) after the value" );
			}
			return value;
		}

		/// <summary>Whether two decoded values are the same: numbers by value whatever their type, containers deeply.</summary>
		public static bool ValueEquals( object? a, object? b )
		{
			switch ( a )
			{
			case null:
				return b is null;
			case string text:
				return b is string other && text == other;
			case byte[] bytes:
				return b is byte[] otherBytes && bytes.AsSpan().SequenceEqual( otherBytes );
			case IDictionary<string, object?> map:
				if ( b is not IDictionary<string, object?> otherMap || map.Count != otherMap.Count )
				{
					return false;
				}
				foreach ( KeyValuePair<string, object?> entry in map )
				{
					if ( !otherMap.TryGetValue( entry.Key, out object? item ) || !ValueEquals( entry.Value, item ) )
					{
						return false;
					}
				}
				return true;
			case IList list:
				if ( b is not IList otherList || list.Count != otherList.Count )
				{
					return false;
				}
				for ( int i = 0; i < list.Count; i++ )
				{
					if ( !ValueEquals( list[ i ], otherList[ i ] ) )
					{
						return false;
					}
				}
				return true;
			case bool flag:
				return b is bool otherFlag && flag == otherFlag;
			default:
				return b is not null && !( b is bool || b is string || b is IEnumerable ) && Convert.ToDouble( a ) == Convert.ToDouble( b );
			}
		}
	}

	/// <summary>Writes MessagePack into a buffer it grows and reuses: Reset() and write the next message without allocating.</summary>
	public sealed class MessagePackWriter
	{
		private byte[] _bytes;
		private int _length;

		public MessagePackWriter( int capacity = 256 )
		{
			_bytes = new byte[ capacity ];
		}

		/// <summary>What has been written (valid until the next write).</summary>
		public ReadOnlySpan<byte> WrittenSpan => _bytes.AsSpan( 0, _length );

		/// <summary>
		/// The writer's own buffer: what was written, then whatever was there before. For handing the written bytes on
		/// without a copy where the reader stops after its value (the C# / TypeScript bridge's answers).
		/// </summary>
		public byte[] GetBuffer() => _bytes;

		public void Reset() => _length = 0;

		/// <summary>Writes any supported value.</summary>
		public void Write( object? value )
		{
			switch ( value )
			{
			case null:
				WriteNil();
				break;
			case bool flag:
				WriteBoolean( flag );
				break;
			case int number:
				WriteInteger( number );
				break;
			case long number:
				WriteInteger( number );
				break;
			case double number:
				WriteDouble( number );
				break;
			case float number:
				WriteSingle( number );
				break;
			case string text:
				WriteString( text );
				break;
			case byte[] bytes:
				WriteBinary( bytes );
				break;
			case ulong number:
				WriteUnsigned( number );
				break;
			case uint number:
				WriteInteger( number );
				break;
			case short number:
				WriteInteger( number );
				break;
			case ushort number:
				WriteInteger( number );
				break;
			case byte number:
				WriteInteger( number );
				break;
			case sbyte number:
				WriteInteger( number );
				break;
			case IDictionary<string, object?> map:
				WriteMapHeader( map.Count );
				foreach ( KeyValuePair<string, object?> entry in map )
				{
					WriteString( entry.Key );
					Write( entry.Value );
				}
				break;
			case IList list:
				WriteArrayHeader( list.Count );
				for ( int i = 0; i < list.Count; i++ )
				{
					Write( list[ i ] );
				}
				break;
			default:
				throw new NotSupportedException( $"MessagePack can't write a {value.GetType().Name}" );
			}
		}

		public void WriteNil() => Byte( 0xc0 );

		public void WriteBoolean( bool value ) => Byte( value ? (byte)0xc3 : (byte)0xc2 );

		/// <summary>The smallest integer format that holds the value.</summary>
		public void WriteInteger( long value )
		{
			if ( value >= 0 )
			{
				WriteUnsigned( (ulong)value );
				return;
			}
			Span<byte> span = Room( 9 );
			if ( value >= -32 )
			{
				span[ 0 ] = (byte)value;
				_length += 1;
			}
			else if ( value >= sbyte.MinValue )
			{
				span[ 0 ] = 0xd0;
				span[ 1 ] = (byte)value;
				_length += 2;
			}
			else if ( value >= short.MinValue )
			{
				span[ 0 ] = 0xd1;
				BinaryPrimitives.WriteInt16BigEndian( span[ 1.. ], (short)value );
				_length += 3;
			}
			else if ( value >= int.MinValue )
			{
				span[ 0 ] = 0xd2;
				BinaryPrimitives.WriteInt32BigEndian( span[ 1.. ], (int)value );
				_length += 5;
			}
			else
			{
				span[ 0 ] = 0xd3;
				BinaryPrimitives.WriteInt64BigEndian( span[ 1.. ], value );
				_length += 9;
			}
		}

		public void WriteUnsigned( ulong value )
		{
			Span<byte> span = Room( 9 );
			if ( value < 0x80 )
			{
				span[ 0 ] = (byte)value;
				_length += 1;
			}
			else if ( value <= byte.MaxValue )
			{
				span[ 0 ] = 0xcc;
				span[ 1 ] = (byte)value;
				_length += 2;
			}
			else if ( value <= ushort.MaxValue )
			{
				span[ 0 ] = 0xcd;
				BinaryPrimitives.WriteUInt16BigEndian( span[ 1.. ], (ushort)value );
				_length += 3;
			}
			else if ( value <= uint.MaxValue )
			{
				span[ 0 ] = 0xce;
				BinaryPrimitives.WriteUInt32BigEndian( span[ 1.. ], (uint)value );
				_length += 5;
			}
			else
			{
				span[ 0 ] = 0xcf;
				BinaryPrimitives.WriteUInt64BigEndian( span[ 1.. ], value );
				_length += 9;
			}
		}

		public void WriteDouble( double value )
		{
			Span<byte> span = Room( 9 );
			span[ 0 ] = 0xcb;
			BinaryPrimitives.WriteDoubleBigEndian( span[ 1.. ], value );
			_length += 9;
		}

		public void WriteSingle( float value )
		{
			Span<byte> span = Room( 5 );
			span[ 0 ] = 0xca;
			BinaryPrimitives.WriteSingleBigEndian( span[ 1.. ], value );
			_length += 5;
		}

		public void WriteString( string value )
		{
			int length = Encoding.UTF8.GetByteCount( value );
			Room( 5 + length );
			if ( length < 0x20 )
			{
				Byte( (byte)( 0xa0 | length ) );
			}
			else
			{
				SizedHeader( length, 0xd9 );
			}
			_length += Encoding.UTF8.GetBytes( value, _bytes.AsSpan( _length ) );
		}

		public void WriteBinary( ReadOnlySpan<byte> value )
		{
			Room( 5 + value.Length );
			SizedHeader( value.Length, 0xc4 );
			value.CopyTo( _bytes.AsSpan( _length ) );
			_length += value.Length;
		}

		/// <summary>Bytes that already are MessagePack (values written by another writer).</summary>
		public void WriteRaw( ReadOnlySpan<byte> bytes )
		{
			bytes.CopyTo( Room( bytes.Length ) );
			_length += bytes.Length;
		}

		public void WriteArrayHeader( int count ) => ContainerHeader( count, 0x90, 0xdc );

		public void WriteMapHeader( int count ) => ContainerHeader( count, 0x80, 0xde );

		/// <summary>A length as 8/16/32 bits after the format bytes first, first + 1, first + 2.</summary>
		private void SizedHeader( int length, byte first )
		{
			Span<byte> span = Room( 5 );
			if ( length <= byte.MaxValue )
			{
				span[ 0 ] = first;
				span[ 1 ] = (byte)length;
				_length += 2;
			}
			else if ( length <= ushort.MaxValue )
			{
				span[ 0 ] = (byte)( first + 1 );
				BinaryPrimitives.WriteUInt16BigEndian( span[ 1.. ], (ushort)length );
				_length += 3;
			}
			else
			{
				span[ 0 ] = (byte)( first + 2 );
				BinaryPrimitives.WriteUInt32BigEndian( span[ 1.. ], (uint)length );
				_length += 5;
			}
		}

		private void ContainerHeader( int count, byte fix, byte sized )
		{
			Span<byte> span = Room( 5 );
			if ( count < 0x10 )
			{
				span[ 0 ] = (byte)( fix | count );
				_length += 1;
			}
			else if ( count <= ushort.MaxValue )
			{
				span[ 0 ] = sized;
				BinaryPrimitives.WriteUInt16BigEndian( span[ 1.. ], (ushort)count );
				_length += 3;
			}
			else
			{
				span[ 0 ] = (byte)( sized + 1 );
				BinaryPrimitives.WriteUInt32BigEndian( span[ 1.. ], (uint)count );
				_length += 5;
			}
		}

		private void Byte( byte value )
		{
			Room( 1 )[ 0 ] = value;
			_length++;
		}

		/// <summary>At least <paramref name="extra"/> free bytes at the end; returns them.</summary>
		private Span<byte> Room( int extra )
		{
			int needed = _length + extra;
			if ( needed > _bytes.Length )
			{
				Array.Resize( ref _bytes, Math.Max( needed, _bytes.Length * 2 ) );
			}
			return _bytes.AsSpan( _length );
		}
	}

	/// <summary>Reads MessagePack values one after another from bytes.</summary>
	public ref struct MessagePackReader
	{
		private readonly ReadOnlySpan<byte> _bytes;
		private int _offset;

		public MessagePackReader( ReadOnlySpan<byte> bytes )
		{
			_bytes = bytes;
			_offset = 0;
		}

		public readonly int Offset => _offset;

		/// <summary>Every byte has been read.</summary>
		public readonly bool Done => _offset >= _bytes.Length;

		/// <summary>The next value, whatever it is (see <see cref="MessagePack"/> for the types).</summary>
		public object? Read()
		{
			byte type = Byte();
			if ( type < 0x80 )
			{
				return (long)type;
			}
			if ( type >= 0xe0 )
			{
				return (long)(sbyte)type;
			}
			if ( type >= 0xa0 && type <= 0xbf )
			{
				return Text( type & 0x1f );
			}
			if ( type >= 0x90 && type <= 0x9f )
			{
				return Array( type & 0x0f );
			}
			if ( type <= 0x8f )
			{
				return Map( type & 0x0f );
			}
			switch ( type )
			{
			case 0xc0: return null;
			case 0xc2: return false;
			case 0xc3: return true;
			case 0xc4: return Take( Byte() ).ToArray();
			case 0xc5: return Take( UInt16() ).ToArray();
			case 0xc6: return Take( Length32() ).ToArray();
			case 0xca: return (double)BinaryPrimitives.ReadSingleBigEndian( Take( 4 ) );
			case 0xcb: return BinaryPrimitives.ReadDoubleBigEndian( Take( 8 ) );
			case 0xcc: return (long)Byte();
			case 0xcd: return (long)UInt16();
			case 0xce: return (long)BinaryPrimitives.ReadUInt32BigEndian( Take( 4 ) );
			case 0xcf:
				ulong unsigned = BinaryPrimitives.ReadUInt64BigEndian( Take( 8 ) );
				return unsigned <= long.MaxValue ? (long)unsigned : unsigned;
			case 0xd0: return (long)(sbyte)Byte();
			case 0xd1: return (long)BinaryPrimitives.ReadInt16BigEndian( Take( 2 ) );
			case 0xd2: return (long)BinaryPrimitives.ReadInt32BigEndian( Take( 4 ) );
			case 0xd3: return BinaryPrimitives.ReadInt64BigEndian( Take( 8 ) );
			case 0xd9: return Text( Byte() );
			case 0xda: return Text( UInt16() );
			case 0xdb: return Text( Length32() );
			case 0xdc: return Array( UInt16() );
			case 0xdd: return Array( Length32() );
			case 0xde: return Map( UInt16() );
			case 0xdf: return Map( Length32() );
			default:
				throw new NotSupportedException( $"MessagePack type 0x{type:x2} is not supported" );
			}
		}

		/// <summary>Moves past a nil and returns true, or returns false and moves nowhere.</summary>
		public bool TryReadNil()
		{
			if ( _offset < _bytes.Length && _bytes[ _offset ] == 0xc0 )
			{
				_offset++;
				return true;
			}
			return false;
		}

		public string ReadString() => Encoding.UTF8.GetString( ReadStringBytes() );

		/// <summary>A string's UTF-8 bytes, in place (nothing allocated: compare them, or decode them).</summary>
		public ReadOnlySpan<byte> ReadStringBytes()
		{
			byte type = Peek( "Expected a string" );
			if ( type >= 0xa0 && type <= 0xbf )
			{
				_offset++;
				return Take( type & 0x1f );
			}
			switch ( type )
			{
			case 0xd9:
				_offset++;
				return Take( Byte() );
			case 0xda:
				_offset++;
				return Take( UInt16() );
			case 0xdb:
				_offset++;
				return Take( Length32() );
			default:
				throw new FormatException( "Expected a string" );
			}
		}

		public bool ReadBoolean()
		{
			byte type = Peek( "Expected a boolean" );
			if ( type != 0xc2 && type != 0xc3 )
			{
				throw new FormatException( "Expected a boolean" );
			}
			_offset++;
			return type == 0xc3;
		}

		/// <summary>An integer, whatever its encoding (read in place: no boxing).</summary>
		public long ReadInteger()
		{
			byte type = Peek( "Expected an integer" );
			if ( type < 0x80 || type >= 0xe0 )
			{
				_offset++;
				return type < 0x80 ? type : (sbyte)type;
			}
			switch ( type )
			{
			case 0xcc:
				_offset++;
				return Byte();
			case 0xcd:
				_offset++;
				return UInt16();
			case 0xce:
				_offset++;
				return BinaryPrimitives.ReadUInt32BigEndian( Take( 4 ) );
			case 0xcf:
				ulong unsigned = BinaryPrimitives.ReadUInt64BigEndian( _bytes.Slice( _offset + 1, 8 ) );
				if ( unsigned > long.MaxValue )
				{
					throw new FormatException( "Expected an integer" );
				}
				_offset += 9;
				return (long)unsigned;
			case 0xd0:
				_offset++;
				return (sbyte)Byte();
			case 0xd1:
				_offset++;
				return BinaryPrimitives.ReadInt16BigEndian( Take( 2 ) );
			case 0xd2:
				_offset++;
				return BinaryPrimitives.ReadInt32BigEndian( Take( 4 ) );
			case 0xd3:
				_offset++;
				return BinaryPrimitives.ReadInt64BigEndian( Take( 8 ) );
			default:
				throw new FormatException( "Expected an integer" );
			}
		}

		/// <summary>Any number (an integer too) as a double.</summary>
		public double ReadDouble()
		{
			byte type = Peek( "Expected a number" );
			switch ( type )
			{
			case 0xca:
				_offset++;
				return BinaryPrimitives.ReadSingleBigEndian( Take( 4 ) );
			case 0xcb:
				_offset++;
				return BinaryPrimitives.ReadDoubleBigEndian( Take( 8 ) );
			default:
				try
				{
					return ReadInteger();
				}
				catch ( FormatException )
				{
					throw new FormatException( "Expected a number" );
				}
			}
		}

		private readonly byte Peek( string expected ) =>
			_offset < _bytes.Length ? _bytes[ _offset ] : throw new FormatException( $"{expected}: read past the end of the data" );

		/// <summary>The element count of an array; the elements follow.</summary>
		public int ReadArrayHeader()
		{
			byte type = Byte();
			return type switch
			{
				>= 0x90 and <= 0x9f => type & 0x0f,
				0xdc => UInt16(),
				0xdd => Length32(),
				_ => throw new FormatException( $"Expected an array, got type 0x{type:x2}" ),
			};
		}

		/// <summary>The entry count of a map; key, value pairs follow.</summary>
		public int ReadMapHeader()
		{
			byte type = Byte();
			return type switch
			{
				>= 0x80 and <= 0x8f => type & 0x0f,
				0xde => UInt16(),
				0xdf => Length32(),
				_ => throw new FormatException( $"Expected a map, got type 0x{type:x2}" ),
			};
		}

		private List<object?> Array( int count )
		{
			List<object?> list = new List<object?>( count );
			for ( int i = 0; i < count; i++ )
			{
				list.Add( Read() );
			}
			return list;
		}

		private Dictionary<string, object?> Map( int count )
		{
			Dictionary<string, object?> map = new Dictionary<string, object?>( count );
			for ( int i = 0; i < count; i++ )
			{
				string key = Read() as string ?? throw new FormatException( "MessagePack maps here have string keys" );
				map[ key ] = Read();
			}
			return map;
		}

		private string Text( int length ) => Encoding.UTF8.GetString( Take( length ) );

		private byte Byte() => Take( 1 )[ 0 ];

		private ushort UInt16() => BinaryPrimitives.ReadUInt16BigEndian( Take( 2 ) );

		private int Length32() => checked((int)BinaryPrimitives.ReadUInt32BigEndian( Take( 4 ) ));

		private ReadOnlySpan<byte> Take( int length )
		{
			if ( _offset + length > _bytes.Length )
			{
				throw new FormatException( "MessagePack: read past the end of the data" );
			}
			ReadOnlySpan<byte> span = _bytes.Slice( _offset, length );
			_offset += length;
			return span;
		}
	}
}