import { defineConfig } from "@playwright/test";

// Real-browser tests against the PRODUCTION build (E2E/support/serve.mjs builds it, then serves it with `vite preview`).
//
//   pnpm exec playwright install chromium     once, to get a browser
//   pnpm test:e2e
//
// E2E_CHROMIUM_PATH points at an existing Chromium instead (what the sandbox that wrote these tests had to do).
// Variants: "site" = full site with the stand-in physics runtime; "no-physics" = the site as built without any physics
// build; "real-physics" runs the smoke tests against the real .NET publish output when E2E_REAL_PHYSICS=1 (CI).

const executablePath = process.env["E2E_CHROMIUM_PATH"];
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const useRealPhysics = process.env["E2E_REAL_PHYSICS"] === "1";

export default defineConfig({
    testDir: "E2E",
    testMatch: "**/*.spec.ts",

    // One browser at a time: the pages are WebGL-heavy and the tests share the log sink.
    fullyParallel: false,
    workers: 1,
    retries: process.env["CI"] ? 1 : 0,
    forbidOnly: Boolean(process.env["CI"]),

    timeout: 60_000,
    expect: { timeout: 15_000 },

    reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : [["list"]],
    outputDir: "test-results",

    use: {
        viewport: { width: 800, height: 500 },
        trace: "retain-on-failure",
        launchOptions: {
            ...(executablePath ? { executablePath } : {}),
            args: [
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                "--ignore-gpu-blocklist",
                ...(isRoot ? ["--no-sandbox"] : []),
            ],
        },
    },

    projects: [
        { name: "site", testMatch: /^(?!.*no-physics|.*real-physics).*\.spec\.ts$/, use: { baseURL: "http://127.0.0.1:4173" } },
        { name: "no-physics", testMatch: /no-physics\.spec\.ts$/, use: { baseURL: "http://127.0.0.1:4174" } },
        ...(useRealPhysics
            ? [{ name: "real-physics", testMatch: /real-physics\.spec\.ts$/, use: { baseURL: "http://127.0.0.1:4175" } }]
            : []),
    ],

    webServer: [
        { command: "node E2E/support/serve.mjs mock 4173", url: "http://127.0.0.1:4173/", timeout: 300_000, reuseExistingServer: false },
        { command: "node E2E/support/serve.mjs none 4174", url: "http://127.0.0.1:4174/", timeout: 300_000, reuseExistingServer: false },
        ...(useRealPhysics
            ? [{ command: "node E2E/support/serve.mjs real 4175", url: "http://127.0.0.1:4175/", timeout: 300_000, reuseExistingServer: false }]
            : []),
    ],
});
