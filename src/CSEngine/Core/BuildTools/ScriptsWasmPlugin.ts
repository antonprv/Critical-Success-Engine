// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { join, resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { GenerateContracts } from "./ContractsPlugin.ts";
import {
	CopyPhysicsWasm, CreatePhysicsWasmMiddleware,
} from "./PhysicsWasmPlugin.ts";

/**
 * Where the browser finds the project's C# scripts (GameLogicWorker:
 * Workers/Common/ScriptsWasmUrl.ts).
 */
export const ScriptsWasmUrlPrefix = "/scripts-wasm/_framework/";

export type ScriptsConfiguration = "Debug" | "Release";

/**
 * Where `dotnet build` / `dotnet publish` of a project's scripts leaves the
 * runtime (Modules/Scripting/Sdk/CSEngine.Game.targets: Binaries/Scripts).
 */
export function ScriptsBundleDirectory(
	projectDirectory: string,
	configuration: ScriptsConfiguration,
): string {
	return join(
		projectDirectory,
		"Binaries/Scripts",
		configuration,
		"net10.0/browser-wasm/AppBundle/_framework",
	);
}

export type RunCommand = (
	command: string,
	args: string[],
	options: { cwd: string; encoding: "utf8"; },
) => Pick<SpawnSyncReturns<string>, "status" | "stdout" | "stderr" | "error">;

/**
 * Builds the scripts: Debug (`pnpm dev`) is interpreted and quick; Release
 * (`pnpm build`) is published AOT-compiled with the IL stripped. Returns the
 * errors, or null when it built.
 */
export function BuildScripts(
	projectDirectory: string,
	csproj: string,
	configuration: ScriptsConfiguration,
	run: RunCommand = spawnSync,
): string | null {
	const verb = configuration === "Release" ? "publish" : "build";
	const result = run(
		"dotnet",
		[verb, csproj, "-c", configuration, "-nologo", "-v:q"],
		{ cwd: projectDirectory, encoding: "utf8" },
	);

	if ( result.error ) {
		return `dotnet could not run (${ result.error.message }): install the `
			+ ".NET 10 SDK and `dotnet workload install wasm-tools`";
	}
	if ( result.status !== 0 ) {
		const errors = `${ result.stdout }\n${ result.stderr }`.split( "\n" )
			.filter( ( line ) => /error/i.test( line ) );

		return errors.join( "\n" ) || `dotnet ${ verb } failed`;
	}
	return null;
}

export interface ScriptsWasmPluginOptions {
	/** The project's folder. */
	Directory: string;
	/** Its .csproj (a name in Directory), or null: no C# scripts. */
	CSharp: string | null;
	Run?: RunCommand;
}

/**
 * The project's C# scripts in the game: built when the dev server starts (and
 * again, with a page reload, when a .cs file changes) or when the site is
 * built, served at /scripts-wasm/_framework/, copied into the site. A build
 * that fails is reported and the game runs without its C# components.
 */
export function ScriptsWasmPlugin( options: ScriptsWasmPluginOptions ): Plugin {
	const { CSharp: csproj, Directory: directory } = options;
	let config: ResolvedConfig;
	let configuration: ScriptsConfiguration = "Debug";

	const build = (): boolean => {
		if ( !csproj ) {
			return false;
		}
		// the C# side of the .contract files first (this may run before the
		// contracts plugin's buildStart)
		const contracts = GenerateContracts( directory, true ).Errors;

		if ( contracts.length > 0 ) {
			config.logger.error(
				`scripts-wasm: ${ csproj } was not built - the .contract files `
					+ `have problems:\n${ contracts.join( "\n" ) }`,
			);
			return false;
		}
		const errors = BuildScripts(
			directory,
			csproj,
			configuration,
			options.Run,
		);

		if ( errors ) {
			config.logger.error(
				`scripts-wasm: ${ csproj } did not build - the game runs `
					+ `without its C# components:\n${ errors }`,
			);
			return false;
		}
		config.logger.info(
			`scripts-wasm: built ${ csproj } (${ configuration })`,
		);
		return true;
	};

	return {
		name: "scripts-wasm",

		configResolved( resolved ) {
			config = resolved;
			configuration = resolved.command === "build" ? "Release" : "Debug";
		},

		configureServer( server ) {
			if ( !csproj ) {
				return;
			}
			build();
			server.middlewares.use( CreatePhysicsWasmMiddleware(
				ScriptsBundleDirectory( directory, "Debug" ),
				ScriptsWasmUrlPrefix,
			) );
			server.watcher.add( join( directory, "**/*.cs" ) );
			server.watcher.on( "change", ( file ) => {
				if ( file.endsWith( ".cs" )
					&& file.startsWith( directory )
					&& build() ) {
					server.ws.send( { type: "full-reload" } );
				}
			} );
		},

		writeBundle() {
			if ( !build() ) {
				return;
			}
			const output = resolve( config.root, config.build.outDir );
			const bundle = ScriptsBundleDirectory( directory, "Release" );

			if ( CopyPhysicsWasm( bundle, output, "scripts-wasm" ) ) {
				config.logger.info(
					`scripts-wasm: copied into ${ output }/scripts-wasm`,
				);
			}
			else {
				config.logger.error(
					`scripts-wasm: the build left nothing at ${ bundle }`,
				);
			}
		},
	};
}
