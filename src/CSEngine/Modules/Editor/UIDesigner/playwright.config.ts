// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { defineConfig, devices } from "@playwright/test";

// The designer, built and served as it ships (`pnpm build` first). E2E_CHROMIUM_PATH points at an existing Chromium
// instead of Playwright's own (as in Core's E2E).
const executablePath = process.env["E2E_CHROMIUM_PATH"];
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

export default defineConfig({
	testDir: "E2E",
	timeout: 60_000,
	expect: { timeout: 15_000 },
	workers: 1,
	reporter: [["list"]],
	use: {
		baseURL: "http://127.0.0.1:4176",
		trace: "retain-on-failure",
		launchOptions: {
			...(executablePath ? { executablePath } : {}),
			args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", ...(isRoot ? ["--no-sandbox"] : [])],
		},
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: { command: "pnpm preview", url: "http://127.0.0.1:4176", reuseExistingServer: false, timeout: 60_000 },
});
