// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

/**
 * Where the browser looks for the physics runtime - PhysicsWasmLoader.ts's
 * default URL, in dev and in the built site alike.
 */
export const PhysicsWasmUrlPrefix = "/physics-wasm/_framework/";

/**
 * Where `dotnet publish` of Modules/Physics/Bridge leaves the runtime
 * (devops/build-physics.sh, Modules/Physics/Bridge/BUILD.md), relative to the
 * web project. This is the location the old webpack build copied from; it has
 * not changed.
 */
export const PhysicsWasmDefaultDirectory =
	"../Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework";

/**
 * The build for browsers without WebAssembly SIMD (`-p:CseNoSimd=true`): the
 * main build is SIMD-only (its dotnet.js refuses to start without it), so a
 * host that lacks SIMD gets this one, whose wide math runs on FastMath.
 */
export const PhysicsWasmNoSimdUrlPrefix = "/physics-wasm-nosimd/_framework/";

/** Where `dotnet publish -p:CseNoSimd=true` leaves the fallback runtime. */
export const PhysicsWasmNoSimdDefaultDirectory =
	"../Binaries/PhysicsNoSimd/Release/net10.0/browser-wasm/AppBundle"
	+ "/_framework";

const ContentTypesByExtension: Record<string, string> = {
	".wasm": "application/wasm",
	".gz": "application/gzip",
	".js": "text/javascript",
	".map": "application/json",
	".json": "application/json",
};

/**
 * `PHYSICS_WASM_DIR` (absolute, or relative to the project root) overrides the
 * default location - used by the E2E tests to build against a stand-in runtime,
 * and handy for trying a physics build from somewhere else.
 */
export function ResolvePhysicsWasmDirectory(
	projectRoot: string,
	environment: NodeJS.ProcessEnv = process.env,
): string {
	const override = environment["PHYSICS_WASM_DIR"];

	return override
		? resolve( projectRoot, override )
		: resolve( projectRoot, PhysicsWasmDefaultDirectory );
}

/**
 * The fallback (no SIMD) runtime's folder; `PHYSICS_WASM_NOSIMD_DIR` overrides
 * it the way `PHYSICS_WASM_DIR` does the main one.
 */
export function ResolvePhysicsWasmNoSimdDirectory(
	projectRoot: string,
	environment: NodeJS.ProcessEnv = process.env,
): string {
	const override = environment["PHYSICS_WASM_NOSIMD_DIR"];

	return resolve(
		projectRoot,
		override || PhysicsWasmNoSimdDefaultDirectory,
	);
}

type Next = ( error?: unknown ) => void;

/**
 * Connect middleware that serves `directory` under {@link PhysicsWasmUrlPrefix}
 * (files only, never outside the directory).
 */
export function CreatePhysicsWasmMiddleware(
	directory: string,
	prefix: string = PhysicsWasmUrlPrefix,
) {
	return (
		request: Pick<IncomingMessage, "url">,
		response: Pick<ServerResponse, "setHeader"> & NodeJS.WritableStream,
		next: Next,
	): void => {
		if ( !request.url?.startsWith( prefix ) ) {
			next();
			return;
		}

		const requested = decodeURIComponent(
			request.url.slice( prefix.length )
				.replace( /\?.*$/s, "" ),
		);
		const filePath = join( directory, requested );
		const relativePath = relative( directory, filePath );
		const insideDirectory = relativePath !== ""
			&& !relativePath.startsWith( ".." )
			&& !isAbsolute( relativePath );

		if ( !insideDirectory
			|| !existsSync( filePath )
			|| !statSync( filePath ).isFile() ) {
			next();
			return;
		}

		response.setHeader(
			"Content-Type",
			ContentTypesByExtension[extname( filePath )]
				?? "application/octet-stream",
		);
		createReadStream( filePath ).pipe( response );
	};
}

/**
 * Copies the physics runtime into the built site:
 * `<outDir>/<folder>/_framework`, exactly where the dev server serves it.
 */
export function CopyPhysicsWasm(
	directory: string,
	outputDirectory: string,
	folder = "physics-wasm",
): boolean {
	if ( !existsSync( directory ) ) {
		return false;
	}

	cpSync(
		directory,
		resolve( outputDirectory, folder, "_framework" ),
		{ recursive: true },
	);
	return true;
}

/**
 * Makes the physics runtime available at /physics-wasm/_framework/ (and the
 * fallback for browsers without WebAssembly SIMD at
 * /physics-wasm-nosimd/_framework/) - served straight from the .NET publish
 * folders by `vite dev`, copied into the output by `vite build` (and therefore
 * served by `vite preview`). A missing folder is not an error: the game then
 * runs without physics (GameLogic reports it on screen), so UI/render work
 * doesn't need a .NET build; without the fallback only SIMD-less browsers do.
 */
export function PhysicsWasmPlugin(
	directory: string,
	noSimdDirectory?: string,
): Plugin {
	let config: ResolvedConfig;

	return {
		name: "physics-wasm",

		configResolved( resolved ) {
			config = resolved;
		},

		configureServer( server ) {
			server.middlewares.use( CreatePhysicsWasmMiddleware( directory ) );

			if ( noSimdDirectory ) {
				server.middlewares.use( CreatePhysicsWasmMiddleware(
					noSimdDirectory,
					PhysicsWasmNoSimdUrlPrefix,
				) );
			}
		},

		writeBundle() {
			const outputDirectory = resolve( config.root, config.build.outDir );

			if ( CopyPhysicsWasm( directory, outputDirectory ) ) {
				config.logger.info(
					`physics-wasm: copied ${ directory } -> ${
						resolve( outputDirectory, "physics-wasm/_framework" )
					}`,
				);
			} else {
				config.logger.info(
					`physics-wasm: no physics build at ${ directory } - the `
						+ "site will run without physics.",
				);
			}

			if ( noSimdDirectory && CopyPhysicsWasm(
				noSimdDirectory,
				outputDirectory,
				"physics-wasm-nosimd",
			) ) {
				config.logger.info(
					`physics-wasm-nosimd: copied ${ noSimdDirectory } -> ${
						resolve(
							outputDirectory,
							"physics-wasm-nosimd/_framework",
						)
					}`,
				);
			} else {
				config.logger.info(
					"physics-wasm: no build for browsers without WebAssembly "
						+ "SIMD - they will run without physics.",
				);
			}
		},
	};
}
