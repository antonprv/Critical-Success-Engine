// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const RootDirectory = fileURLToPath(new URL(".", import.meta.url));

/** The engine's UI module: its page is the toolkit gallery, built to Binaries/Modules/Engine/UI. */
export default defineConfig({
	plugins: [vue(), tailwindcss()],
	server: {
		host: "127.0.0.1",
		port: 5176,
		// The engine core (@cse/core) is a workspace package next to it.
		fs: { allow: [resolve(RootDirectory, "../../..")] },
	},
	preview: { host: "127.0.0.1", port: 4177 },
	build: {
		outDir: resolve(RootDirectory, "../../../Binaries/Modules/Engine/UI"),
		emptyOutDir: true,
		sourcemap: true,
		chunkSizeWarningLimit: 4096,
	},
});
