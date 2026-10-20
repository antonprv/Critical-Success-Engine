// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { Severity, type Diagnostic } from "./Format.ts";
import { GenerateTypeScript, ShortKeys } from "./Generate.ts";
import {
	Compile,
	ReadTables,
	Report,
	TableExtension,
	type CompiledTables,
	type Tables,
} from "./Tables.ts";

/**
 * The build of a project's tables (Node: the engine's Vite build, the table
 * editor, a command line).
 */
export interface BuildOptions {
	/** The project's folder (messages give paths from it). */
	Project: string;
	/**
	 * Where the tables are, from the project's folder (every .cstables below
	 * it).
	 */
	Resources?: string;
	/** Where the generated code goes, from the project's folder. */
	Output?: string;
	BaseLanguage?: string;
	/** Where the generated code imports the runtime from. */
	Runtime?: string;
	/** Warnings fail the build too. */
	WarningsAsErrors?: boolean;
}

export interface BuildResult {
	Tables: Tables;
	Compiled: CompiledTables;
	Diagnostics: Diagnostic[];
	/**
	 * Whether the build may go on: no errors (no warnings either, with
	 * WarningsAsErrors).
	 */
	Ok: boolean;
	/**
	 * The files written (those whose text changed), from the project's folder.
	 */
	Written: string[];
	Report: string;
}

export const DefaultResources = "Resources";
export const DefaultOutput = "Source/Generated";
export const DefaultBaseLanguage = "ru";

function TableFiles( folder: string ): string[] {
	if ( !existsSync( folder ) ) {
		return [];
	}
	return readdirSync( folder, { recursive: true, withFileTypes: true } )
		.filter(
			( entry ) => entry.isFile() && entry.name.toLowerCase()
				.endsWith( TableExtension ),
		)
		.map( ( entry ) => join( entry.parentPath, entry.name ) )
		.sort();
}

/**
 * Reads every table of the project, checks it, writes the code when there are
 * no errors; nothing is written when it is the same.
 */
export function BuildTables( options: BuildOptions ): BuildResult {
	const resources = join(
		options.Project,
		options.Resources ?? DefaultResources,
	);
	const output = join( options.Project, options.Output ?? DefaultOutput );
	const sources = TableFiles( resources )
		.map(
			( file ) => ( { File: relative( options.Project, file ).split( sep )
				.join( "/" ), Text: readFileSync( file, "utf8" ) } ),
		);
	const tables = ReadTables(
		sources,
		options.BaseLanguage ?? DefaultBaseLanguage,
	);
	const compiled = Compile( tables );
	const errors = tables.Diagnostics.some(
		( d ) => d.Severity === Severity.Error
			|| options.WarningsAsErrors === true,
	);
	const written: string[] = [];

	if ( !errors && tables.Groups.length > 0 ) {
		mkdirSync( output, { recursive: true } );
		for ( const [ name, text ] of Object.entries(
			GenerateTypeScript(
				compiled,
				ShortKeys( compiled ),
				options.Runtime,
			).Files,
		) ) {
			const file = join( output, name );

			if ( existsSync( file )
				&& readFileSync( file, "utf8" ) === text ) {
				continue;
			}
			writeFileSync( file, text );
			written.push(
				relative( options.Project, file ).split( sep )
					.join( "/" ),
			);
		}
	}
	return {
		Tables: tables,
		Compiled: compiled,
		Diagnostics: tables.Diagnostics,
		Ok: !errors,
		Written: written,
		Report: Report( tables, compiled ),
	};
}

/**
 * A diagnostic as compilers write them: `file(line): error CST010: message`.
 */
export function FormatDiagnostic( diagnostic: Diagnostic ): string {
	const at = diagnostic.Line > 0 ? `(${ diagnostic.Line })` : "";
	const kind = diagnostic.Severity === Severity.Error ? "error" : "warning";

	return `${ diagnostic.File }${ at }: ${ kind } ${ diagnostic.Code }: `
		+ diagnostic.Message;
}

/** The parts of Vite's plugin API this plugin uses. */
interface ViteServer {
	watcher: {
		add( path: string ): void;
		on(
			event: "add" | "change" | "unlink",
			listener: ( file: string ) => void
		): void;
	};
	config: {
		logger: {
			info( message: string ): void;
			warn( message: string ): void;
			error( message: string ): void;
		};
	};
}

/**
 * The tables in a Vite build: generated before the build (errors stop it), and
 * again whenever a .cstables changes in the dev server (the generated modules
 * change, so the page reloads with the new texts).
 */
export function CSTablesPlugin( options: BuildOptions ) {
	const Run = (
		log: ( message: string ) => void,
		warn: ( message: string ) => void,
	): BuildResult => {
		const result = BuildTables( options );

		for ( const diagnostic of result.Diagnostics ) {
			( diagnostic.Severity
			=== Severity.Error ? log : warn )( FormatDiagnostic( diagnostic ) );
		}
		return result;
	};

	return {
		name: "cse-cstables",
		buildStart(): void {
			const result = Run(
				( m ) => console.error( m ),
				( m ) => console.warn( m ),
			);

			if ( !result.Ok ) {
				const failing = result.Diagnostics.filter(
					( d ) => d.Severity === Severity.Error
						|| options.WarningsAsErrors === true,
				);

				throw new Error(
					`CSTables: the tables have ${ failing.length } problems `
					+ "(see above)",
				);
			}
		},
		configureServer( server: ViteServer ): void {
			const resources = join(
				options.Project,
				options.Resources ?? DefaultResources,
			);
			const logger = server.config.logger;
			const Changed = ( file: string ): void => {
				if ( !file.toLowerCase().endsWith( TableExtension ) ) {
					return;
				}
				const result = Run(
					( m ) => logger.error( m ),
					( m ) => logger.warn( m ),
				);

				if ( result.Written.length > 0 ) {
					logger.info(
						`CSTables: ${ result.Written.join( ", " ) } written `
							+ "again",
					);
				}
			};

			server.watcher.add( resources );
			server.watcher.on( "add", Changed );
			server.watcher.on( "change", Changed );
			server.watcher.on( "unlink", Changed );
		},
	};
}
