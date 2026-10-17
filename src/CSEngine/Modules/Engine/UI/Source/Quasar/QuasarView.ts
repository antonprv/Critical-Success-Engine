// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { camelize, capitalize, defineComponent, getCurrentInstance, h, onBeforeUnmount, ref, shallowRef, withDirectives, type Component, type Directive, type DirectiveArguments, type PropType, type ShallowRef, type VNode } from "vue";
import { UseKit } from "../Core/KitContext";
import type { JsonValue } from "../Documents/Json";
import type { LayoutNode } from "../Documents/Layout";
import type { UiDocument } from "../Documents/UiDocument";
import type { QuasarController } from "./QuasarController";
import { EnsureQuasar, HasQuasar, LoadedQuasarComponent, LoadedQuasarDirective, LoadQuasarComponent, LoadQuasarDirective, QuasarRules } from "./QuasarRuntime";

/** Directives whose value is a handler: the widget gets an event of the directive's name instead ("touch-swipe"). */
const HandlerDirectives = new Set(["touch-hold", "touch-pan", "touch-repeat", "touch-swipe", "intersection", "mutation", "resize", "scroll", "scroll-fire", "drop-zone"]);

/** "touch-swipe:mouse.left.right" -> name, argument and modifiers (Vue's own syntax for a directive). */
export function ParseDirectiveKey(key: string): { Name: string; Arg: string | undefined; Modifiers: Record<string, boolean>; } {
	const [head, ...modifiers] = key.split(".");
	const [name, arg] = head!.split(":");
	return { Name: name!, Arg: arg || undefined, Modifiers: Object.fromEntries(modifiers.filter(Boolean).map((modifier) => [modifier, true])) };
}

/** "update:model-value" -> "onUpdate:modelValue": the listener prop of an event. */
export const ListenerOf = (event: string): string => `on${capitalize(camelize(event))}`;

/**
 * Draws a Quasar widget: its component (loaded on first use, with Quasar installed into the app), the controller's
 * props, value and enabled state, every event forwarded to the controller, the layout's directives, and the child
 * widgets in the slots they name.
 */
export const QuasarView = defineComponent({
	name: "QuasarView",
	props: {
		node: { type: Object as PropType<LayoutNode>, required: true },
		controller: { type: Object as PropType<object | null>, default: null },
		document: { type: Object as PropType<UiDocument>, required: true },
	},
	setup(props, { slots }) {
		const app = getCurrentInstance()!.appContext.app;
		const kit = UseKit();
		const controller = props.controller as QuasarController;
		const row = controller.Row;
		const names = (): string[] => Object.keys(props.node.Directives ?? {}).map((key) => ParseDirectiveKey(key).Name);
		const ready = (): boolean => HasQuasar(app) && LoadedQuasarComponent(row) !== undefined && names().every((name) => LoadedQuasarDirective(name) !== undefined);

		const component: ShallowRef<Component | null> = shallowRef(ready() ? LoadedQuasarComponent(row)! : null);
		const failure = ref<string | null>(null);
		if (!component.value) {
			Promise.all([EnsureQuasar(app), LoadQuasarComponent(row), ...names().map(LoadQuasarDirective)])
				.then(([, loaded]) => { component.value = loaded; })
				.catch((error: Error) => { failure.value = error.message; });
		}
		onBeforeUnmount(() => controller.Bind(null));

		const Bind = (instance: unknown): void => controller.Bind(instance as Record<string, unknown> | null);

		return (): VNode => {
			if (failure.value) return h("div", { class: "win-quasar win-quasar--failed", title: failure.value }, `${row.Name}: ${failure.value}`);
			if (!component.value) return h("div", { class: "win-quasar win-quasar--loading" });

			const attrs: Record<string, unknown> = { ...controller.Props, ref: Bind, class: ["win-quasar", controller.Props["class"] as string | undefined] };
			if (row.Model) {
				if (controller.Value !== undefined) attrs["modelValue"] = controller.Value;
				attrs["onUpdate:modelValue"] = (value: JsonValue): void => controller.Raise("update:model-value", [value]);
			}
			if (!controller.Enabled) attrs["disable"] = true;
			// A dark theme gives Quasar's components their dark look, unless the layout says otherwise.
			if (kit.Dark && !("dark" in controller.Props)) attrs["dark"] = true;
			if ("rules" in controller.Props) attrs["rules"] = QuasarRules(controller.Props["rules"]);
			for (const event of row.Events) {
				if (event !== "update:model-value") attrs[ListenerOf(event)] = (...args: unknown[]): void => controller.Raise(event, args);
			}

			// The child widgets go into the slots they name; with none, the default slot shows the widget's text.
			const content: Record<string, () => unknown> = { ...slots } as Record<string, () => unknown>;
			if (!content["default"] && controller.Content) content["default"] = () => controller.Content;

			const vnode = h(component.value, attrs, content);
			const directives: DirectiveArguments = Object.entries(props.node.Directives ?? {}).map(([key, value]) => {
				const { Name, Arg, Modifiers } = ParseDirectiveKey(key);
				const directive = LoadedQuasarDirective(Name) as Directive;
				const bound = HandlerDirectives.has(Name) ? (...args: unknown[]): void => controller.Raise(Name, args) : value;
				return [directive, bound, Arg, Modifiers];
			});
			return directives.length ? withDirectives(vnode, directives) : vnode;
		};
	},
});
