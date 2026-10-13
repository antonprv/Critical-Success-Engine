// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { ResolveExports } from "./ExportsMap";

export interface EnginePackage {
	/** The package's name ("@cse/core"). */
	Name: string;
	/** Its folder (where package.json is). */
	Root: string;
	Exports: unknown;
}

export interface Engine {
	/**
	 * The workspace folder of the engine (src/CSEngine): Core, Modules and the
	 * pnpm workspace file are here.
	 */
	Root: string;
	Packages: Map<string, EnginePackage>;
}

const DefaultGlobs = [ "Core", "Modules/Engine/*", "Modules/Editor/*" ];
const SourceExtensions = [ ".ts", ".tsx", ".d.ts", ".js", ".mjs" ];

const Engines = new Map<string, Engine>();
const Located = new Map<string, string | null>();

function ReadJson( file: string ): Record<string, unknown> | undefined {
	try {
		return JSON.parse(
			readFileSync( file, "utf8" ).replace( /^\uFEFF/, "" ),
		) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

function IsFile( file: string ): boolean {
	try {
		return statSync( file ).isFile();
	} catch {
		return false;
	}
}

function IsEngineRoot( directory: string ): boolean {
	return ReadJson(
		join( directory, "Core", "package.json" ),
	)?.["name"] === "@cse/core";
}

/**
 * The engine's workspace folder for what the person pointed at: the repository,
 * src/CSEngine, or Core itself.
 */
export function LocateEngine( input: string ): string | undefined {
	const expanded = input.startsWith( "~" )
		? join( homedir(), input.slice( 1 ) )
		: input;
	const start = resolve( expanded );
	const candidates = [
		start,
		join( start, "src", "CSEngine" ),
		join( start, "CSEngine" ),
		basename( start ) === "Core"
			? dirname( start )
			: start,
	];

	return candidates.find( IsEngineRoot );
}

/**
 * The engine around a file (a project inside the repository, or the engine's
 * own sources), if there is one.
 */
export function LocateEngineAround( file: string ): string | undefined {
	let directory = dirname( file );
	const visited: string[] = [];

	for ( ;; ) {
		const known = Located.get( directory );

		if ( known !== undefined ) {
			visited.forEach( ( path ) => Located.set( path, known ) );
			return known ?? undefined;
		}
		visited.push( directory );

		const found = [ join( directory, "src", "CSEngine" ), directory ].find(
			IsEngineRoot,
		);
		const parent = dirname( directory );

		if ( found !== undefined || parent === directory ) {
			visited.forEach( ( path ) => Located.set( path, found ?? null ) );
			return found;
		}
		directory = parent;
	}
}

/**
 * The globs of the pnpm workspace file ("packages:" list), where the engine's
 * packages live.
 */
function WorkspaceGlobs( root: string ): string[] {
	const file = join( root, "pnpm-workspace.yaml" );

	if ( !existsSync( file ) ) {
		return DefaultGlobs;
	}

	const globs: string[] = [];
	let inPackages = false;

	for ( const line of readFileSync( file, "utf8" ).split( /\r?\n/ ) ) {
		if ( /^packages\s*:/.test( line ) ) {
			inPackages = true;
			continue;
		}

		if ( !inPackages ) {
			continue;
		}

		const item = /^\s+-\s+['"]?([^'"#]+?)['"]?\s*(#.*)?$/.exec( line );

		if ( item ) {
			globs.push( item[1]! );
		} else if ( /^\S/.test( line ) ) {
			break;
		}
	}
	return globs.length > 0
		? globs
		: DefaultGlobs;
}

function Expand( base: string, segments: string[] ): string[] {
	const [ head, ...rest ] = segments;

	if ( head === undefined ) {
		return [ base ];
	}

	if ( head !== "*" ) {
		return Expand( join( base, head ), rest );
	}

	try {
		return readdirSync( base, { withFileTypes: true } )
			.filter(
				( entry ) => entry.isDirectory()
					&& entry.name !== "node_modules",
			)
			.flatMap( ( entry ) => Expand( join( base, entry.name ), rest ) );
	} catch {
		return [];
	}
}

/**
 * The engine's packages (@cse/core, @cse/ui, ...) with their export maps, read
 * once per engine folder.
 */
export function LoadEngine( root: string ): Engine {
	const known = Engines.get( root );

	if ( known ) {
		return known;
	}

	const packages = new Map<string, EnginePackage>();

	for ( const glob of WorkspaceGlobs( root ) ) {
		for ( const folder of Expand(
			root,
			glob.split( "/" ).filter( Boolean ),
		) ) {
			const manifest = ReadJson( join( folder, "package.json" ) );
			const name = manifest?.["name"];

			if ( typeof name === "string" && name.startsWith( "@cse/" ) ) {
				packages.set(
					name,
					{
						Name: name,
						Root: folder,
						Exports: manifest?.["exports"],
					},
				);
			}
		}
	}

	const engine: Engine = { Root: root, Packages: packages };

	Engines.set( root, engine );
	return engine;
}

export function ForgetEngines(): void {
	Engines.clear();
	Located.clear();
}

/**
 * The file for a path the export map led to, the way an editor finds it
 * (extensions, an index file).
 */
function FindFile( path: string ): string | undefined {
	const options = [
		path,
		...SourceExtensions.map( ( extension ) => path + extension ),
		...SourceExtensions.map(
			( extension ) => join( path, `index${extension}` ),
		),
	];

	return options.find( IsFile );
}

/**
 * The source file an engine import stands for ("@cse/core/modules" is
 * Core/Source/Engine/Modules/ModuleManager.ts), or nothing if the import is not
 * an engine package's, or leads to what TypeScript can't read (.vue).
 */
export function ResolveEngineModule( engine: Engine, specifier: string ): string
	| undefined {
	const match = /^(@cse\/[^/]+)(?:\/(.+))?$/.exec( specifier );
	const pack = match
		? engine.Packages.get( match[1]! )
		: undefined;

	if ( !match || !pack ) {
		return undefined;
	}

	const subpath = match[2] === undefined
		? "."
		: `./${match[2]}`;
	const target = ResolveExports( pack.Exports, subpath );
	const path = target === undefined
		? join( pack.Root, subpath )
		: resolve( pack.Root, target );
	const file = FindFile( path );

	return file !== undefined
		&& SourceExtensions.some( ( extension ) => file.endsWith( extension ) )
		? file
		: undefined;
}

export { ReadJson };
