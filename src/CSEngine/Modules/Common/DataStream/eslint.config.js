// The engine's lint rules (the same config as Core).
import base from "../../../Core/eslint.config.js";

export default [
	...base,
	// Generated test data (MessagePack vectors): long hex lines by nature.
	{
		ignores: [
			"Tests/Vectors.json",
			"DotNet/**",
			"DotNet.Tests/**",
			"coverage/**",
		],
	},
];
