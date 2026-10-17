// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// MessagePack (https://msgpack.org), the engine's binary format: what crosses
// between TypeScript and C# (DataStream), and what settings and UI documents
// can be stored as. The C# codec (DotNet/MessagePack.cs) writes exactly the
// same bytes: both are checked against Tests/Vectors.json.
//
// Values: null/undefined -> nil, booleans, numbers (whole ones as the smallest
// integer format, the rest as float64), bigint (int64/uint64), strings,
// Uint8Array (bin), arrays, plain objects and Maps with string keys (map).

/** A number always written as float64, even when it is whole (2 -> 2.0). */
export class Float64 {
	public constructor( public readonly Value: number ) {
	}
}

const Utf8Encoder = new TextEncoder();
const Utf8Decoder = new TextDecoder();

// Strings up to this many characters are encoded and decoded by hand: for
// short strings (tags, keys) the TextEncoder/TextDecoder call costs more than
// the loop.
const ShortString = 32;

/**
 * Writes MessagePack into a buffer it grows and reuses: Reset() and write the
 * next message without allocating.
 */
export class MessagePackWriter {
	private _bytes: Uint8Array;

	private _view: DataView;

	private _length = 0;

	public constructor( capacity = 256 ) {
		this._bytes = new Uint8Array( capacity );
		this._view = new DataView( this._bytes.buffer );
	}

	/**
	 * What has been written: a view into the writer's buffer (valid until the
	 * next write).
	 */
	public get Bytes(): Uint8Array {
		return this._bytes.subarray( 0, this._length );
	}

	public get Length(): number {
		return this._length;
	}

	public Reset(): void {
		this._length = 0;
	}

	/** Writes any supported value. */
	public Write( value: unknown ): void {
		switch ( typeof value ) {
			case "undefined":
				this.WriteNil();
				return;
			case "boolean":
				this.WriteBoolean( value );
				return;
			case "number":
				this.WriteNumber( value );
				return;
			case "bigint":
				this.WriteBigInt( value );
				return;
			case "string":
				this.WriteString( value );
				return;
			case "object":
				this.WriteObject( value );
				return;
			default:
				throw new TypeError(
					`MessagePack can't write a ${ typeof value }`,
				);
		}
	}

	public WriteNil(): void {
		this.Ensure( 1 );
		this._bytes[this._length++] = 0xc0;
	}

	public WriteBoolean( value: boolean ): void {
		this.Ensure( 1 );
		this._bytes[this._length++] = value ? 0xc3 : 0xc2;
	}

	/** Whole numbers in the smallest integer format, the rest as float64. */
	public WriteNumber( value: number ): void {
		if ( !Number.isSafeInteger( value ) ) {
			this.WriteFloat64( value );
			return;
		}
		this.Ensure( 9 );
		const bytes = this._bytes;

		if ( value >= 0 ) {
			if ( value < 0x80 ) {
				bytes[this._length++] = value;
			}
			else if ( value < 0x100 ) {
				bytes[this._length++] = 0xcc;
				bytes[this._length++] = value;
			}
			else if ( value < 0x10000 ) {
				bytes[this._length++] = 0xcd;
				this._view.setUint16( this._length, value );
				this._length += 2;
			}
			else if ( value < 0x100000000 ) {
				bytes[this._length++] = 0xce;
				this._view.setUint32( this._length, value );
				this._length += 4;
			}
			else {
				bytes[this._length++] = 0xcf;
				this._view.setBigUint64( this._length, BigInt( value ) );
				this._length += 8;
			}
		}
		else if ( value >= -32 ) {
			bytes[this._length++] = value & 0xff;
		}
		else if ( value >= -0x80 ) {
			bytes[this._length++] = 0xd0;
			this._view.setInt8( this._length++, value );
		}
		else if ( value >= -0x8000 ) {
			bytes[this._length++] = 0xd1;
			this._view.setInt16( this._length, value );
			this._length += 2;
		}
		else if ( value >= -0x80000000 ) {
			bytes[this._length++] = 0xd2;
			this._view.setInt32( this._length, value );
			this._length += 4;
		}
		else {
			bytes[this._length++] = 0xd3;
			this._view.setBigInt64( this._length, BigInt( value ) );
			this._length += 8;
		}
	}

	public WriteFloat64( value: number ): void {
		this.Ensure( 9 );
		this._bytes[this._length++] = 0xcb;
		this._view.setFloat64( this._length, value );
		this._length += 8;
	}

	/** int64/uint64 (or a smaller format when it fits a safe integer). */
	public WriteBigInt( value: bigint ): void {
		if ( value >= -0x1fffffffffffffn && value <= 0x1fffffffffffffn ) {
			this.WriteNumber( Number( value ) );
			return;
		}
		if ( value > 0xffffffffffffffffn || value < -0x8000000000000000n ) {
			throw new RangeError(
				`MessagePack integers are 64 bits: ${ value }`,
			);
		}
		this.Ensure( 9 );
		if ( value > 0n ) {
			this._bytes[this._length++] = 0xcf;
			this._view.setBigUint64( this._length, value );
		}
		else {
			this._bytes[this._length++] = 0xd3;
			this._view.setBigInt64( this._length, value );
		}
		this._length += 8;
	}

	public WriteString( value: string ): void {
		if ( value.length <= ShortString && this.TryWriteAscii( value ) ) {
			return;
		}
		// UTF-8 takes at most 3 bytes per UTF-16 unit.
		this.Ensure( 5 + value.length * 3 );
		const header = value.length * 3 < 0x100
			? 2
			: value.length * 3 < 0x10000
				? 3
				: 5;
		const written = Utf8Encoder.encodeInto(
			value,
			this._bytes.subarray( this._length + header ),
		).written;

		// The header was sized for the worst case; move the text when the real
		// length needs a smaller one (the smallest format is the canonical
		// one).
		const needed = written < 0x20
			? 1
			: written < 0x100
				? 2
				: written < 0x10000
					? 3
					: 5;

		if ( needed !== header ) {
			this._bytes.copyWithin(
				this._length + needed,
				this._length + header,
				this._length + header + written,
			);
		}
		this.WriteStringHeader( written );
		this._length += written;
	}

	public WriteBinary( value: Uint8Array ): void {
		const length = value.length;
		this.Ensure( 5 + length );

		if ( length < 0x100 ) {
			this._bytes[this._length++] = 0xc4;
			this._bytes[this._length++] = length;
		}
		else if ( length < 0x10000 ) {
			this._bytes[this._length++] = 0xc5;
			this._view.setUint16( this._length, length );
			this._length += 2;
		}
		else {
			this._bytes[this._length++] = 0xc6;
			this._view.setUint32( this._length, length );
			this._length += 4;
		}
		this._bytes.set( value, this._length );
		this._length += length;
	}

	/**
	 * Bytes that already are MessagePack (a value written by another writer).
	 */
	public WriteRaw( bytes: Uint8Array ): void {
		this.Ensure( bytes.length );
		this._bytes.set( bytes, this._length );
		this._length += bytes.length;
	}

	public WriteArrayHeader( count: number ): void {
		this.WriteContainerHeader( count, 0x90, 0xdc );
	}

	public WriteMapHeader( count: number ): void {
		this.WriteContainerHeader( count, 0x80, 0xde );
	}

	private WriteObject( value: object | null ): void {
		if ( value === null ) {
			this.WriteNil();
		}
		else if ( value instanceof Float64 ) {
			this.WriteFloat64( value.Value );
		}
		else if ( value instanceof Uint8Array ) {
			this.WriteBinary( value );
		}
		else if ( Array.isArray( value ) ) {
			this.WriteArrayHeader( value.length );
			for ( const item of value ) {
				this.Write( item );
			}
		}
		else if ( value instanceof Map ) {
			this.WriteMapHeader( value.size );
			for ( const [key, item] of value ) {
				if ( typeof key !== "string" ) {
					throw new TypeError(
						"MessagePack maps here have string keys",
					);
				}
				this.WriteString( key );
				this.Write( item );
			}
		}
		else {
			const record = value as Record<string, unknown>;
			let count = 0;

			for ( const key in record ) {
				if ( record[key] !== undefined ) {
					count++;
				}
			}
			this.WriteMapHeader( count );
			for ( const key in record ) {
				const item = record[key];

				if ( item !== undefined ) {
					this.WriteString( key );
					this.Write( item );
				}
			}
		}
	}

	/**
	 * Short ASCII strings without TextEncoder; false (nothing written) when
	 * there is a non-ASCII character.
	 */
	private TryWriteAscii( value: string ): boolean {
		const length = value.length;
		this.Ensure( 2 + length );
		const bytes = this._bytes;
		const start = this._length + ( length < 0x20 ? 1 : 2 );

		for ( let i = 0; i < length; i++ ) {
			const code = value.charCodeAt( i );

			if ( code > 0x7f ) {
				return false;
			}
			bytes[start + i] = code;
		}
		this.WriteStringHeader( length );
		this._length += length;
		return true;
	}

	private WriteStringHeader( length: number ): void {
		const bytes = this._bytes;

		if ( length < 0x20 ) {
			bytes[this._length++] = 0xa0 | length;
		}
		else if ( length < 0x100 ) {
			bytes[this._length++] = 0xd9;
			bytes[this._length++] = length;
		}
		else if ( length < 0x10000 ) {
			bytes[this._length++] = 0xda;
			this._view.setUint16( this._length, length );
			this._length += 2;
		}
		else {
			bytes[this._length++] = 0xdb;
			this._view.setUint32( this._length, length );
			this._length += 4;
		}
	}

	private WriteContainerHeader(
		count: number,
		fix: number,
		sized: number,
	): void {
		this.Ensure( 5 );

		if ( count < 0x10 ) {
			this._bytes[this._length++] = fix | count;
		}
		else if ( count < 0x10000 ) {
			this._bytes[this._length++] = sized;
			this._view.setUint16( this._length, count );
			this._length += 2;
		}
		else {
			this._bytes[this._length++] = sized + 1;
			this._view.setUint32( this._length, count );
			this._length += 4;
		}
	}

	private Ensure( extra: number ): void {
		const needed = this._length + extra;

		if ( needed <= this._bytes.length ) {
			return;
		}
		let capacity = this._bytes.length * 2;

		while ( capacity < needed ) {
			capacity *= 2;
		}
		const bytes = new Uint8Array( capacity );
		bytes.set( this._bytes.subarray( 0, this._length ) );
		this._bytes = bytes;
		this._view = new DataView( bytes.buffer );
	}
}

/**
 * Reads MessagePack values one after another from a byte array (or a view into
 * one).
 */
export class MessagePackReader {
	private readonly _bytes: Uint8Array;

	private readonly _view: DataView;

	private _offset = 0;

	public constructor( bytes: Uint8Array ) {
		this._bytes = bytes;
		this._view = new DataView(
			bytes.buffer,
			bytes.byteOffset,
			bytes.byteLength,
		);
	}

	public get Offset(): number {
		return this._offset;
	}

	/** Every byte has been read. */
	public get Done(): boolean {
		return this._offset >= this._bytes.length;
	}

	/**
	 * The next value, whatever it is. Binaries are copied out (they outlive the
	 * buffer).
	 */
	public Read(): unknown {
		const type = this.Byte();

		if ( type < 0x80 ) {
			return type;
		}
		if ( type >= 0xe0 ) {
			return type - 0x100;
		}
		if ( type >= 0xa0 && type <= 0xbf ) {
			return this.Text( type & 0x1f );
		}
		if ( type >= 0x90 && type <= 0x9f ) {
			return this.Array( type & 0x0f );
		}
		if ( type <= 0x8f ) {
			return this.Map( type & 0x0f );
		}

		switch ( type ) {
			case 0xc0: return null;
			case 0xc2: return false;
			case 0xc3: return true;
			case 0xc4: return this.Binary( this.Byte() );
			case 0xc5: return this.Binary( this.Uint16() );
			case 0xc6: return this.Binary( this.Uint32() );
			case 0xca: return this.Float32();
			case 0xcb: return this.Float64();
			case 0xcc: return this.Byte();
			case 0xcd: return this.Uint16();
			case 0xce: return this.Uint32();
			case 0xcf: return this.Uint64();
			case 0xd0: return this.Int8();
			case 0xd1: return this.Int16();
			case 0xd2: return this.Int32();
			case 0xd3: return this.Int64();
			case 0xd9: return this.Text( this.Byte() );
			case 0xda: return this.Text( this.Uint16() );
			case 0xdb: return this.Text( this.Uint32() );
			case 0xdc: return this.Array( this.Uint16() );
			case 0xdd: return this.Array( this.Uint32() );
			case 0xde: return this.Map( this.Uint16() );
			case 0xdf: return this.Map( this.Uint32() );
			default:
				throw new TypeError(
					`MessagePack type 0x${ type.toString( 16 ) } is not `
						+ "supported",
				);
		}
	}

	public ReadString(): string {
		const value = this.Read();

		if ( typeof value !== "string" ) {
			throw new TypeError(
				`Expected a string, got ${ String( value ) }`,
			);
		}
		return value;
	}

	/**
	 * A number (a 64-bit integer past 2^53 loses precision here: use Read() for
	 * a bigint).
	 */
	public ReadNumber(): number {
		const value = this.Read();

		if ( typeof value === "bigint" ) {
			return Number( value );
		}
		if ( typeof value !== "number" ) {
			throw new TypeError(
				`Expected a number, got ${ String( value ) }`,
			);
		}
		return value;
	}

	/** The element count of an array; the elements follow. */
	public ReadArrayHeader(): number {
		const type = this.Byte();

		if ( type >= 0x90 && type <= 0x9f ) {
			return type & 0x0f;
		}
		if ( type === 0xdc ) {
			return this.Uint16();
		}
		if ( type === 0xdd ) {
			return this.Uint32();
		}
		throw new TypeError(
			`Expected an array, got type 0x${ type.toString( 16 ) }`,
		);
	}

	/** The entry count of a map; key, value pairs follow. */
	public ReadMapHeader(): number {
		const type = this.Byte();

		if ( type >= 0x80 && type <= 0x8f ) {
			return type & 0x0f;
		}
		if ( type === 0xde ) {
			return this.Uint16();
		}
		if ( type === 0xdf ) {
			return this.Uint32();
		}
		throw new TypeError(
			`Expected a map, got type 0x${ type.toString( 16 ) }`,
		);
	}

	private Array( count: number ): unknown[] {
		const array = new Array<unknown>( count );

		for ( let i = 0; i < count; i++ ) {
			array[i] = this.Read();
		}
		return array;
	}

	private Map( count: number ): Record<string, unknown> {
		const map: Record<string, unknown> = {};

		for ( let i = 0; i < count; i++ ) {
			const key = this.Read();

			if ( typeof key !== "string" ) {
				throw new TypeError( "MessagePack maps here have string keys" );
			}
			const value = this.Read();

			if ( key === "__proto__" ) {
				Object.defineProperty(
					map,
					key,
					{
						value,
						enumerable: true,
						writable: true,
						configurable: true,
					},
				);
			}
			else {
				map[key] = value;
			}
		}
		return map;
	}

	private Text( length: number ): string {
		const start = this.Take( length );
		const bytes = this._bytes;

		if ( length <= ShortString ) {
			let text = "";

			for ( let i = 0; i < length; i++ ) {
				const code = bytes[start + i]!;

				if ( code > 0x7f ) {
					return Utf8Decoder.decode(
						bytes.subarray( start, start + length ),
					);
				}
				text += String.fromCharCode( code );
			}
			return text;
		}
		return Utf8Decoder.decode( bytes.subarray( start, start + length ) );
	}

	private Binary( length: number ): Uint8Array {
		const start = this.Take( length );

		return this._bytes.slice( start, start + length );
	}

	private Byte(): number {
		return this._bytes[this.Take( 1 )]!;
	}

	private Uint16(): number {
		return this._view.getUint16( this.Take( 2 ) );
	}

	private Uint32(): number {
		return this._view.getUint32( this.Take( 4 ) );
	}

	private Uint64(): number | bigint {
		const value = this._view.getBigUint64( this.Take( 8 ) );

		return value <= 0x1fffffffffffffn ? Number( value ) : value;
	}

	private Int8(): number {
		return this._view.getInt8( this.Take( 1 ) );
	}

	private Int16(): number {
		return this._view.getInt16( this.Take( 2 ) );
	}

	private Int32(): number {
		return this._view.getInt32( this.Take( 4 ) );
	}

	private Int64(): number | bigint {
		const value = this._view.getBigInt64( this.Take( 8 ) );

		return value >= -0x1fffffffffffffn ? Number( value ) : value;
	}

	private Float32(): number {
		return this._view.getFloat32( this.Take( 4 ) );
	}

	private Float64(): number {
		return this._view.getFloat64( this.Take( 8 ) );
	}

	/** Moves past `length` bytes and returns where they start. */
	private Take( length: number ): number {
		const start = this._offset;

		if ( start + length > this._bytes.length ) {
			throw new RangeError(
				"MessagePack: read past the end of the data",
			);
		}
		this._offset = start + length;
		return start;
	}
}

const SharedWriter = new MessagePackWriter();

/** One value as MessagePack (a new array the caller owns). */
export function Encode( value: unknown ): Uint8Array {
	SharedWriter.Reset();
	SharedWriter.Write( value );
	return SharedWriter.Bytes.slice();
}

/** The one value in `bytes`; anything after it is an error. */
export function Decode( bytes: Uint8Array ): unknown {
	const reader = new MessagePackReader( bytes );
	const value = reader.Read();

	if ( !reader.Done ) {
		throw new RangeError(
			`MessagePack: ${ bytes.length - reader.Offset } byte(s) after the `
				+ "value",
		);
	}
	return value;
}
