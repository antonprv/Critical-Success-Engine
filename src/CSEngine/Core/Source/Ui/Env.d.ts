// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

declare module "*.vue" {
	import type { DefineComponent } from "vue";
	const component: DefineComponent<object, object, unknown>;
	export default component;
}
