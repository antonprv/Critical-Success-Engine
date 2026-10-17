// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.
//
// usage: node check-physics.mjs <unpacked AppBundle> [benchmarkBodyCount]
// Smoke test of a built PhysicsBridge (interpreted or AOT) plus an optional Step() benchmark.

import { loadBridge, runFeatureScenario, runBenchmark } from "./scenario.mjs";

const [bundle, benchBodies] = process.argv.slice(2);
const P = await loadBridge(bundle);

const { checks } = runFeatureScenario(P);
for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name} ${c.info}`);
const failed = checks.filter(c => !c.ok).length;
console.log(failed ? `${failed} of ${checks.length} checks FAILED` : `all ${checks.length} checks passed`);

if (benchBodies) {
	for (const count of benchBodies.split(",").map(Number))
		console.log(`benchmark: ${count} bodies, ${runBenchmark(P, count).toFixed(3)} ms/step`);
}
process.exit(failed ? 1 : 0);
