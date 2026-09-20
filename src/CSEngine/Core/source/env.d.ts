// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Injected by webpack.DefinePlugin (see webpack.config.js).
// true in `webpack serve --mode development`, false in `--mode production`.
// Any code guarded by `if (__DEV__)` is dead-code-eliminated by Terser in
// production builds, so debug-only dependencies (e.g. the Inspector) never
// end up in the shipped bundle.
declare const __DEV__: boolean;
