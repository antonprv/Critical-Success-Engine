// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AreFileTypesRegistered,
	FileLog,
	FilesInArguments,
	RegisterFileTypes,
	RegistryCommands,
	SingleInstance,
	type ShellApp,
} from "../Source/Index.ts";

let folder = "";

beforeEach( () => {
	folder = mkdtempSync( join( tmpdir(), "cse-shell-" ) );
	writeFileSync( join( folder, "UiNames.cstables" ), "" );
	writeFileSync( join( folder, "Notes.txt" ), "" );
	mkdirSync( join( folder, "Sub" ) );
} );
afterEach( () => rmSync( folder, { recursive: true, force: true } ) );

function FakeApp( locked: boolean ) {
	const listeners = new Map<string, ( ...args: never[] ) => void>();
	const app = {
		requestSingleInstanceLock: () => locked,
		quit: vi.fn(),
		on: ( event: string, listener: ( ...args: never[] ) => void ) => {
			listeners.set( event, listener );
		},
	};

	return {
		app: app as unknown as ShellApp & { quit: ReturnType<typeof vi.fn>; },
		listeners,
	};
}

describe( "the files of a command line", () => {
	it(
		"are the arguments that are existing files, absolute, of the given "
			+ "types",
		() => {
			const argv = [
				"Program.exe",
				"--flag",
				"UiNames.cstables",
				join( folder, "Notes.txt" ),
				"Sub",
				"missing.cstables",
			];

			expect( FilesInArguments( argv, folder ) )
				.toEqual(
					[
						join( folder, "UiNames.cstables" ),
						join( folder, "Notes.txt" ),
					],
				);
			expect( FilesInArguments( argv, folder, [ ".CSTABLES" ] ) )
				.toEqual( [ join( folder, "UiNames.cstables" ) ] );
			expect( FilesInArguments( [ "Program.exe" ], folder ) )
				.toEqual( [] );
		},
	);
} );

describe( "one instance", () => {
	it(
		"hands a second launch's files to the first, and macOS's open-file too",
		() => {
			const { app, listeners } = FakeApp( true );
			const open = vi.fn();

			expect( SingleInstance( app, open, [ ".cstables" ] ) ).toBe( true );
			listeners.get( "second-instance" )!(
				null as never,
				[ "Program.exe", "UiNames.cstables", "Notes.txt" ] as never,
				folder as never,
			);
			expect( open )
				.toHaveBeenCalledWith( [ join( folder, "UiNames.cstables" ) ] );
			const preventDefault = vi.fn();

			listeners.get( "open-file" )!(
				{ preventDefault } as never,
				"/a/b.cstables" as never,
			);
			expect( preventDefault ).toHaveBeenCalled();
			expect( open ).toHaveBeenLastCalledWith( [ "/a/b.cstables" ] );
		},
	);

	it( "quits the second instance", () => {
		const { app } = FakeApp( false );

		expect( SingleInstance( app, vi.fn() ) ).toBe( false );
		expect( app.quit ).toHaveBeenCalled();
	} );
} );

describe( "file types", () => {
	const Classes = "HKCU\\Software\\Classes";
	const Type = `${ Classes }\\CriticalSuccess.TableEditor.cstables`;
	const Command = `${ Type }\\shell\\open\\command`;

	const registration = {
		AppId: "CriticalSuccess.TableEditor",
		Executable: "C:\\Tools\\Table Editor.exe",
		Types: [ { Extension: ".cstables", Description: "CSTables table" } ],
	};

	it( "are registered for the current user on Windows only", async () => {
		expect( RegistryCommands( registration ) ).toEqual( [
			[
				"add",
				"HKCU\\Software\\Classes\\.cstables",
				"/ve",
				"/d",
				"CriticalSuccess.TableEditor.cstables",
				"/f",
			],
			[
				"add",
				"HKCU\\Software\\Classes\\CriticalSuccess.TableEditor.cstables",
				"/ve",
				"/d",
				"CSTables table",
				"/f",
			],
			[
				"add",
				`${ Type }\\DefaultIcon`,
				"/ve",
				"/d",
				"\"C:\\Tools\\Table Editor.exe\",0",
				"/f",
			],
			[
				"add",
				Command,
				"/ve",
				"/d",
				"\"C:\\Tools\\Table Editor.exe\" \"%1\"",
				"/f",
			],
		] );
		const run = vi.fn( async () => undefined );

		expect( await RegisterFileTypes( registration, "win32", run ) )
			.toBe( true );
		expect( run ).toHaveBeenCalledTimes( 4 );
		expect( await RegisterFileTypes( registration, "linux", run ) )
			.toBe( false );
		expect( run ).toHaveBeenCalledTimes( 4 );
	} );

	it( "say whether they open in this program", async () => {
		const values: Record<string, string> = {
			"HKCU\\Software\\Classes\\.cstables":
				"CriticalSuccess.TableEditor.cstables",
			[Command]: "\"C:\\Tools\\Table Editor.exe\" \"%1\"",
		};
		const query = async ( key: string ) => values[key] ?? null;

		expect( await AreFileTypesRegistered( registration, "win32", query ) )
			.toBe( true );
		expect(
			await AreFileTypesRegistered(
				{ ...registration, Executable: "C:\\Other.exe" },
				"win32",
				query,
			),
		).toBe( false );
		expect(
			await AreFileTypesRegistered(
				{ ...registration, AppId: "Other" },
				"win32",
				query,
			),
		).toBe( false );
		expect( await AreFileTypesRegistered( registration, "darwin", query ) )
			.toBe( false );
		delete values[Command];
		expect( await AreFileTypesRegistered( registration, "win32", query ) )
			.toBe( false );
	} );

	it(
		"are read from the real registry on Windows (a key that isn't there "
			+ "reads as missing)",
		async () => {
			const missing = {
				...registration,
				Types: [
					{ Extension: ".cse-no-such-type-ever", Description: "x" },
				],
			};

			expect( await AreFileTypesRegistered( missing ) ).toBe( false );
		},
	);

	it( "read a key that is there from the real registry", async () => {
		// HKCU\Software\Classes itself is always there (its default value is
		// not set).
		const root = {
			...registration,
			Types: [ { Extension: "", Description: "x" } ],
		};

		expect( await AreFileTypesRegistered( root ) ).toBe( false );
	} );

	it( "are written with reg.exe (a failure is reported)", async () => {
		const bad = {
			...registration,
			AppId: "",
			Types: [ { Extension: "", Description: "" } ],
		};

		await expect( RegisterFileTypes( bad, "win32" ) ).rejects.toThrow();
	} );
} );

describe( "the log file", () => {
	it(
		"writes timed lines into the user's folder, and what nobody caught "
			+ "before the end",
		() => {
			const handlers = new Map<string, ( error: Error ) => void>();
			const log = FileLog(
				folder,
				"main",
				{
					on: (
						event: string,
						handler: ( error: Error ) => void,
					) => (
						handlers.set( event, handler )
					),
				} as never,
			);

			log( "started" );
			expect(
				() => handlers.get( "uncaughtException" )!(
					new Error( "boom" ),
				),
			).toThrow( "boom" );
			const text = readFileSync(
				join( folder, "logs", "main.log" ),
				"utf8",
			);

			expect( text ).toMatch( /^\d{4}-\d\d-\d\dT[\d:.]+Z started\n/ );
			expect( text ).toContain( "uncaught: Error: boom" );
			const noStack = new Error( "plain" );

			delete ( noStack as { stack?: string; } ).stack;
			expect( () => handlers.get( "uncaughtException" )!( noStack ) )
				.toThrow( "plain" );
			expect( readFileSync( join( folder, "logs", "main.log" ), "utf8" ) )
				.toContain( "uncaught: plain" );
			expect( FileLog( folder ) ).toBeTypeOf( "function" );
		},
	);
} );
