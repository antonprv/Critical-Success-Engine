// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	Access,
	FormatValue,
	IsKey,
	LineKind,
	TableDocument,
	Unescape,
} from "../Source/Format.ts";

const Sample = [
	"@access internal",
	"# The title of the main menu.",
	"# Second line.",
	"MenuTitle = Главное меню",
	"",
	"// not a comment: a broken line",
	"Greeting = Привет, {name}!",
	"Padded = \"  spaces kept  \"",
	"Quoted = \"say \\\"hi\\\"\"",
	"Escapes = a\\tb\\nc \\\\ \\{x\\} \\q",
	"Coins[one] = {count} монета",
	"Coins[other] = {count} монет",
	"About = \"\"\"",
	"Line one,",
	"  indented \\\"\"\"",
	"\"\"\"",
	"Last=value",
].join( "\n" );

describe( "the .cstables format", () => {
	it(
		"reads keys, values, comments, directives, plural forms and multi-line "
			+ "values",
		() => {
			const document = TableDocument.Parse(
				`﻿${ Sample }\n`,
				"UiNames.cstables",
			);

			expect( document.Keys )
				.toEqual(
					[
						"MenuTitle",
						"Greeting",
						"Padded",
						"Quoted",
						"Escapes",
						"Coins",
						"About",
						"Last",
					],
				);
			expect( document.Access ).toBe( Access.Internal );
			expect( document.Directive( "nope" ) ).toBeNull();
			expect( document.Entry( "MenuTitle" )!.Value )
				.toBe( "Главное меню" );
			expect( document.Entry( "MenuTitle" )!.Line ).toBe( 4 );
			expect( document.Comment( "MenuTitle" ) )
				.toBe( "The title of the main menu.\nSecond line." );
			expect( document.Comment( "Greeting" ) ).toBeNull();
			expect( document.Comment( "Nope" ) ).toBeNull();
			expect( document.Entry( "Padded" )!.Value )
				.toBe( "  spaces kept  " );
			expect( document.Entry( "Quoted" )!.Value ).toBe( "say \"hi\"" );
			expect( document.Entry( "Escapes" )!.Value )
				.toBe( "a\tb\nc \\ \\{x\\} \\q" );
			expect( document.Entry( "Coins", "one" )!.Value )
				.toBe( "{count} монета" );
			expect( document.Entry( "Coins" ) ).toBeUndefined();
			expect( document.Entry( "About" )!.Value )
				.toBe( "Line one,\n  indented \"\"\"" );
			expect( document.Entry( "Last" )!.Value ).toBe( "value" );
			expect( document.Problems )
				.toEqual(
					[
						expect.objectContaining(
							{
								Code: "CST001",
								Line: 6,
								File: "UiNames.cstables",
							},
						),
					],
				);
		},
	);

	it( "reports what it can't read and keeps it", () => {
		const document = TableDocument.Parse(
			"no equals\n1st = x\nKey[weird] = x\n@ alone\nOpen = \"\"\"\nnever "
				+ "closed",
		);

		expect( document.Problems.map( ( p ) => p.Code ) )
			.toEqual( [ "CST001", "CST002", "CST003", "CST001", "CST004" ] );
		expect( document.Lines.filter( ( l ) => l.Kind === LineKind.Invalid ) )
			.toHaveLength( 4 );
		expect( document.Entry( "Open" )!.Value ).toBe( "never closed" );
		expect( document.Serialize() )
			.toBe(
				"no equals\n1st = x\nKey[weird] = x\n@ alone\nOpen = "
					+ "\"\"\"\nnever closed\n",
			);
	} );

	it(
		"gives back the same text when nothing changed, with the file's own "
			+ "newline",
		() => {
			expect( TableDocument.Parse( `${ Sample }\n` ).Serialize() )
				.toBe( `${ Sample }\n` );
			const windows = `${ Sample.replace( /\n/g, "\r\n" ) }\r\n`;

			expect( TableDocument.Parse( windows ).Serialize() )
				.toBe( windows );
			expect( TableDocument.Parse( "" ).Serialize() ).toBe( "" );
			expect( TableDocument.Empty().Serialize() ).toBe( "" );
			expect( TableDocument.Empty().Access ).toBe( Access.Public );
		},
	);

	it(
		"edits a key in place, adds, renames, removes and moves keys with "
			+ "their comments",
		() => {
			const document = TableDocument.Parse( `${ Sample }\n` );

			document.Set( "MenuTitle", "Меню" );
			document.Set( "MenuTitle", "Меню" );
			document.Set( "Greeting", "Привет, {name}!" );
			document.Set( "Coins", "{count} монеты", "few" );
			document.Set( "Fresh", "  new  " );
			document.SetComment( "Greeting", "Says hello.\n\nTwice." );
			document.SetComment( "MenuTitle", null );
			document.SetComment( "Nope", "x" );
			document.Rename( "Padded", "Spaced" );
			document.Remove( "Quoted" );
			document.Move( "Last", "MenuTitle" );
			document.Move( "Greeting", null );
			document.Move( "Nope", null );
			document.Move( "Last", "Last" );
			document.Move( "Coins", "Escapes" );
			document.Move( "Escapes", "Coins" );
			document.SetDirective( "access", "public" );
			document.SetDirective( "language", "ru" );
			document.SetDirective( "language", null );
			document.SetDirective( "absent", null );
			expect( document.Serialize() ).toBe( [
				"@access public",
				"Last=value",
				"MenuTitle = Меню",
				"",
				"// not a comment: a broken line",
				"Spaced = \"  spaces kept  \"",
				"Escapes = a\\tb\\nc \\\\ \\{x\\} \\q",
				"Coins[one] = {count} монета",
				"Coins[other] = {count} монет",
				"Coins[few] = {count} монеты",
				"About = \"\"\"",
				"Line one,",
				"  indented \\\"\"\"",
				"\"\"\"",
				"Fresh = \"  new  \"",
				"# Says hello.",
				"#",
				"# Twice.",
				"Greeting = Привет, {name}!",
				"",
			].join( "\n" ) );
			expect(
				TableDocument.Parse( document.Serialize() )
					.Comment( "Greeting" ),
			).toBe( "Says hello.\n\nTwice." );
		},
	);

	it( "writes values so they read back the same", () => {
		for ( const value of [
			"plain",
			"  padded",
			"\"starts with a quote",
			"",
			"tab\there",
			"back\\slash",
			"brace \\{ kept",
			"two\nlines",
			"a\n\"\"\"\nb",
			"x \\{y\\}",
		] ) {
			const document = TableDocument.Empty();

			document.Set( "Key", value );
			expect(
				TableDocument.Parse( document.Serialize() )
					.Entry( "Key" )!.Value,
				value,
			).toBe( value );
		}
		expect( FormatValue( "two\nlines" ) )
			.toEqual( [ "\"\"\"", "two", "lines", "\"\"\"" ] );
		expect( FormatValue( "\"x" ) ).toEqual( [ "\"\\\"x\"" ] );
	} );

	it( "knows keys and escapes", () => {
		expect( IsKey( "Menu_Title2" ) ).toBe( true );
		expect( IsKey( "2nd" ) ).toBe( false );
		expect( Unescape( "\\n\\t\\\\\\\"\\{\\}\\z" ) )
			.toBe( "\n\t\\\"\\{\\}\\z" );
		// A quoted value whose last quote is escaped is not a quoted value.
		expect(
			TableDocument.Parse( "Key = \"open \\\"" ).Entry( "Key" )!.Value,
		).toBe( "\"open \"" );
		expect( TableDocument.Parse( "Key = \"a\\\\\"" ).Entry( "Key" )!.Value )
			.toBe( "a\\" );
		expect( TableDocument.Parse( "Key = \"" ).Entry( "Key" )!.Value )
			.toBe( "\"" );
		expect( TableDocument.Parse( "@access weird\nKey = x" ).Access )
			.toBe( Access.Public );
	} );
} );
