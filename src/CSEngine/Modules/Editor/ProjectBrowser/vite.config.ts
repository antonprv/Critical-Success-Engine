// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const RootDirectory = fileURLToPath(new URL(".", import.meta.url));

/** The Project Browser, an editor module: its page builds to Binaries/Modules/Editor/ProjectBrowser (the desktop app loads it from there). */
export default defineConfig({
	plugins: [vue(), tailwindcss()],
	// Relative paths: the desktop app opens the built page from disk (file://).
	base: "./",
	server: { host: "127.0.0.1", port: 5177, fs: { allow: [resolve(RootDirectory, "../../..")] } },
	preview: { host: "127.0.0.1", port: 4178 },
	build: {
		outDir: resolve(RootDirectory, "../../../Binaries/Modules/Editor/ProjectBrowser"),
		emptyOutDir: true,
		sourcemap: true,
		chunkSizeWarningLimit: 4096,
	},
});
