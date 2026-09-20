// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.
//
// This file only exists because the wasm-tools SDK requires WasmMainJSPath to
// point at *something* to produce a valid AppBundle. physics.worker.ts does
// NOT load this file - it imports `_framework/dotnet.js` from the published
// output directly and drives PhysicsBridge itself (see physics.worker.ts and
// BUILD.md for why: we want the exports object, not this script's own
// booting/console-log behavior).
//
// Kept around for one thing only: opening `index.html` in the AppBundle
// directly in a browser tab, as a quick manual sanity check that the build
// boots and PhysicsBridge.CreateWorld/Step round-trip before wiring it into
// the real worker.

import { dotnet } from "./_framework/dotnet.js";

const { getAssemblyExports, getConfig } = await dotnet.create();
const config = getConfig();
const exports = await getAssemblyExports(config.mainAssemblyName);

globalThis.PhysicsBridge = exports.Framework.Physics.Wasm.PhysicsBridge;

console.log(
	"[PhysicsBridge] loaded standalone - try: " +
	"PhysicsBridge.CreateWorld(0,-20,0,8,1,false); PhysicsBridge.Step(0.016)"
);
