// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { defineConfig } from "vitest/config";

// Tasks: tests of the engine's Promise-compatible tasks; 100% coverage.
export default defineConfig( {
	test: {
		include: [ "Tests/**/*.test.ts" ],
		coverage: {
			provider: "v8",
			include: [ "Source/**/*.ts" ],
			reporter: [ "text-summary", "html", "json-summary" ],
			reportsDirectory: "coverage",
			thresholds: { 100: true, perFile: true },
		},
	},
} );
