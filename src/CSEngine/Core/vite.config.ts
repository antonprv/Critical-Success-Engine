import { resolve } from "node:path";
import { quasar, transformAssetUrls } from "@quasar/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

import { LogServerPlugin } from "./BuildTools/LogServerPlugin.ts";
import { PhysicsWasmPlugin, ResolvePhysicsWasmDirectory } from "./BuildTools/PhysicsWasmPlugin.ts";

const RootDirectory = process.cwd();

// The .NET publish output for the physics engine lives outside this project - see Physics/Bridge/BUILD.md. Dev serves it
// from there, the production build copies it into the site (PHYSICS_WASM_DIR overrides the location).
const PhysicsWasmFrameworkDirectory = ResolvePhysicsWasmDirectory(RootDirectory);

export default defineConfig(({ mode }) => {
    const isProduction = mode === "production";

    return {
        // `if (__DEV__) { ... }` blocks (and what they import) are removed from production bundles.
        define: {
            __DEV__: JSON.stringify(!isProduction),
        },

        plugins: [
            vue({ template: { transformAssetUrls } }),
            // Auto-imports only the Quasar components the templates actually use (q-btn, q-card, ...).
            quasar(),
            // The UI toolkit's Tailwind kit (Source/Toolkit/Styles/tailwind-kit.css).
            tailwindcss(),
            PhysicsWasmPlugin(PhysicsWasmFrameworkDirectory),
            LogServerPlugin(),
        ],

        // Models/textures/environments imported from TS get hashed into the output, like any other asset.
        assetsInclude: ["**/*.glb", "**/*.gltf", "**/*.babylon", "**/*.env", "**/*.dds"],

        // Workers are ES modules (`new Worker(url, { type: "module" })`) and use dynamic import() (dotnet.js, Babylon
        // shaders), which Vite's default "iife" worker format cannot bundle.
        worker: {
            format: "es",
        },

        build: {
            // Matches Core.esproj's <BuildOutputFolder> and what CI uploads.
            outDir: resolve(RootDirectory, "../Binaries/Core"),
            emptyOutDir: true,
            target: "es2022",
            sourcemap: isProduction,
            reportCompressedSize: false,
            rolldownOptions: {
                // Three pages: the game, the UI toolkit gallery and the UI designer. The key names the entry chunk (index-<hash>.js).
                input: {
                    index: resolve(RootDirectory, "index.html"),
                    toolkit: resolve(RootDirectory, "toolkit.html"),
                    designer: resolve(RootDirectory, "designer.html"),
                },
                // The "plugin took 99% of the build" hint is noise for a build dominated by one big dependency.
                checks: { pluginTimings: false },
            },
        },

        server: {
            host: "127.0.0.1",
            port: 5173,
            strictPort: true,
            watch: {
                ignored: ["**/.vs/**", "**/.git/**", "**/node_modules/**", "**/.e2e/**", "**/coverage/**"],
            },
        },

        preview: {
            host: "127.0.0.1",
            port: 4173,
            strictPort: true,
        },
    };
});
