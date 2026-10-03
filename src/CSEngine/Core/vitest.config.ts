import { quasar, transformAssetUrls } from "@quasar/vite-plugin";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

// Unit and integration tests (Node; the UI and main-thread tests switch to jsdom per file). `pnpm test` runs them with
// coverage, and fails if any file drops below 100% on any metric. The browser-only behaviour (WebGL rendering, real
// pointer lock, the built and served site) is covered on top of this by the Playwright suite in E2E/ (`pnpm test:e2e`).
export default defineConfig({
    plugins: [vue({ template: { transformAssetUrls } }), quasar()],

    test: {
        include: ["Tests/**/*.test.ts"],
        setupFiles: ["Tests/setup.ts"],
        clearMocks: true,
        restoreMocks: true,
        unstubGlobals: true,
        unstubEnvs: true,
        // Engine debug logs only for failing tests (the passing ones log a lot of "Mode -> ..." on purpose).
        silent: "passed-only",

        coverage: {
            provider: "v8",
            include: ["Source/**/*.{ts,vue}", "BuildTools/**/*.{ts,mjs}", "vite.config.ts"],
            exclude: ["**/*.d.ts"],
            reporter: ["text-summary", "html", "lcov", "json-summary"],
            reportsDirectory: "coverage",
            thresholds: { 100: true, perFile: true },
        },
    },
});
