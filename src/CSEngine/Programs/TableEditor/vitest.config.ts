// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";
import { QuasarDefines } from "@cse/ui/build";

// The table editor's model and form: jsdom, 100% coverage (its page is @cse/program's, checked by its smoke test).
export default defineConfig({
	plugins: [vue(), tailwindcss()],
	define: QuasarDefines,
	test: {
		include: ["Tests/**/*.test.ts"],
		environment: "jsdom",
		setupFiles: ["../../Modules/Engine/UI/Tests/Setup.ts"],
		clearMocks: true,
		restoreMocks: true,
		silent: "passed-only",
		coverage: {
			provider: "v8",
			include: ["Source/**/*.ts"],
			exclude: ["Source/Generated/**", "Source/Program.ts"],
			reporter: ["text-summary", "html", "json-summary"],
			reportsDirectory: "coverage",
			thresholds: { 100: true, perFile: true },
		},
	},
});
