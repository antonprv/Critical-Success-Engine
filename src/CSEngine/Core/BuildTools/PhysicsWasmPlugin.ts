// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

/** Where the browser looks for the physics runtime - PhysicsWasmLoader.ts's default URL, in dev and in the built site alike. */
export const PhysicsWasmUrlPrefix = "/physics-wasm/_framework/";

/**
 * Where `dotnet publish` of Physics/Bridge leaves the runtime (devops/build-physics.sh, Physics/Bridge/BUILD.md), relative
 * to the web project. This is the location the old webpack build copied from; it has not changed.
 */
export const PhysicsWasmDefaultDirectory = "../Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework";

const ContentTypesByExtension: Record<string, string> = {
	".wasm": "application/wasm",
	".gz": "application/gzip",
	".js": "text/javascript",
	".map": "application/json",
	".json": "application/json",
};

/**
 * `PHYSICS_WASM_DIR` (absolute, or relative to the project root) overrides the default location - used by the E2E tests to
 * build against a stand-in runtime, and handy for trying a physics build from somewhere else.
 */
export function ResolvePhysicsWasmDirectory(projectRoot: string, environment: NodeJS.ProcessEnv = process.env): string {
	const override = environment["PHYSICS_WASM_DIR"];
	return override ? resolve(projectRoot, override) : resolve(projectRoot, PhysicsWasmDefaultDirectory);
}

type Next = (error?: unknown) => void;

/** Connect middleware that serves `directory` under {@link PhysicsWasmUrlPrefix} (files only, never outside the directory). */
export function CreatePhysicsWasmMiddleware(directory: string) {
	return (request: Pick<IncomingMessage, "url">, response: Pick<ServerResponse, "setHeader"> & NodeJS.WritableStream, next: Next): void => {
		if (!request.url?.startsWith(PhysicsWasmUrlPrefix)) {
			next();
			return;
		}

		const requested = decodeURIComponent(request.url.slice(PhysicsWasmUrlPrefix.length).replace(/\?.*$/s, ""));
		const filePath = join(directory, requested);
		const relativePath = relative(directory, filePath);
		const insideDirectory = relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);

		if (!insideDirectory || !existsSync(filePath) || !statSync(filePath).isFile()) {
			next();
			return;
		}

		response.setHeader("Content-Type", ContentTypesByExtension[extname(filePath)] ?? "application/octet-stream");
		createReadStream(filePath).pipe(response);
	};
}

/** Copies the physics runtime into the built site: `<outDir>/physics-wasm/_framework`, exactly where the dev server serves it. */
export function CopyPhysicsWasm(directory: string, outputDirectory: string): boolean {
	if (!existsSync(directory)) return false;

	cpSync(directory, resolve(outputDirectory, "physics-wasm/_framework"), { recursive: true });
	return true;
}

/**
 * Makes the physics runtime available at /physics-wasm/_framework/ - served straight from the .NET publish folder by
 * `vite dev`, copied into the output by `vite build` (and therefore served by `vite preview`). A missing folder is not an
 * error: the game then runs without physics (GameLogic reports it on screen), so UI/render work doesn't need a .NET build.
 */
export function PhysicsWasmPlugin(directory: string): Plugin {
	let config: ResolvedConfig;

	return {
		name: "physics-wasm",

		configResolved(resolved) {
			config = resolved;
		},

		configureServer(server) {
			server.middlewares.use(CreatePhysicsWasmMiddleware(directory));
		},

		writeBundle() {
			const outputDirectory = resolve(config.root, config.build.outDir);
			if (CopyPhysicsWasm(directory, outputDirectory)) {
				config.logger.info(`physics-wasm: copied ${directory} -> ${resolve(outputDirectory, "physics-wasm/_framework")}`);
			} else {
				config.logger.info(`physics-wasm: no physics build at ${directory} - the site will run without physics.`);
			}
		},
	};
}
