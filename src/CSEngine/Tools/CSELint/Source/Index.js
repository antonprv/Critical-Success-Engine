// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import EmptyBlock from "./EmptyBlock.js";
import MaxLen from "./MaxLen.js";

/** ESLint plugin of the engine ("@cse"): rules that fix what they find. */
export default {
	meta: {
		name: "@cse/eslint-plugin",
		version: "1.0.0",
	},
	rules: {
		"empty-block-newline": EmptyBlock,
		"max-len": MaxLen,
	},
};
