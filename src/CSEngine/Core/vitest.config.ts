import { quasar, transformAssetUrls } from "@quasar/vite-plugin";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { ProjectPlugin } from "./BuildTools/ProjectPlugin.ts";
import { ProjectOptions, ResolveAliases } from "./vite.config.ts";

// Unit and integration tests (Node; the UI and main-thread tests switch to
// jsdom per file). `pnpm test` runs them with coverage, and fails if any file
// drops below 100% on any metric. The browser-only behaviour (WebGL rendering,
// real pointer lock, the built and served site) is covered on top of this by
// the Playwright suite in E2E/ (`pnpm test:e2e`).
export default defineConfig( {
	plugins: [
		vue( { template: { transformAssetUrls } } ),
		quasar(),
		ProjectPlugin( ProjectOptions ),
	],

	resolve: { alias: ResolveAliases },

	// @Inject( IContract ) fields: TypeScript's own (legacy) decorators.
	oxc: { decorator: { legacy: true } },

	test: {
		include: ["Tests/**/*.test.ts"],
		setupFiles: ["Tests/setup.ts"],
		clearMocks: true,
		restoreMocks: true,
		unstubGlobals: true,
		unstubEnvs: true,
		// Engine debug logs only for failing tests (the passing ones log a lot
		// of "Mode -> ..." on purpose).
		silent: "passed-only",

		coverage: {
			provider: "v8",
			// The templates' games are the engine's sample content: their code
			// is covered by these tests too.
			include: [
				"Source/**/*.{ts,vue}",
				"BuildTools/**/*.{ts,mjs}",
				"vite.config.ts",
				`${
					resolve( process.cwd(), "../../Templates" )
				}/*/Source/**/*.ts`,
			],
			allowExternal: true,
			// generated from .contract files (the contract compiler is tested)
			exclude: ["**/*.d.ts", "**/*.contract.ts"],
			reporter: ["text-summary", "html", "lcov", "json-summary"],
			reportsDirectory: "coverage",
			thresholds: { 100: true, perFile: true },
		},
	},
} );
