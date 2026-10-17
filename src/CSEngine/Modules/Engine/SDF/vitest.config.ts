// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { defineConfig } from "vitest/config";

// The SDF module's tests (Node; Babylon runs on its NullEngine); every file at
// 100% coverage. The demo page is checked in a real browser, not here.
export default defineConfig( {
	test: {
		include: [ "Tests/**/*.test.ts" ],
		clearMocks: true,
		restoreMocks: true,
		coverage: {
			provider: "v8",
			include: [ "Source/**/*.ts" ],
			reporter: [ "text-summary", "html", "json-summary" ],
			reportsDirectory: "coverage",
			thresholds: { 100: true, perFile: true },
		},
	},
} );
