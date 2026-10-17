// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	Decode, Encode, Float64, MessagePackReader, MessagePackWriter,
} from "../Source/MessagePack.ts";

interface Vector {
	name: string;
	value: unknown;
	hex: string;
}

const Vectors = ( JSON.parse(
	readFileSync( new URL( "./Vectors.json", import.meta.url ), "utf8" ),
) as { vectors: Vector[]; } ).vectors;

/** The vectors' JSON value as the codec sees it ($bin, $f64 markers). */
function ToValue( json: unknown ): unknown {
	if ( Array.isArray( json ) ) {
		return json.map( ToValue );
	}
	if ( json !== null && typeof json === "object" ) {
		const object = json as Record<string, unknown>;

		if ( "$bin" in object ) {
			return Uint8Array.from(
				Buffer.from( object["$bin"] as string, "hex" ),
			);
		}
		if ( "$f64" in object ) {
			return new Float64( object["$f64"] as number );
		}
		return Object.fromEntries(
			Object.entries( object ).map( ( [k, v] ) => [k, ToValue( v )] ),
		);
	}
	return json;
}

/** What decoding gives back: a Float64 is just its number. */
function Decoded( value: unknown ): unknown {
	if ( value instanceof Float64 ) {
		return value.Value;
	}
	if ( Array.isArray( value ) ) {
		return value.map( Decoded );
	}
	if ( value !== null
		&& typeof value === "object"
		&& !( value instanceof Uint8Array ) ) {
		return Object.fromEntries(
			Object.entries( value ).map( ( [k, v] ) => [k, Decoded( v )] ),
		);
	}
	return value;
}

const Hex = ( bytes: Uint8Array ) => Buffer.from( bytes ).toString( "hex" );
const Bytes = ( hex: string ) => Uint8Array.from( Buffer.from( hex, "hex" ) );

describe(
	"MessagePack: the shared vectors (the C# codec checks the same file)",
	() => {
		it.each( Vectors )( "encodes $name", ( vector ) => {
			expect( Hex( Encode( ToValue( vector.value ) ) ) )
				.toBe( vector.hex );
		} );

		it.each( Vectors )( "decodes $name", ( vector ) => {
			expect( Decode( Bytes( vector.hex ) ) )
				.toEqual( Decoded( ToValue( vector.value ) ) );
		} );
	},
);

describe( "MessagePack: beyond the vectors", () => {
	it( "64-bit integers past 2^53 are bigints both ways", () => {
		expect( Hex( Encode( 2n ** 63n ) ) ).toBe( "cf8000000000000000" );
		expect( Hex( Encode( -( 2n ** 63n ) ) ) ).toBe( "d38000000000000000" );
		expect( Hex( Encode( 5n ) ) ).toBe( "05" );
		expect( Decode( Bytes( "cf8000000000000000" ) ) ).toBe( 2n ** 63n );
		expect( Decode( Bytes( "d38000000000000000" ) ) )
			.toBe( -( 2n ** 63n ) );
		// integers JS numbers can't hold exactly are written as doubles
		expect( Hex( Encode( 2 ** 60 ) ) ).toBe( "cb43b0000000000000" );
		expect( () => Encode( 2n ** 64n ) ).toThrow( /64 bits/ );
	} );

	it( "reads float32, and the 32-bit lengths", () => {
		expect( Decode( Bytes( "ca3fc00000" ) ) ).toBe( 1.5 );
		expect( Decode( Bytes( "db00000001" + "41" ) ) ).toBe( "A" );
		expect( Decode( Bytes( "c60000000101" ) ) )
			.toEqual( Uint8Array.of( 1 ) );
		expect( Decode( Bytes( "dd00000001c3" ) ) ).toEqual( [true] );
		expect( Decode( Bytes( "df00000001a161c0" ) ) ).toEqual( { a: null } );
		expect( Decode( Bytes( "d9020102" ) ) ).toBe( "\u0001\u0002" );
		expect( Decode( Bytes( "c4020102" ) ) )
			.toEqual( Uint8Array.of( 1, 2 ) );
	} );

	it(
		"writes the 32-bit lengths for big strings, binaries, arrays and maps",
		() => {
			const big = "y".repeat( 70000 );
			expect( Hex( Encode( big ).subarray( 0, 5 ) ) )
				.toBe( "db00011170" );
			expect( Decode( Encode( big ) ) ).toBe( big );
			expect( Hex( Encode( new Uint8Array( 70000 ) ).subarray( 0, 5 ) ) )
				.toBe( "c600011170" );
			expect(
				Hex(
					Encode( Array.from( { length: 70000 }, () => 0 ) )
						.subarray( 0, 5 ),
				),
			).toBe( "dd00011170" );
			const map = Object.fromEntries(
				Array.from( { length: 70000 }, ( _, i ) => [`k${ i }`, i] ),
			);
			expect( Hex( Encode( map ).subarray( 0, 5 ) ) )
				.toBe( "df00011170" );
			expect( Decode( Encode( map ) ) ).toEqual( map );
		},
	);

	it(
		"long and non-ASCII strings take the TextEncoder path and come back "
			+ "intact",
		() => {
			// the longest short string
			expect( Hex( Encode( "z".repeat( 32 ) ).subarray( 0, 2 ) ) )
				.toBe( "d920" );
			for ( const text of [
				"é".repeat( 40 ),
				"😀 emoji",
				"a".repeat( 100 ) + "Ж",
				"\u0000\u007f",
			] ) {
				expect( Decode( Encode( text ) ) ).toBe( text );
			}
		},
	);

	it(
		"undefined is nil, undefined properties are left out, Maps are maps",
		() => {
			expect( Hex( Encode( undefined ) ) ).toBe( "c0" );
			expect( Decode( Encode( { a: 1, b: undefined } ) ) )
				.toEqual( { a: 1 } );
			expect( Decode( Encode( new Map( [["x", 1]] ) ) ) )
				.toEqual( { x: 1 } );
			expect( Decode( Encode( [undefined] ) ) ).toEqual( [null] );
		},
	);

	it( "a __proto__ key is a plain key, not the object's prototype", () => {
		const decoded = Decode( Bytes( "81a95f5f70726f746f5f5f01" ) ) as Record<
			string,
			unknown
		>;
		expect( Object.getPrototypeOf( decoded ) ).toBe( Object.prototype );
		expect( Object.getOwnPropertyDescriptor( decoded, "__proto__" )?.value )
			.toBe( 1 );
	} );

	it( "refuses what it can't represent", () => {
		expect( () => Encode( () => 1 ) ).toThrow( /function/ );
		expect( () => Encode( Symbol( "s" ) ) ).toThrow( /symbol/ );
		expect( () => Encode( new Map( [[1, 1]] ) ) ).toThrow( /keys/ );
		expect( () => Decode( Bytes( "d401" ) ) ).toThrow( /0xd4/ );
		expect( () => Decode( Bytes( "81" + "01" + "01" ) ) ).toThrow( /keys/ );
		expect( () => Decode( Bytes( "a3" + "41" ) ) )
			.toThrow( /past the end/ );
		expect( () => Decode( Bytes( "" ) ) ).toThrow( /past the end/ );
		expect( () => Decode( Bytes( "c0c0" ) ) ).toThrow( /1 byte.* after/ );
	} );

	it(
		"the writer is reused without allocating; the reader reads a sequence",
		() => {
			const writer = new MessagePackWriter( 4 );
			writer.WriteArrayHeader( 2 );
			writer.WriteString( "Hit" );
			writer.WriteMapHeader( 1 );
			writer.WriteString( "Amount" );
			writer.WriteFloat64( 3 );
			writer.WriteBinary( Uint8Array.of( 9 ) );
			writer.WriteNil();
			writer.WriteBoolean( false );
			writer.WriteNumber( -1 );
			const bytes = writer.Bytes.slice();
			expect( writer.Length ).toBe( bytes.length );

			const reader = new MessagePackReader( bytes );
			expect( reader.ReadArrayHeader() ).toBe( 2 );
			expect( reader.ReadString() ).toBe( "Hit" );
			expect( reader.ReadMapHeader() ).toBe( 1 );
			expect( reader.Read() ).toBe( "Amount" );
			expect( reader.ReadNumber() ).toBe( 3 );
			expect( reader.Read() ).toEqual( Uint8Array.of( 9 ) );
			expect( reader.Read() ).toBe( null );
			expect( reader.Read() ).toBe( false );
			expect( reader.Done ).toBe( false );
			expect( reader.Read() ).toBe( -1 );
			expect( reader.Done ).toBe( true );
			expect( reader.Offset ).toBe( bytes.length );

			writer.Reset();
			expect( writer.Length ).toBe( 0 );
			writer.Write( "again" );
			expect( Decode( writer.Bytes ) ).toBe( "again" );

			expect( () => new MessagePackReader( Bytes( "c0" ) ).ReadString() )
				.toThrow( /string/ );
			expect( () => new MessagePackReader( Bytes( "c0" ) ).ReadNumber() )
				.toThrow( /number/ );
			expect(
				() => new MessagePackReader( Bytes( "c0" ) ).ReadArrayHeader(),
			)
				.toThrow( /array/ );
			expect(
				() => new MessagePackReader( Bytes( "c0" ) ).ReadMapHeader(),
			)
				.toThrow( /map/ );
			expect(
				new MessagePackReader( Bytes( "dc0001" ) ).ReadArrayHeader(),
			)
				.toBe( 1 );
			expect(
				new MessagePackReader(
					Bytes( "dd00000001" ),
				).ReadArrayHeader(),
			).toBe( 1 );
			expect( new MessagePackReader( Bytes( "de0001" ) ).ReadMapHeader() )
				.toBe( 1 );
			expect(
				new MessagePackReader( Bytes( "df00000001" ) ).ReadMapHeader(),
			)
				.toBe( 1 );
			expect(
				new MessagePackReader(
					Bytes( "cf8000000000000000" ),
				).ReadNumber(),
			).toBe( 2 ** 63 );
		},
	);

	it( "reads from a view into a bigger buffer", () => {
		const buffer = Bytes( "ff" + "a3616263" + "ff" );
		expect( Decode( buffer.subarray( 1, 5 ) ) ).toBe( "abc" );
	} );
} );
