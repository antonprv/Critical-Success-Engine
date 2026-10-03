// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Used by playwright.config.ts as the web server of one test variant: builds the site exactly like `pnpm build` (production
// mode, same vite.config.ts) into .e2e/<variant>/dist and serves it with `vite preview`.
//
//   node E2E/support/serve.mjs mock 4173   physics = the stand-in runtime from E2E/fixtures/mock-physics
//   node E2E/support/serve.mjs none 4174   no physics build at all (what a checkout without a .NET build looks like)
//   node E2E/support/serve.mjs real 4175   physics = the real publish output at its default location (CI, after the wasm step)
//
// The `mock` variant also runs the log sink on :4790 - the address Logger.ts posts to from localhost pages - so the browser
// never sees a refused connection, and the tests can read back everything the game logged (GET /lines).

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build, preview } from "vite";

const [variant, portArgument] = process.argv.slice(2);
const port = Number(portArgument);
if (!["mock", "none", "real"].includes(variant) || !Number.isInteger(port)) {
	console.error("usage: node E2E/support/serve.mjs <mock|none|real> <port>");
	process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const work = resolve(root, ".e2e", variant);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

if (variant === "mock") {
	const framework = join(work, "physics", "_framework");
	cpSync(join(root, "E2E/fixtures/mock-physics"), framework, { recursive: true });
	// Like the real publish output, the runtime's .wasm is shipped gzip-only (GzipCompressWasmAssets.targets).
	// 8 bytes = the smallest valid WebAssembly module: magic number + version.
	writeFileSync(join(framework, "dotnet.native.wasm.gz"), gzipSync(Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])));
	process.env.PHYSICS_WASM_DIR = framework;
} else if (variant === "none") {
	process.env.PHYSICS_WASM_DIR = join(work, "physics", "does-not-exist");
} else {
	delete process.env.PHYSICS_WASM_DIR; // the default location - what `pnpm build` uses
	if (!existsSync(resolve(root, "../Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework/dotnet.js"))) {
		console.error("variant 'real' needs the published physics runtime (devops/build-physics.sh) - not found");
		process.exit(2);
	}
}

const outDir = join(work, "dist");
await build({ root, configFile: join(root, "vite.config.ts"), build: { outDir, emptyOutDir: true }, logLevel: "warn" });

if (variant === "mock") {
	const lines = [];
	createServer((request, response) => {
		response.setHeader("Access-Control-Allow-Origin", "*");
		response.setHeader("Access-Control-Allow-Headers", "*");
		response.setHeader("Access-Control-Allow-Methods", "*");
		if (request.method === "OPTIONS") return void response.writeHead(204).end();
		if (request.method === "GET" && request.url === "/lines") {
			response.setHeader("Content-Type", "application/json");
			return void response.end(JSON.stringify(lines));
		}
		if (request.method === "DELETE") {
			lines.length = 0;
			return void response.writeHead(204).end();
		}
		const chunks = [];
		request.on("data", (chunk) => chunks.push(chunk));
		request.on("end", () => {
			lines.push(...Buffer.concat(chunks).toString("utf8").split("\n").filter(Boolean));
			response.writeHead(204).end();
		});
	}).listen(4790, "127.0.0.1");
}

await preview({ root, configFile: join(root, "vite.config.ts"), build: { outDir }, preview: { port, host: "127.0.0.1", strictPort: true } });
console.log(`[e2e] ${variant} variant ready on http://127.0.0.1:${port}/`);
