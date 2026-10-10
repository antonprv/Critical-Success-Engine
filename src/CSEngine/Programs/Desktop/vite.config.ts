// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const RootDirectory = fileURLToPath(new URL(".", import.meta.url));

/**
 * The desktop app's main process and preload, for Node (CommonJS): Binaries/Programs/Desktop/main.cjs and preload.cjs,
 * in two passes ("vite build", then "vite build --mode preload"): a sandboxed preload may require nothing but electron,
 * so it must be one file, sharing no chunk with the main process.
 */
export default defineConfig(({ mode }) => {
	const preload = mode === "preload";
	const entry = preload ? "Source/Preload/Preload.ts" : "Source/Main/Main.ts";
	return {
		build: {
			outDir: resolve(RootDirectory, "../../Binaries/Programs/Desktop"),
			emptyOutDir: !preload,
			sourcemap: true,
			target: "node22",
			minify: false,
			lib: { entry: resolve(RootDirectory, entry), formats: ["cjs"], fileName: () => (preload ? "preload.cjs" : "main.cjs") },
			rollupOptions: { external: ["electron", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)] },
		},
	};
});
