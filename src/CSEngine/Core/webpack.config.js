import path from "node:path";
import { fileURLToPath } from "node:url";

import CopyWebpackPlugin from "copy-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import webpack from "webpack";

const Filename = fileURLToPath(import.meta.url);
const Dirname = path.dirname(Filename);
const AppDirectory = Dirname;

// Matches Core.esproj's <BuildOutputFolder> and vite.config.ts's build.outDir -
// one build destination regardless of which bundler produced it.
const OutputDirectory = path.resolve(AppDirectory, "../Binaries/Core");

// The .NET publish output for the physics engine lives outside this project
// entirely - see Physics/Bridge/BUILD.md - addressed relative to this file
// rather than hardcoded to one machine's checkout path.
const PhysicsWasmFrameworkDirectory = path.resolve(
    AppDirectory,
    "../Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework"
);

export default (env, argv) => {
    const IsProduction = argv.mode === "production";

    return {
        // Main TypeScript entry point.
        entry: path.resolve(AppDirectory, "Source/App.ts"),

        // Production/development build output.
        output: {
            path: OutputDirectory,

            // Content hash busts the browser cache whenever the bundle changes.
            filename: IsProduction
                ? "js/bundle.[contenthash].js"
                : "js/bundle.js",

            clean: true,
        },

        // Persistent filesystem cache for incremental builds.
        cache: {
            type: "filesystem",
        },

        resolve: {
            extensions: [".tsx", ".ts", ".js"],
        },

        module: {
            rules: [
                {
                    test: /\.(t|j)sx?$/,
                    exclude: /node_modules/,
                    use: {
                        loader: "ts-loader",
                    },
                },

                {
                    // Textures, models, audio imported directly from TS code
                    // get copied to <output>/assets and the import resolves to
                    // their final URL.
                    test: /\.(png|jpe?g|gif|glb|gltf|babylon|env|dds|mp3|wav|ogg)$/i,
                    type: "asset/resource",
                    generator: {
                        filename: "assets/[hash][ext]",
                    },
                },
            ],
        },

        plugins: [
            // __DEV__ lets code do:
            // if (__DEV__) { import("@babylonjs/inspector") }
            new webpack.DefinePlugin({
                __DEV__: JSON.stringify(!IsProduction),
            }),

            new HtmlWebpackPlugin({
                inject: true,
                template: path.resolve(
                    AppDirectory,
                    "Assets/index.html"
                ),

                // Only inject the entry chunks. Dynamic imports are loaded
                // by webpack runtime when they are actually requested.
                chunks: ["runtime", "main"],
            }),

            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: path.resolve(AppDirectory, "Assets/assets"),
                        to: path.resolve(OutputDirectory, "assets"),
                        noErrorOnMissing: true,
                    },
                    {
                        from: path.resolve(AppDirectory, "Assets/index.css"),
                        to: path.resolve(OutputDirectory, "index.css"),
                    },
                    {
                        from: PhysicsWasmFrameworkDirectory,
                        to: path.resolve(OutputDirectory, "physics-wasm/_framework"),
                        noErrorOnMissing: true,
                    },
                ],
            }),
        ],

        optimization: IsProduction
            ? {
                splitChunks: {
                    chunks: "all",

                    cacheGroups: {
                        vendor: {
                            test: /[\\/]node_modules[\\/]/,
                            name: "vendor",
                            chunks: "all",
                        },
                    },
                },

                runtimeChunk: "single",
            }
            : undefined,

        performance: {
            hints: false,
        },

        devServer: {
            host: "0.0.0.0",
            port: 8080,

            static: [
                {
                    directory: path.resolve(AppDirectory, "Assets"),
                },
                {
                    directory: PhysicsWasmFrameworkDirectory,
                    publicPath: "/physics-wasm/_framework",
                },
            ],

            hot: true,

            devMiddleware: {
                publicPath: "/",
            },

            client: {
                overlay: {
                    errors: true,
                    warnings: false,
                },
            },
        },

        // Full source maps in dev, lighter maps in production.
        devtool: IsProduction ? "source-map" : "eval-source-map",

        mode: IsProduction ? "production" : "development",
    };
};
