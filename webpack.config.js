const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

const appDirectory = __dirname;

module.exports = (env, argv) => {
    const isProduction = argv.mode === "production";

    return {
        // Main TypeScript entry point.
        entry: path.resolve(appDirectory, "src/app.ts"),

        // Production/development build output.
        output: {
            path: path.resolve(appDirectory, "dist"),
            // Content hash busts the browser cache whenever the bundle changes.
            filename: isProduction ? "js/bundle.[contenthash].js" : "js/bundle.js",
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
                    // (e.g. `import tex from "./assets/rock.png"`) get copied
                    // to dist/assets and the import resolves to their final URL.
                    test: /\.(png|jpe?g|gif|glb|gltf|babylon|env|dds|mp3|wav|ogg)$/i,
                    type: "asset/resource",
                    generator: {
                        filename: "assets/[hash][ext]",
                    },
                },
            ],
        },

        plugins: [
            // __DEV__ lets code do `if (__DEV__) { import("@babylonjs/inspector") }`.
            // In production this becomes `if (false)`, and Terser drops the
            // whole branch — including the import() call — so Inspector
            // never ends up in the shipped bundle.
            new webpack.DefinePlugin({
                __DEV__: JSON.stringify(!isProduction),
            }),
            new HtmlWebpackPlugin({
                inject: true,
                template: path.resolve(appDirectory, "public/index.html"),
                // Without this, HtmlWebpackPlugin injects a <script> tag for
                // EVERY chunk it sees — including "vendor", which only exists
                // because of the dynamic import() in app.ts. That would force
                // the browser to fetch Babylon synchronously on page load,
                // defeating the whole lazy-loading setup. "runtime" + "main"
                // is the app.ts entry only; vendor is fetched by webpack's
                // own runtime the moment import() actually executes.
                chunks: ["runtime", "main"],
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        // Anything in public/assets is served as-is (no hashing,
                        // no bundling) — good for large static files like level
                        // data or third-party assets you don't import in code.
                        from: path.resolve(appDirectory, "public/assets"),
                        to: path.resolve(appDirectory, "dist/assets"),
                        noErrorOnMissing: true,
                    },
                ],
            }),
        ],

        // Split vendor code (Babylon.js etc.) from app code so the large,
        // rarely-changing library chunk can be cached separately by the browser.
        optimization: isProduction
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

        // The 244 KiB default is a generic web-app guideline and doesn't fit
        // a 3D engine chunk that's fetched lazily after the game is already
        // interactive. Real regressions are still visible via `pnpm analyze`.
        performance: {
            hints: false,
        },

        devServer: {
            host: "0.0.0.0",
            port: 8080,

            static: {
                directory: path.resolve(appDirectory, "public"),
            },

            hot: true,

            devMiddleware: {
                publicPath: "/",
            },

            client: {
                // Show real runtime errors, but don't pop the overlay for
                // build warnings like the size hint above.
                overlay: {
                    errors: true,
                    warnings: false,
                },
            },
        },

        // Full source maps in dev for easy debugging, lighter maps in prod.
        devtool: isProduction ? "source-map" : "eval-source-map",

        mode: isProduction ? "production" : "development",
    };
};
