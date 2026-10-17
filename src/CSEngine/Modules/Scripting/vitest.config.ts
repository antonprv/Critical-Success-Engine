// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// C# scripting from TypeScript: protocol, runtime, loader (the real .NET too
// when a bundle is built).
export default defineConfig( {
	// @FromCSharp / @Implements are TypeScript (legacy) decorators
	oxc: { decorator: { legacy: true } },
	// the generated code of the test contracts imports the engine like a game's
	// does
	resolve: {
		alias: {
			"@cse/core/Engine": resolve(
				import.meta.dirname,
				"../../Core/Source/Engine",
			),
			"@cse/scripting": resolve( import.meta.dirname, "Source/Index.ts" ),
			"@cse/fastmath": resolve(
				import.meta.dirname,
				"../Common/FastMath/Source/Index.ts",
			),
		},
	},
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
