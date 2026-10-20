// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { Access, Severity } from "../Source/Format.ts";
import {
	Compile,
	ParseTableName,
	ReadTables,
	Report,
	SharedKeys,
	TableFileName,
} from "../Source/Tables.ts";
import {
	Arguments,
	Fill,
	HasStrayBrace,
	PluralOf,
	Segments,
} from "../Source/Values.ts";

const Base = [
	"MenuTitle = Главное меню",
	"Greeting = Привет, {name}!",
	"Coins[one] = {count} монета",
	"Coins[few] = {count} монеты",
	"Coins[other] = {count} монет",
	"Only = только по-русски",
].join( "\n" );
const English = [
	"MenuTitle = Main menu",
	"Greeting = Hello, {who}!",
	"Coins[one] = {count} coin",
	"Coins[other] = {count} coins",
	"Unused = never",
].join( "\n" );

describe( "values", () => {
	it( "cut into text and arguments, with escaped braces as text", () => {
		expect( Segments( "Hi {name}, {0} \\{x\\} {not one" ) )
			.toEqual(
				[ "Hi ", { Arg: "name" }, ", ", { Arg: "0" }, " {x} {not one" ],
			);
		expect( Segments( "{a}" ) ).toEqual( [ { Arg: "a" } ] );
		expect( Segments( "" ) ).toEqual( [] );
		expect( Arguments( "{a} {b} {a}" ) ).toEqual( [ "a", "b" ] );
		expect( HasStrayBrace( "fine {a} \\{" ) ).toBe( false );
		expect( HasStrayBrace( "stray { here" ) ).toBe( true );
		expect( Fill( Segments( "{0} and {1} {x}" ), [ "a", 2 ] ) )
			.toBe( "a and 2 {x}" );
		expect( Fill( Segments( "Hi {name}" ), { name: "Ann" } ) )
			.toBe( "Hi Ann" );
	} );

	it( "pick plural forms by the language's rules", () => {
		expect( [ 1, 2, 5, 21 ].map( ( n ) => PluralOf( "ru", n ) ) )
			.toEqual( [ "one", "few", "many", "one" ] );
		expect( [ 1, 2 ].map( ( n ) => PluralOf( "en", n ) ) )
			.toEqual( [ "one", "other" ] );
		expect( PluralOf( "not a language!", 1 ) ).toBe( "one" );
		expect( PluralOf( "not a language!", 2 ) ).toBe( "other" );
	} );
} );

describe( "tables", () => {
	it( "name files by table and language", () => {
		expect( ParseTableName( "UiNames.cstables" ) )
			.toEqual( { Table: "UiNames", Language: null } );
		expect( ParseTableName( "UiNames.pt-BR.CSTABLES" ) )
			.toEqual( { Table: "UiNames", Language: "pt-BR" } );
		expect( ParseTableName( "UiNames.json" ) ).toBeNull();
		expect( TableFileName( "UiNames", null ) ).toBe( "UiNames.cstables" );
		expect( TableFileName( "UiNames", "en" ) )
			.toBe( "UiNames.en.cstables" );
	} );

	it(
		"group languages under their table and check them against the base",
		() => {
			const tables = ReadTables( [
				{ File: "Resources/UiNames.cstables", Text: Base },
				{ File: "Resources\\UiNames.en.cstables", Text: English },
				{ File: "Resources/readme.txt", Text: "" },
			], "ru" );

			expect(
				tables.Groups.map(
					( g ) => [ g.Name, [ ...g.Languages.keys() ] ],
				),
			).toEqual( [ [ "UiNames", [ "en" ] ] ] );
			expect(
				tables.Diagnostics.map(
					( d ) => [ d.Code, d.Severity, d.File, d.Line ],
				),
			).toEqual( [
				[
					"CST022",
					Severity.Warning,
					"Resources\\UiNames.en.cstables",
					2,
				],
				[
					"CST020",
					Severity.Warning,
					"Resources\\UiNames.en.cstables",
					0,
				],
				[
					"CST021",
					Severity.Warning,
					"Resources\\UiNames.en.cstables",
					5,
				],
			] );
		},
	);

	it(
		"report bad names, twins, translations without a base, duplicates, "
			+ "empties, braces, plural slips",
		() => {
			const tables = ReadTables( [
				{ File: "1st.cstables", Text: "" },
				{ File: "UiNames.EN!.cstables", Text: "" },
				{
					File: "A/Menu.cstables",
					Text:
					"Key = x\nKey = y\nEmpty = \"\"\nBrace = {oops\nP[one] = "
						+ "a\nP = b\nNoOther[one] = a\nPlain = x\nFlip = "
						+ "x\nPlur[one] = a\nPlur[other] = b\nPlur[one] = c",
				},
				{ File: "B/Menu.cstables", Text: "" },
				{
					File: "Menu.en.cstables",
					Text:
					"Key = x\nPlain[one] = a\nPlain[other] = b\nFlip[one] = "
						+ "a\nFlip[other] = b\nNoOther[one] = "
						+ "a\nNoOther[other] = b\nP[one] = a\nP[other] = "
						+ "b\nBrace = {oops\nEmpty = e\nPlur = x",
				},
				{ File: "Orphan.en.cstables", Text: "Key = x" },
			], "ru" );
			const codes = tables.Diagnostics.map( ( d ) => d.Code );

			expect( codes )
				.toEqual(
					expect.arrayContaining(
						[
							"CST030",
							"CST034",
							"CST031",
							"CST032",
							"CST010",
							"CST012",
							"CST011",
							"CST014",
							"CST013",
							"CST023",
						],
					),
				);
		},
	);

	it(
		"warn when a key is in two tables or is a table's name, so it gets no "
			+ "short access",
		() => {
			const tables = ReadTables( [
				{ File: "A.cstables", Text: "Shared = a\nB = b\nOwn = o" },
				{ File: "B.cstables", Text: "Shared = b" },
				{
					File: "Hidden.cstables",
					Text: "@access none\nShared = h\nOwn = o",
				},
			], "ru" );

			expect( tables.Diagnostics.map( ( d ) => d.Code ) )
				.toEqual( [ "CST033", "CST035", "CST033" ] );
			expect( [ ...SharedKeys( tables.Groups ) ] )
				.toEqual( [ "Shared" ] );
			expect( tables.Groups.find( ( g ) => g.Name === "Hidden" )!.Access )
				.toBe( Access.None );
		},
	);

	it(
		"compile to ids and values per language, with the base language first",
		() => {
			const tables = ReadTables( [
				{ File: "UiNames.cstables", Text: Base },
				{ File: "UiNames.en.cstables", Text: English },
				{ File: "Other.cstables", Text: "Z = z" },
				{
					File: "Other.de.cstables",
					Text: "Z[one] = z\nZ[other] = zz",
				},
			], "ru" );
			const compiled = Compile( tables );

			expect( compiled.Languages ).toEqual( [ "ru", "de", "en" ] );
			expect( compiled.Keys.map( ( k ) => `${ k.Table }.${ k.Key }` ) )
				.toEqual(
					[
						"Other.Z",
						"UiNames.MenuTitle",
						"UiNames.Greeting",
						"UiNames.Coins",
						"UiNames.Only",
					],
				);
			expect( compiled.Keys[2] )
				.toEqual(
					{
						Table: "UiNames",
						Key: "Greeting",
						Arguments: [ "name" ],
						Plural: false,
						Access: Access.Public,
					},
				);
			expect( compiled.Values.ru )
				.toEqual(
					[
						"z",
						"Главное меню",
						"Привет, {name}!",
						{
							one: "{count} монета",
							few: "{count} монеты",
							other: "{count} монет",
						},
						"только по-русски",
					],
				);
			expect( compiled.Values.en )
				.toEqual(
					[
						null,
						"Main menu",
						"Hello, {who}!",
						{ one: "{count} coin", other: "{count} coins" },
						null,
					],
				);
			expect( compiled.Values.de )
				.toEqual( [ null, null, null, null, null ] );
			expect( Report( tables, compiled ) ).toBe( [
				"CSTables: 2 tables, 5 keys, languages: ru, de, en (base ru)",
				"  de: 0/5 translated",
				"  en: 3/5 translated",
				"  1 unused keys, 0 errors, 4 warnings",
			].join( "\n" ) );
			expect( Compile( ReadTables( [], "en" ) ).Languages )
				.toEqual( [ "en" ] );
		},
	);
} );
