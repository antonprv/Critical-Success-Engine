// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Plain JavaScript on purpose: Vite configs of other packages import it through the package ("@cse/ui/build"), and
// Node loads it as it is (a .ts file there needs a Node that strips types - 22.18 and later).

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const version = JSON.parse(readFileSync(require.resolve("quasar/package.json"), "utf8")).version;

/**
 * The build flags Quasar's sources expect (what @quasar/vite-plugin defines): every Vite config that bundles @cse/ui
 * puts them in its `define` - the UI module's Quasar widgets import Quasar's sources file by file.
 * @type {Record<string, string | boolean>}
 */
export const QuasarDefines = {
	__QUASAR_VERSION__: JSON.stringify(version),
	__QUASAR_SSR__: false,
	__QUASAR_SSR_SERVER__: false,
	__QUASAR_SSR_CLIENT__: false,
	__QUASAR_SSR_PWA__: false,
};
