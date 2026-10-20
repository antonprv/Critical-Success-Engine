// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PackageApp } from "../Source/Main/Packager";
import { WriteElectronShell } from "../Source/Main/ProjectRunner";

// The packaging half of the smoke test (S6-07): a built site with the engine's Electron shell, packaged with
// electron-builder into CSE_PACKAGE_SMOKE_OUT. Scripts/SmokeExe.mjs (`pnpm smoke:exe`, Windows) runs it, then starts the
// executable on a bare machine itself: Electron started from inside a Vitest worker hangs, from plain Node it doesn't.
const Output = process.env["CSE_PACKAGE_SMOKE_OUT"];

describe.runIf(Output !== undefined && process.platform === "win32")("a Desktop build to package", () => {
	it("becomes one .exe", { timeout: 600_000 }, async () => {
		const site = join(Output!, "Site");
		WriteElectronShell(site, "Smoke");
		writeFileSync(join(site, "index.html"), "<!doctype html><title>Smoke</title><p>The game would be here.</p>");
		const exe = await PackageApp({ App: site, Output: join(Output!, "Binaries", "Windows", "Prod"), Name: "Smoke", Id: "com.criticalsuccess.smoke" });
		expect(existsSync(exe)).toBe(true);
		writeFileSync(join(Output!, "exe.txt"), exe);
	});
});
