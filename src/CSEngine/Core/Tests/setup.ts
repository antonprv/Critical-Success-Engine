// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Worker-side globals the engine code expects, for tests that run in the plain node environment (jsdom tests have a real
// `self` and `location`). Logger reads `self.location.hostname` to decide whether to buffer lines for the log sidecar.
if (typeof (globalThis as { self?: unknown; }).self === "undefined") {
	(globalThis as { self?: unknown; }).self = { location: { hostname: "test.invalid" } };
}

// Normally replaced at build time by Vite's `define` (vite.config.ts); a real global here so tests can flip it (vi.stubGlobal).
(globalThis as { __DEV__?: boolean; }).__DEV__ = true;
