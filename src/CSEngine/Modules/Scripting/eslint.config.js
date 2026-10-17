// The engine's lint rules (the same config as Core).
import base from "../../Core/eslint.config.js";

export default [
	...base,
	{
		ignores: [
			"CSharp/**",
			"CSharp.Tests/**",
			"Sdk/**",
			"Tests/TestGame/**",
			"coverage/**",
		],
	},
];
