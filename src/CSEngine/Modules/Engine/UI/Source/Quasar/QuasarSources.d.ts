// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Quasar's own sources (one file per component, directive and plugin): typed by Quasar's package as a whole, not by
// file, so each import here is what the file's default export is.
declare module "quasar/src/install-quasar.js" {
	import type { App } from "vue";
	const installQuasar: (app: App, options?: Record<string, unknown>) => void;
	export default installQuasar;
}

declare module "quasar/src/components/*" {
	import type { Component } from "vue";
	const component: Component;
	export default component;
}

declare module "quasar/src/directives/*" {
	import type { Directive } from "vue";
	const directive: Directive;
	export default directive;
}

declare module "quasar/src/plugins/*" {
	const plugin: Record<string, unknown> & { install?: (options: Record<string, unknown>) => void; };
	export default plugin;
}

declare module "quasar/src/utils/private.config/nodes.js" {
	export function changeGlobalNodesTarget(target: HTMLElement): void;
}

declare module "quasar/src/utils/*" {
	const util: unknown;
	export default util;
}

declare module "quasar/lang/*" {
	const pack: unknown;
	export default pack;
}
