// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { EngineTypesPlugin } from "../../../Core/BuildTools/EngineTypes.ts";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const RootDirectory = fileURLToPath(new URL(".", import.meta.url));

/** The UI Designer, an editor module: its page builds to Binaries/Modules/Editor/UIDesigner. */
export default defineConfig({
	// The engine's declarations, for the code editor's TypeScript (virtual:cse/engine-types).
	plugins: [vue(), tailwindcss(), EngineTypesPlugin()],
	// Relative paths: the desktop app opens the built page from disk (file://).
	base: "./",
	server: {
		host: "127.0.0.1",
		port: 5175,
		// The UI module and the engine core come from their sources (workspace packages).
		fs: { allow: [resolve(RootDirectory, "../../..")] },
	},
	preview: { host: "127.0.0.1", port: 4176 },
	build: {
		outDir: resolve(RootDirectory, "../../../Binaries/Modules/Editor/UIDesigner"),
		emptyOutDir: true,
		sourcemap: true,
		chunkSizeWarningLimit: 4096,
	},
});
