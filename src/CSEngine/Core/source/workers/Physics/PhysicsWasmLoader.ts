// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../../Logging/Logger";
import type { DotnetRuntimeApi, PhysicsBridgeExports } from "./PhysicsBridgeContract";

/**
 * Boots the physics-wasm .NET runtime inside the worker and hands back the
 * PhysicsBridge exports. This is the ONLY thing this class does - it knows
 * nothing about shapes, bodies or stepping (see PhysicsWorld for that side
 * of things).
 */
export class PhysicsWasmLoader {
	private readonly _dotnetJsUrl: string;

	public constructor(dotnetJsUrl: string = "/physics-wasm/_framework/dotnet.js") {
		this._dotnetJsUrl = dotnetJsUrl;
	}

	/** Boots dotnet.js and resolves the PhysicsBridge's [JSExport] surface. */
	public async Load(): Promise<PhysicsBridgeExports> {
		// A non-literal specifier is used on purpose: it's not one of this repo's own
		// TS modules, so neither tsc nor the bundler should try to statically
		// resolve/type it - both webpack and Vite still leave a genuinely dynamic
		// `import(someVariable)` as a runtime browser import.
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const { dotnet } = (await import(/* webpackIgnore: true */ /* @vite-ignore */ this._dotnetJsUrl)) as {
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
	 * Every .wasm asset under _framework/ (the wasm-tools native runtime AND every
	 * Webcil-wrapped managed assembly, which also carries a .wasm extension) is
	 * published gzip-only - see GzipCompressWasmAssets.targets. There is no
	 * uncompressed fallback on disk, so any .wasm resource dotnet.js asks for is
	 * intercepted here and loaded from its `.gz` sibling.
	 *
	 * Some static-file servers (notably Vite's dev server) transparently set
	 * `Content-Encoding: gzip` on requests for a `.gz`-suffixed file, which makes
	 * the browser's own fetch() silently undo the compression before this code
	 * ever sees the bytes - other hosts may not do this at all. So we check the
	 * gzip magic bytes (1F 8B) on what we actually received: if present, we
	 * decompress ourselves; if absent, the transport already did it for us and
	 * the bytes are used as-is. This works uniformly for the native runtime
	 * (raw WASM once decompressed) and for Webcil-wrapped managed assemblies
	 * (which don't carry a WASM magic number at all, so we can't key off that).
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
