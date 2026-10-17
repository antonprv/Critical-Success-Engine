// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { defineConfig } from "vite";

// The demo page (`pnpm dev`, then http://127.0.0.1:5177/): Babylon meshes and
// the SDF world in one scene, ray-marched or as the mesh tier.
export default defineConfig( {
	server: { host: "127.0.0.1", port: 5177, strictPort: true },
	build: { outDir: "../../../../Binaries/Modules/Engine/SDF" },
} );
