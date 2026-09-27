// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { Plugin } from "vite";

const ContentTypesByExtension: Record<string, string> = {
	".wasm": "application/wasm",
	".gz": "application/gzip",
	".js": "text/javascript",
	".map": "application/json",
	".json": "application/json",
};

/**
 * There is no committed physics-wasm/ copy in the repo anymore - the .NET
 * publish output under CSEngine/Binaries/Physics/.../AppBundle/_framework/
 * is the single source of truth. This plugin serves that directory straight
 * out of the Binaries folder during `vite dev`, at the same
 * /physics-wasm/_framework/ URL the production build copies it to (see
 * webpack.config.js's CopyWebpackPlugin pattern) - so PhysicsWasmLoader.ts's
 * default URL never has to know whether it's running under dev or prod.
 */
export function PhysicsWasmStaticPlugin(physicsWasmFrameworkDirectory: string): Plugin {
	const UrlPrefix = "/physics-wasm/_framework/";

	return {
		name: "physics-wasm-static",

		config() {
			// Outside the project root, so the dev server's default filesystem
			// guard has to be told explicitly that this directory is fine to read.
			return {
				server: {
					fs: {
						allow: [physicsWasmFrameworkDirectory],
					},
				},
			};
		},

		configureServer(Server) {
			Server.middlewares.use((request, response, next) => {
				if (!request.url || !request.url.startsWith(UrlPrefix)) {
					next();
					return;
				}

				const relativePath = decodeURIComponent(request.url.slice(UrlPrefix.length).split("?")[0] ?? "");
				const filePath = join(physicsWasmFrameworkDirectory, relativePath);

				if (!filePath.startsWith(physicsWasmFrameworkDirectory) || !existsSync(filePath) || !statSync(filePath).isFile()) {
					next();
					return;
				}

				response.setHeader("Content-Type", ContentTypesByExtension[extname(filePath)] ?? "application/octet-stream");
				createReadStream(filePath).pipe(response);
			});
		},
	};
}
