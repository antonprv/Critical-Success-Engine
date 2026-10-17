// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { defineConfig } from "vitest/config";

// The DI container's tests; every file at 100% coverage. @Inject is a
// TypeScript (legacy) decorator: oxc compiles it as such.
export default defineConfig( {
	oxc: { decorator: { legacy: true } },
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
