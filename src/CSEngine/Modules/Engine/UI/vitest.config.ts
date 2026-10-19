// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { QuasarDefines } from "./Build/QuasarBuild.mjs";
import { defineConfig } from "vitest/config";

// The UI module's unit and component tests (jsdom); coverage counts its own sources.
export default defineConfig({
	plugins: [vue(), tailwindcss()],
	define: QuasarDefines,
	test: {
		include: ["Tests/**/*.test.ts"],
		environment: "jsdom",
		setupFiles: ["Tests/Setup.ts"],
		clearMocks: true,
		restoreMocks: true,
		unstubGlobals: true,
		silent: "passed-only",
		coverage: {
			provider: "v8",
			include: ["Source/**/*.{ts,vue}"],
			exclude: ["**/*.d.ts"],
			reporter: ["text-summary", "html", "json-summary"],
			reportsDirectory: "coverage",
			thresholds: { 100: true, perFile: true },
		},
	},
});
