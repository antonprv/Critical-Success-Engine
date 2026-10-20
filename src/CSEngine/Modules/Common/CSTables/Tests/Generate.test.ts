// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	BuildTables,
	CSTablesPlugin,
	FormatDiagnostic,
} from "../Source/Build.ts";
import { Severity } from "../Source/Format.ts";
import { GenerateTypeScript, ShortKeys } from "../Source/Generate.ts";
import { Compile, ReadTables } from "../Source/Tables.ts";

const Runtime = resolve( __dirname, "../Source/Index.ts" )
	.replace( /\\/g, "/" );
let project = "";

beforeEach( () => {
	// Inside the package, so the generated modules are transformed like its own
	// sources.
	mkdirSync( resolve( __dirname, ".generated" ), { recursive: true } );
	project = mkdtempSync(
		join( resolve( __dirname, ".generated" ), "project-" ),
	);
	mkdirSync( join( project, "Resources", "Ui" ), { recursive: true } );
	writeFileSync( join( project, "Resources", "Ui", "UiNames.cstables" ), [
		"# The main menu's title.",
		"MenuTitle = Главное меню */",
		"Greeting = Привет, {name}!",
		"Pair = {0} и {1}",
		"Coins[one] = {count} монета",
		"Coins[few] = {count} монеты",
		"Coins[other] = {count} монет",
		"Bag[one] = в {where} одна",
		"Bag[other] = в {where} {count}",
		"Shared = из UiNames",
		"constructor = зарезервировано",
		"Lines = \"\"\"",
		"a",
		"b",
		"\"\"\"",
	].join( "\n" ) );
	writeFileSync(
		join( project, "Resources", "Ui", "UiNames.en.cstables" ),
		"MenuTitle = Main menu\nGreeting = Hello, {name}!\nCoins[one] = "
			+ "{count} coin\nCoins[other] = {count} coins",
	);
	writeFileSync(
		join( project, "Resources", "Other.cstables" ),
		"@access internal\nShared = из Other\nUiNames = таблица?",
	);
	writeFileSync(
		join( project, "Resources", "Data.cstables" ),
		"@access none\nSecret = нет кода",
	);
} );
afterEach( () => rmSync( project, { recursive: true, force: true } ) );

describe( "the generated code", () => {
	it(
		"reads each key in the language current at that moment; keys in one "
			+ "table only are short too",
		async () => {
			const result = BuildTables( { Project: project, Runtime } );

			expect( result.Ok ).toBe( true );
			expect( result.Written.sort() )
				.toEqual(
					[
						"Source/Generated/CSTables.en.ts",
						"Source/Generated/CSTables.ru.ts",
						"Source/Generated/CSTables.ts",
					],
				);
			const generated = await import( /* @vite-ignore */ join(
				project,
				"Source",
				"Generated",
				"CSTables.ts",
			) );
			const { CSTables, CSTablesRuntime } = generated;

			expect( CSTables.UiNames.MenuTitle ).toBe( "Главное меню */" );
			expect( CSTables.MenuTitle ).toBe( "Главное меню */" );
			expect( CSTables.UiNames.Greeting( { name: "Аня" } ) )
				.toBe( "Привет, Аня!" );
			expect( CSTables.UiNames.Pair( "a", "b" ) ).toBe( "a и b" );
			expect( CSTables.UiNames.Coins( 3 ) ).toBe( "3 монеты" );
			expect( CSTables.UiNames.Bag( 2, { where: "сумке" } ) )
				.toBe( "в сумке 2" );
			expect( CSTables.UiNames.constructor ).toBe( "зарезервировано" );
			expect( CSTables.UiNames.Lines ).toBe( "a\nb" );
			expect( CSTables.Other.Shared ).toBe( "из Other" );
			expect( CSTables.Shared ).toBeUndefined();
			expect( CSTables.UiNames.Shared ).toBe( "из UiNames" );
			expect( CSTables.Data ).toBeUndefined();
			expect( CSTablesRuntime.Id( "Data.Secret" ) ).not.toBeNull();
			await CSTablesRuntime.SetLanguage( "en" );
			expect( CSTables.UiNames.MenuTitle ).toBe( "Main menu" );
			expect( CSTables.UiNames.Coins( 1 ) ).toBe( "1 coin" );
			expect( CSTables.UiNames.Pair( "a", "b" ) ).toBe( "a и b" );
			const text = readFileSync(
				join( project, "Source", "Generated", "CSTables.ts" ),
				"utf8",
			);

			expect( text ).toContain( "/** Главное меню *\\/ */" );
			expect( text ).toContain( "@internal" );
			expect( text ).toContain( "\"constructor\"" );
		},
	);

	it(
		"is not written again when nothing changed, nor at all when the tables "
			+ "have errors",
		() => {
			expect( BuildTables( { Project: project, Runtime } ).Written )
				.toHaveLength( 3 );
			expect( BuildTables( { Project: project, Runtime } ).Written )
				.toEqual( [] );
			writeFileSync(
				join( project, "Resources", "Broken.cstables" ),
				"Key = a\nKey = b",
			);
			const broken = BuildTables( { Project: project } );

			expect( broken.Ok ).toBe( false );
			expect( broken.Written ).toEqual( [] );
			expect(
				BuildTables(
					{ Project: project, Resources: "Nowhere" },
				).Written,
			).toEqual( [] );
			rmSync( join( project, "Resources", "Broken.cstables" ) );
			expect(
				BuildTables( { Project: project, WarningsAsErrors: true } ).Ok,
			)
				.toBe( false );
		},
	);

	it(
		"doc-comments plural keys by their other form and handles a table with "
			+ "no other form",
		() => {
			const compiled = Compile(
				ReadTables(
					[
						{
							File: "T.cstables",
							Text:
							"Plural[one] = one\nPlural[other] = many\nOdd[one] "
								+ "= only one\nOdd[other] = x",
						},
					],
					"en",
				),
			);

			compiled.Values.en![1] = { one: "only one" };
			compiled.Values.en![0] = { };
			const text = GenerateTypeScript(
				compiled,
				ShortKeys( compiled ),
			).Files["CSTables.ts"]!;

			expect( text ).toContain( "/** only one */" );
			expect( text ).toContain( "from \"@cse/cstables\"" );
		},
	);
} );

describe( "the build's messages and the Vite plugin", () => {
	it( "writes diagnostics as compilers do", () => {
		expect(
			FormatDiagnostic(
				{
					Severity: Severity.Error,
					Code: "CST010",
					Message: "twice",
					File: "A.cstables",
					Line: 3,
				},
			),
		).toBe( "A.cstables(3): error CST010: twice" );
		expect(
			FormatDiagnostic(
				{
					Severity: Severity.Warning,
					Code: "CST020",
					Message: "missing",
					File: "A.en.cstables",
					Line: 0,
				},
			),
		).toBe( "A.en.cstables: warning CST020: missing" );
	} );

	it(
		"builds before the build, fails it on errors, and builds again when a "
			+ "table changes in the dev server",
		() => {
			const error = vi.spyOn( console, "error" )
				.mockImplementation( () => undefined );
			const warn = vi.spyOn( console, "warn" )
				.mockImplementation( () => undefined );
			const plugin = CSTablesPlugin( { Project: project, Runtime } );

			plugin.buildStart();
			expect( warn ).toHaveBeenCalled();
			const listeners = new Map<string, ( file: string ) => void>();
			const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
			const watched: string[] = [];

			plugin.configureServer(
				{
					watcher: {
						add: ( path: string ) => watched.push( path ),
						on: ( event, listener ) => listeners.set(
							event,
							listener,
						),
					},
					config: { logger },
				},
			);
			expect( watched ).toEqual( [ join( project, "Resources" ) ] );
			listeners.get( "change" )!( "readme.md" );
			expect( logger.info ).not.toHaveBeenCalled();
			writeFileSync(
				join( project, "Resources", "Other.cstables" ),
				"Shared = снова",
			);
			listeners.get( "change" )!(
				join( project, "Resources", "Other.cstables" ),
			);
			expect( logger.info )
				.toHaveBeenCalledWith(
					expect.stringContaining( "written again" ),
				);
			listeners.get( "add" )!( "X.CSTABLES" );
			expect( logger.info ).toHaveBeenCalledTimes( 1 );
			writeFileSync(
				join( project, "Resources", "Broken.cstables" ),
				"Key = a\nKey = b",
			);
			listeners.get( "unlink" )!( "Broken.cstables" );
			expect( logger.error )
				.toHaveBeenCalledWith( expect.stringContaining( "CST010" ) );
			expect( () => plugin.buildStart() )
				.toThrow( /the tables have 1 problems/ );
			expect( error ).toHaveBeenCalled();
			expect(
				() => CSTablesPlugin(
					{ Project: project, WarningsAsErrors: true },
				)
					.buildStart(),
			).toThrow( /problems/ );
		},
	);
} );
