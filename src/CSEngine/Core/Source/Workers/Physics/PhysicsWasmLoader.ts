// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../../Logging/Logger";
import type { DotnetRuntimeApi, PhysicsBridgeExports } from "./PhysicsBridgeContract";

/** Boots the .NET wasm runtime in the worker and returns the PhysicsBridge exports. */
export class PhysicsWasmLoader {
	private readonly _dotnetJsUrl: string;

	public constructor(dotnetJsUrl: string = "/physics-wasm/_framework/dotnet.js") {
		this._dotnetJsUrl = dotnetJsUrl;
	}

	/** Boots dotnet.js and resolves the PhysicsBridge's [JSExport] surface. */
	public async Load(): Promise<PhysicsBridgeExports> {
		// A non-literal specifier is used on purpose: it's not one of this repo's own
		// TS modules, so neither tsc nor the bundler should try to statically
		// resolve/type it - Vite leaves a genuinely dynamic `import(someVariable)`
		// (marked @vite-ignore) as a runtime browser import.
		const { dotnet } = (await import(/* @vite-ignore */ this._dotnetJsUrl)) as {
			dotnet: {
				withResourceLoader(
					loader: (
						type: string,
						name: string,
						defaultUri: string,
						integrity: string,
						behavior: string
					) => string | Promise<Response | undefined> | undefined
				): { create(): Promise<DotnetRuntimeApi>; };
			};
		};

		const { getAssemblyExports, getConfig } = await dotnet.withResourceLoader(this.LoadGzippedWasmAsset).create();
		const config = getConfig();
		const exports = await getAssemblyExports(config.mainAssemblyName);
		return exports.Physics.Wasm.PhysicsBridge;
	}

	/**
	 * Every .wasm under _framework/ is published gzip-only, so .wasm requests are served from their `.gz` sibling. Some
	 * servers (Vite's dev server) send that file with `Content-Encoding: gzip` and the browser already inflates it, so the
	 * gzip magic bytes decide whether to decompress here.
	 */
	private LoadGzippedWasmAsset(type: string, name: string, defaultUri: string): Promise<Response | undefined> | undefined {
		if (!defaultUri.endsWith(".wasm")) {
			return undefined; // not a wasm asset - let dotnet.js load it normally
		}

		return (async () => {
			const gzipUri = `${defaultUri}.gz`;
			const gzipResponse = await fetch(gzipUri);

			if (!gzipResponse.ok) {
				throw new Error(
					`[PhysicsWasmLoader] Missing gzip asset: ${gzipUri} (${gzipResponse.status} ${gzipResponse.statusText}). ` +
					`Uncompressed .wasm files are not published - rebuild via GzipCompressWasmAssets (see physics-wasm/BUILD.md).`
				);
			}

			const received = new Uint8Array(await gzipResponse.arrayBuffer());
			const isGzip = received.length >= 2 && received[0] === 0x1f && received[1] === 0x8b;

			let payload: ArrayBuffer;
			if (isGzip) {
				payload = await new Response(
					new Blob([received]).stream().pipeThrough(new DecompressionStream("gzip"))
				).arrayBuffer();
				Logger.LogDebug(`[PhysicsWasmLoader] decompressed ${gzipUri}: ${payload.byteLength} bytes`);
			} else {
				// No gzip magic bytes - the transport (dev server + browser Content-Encoding
				// handling) already decompressed this for us. Nothing left to do.
				payload = received.buffer;
				Logger.LogDebug(`[PhysicsWasmLoader] ${gzipUri} arrived pre-decompressed by the transport: ${payload.byteLength} bytes`);
			}

			return new Response(payload, {
				status: 200,
				headers: {
					"Content-Type": "application/wasm",
					"Content-Length": String(payload.byteLength),
				},
			});
		})();
	}
}
