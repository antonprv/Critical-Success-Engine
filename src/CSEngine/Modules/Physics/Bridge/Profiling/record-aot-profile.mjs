// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.
//
// usage: node record-aot-profile.mjs <unpacked profiling AppBundle> <output aot.profile>
// Runs scenario.mjs on the profiling build (-p:CseAotProfile=true) and writes the methods it executed.

import fs from "node:fs";
import { loadBridge, runFeatureScenario, runBenchmark } from "./scenario.mjs";

const [bundle, output] = process.argv.slice(2);
const P = await loadBridge(bundle, {
	aotProfilerOptions: {
		writeAt: "Physics.Wasm.PhysicsBridge::StopAotProfile",
		sendTo: "Physics.Wasm.PhysicsBridge::ReceiveAotProfile",
	},
});

const { checks } = runFeatureScenario(P);
const failed = checks.filter(c => !c.ok);
for (const c of failed) console.error(`FAIL ${c.name} ${c.info}`);
// A big pile fills every SIMD lane and splits constraints over many solver batches - paths the small scene misses.
runBenchmark(P, 2000, 60);

P.StopAotProfile();
const profile = Uint8Array.from(P.GetAotProfile());
if (profile.length === 0) {
	console.error("The runtime produced no AOT profile - is this the -p:CseAotProfile=true build?");
	process.exit(1);
}
fs.writeFileSync(output, profile);
console.log(`AOT profile: ${output} (${profile.length} bytes), scenario checks failed: ${failed.length}`);
process.exit(failed.length ? 1 : 0);
