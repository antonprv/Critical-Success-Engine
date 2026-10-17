// The perf suite (the perf harness's scenes, src/CSEngine/Core/Perf): the
// engine's lint rules apply to them (run from src/CSEngine/Core).
import base from "../CSEngine/Core/eslint.config.js";

export default [
	...base,
	// what the C# scripts build to (Binaries/Scripts, obj): not sources
	{ ignores: [ "**/Binaries/**", "**/obj/**", "**/bin/**" ] },
];
