// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";
import { QuasarDefines } from "@cse/ui/build";

// Programs' runtime (Source): unit tests in jsdom, 100% coverage. The page (App), the Electron shell (Shell) and the
// build (Build) run for real in the packaged program: its smoke test (pnpm smoke:program) checks them.
export default defineConfig({
	plugins: [vue(), tailwindcss()],
	define: QuasarDefines,
	test: {
		include: ["Tests/**/*.test.ts"],
		environment: "jsdom",
		setupFiles: ["../UI/Tests/Setup.ts"],
		clearMocks: true,
		restoreMocks: true,
		silent: "passed-only",
		coverage: {
			provider: "v8",
			include: ["Source/**/*.ts"],
			reporter: ["text-summary", "html", "json-summary"],
			reportsDirectory: "coverage",
			thresholds: { 100: true, perFile: true },
		},
	},
});
