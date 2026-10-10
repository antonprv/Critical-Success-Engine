// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { defineConfig } from "vitest/config";

// The desktop app's tests run in Node, with Electron's modules replaced by fakes (the real app is driven by the E2E).
export default defineConfig({
	test: {
		include: ["Tests/**/*.test.ts"],
		environment: "node",
		clearMocks: true,
		restoreMocks: true,
		unstubEnvs: true,
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
