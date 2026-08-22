const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const appDirectory = __dirname;

module.exports = {
    // Main TypeScript entry point.
    entry: path.resolve(appDirectory, "src/app.ts"),

    // Production/development build output.
    output: {
        path: path.resolve(appDirectory, "dist"),
        filename: "js/bundle.js",

        // Remove old files from dist before each Webpack build.
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
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: {
                    loader: "ts-loader",
                },
            },
        ],
    },

    plugins: [
        new HtmlWebpackPlugin({
            inject: true,
            template: path.resolve(appDirectory, "public/index.html"),
        }),
    ],

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
    },

    // Useful source maps for debugging TypeScript in the browser.
    devtool: "source-map",

    mode: "development",
};const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const appDirectory = __dirname;

module.exports = {
    // Main TypeScript entry point.
    entry: path.resolve(appDirectory, "src/app.ts"),

    // Production/development build output.
    output: {
        path: path.resolve(appDirectory, "dist"),
        filename: "js/bundle.js",

        // Remove old files from dist before each Webpack build.
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
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: {
                    loader: "ts-loader",
                },
            },
        ],
    },

    plugins: [
        new HtmlWebpackPlugin({
            inject: true,
            template: path.resolve(appDirectory, "public/index.html"),
        }),
    ],

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
    },

    // Useful source maps for debugging TypeScript in the browser.
    devtool: "source-map",

    mode: "development",
};