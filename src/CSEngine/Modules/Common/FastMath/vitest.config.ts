// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { defineConfig } from "vitest/config";

// FastMath's accuracy and edge-case tests; every file at 100% coverage.
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
