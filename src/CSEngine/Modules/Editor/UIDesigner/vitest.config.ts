// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";
import { EngineTypesPlugin } from "../../../Core/BuildTools/EngineTypes.ts";

// The designer's unit and component tests (jsdom). Coverage counts this module's own sources: the toolkit it builds on is
// covered by the engine's tests.
export default defineConfig({
	// The engine's types module answers empty here: the tests stand in for Monaco, which alone reads it.
	plugins: [vue(), tailwindcss(), EngineTypesPlugin(() => ({}))],
	test: {
		include: ["Tests/**/*.test.ts"],
		environment: "jsdom",
		clearMocks: true,
		restoreMocks: true,
		unstubGlobals: true,
		silent: "passed-only",
		coverage: {
			provider: "v8",
			include: ["Source/**/*.{ts,vue}"],
			// Monaco's setup runs only in a real browser (its workers): the end-to-end tests run it.
			exclude: ["**/*.d.ts", "Source/Code/MonacoSetup.ts"],
			reporter: ["text-summary", "html", "json-summary"],
			reportsDirectory: "coverage",
			thresholds: { 100: true, perFile: true },
		},
	},
});
