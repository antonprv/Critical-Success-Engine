// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { defineConfig } from "@playwright/test";

/**
 * The desktop app, run for real: Electron starts Binaries/Programs/Desktop/main.cjs (build it, and the project browser
 * and UI designer pages, first). On Linux without a screen, run under a virtual one (xvfb-run).
 */
export default defineConfig({
	testDir: "E2E",
	timeout: 90_000,
	workers: 1,
	reporter: [["list"]],
	use: { trace: "retain-on-failure" },
});
