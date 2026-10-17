// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { defineConfig } from "vite";

// `pnpm bench`: Bench/Bench.ts bundled for Node, as the game bundles it.
export default defineConfig( {
	build: {
		ssr: "Bench/Bench.ts",
		outDir: "../../../../Binaries/Bench/SDF",
		emptyOutDir: true,
		rolldownOptions: { output: { entryFileNames: "Bench.mjs" } },
	},
	ssr: { noExternal: true },
} );
