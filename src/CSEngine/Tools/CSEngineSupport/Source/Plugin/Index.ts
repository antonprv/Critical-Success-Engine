// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type * as ts from "typescript";
import {
	ForgetEngines,
	LoadEngine,
	LocateEngine,
	LocateEngineAround,
	ResolveEngineModule,
	type Engine,
} from "./EnginePackages";

/**
 * The TypeScript server plugin: imports of the engine's packages (@cse/core,
 * @cse/ui, ...) in a project resolve to the engine's own sources, wherever the
 * project lives. Types, completion and go to definition then work with no
 * node_modules and no tsconfig paths in the project. The extension tells the
 * plugin where the engine is (cse.enginePath); without that, the engine around
 * the file is used (a project inside the repository).
 */
interface PluginConfiguration {
	enginePath?: string;
}

/**
 * The compiler options that would make no sense in a project of its own
 * (places, outputs, tooling).
 */
const ProjectSpecific = new Set( [
	"paths",
	"baseUrl",
	"rootDir",
	"rootDirs",
	"outDir",
	"types",
	"typeRoots",
	"plugins",
	"composite",
	"incremental",
	"tsBuildInfoFile",
	"declarationDir",
] );

const ExtensionOf = ( file: string ): string => {
	const match = /\.(d\.ts|tsx|ts|mjs|js)$/.exec( file );

	return match
		? `.${match[1]}`
		: ".ts";
};

function Initialize(
	modules: { typescript: typeof ts },
): ts.server.PluginModule {
	const typescript = modules.typescript;
	let configured: Engine | undefined;
	const projects = new Set<ts.server.PluginCreateInfo>();
	const settings = new Map<string, ts.CompilerOptions>();

	const EngineFor = ( file: string ): Engine | undefined => {
		if ( configured ) {
			return configured;
		}

		const around = LocateEngineAround( file );

		return around === undefined
			? undefined
			: LoadEngine( around );
	};

	/**
	 * The engine's own compiler options (Core/tsconfig.json), for projects that
	 * have no tsconfig of their own.
	 */
	const EngineOptions = ( engine: Engine ): ts.CompilerOptions => {
		const known = settings.get( engine.Root );

		if ( known ) {
			return known;
		}

		const file = `${engine.Root}/Core/tsconfig.json`;
		const config = typescript.readConfigFile(
			file,
			typescript.sys.readFile,
		).config as
			{ compilerOptions?: Record<string, unknown>; } | undefined;
		const { options } = typescript.convertCompilerOptionsFromJson(
			config?.compilerOptions ?? {},
			`${engine.Root}/Core`,
		);

		for ( const key of ProjectSpecific ) {
			delete ( options as Record<string, unknown> )[key];
		}

		settings.set( engine.Root, options );
		return options;
	};

	/**
	 * The engine the extension pointed at (cse.enginePath), or none: then the
	 * engine around each file is used.
	 */
	const Apply = ( configuration: PluginConfiguration | undefined ): void => {
		ForgetEngines();
		settings.clear();

		const root = configuration?.enginePath
			? LocateEngine( configuration.enginePath )
			: undefined;

		configured = root === undefined
			? undefined
			: LoadEngine( root );
	};

	const ResolveImport = (
		specifier: string,
		containingFile: string,
	): ts.ResolvedModuleFull | undefined => {
		if ( !specifier.startsWith( "@cse/" ) ) {
			return undefined;
		}

		const engine = EngineFor( containingFile );
		const file = engine
			? ResolveEngineModule( engine, specifier )
			: undefined;

		return file === undefined
			? undefined
			: {
				resolvedFileName: file,
				extension: ExtensionOf( file ) as ts.Extension,
				isExternalLibraryImport: false,
			};
	};

	return {
		create( info ) {
			projects.add( info );

			// The configuration the extension sent before the plugin was loaded
			// arrives here (later ones, below).
			if ( ( info.config as PluginConfiguration
				| undefined )?.enginePath !== undefined ) {
				Apply( info.config as PluginConfiguration );
			}

			const host = info.languageServiceHost;
			const literals = host.resolveModuleNameLiterals?.bind( host );
			const names = host.resolveModuleNames?.bind( host );

			if ( literals ) {
				host.resolveModuleNameLiterals = (
					moduleLiterals,
					containingFile,
					...rest
				) => {
					const results = literals(
						moduleLiterals,
						containingFile,
						...rest,
					);

					return results.map( ( result, index ) => {
						const resolvedModule = ResolveImport(
							moduleLiterals[index]!.text,
							containingFile,
						);

						return resolvedModule
							? { resolvedModule }
							: result;
					} );
				};
			}

			if ( names ) {
				host.resolveModuleNames = (
					moduleNames,
					containingFile,
					...rest
				) => {
					const results = names(
						moduleNames,
						containingFile,
						...rest,
					);

					return results.map(
						( result, index ) => ResolveImport(
							moduleNames[index]!,
							containingFile,
						) ?? result,
					);
				};
			}

			const compilationSettings = host.getCompilationSettings.bind(
				host,
			);
			let lastBase: ts.CompilerOptions | undefined;
			let lastMerged: ts.CompilerOptions | undefined;

			host.getCompilationSettings = () => {
				const base = compilationSettings();

				if ( info.project.projectKind
					!== typescript.server.ProjectKind.Inferred ) {
					return base;
				}

				const engine = configured ?? ( () => {
					const around = LocateEngineAround(
						`${info.project.getCurrentDirectory()}/_`,
					);

					return around === undefined
						? undefined
						: LoadEngine( around );
				} )();

				if ( !engine ) {
					return base;
				}

				if ( base !== lastBase || lastMerged === undefined ) {
					lastBase = base;
					lastMerged = { ...base, ...EngineOptions( engine ) };
				}
				return lastMerged;
			};

			return info.languageService;
		},

		onConfigurationChanged( configuration: PluginConfiguration ) {
			Apply( configuration );

			for ( const info of projects ) {
				try {
					( info.project as unknown as {
						markAsDirty(): void;
					} ).markAsDirty();
					info.project.refreshDiagnostics();
				} catch {
					// the next edit refreshes the project anyway
				}
			}
		},
	};
}

export default Initialize;
