// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, test } from "@playwright/test";
import { gunzipSync } from "node:zlib";

// The built site as a plain static host serves it: the entry page, hashed assets, source maps, and the physics runtime copied
// from the .NET publish folder (here: the stand-in runtime from E2E/fixtures/mock-physics).

test.describe("production build", () => {
	test("index.html is the Vite entry: module script, stylesheet and the first-paint splash", async ({ request }) => {
		const html = await (await request.get("/")).text();

		expect(html).toMatch(/<script type="module" crossorigin src="\/assets\/index-[\w-]+\.js"><\/script>/);
		expect(html).toMatch(/<link rel="stylesheet" crossorigin href="\/assets\/index-[\w-]+\.css">/);
		expect(html).toContain('id="boot-splash"');
		expect(html).not.toMatch(/js\/bundle|webpack/i);
	});

	test("the entry script and its source map are served", async ({ request }) => {
		const html = await (await request.get("/")).text();
		const script = html.match(/src="(\/assets\/index-[\w-]+\.js)"/)![1]!;

		const js = await request.get(script);
		expect(js.status()).toBe(200);
		expect(js.headers()["content-type"]).toContain("javascript");
		expect(await js.text()).not.toContain("__DEV__"); // replaced at build time

		expect((await request.get(`${script}.map`)).status()).toBe(200);
	});

	test("the five workers are separate bundles", async ({ request }) => {
		const html = await (await request.get("/")).text();
		const entry = html.match(/src="(\/assets\/index-[\w-]+\.js)"/)![1]!;
		const orchestrator = await (await request.get(entry)).text();

		const chunk = orchestrator.match(/Orchestrator-[\w-]+\.js/)?.[0];
		expect(chunk).toBeDefined();
		const workers = await (await request.get(`/assets/${chunk}`)).text();
		for (const name of ["RenderWorker", "PhysicsWorker", "GameLogicWorker", "AudioWorker", "UiWorker"]) {
			expect(workers, name).toMatch(new RegExp(`${name}-[\\w-]+\\.js`));
		}
	});

	test("the physics runtime is served from /physics-wasm/_framework/", async ({ request }) => {
		const dotnet = await request.get("/physics-wasm/_framework/dotnet.js");
		expect(dotnet.status()).toBe(200);
		expect(dotnet.headers()["content-type"]).toContain("javascript");

		// Static hosts differ: some (Vite's preview server) label a .gz file `Content-Encoding: gzip`, so the client already
		// gets the decompressed bytes; others send the raw gzip. PhysicsWasmLoader accepts both - so does this check.
		const wasm = await request.get("/physics-wasm/_framework/dotnet.native.wasm.gz");
		expect(wasm.status()).toBe(200);
		let bytes = await wasm.body();
		if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
		expect([...bytes.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]); // "\0asm" - a real WebAssembly module
	});

	test("a missing physics file is not mistaken for the runtime", async ({ request }) => {
		const response = await request.get("/physics-wasm/_framework/does-not-exist.dll");
		expect(response.headers()["content-type"] ?? "").not.toContain("javascript");
	});
});
