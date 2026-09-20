import path from "node:path";
import { fileURLToPath } from "node:url";

import webpack from "webpack";
import HtmlWebpackPlugin from "html-webpack-plugin";
import CopyWebpackPlugin from "copy-webpack-plugin";

const Filename = fileURLToPath(import.meta.url);
const Dirname = path.dirname(Filename);
const AppDirectory = Dirname;

export default (env, argv) => {
    const IsProduction = argv.mode === "production";

    return {
        // Main TypeScript entry point.
        entry: path.resolve(AppDirectory, "source/app.ts"),

        // Production/development build output.
        output: {
            path: path.resolve(AppDirectory, "dist"),

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
                    // get copied to dist/assets and the import resolves to their
                    // final URL.
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
                    "public/index.html"
                ),

                // Only inject the entry chunks. Dynamic imports are loaded
                // by webpack runtime when they are actually requested.
                chunks: ["runtime", "main"],
            }),

            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: path.resolve( AppDirectory, "public/assets" ),
                        to: path.resolve( AppDirectory, "dist/assets" ),
                        noErrorOnMissing: true,
                    },
                    {
                        from: path.resolve( AppDirectory, "public/index.css" ),
                        to: path.resolve( AppDirectory, "dist/index.css" ),
                    },
                ],
            }),
        ],

        // Split vendor code from application code so large libraries can
        // be cached separately by the browser.
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

        // The generic webpack size warning is not useful for a 3D engine
        // bundle where large Babylon.js chunks are expected.
        performance: {
            hints: false,
        },

        devServer: {
            host: "0.0.0.0",
            port: 8080,

            static: {
                directory: path.resolve(AppDirectory, "public"),
            },

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
