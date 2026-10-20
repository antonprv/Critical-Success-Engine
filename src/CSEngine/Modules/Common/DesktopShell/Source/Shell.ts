// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

/**
 * What a desktop program's main process (Electron) needs around its windows:
 * one instance that the second launch hands its files to, the files the
 * command line names, file types that open in the program on a double click,
 * and a log file in the user's folder. Electron is passed in (its `app`), so
 * the helpers run in tests without it.
 */

/** The part of Electron's `app` the helpers use. */
export interface ShellApp {
	requestSingleInstanceLock(): boolean;
	quit(): void;
	on(
		event: "second-instance",
		listener: ( event: unknown, argv: string[], cwd: string ) => void,
	): unknown;
	on(
		event: "open-file",
		listener: ( event: { preventDefault(): void; }, path: string ) => void,
	): unknown;
}

/**
 * The files a command line names: the arguments that are existing files (not
 * flags, not the program itself), made absolute from `cwd`; only those with
 * one of `extensions` when given.
 */
export function FilesInArguments(
	argv: readonly string[],
	cwd: string,
	extensions: readonly string[] = [],
): string[] {
	const out: string[] = [];

	// argv[0] is the program (and in development argv[1] is its folder: ".").
	for ( const argument of argv.slice( 1 ) ) {
		if ( argument.startsWith( "-" ) ) {
			continue;
		}
		const path = isAbsolute( argument )
			? argument
			: resolve( cwd, argument );
		const lower = path.toLowerCase();

		if ( !existsSync( path ) || !statSync( path ).isFile() ) {
			continue;
		}
		if (
			extensions.length > 0
			&& !extensions.some( ( e ) => lower.endsWith( e.toLowerCase() ) )
		) {
			continue;
		}
		out.push( path );
	}
	return out;
}

/**
 * Makes the program one instance: a second launch (a file double-clicked
 * while it runs) quits and hands its files to the first one's `open`; macOS
 * gives files through "open-file". Returns false in the second instance (it
 * is quitting: start nothing).
 */
export function SingleInstance(
	app: ShellApp,
	open: ( files: string[] ) => void,
	extensions: readonly string[] = [],
): boolean {
	if ( !app.requestSingleInstanceLock() ) {
		app.quit();
		return false;
	}
	app.on( "second-instance", ( _event, argv, cwd ) => {
		open( FilesInArguments( argv, cwd, extensions ) );
	} );
	app.on( "open-file", ( event, path ) => {
		event.preventDefault();
		open( [ path ] );
	} );
	return true;
}

/** A file type the program opens. */
export interface FileType {
	/** With its dot: ".cstables". */
	Extension: string;
	/** What Explorer calls it: "CSTables table". */
	Description: string;
}

export interface FileTypeRegistration {
	/**
	 * The program's id ("CriticalSuccess.TableEditor"): names its file types.
	 */
	AppId: string;
	/** The program to run (process.execPath of the packaged program). */
	Executable: string;
	Types: readonly FileType[];
}

/** Runs reg.exe (tests replace it). */
export type RegistryRunner = ( args: string[] ) => Promise<void>;

const Reg: RegistryRunner = ( args ) => new Promise( ( done, fail ) => {
	execFile( "reg.exe", args, { windowsHide: true }, ( error ) => {
		if ( error ) {
			fail( error );
		} else {
			done();
		}
	} );
} );

/** The registry keys and values of a registration (HKCU: no admin rights). */
export function RegistryCommands(
	registration: FileTypeRegistration,
): string[][] {
	const classes = "HKCU\\Software\\Classes";
	const program = `"${ registration.Executable }"`;
	const commands: string[][] = [];

	for ( const type of registration.Types ) {
		const id = `${ registration.AppId }${ type.Extension }`;
		const Add = ( key: string, value: string ): void => {
			commands.push( [ "add", key, "/ve", "/d", value, "/f" ] );
		};

		Add( `${ classes }\\${ type.Extension }`, id );
		Add( `${ classes }\\${ id }`, type.Description );
		Add( `${ classes }\\${ id }\\DefaultIcon`, `${ program },0` );
		Add(
			`${ classes }\\${ id }\\shell\\open\\command`,
			`${ program } "%1"`,
		);
	}
	return commands;
}

/**
 * Makes the file types open in the program (a portable program registers
 * itself: the caller asks the user first). Windows only, for the current user;
 * elsewhere it does nothing and says so (false). Explorer is told of the
 * change on its next refresh.
 */
export async function RegisterFileTypes(
	registration: FileTypeRegistration,
	platform: string = process.platform,
	run: RegistryRunner = Reg,
): Promise<boolean> {
	if ( platform !== "win32" ) {
		return false;
	}
	for ( const command of RegistryCommands( registration ) ) {
		await run( command );
	}
	return true;
}

/**
 * Whether the file types already open in this program (asked of the
 * registry; false when not on Windows or when any is missing or another
 * program's).
 */
export async function AreFileTypesRegistered(
	registration: FileTypeRegistration,
	platform: string = process.platform,
	query: ( key: string ) => Promise<string | null> = QueryDefault,
): Promise<boolean> {
	if ( platform !== "win32" ) {
		return false;
	}
	const classes = "HKCU\\Software\\Classes";

	for ( const type of registration.Types ) {
		const id = `${ registration.AppId }${ type.Extension }`;
		const command = await query(
			`${ classes }\\${ id }\\shell\\open\\command`,
		);

		if ( await query( `${ classes }\\${ type.Extension }` ) !== id ) {
			return false;
		}
		if ( command === null
			|| !command.includes( registration.Executable ) ) {
			return false;
		}
	}
	return true;
}

/** The default value of a registry key (null: no such key). */
function QueryDefault( key: string ): Promise<string | null> {
	return new Promise( ( done ) => {
		execFile(
			"reg.exe",
			[ "query", key, "/ve" ],
			{ windowsHide: true },
			( error, stdout ) => {
				const match = /REG_\w+\s+(.*)$/m.exec( String( stdout ) );

				done( error || !match ? null : match[1]!.trim() );
			},
		);
	} );
}

/**
 * A log file in the user's folder (`<userData>/logs/<name>.log`): lines with
 * their time; what the main process throws and nobody catches is written
 * there too before the process ends. Returns the way to write a line.
 */
export function FileLog(
	userData: string,
	name = "main",
	process: Pick<NodeJS.Process, "on"> = globalThis.process,
): ( line: string ) => void {
	const file = join( userData, "logs", `${ name }.log` );

	mkdirSync( dirname( file ), { recursive: true } );
	const Write = ( line: string ): void => {
		appendFileSync( file, `${ new Date().toISOString() } ${ line }\n` );
	};

	process.on( "uncaughtException", ( error: Error ) => {
		Write( `uncaught: ${ error.stack ?? error.message }` );
		throw error;
	} );
	return Write;
}
