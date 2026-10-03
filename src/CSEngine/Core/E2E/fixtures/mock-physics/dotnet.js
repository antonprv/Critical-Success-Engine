// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// TEST DOUBLE for the .NET runtime's dotnet.js: the same boot API PhysicsWasmLoader.ts uses
// (`dotnet.withResourceLoader(fn).create()` -> getConfig / getAssemblyExports), backed by mock-bridge.js.
// Like the real runtime it asks the resource loader for its native .wasm asset and must receive intact wasm bytes -
// so the tests also prove the built site serves the (gzip-only) runtime files correctly.

import { CreateBridge } from "./mock-bridge.js";

export const dotnet = {
	withResourceLoader(loader) {
		return {
			async create() {
				const nativeWasm = new URL("dotnet.native.wasm", import.meta.url).href;
				const response = await loader("dotnetwasm", "dotnet.native.wasm", nativeWasm, "", "");
				if (!response || !response.ok) throw new Error("mock dotnet.js: the native .wasm asset was not provided by the resource loader");

				// Throws unless the bytes are a real WebAssembly module (right file, not an HTML fallback, not still gzipped).
				await WebAssembly.compile(await response.arrayBuffer());

				const bridge = CreateBridge();
				return {
					getConfig: () => ({ mainAssemblyName: "PhysicsBridge" }),
					getAssemblyExports: async (assembly) => {
						if (assembly !== "PhysicsBridge") throw new Error(`mock dotnet.js: unknown assembly ${assembly}`);
						return { Physics: { Wasm: { PhysicsBridge: bridge } } };
					},
				};
			},
		};
	},
};
