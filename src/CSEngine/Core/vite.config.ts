import { resolve } from "node:path";
import { defineConfig, searchForWorkspaceRoot } from "vite";

import { LogServerPlugin } from "./BuildTools/LogServerPlugin.ts";
import { PhysicsWasmStaticPlugin } from "./BuildTools/PhysicsWasmStaticPlugin.ts";
import { TemporaryIndexHtmlPlugin } from "./BuildTools/TemporaryIndexHtmlPlugin.ts";

const RootDirectory = process.cwd();

// The .NET publish output for the physics engine lives outside this project
// entirely - see Physics/Bridge/BUILD.md - addressed relative to this file
// rather than hardcoded to one machine's checkout path.
const PhysicsWasmFrameworkDirectory = resolve(
    RootDirectory,
    "../Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework"
);

export default defineConfig({
    define: {
        __DEV__: "true",
    },

    plugins: [
        TemporaryIndexHtmlPlugin(),
        PhysicsWasmStaticPlugin(PhysicsWasmFrameworkDirectory),
        LogServerPlugin(),
    ],

    build: {
        // Matches Core.esproj's <BuildOutputFolder> and webpack.config.js's
        // production output - one build destination regardless of which
        // bundler produced it.
        outDir: resolve(RootDirectory, "../Binaries/Core"),
        emptyOutDir: true,
    },

    server: {
        host: "127.0.0.1",
        port: 5173,
        strictPort: true,

        fs: {
            allow: [
                searchForWorkspaceRoot(process.cwd()),
                PhysicsWasmFrameworkDirectory
            ],
        },

        watch: {
            ignored: [
                "**/.vs/**",
                "**/.git/**",
                "**/node_modules/**",
            ],
        },
    },
});
