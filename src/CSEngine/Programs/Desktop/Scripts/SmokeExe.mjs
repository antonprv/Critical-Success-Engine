// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// `pnpm smoke:exe` (Windows, S6-07): packages a Desktop build into an .exe (Tests/PackageSmoke.test.ts), then runs it
// as a player would - Windows' own PATH (no Node, no browser, no pnpm), an empty app profile - with --cse-smoke: the
// shell quits with 0 once its page has loaded and run for a few seconds, 1 if it didn't load. Prints the exe's size.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "cse-smoke-"));
const Fail = (message) => {
	console.error(`smoke: FAILED - ${message}`);
	process.exitCode = 1;
};

try {
	const packaged = spawnSync("pnpm", ["exec", "vitest", "run", "Tests/PackageSmoke.test.ts"], {
		stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, CSE_PACKAGE_SMOKE_OUT: sandbox },
	});
	const record = join(sandbox, "exe.txt");
	if (packaged.status !== 0 || !existsSync(record)) throw new Error("packaging failed (see above)");
	const exe = readFileSync(record, "utf8");

	// Windows' own variables stay (Chromium needs them; it also hangs on a USERPROFILE that isn't there).
	const profile = join(sandbox, "Profile");
	const temp = join(profile, "Temp");
	mkdirSync(temp, { recursive: true });
	const env = {};
	for (const [name, value] of Object.entries(process.env)) {
		if (/^(NODE|NPM|PNPM|ELECTRON|VITEST|VITE|PATH$)/i.test(name)) continue;
		env[name] = value;
	}
	const windows = process.env.SystemRoot ?? "C:\\Windows";
	Object.assign(env, { PATH: `${windows}\\System32;${windows}`, APPDATA: profile, LOCALAPPDATA: profile, TEMP: temp, TMP: temp });

	const started = Date.now();
	// Electron finds its data folder through Windows, not %APPDATA%: told where it is instead.
	const run = spawnSync(exe, ["--cse-smoke", "5", "--cse-profile", join(profile, "Smoke")], { env, stdio: "ignore", timeout: 120_000 });
	const log = readdirSync(profile, { recursive: true, withFileTypes: true }).find((entry) => entry.isFile() && entry.name === "main.log");
	const text = log ? readFileSync(join(log.parentPath, log.name), "utf8") : "";
	console.log(`smoke: ${exe}`);
	console.log(`smoke: ${(statSync(exe).size / 1024 / 1024).toFixed(1)} MB, exit ${run.status ?? run.error?.message}, ${((Date.now() - started) / 1000).toFixed(1)} s`);
	console.log(text.trim().replace(/^/gm, "  log: "));
	if (run.status !== 0) Fail(`the program exited with ${run.status ?? run.error?.message}`);
	else if (!text.includes("smoke: ok")) Fail("the page did not report having loaded");
	else console.log("smoke: OK");
} catch (error) {
	Fail(error.message);
} finally {
	// The portable exe's unpacked copy may still be closing.
	rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}
