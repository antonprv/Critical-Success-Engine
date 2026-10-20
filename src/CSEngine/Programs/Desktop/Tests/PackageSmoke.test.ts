// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PackageApp } from "../Source/Main/Packager";
import { ProjectRunner, WriteElectronShell } from "../Source/Main/ProjectRunner";

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

	it("a program made from the Program template becomes one .exe too (built with the tools' runner)", { timeout: 900_000 }, async () => {
		// The template as the Project Manager copies it: its name where it says TemplateProject.
		const project = join(Output!, "Hello");
		cpSync(resolve(__dirname, "../../../../Templates/Program"), project, { recursive: true });
		renameSync(join(project, "TemplateProject.cseproject"), join(project, "Hello.cseproject"));
		const file = join(project, "Hello.cseproject");
		writeFileSync(file, readFileSync(file, "utf8").replaceAll("TemplateProject", "Hello"));
		const runner = new ProjectRunner({ CoreDirectory: resolve(__dirname, "../../../Core"), Open: () => undefined });
		const built = await runner.Build(file, "Desktop", "Prod");
		expect(built.Executable && existsSync(built.Executable)).toBe(true);
		// No engine in a program: nothing of Babylon or of the engine's workers is in its page.
		const assets = join(built.Directory, "assets");
		const engine = readdirSync(assets).filter((name) => /babylon|GameLogicWorker|PhysicsWorld/i.test(readFileSync(join(assets, name), "latin1")));
		expect(engine).toEqual([]);
		writeFileSync(join(Output!, "program-exe.txt"), built.Executable!);
	});
});
