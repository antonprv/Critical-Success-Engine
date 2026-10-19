// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { camelize, capitalize, defineComponent, getCurrentInstance, h, inject, onBeforeUnmount, onErrorCaptured, ref, shallowRef, withDirectives, type Component, type Directive, type DirectiveArguments, type PropType, type ShallowRef, type VNode } from "vue";
import { UseKit } from "../Core/KitContext";
import type { JsonValue } from "../Documents/Json";
import type { LayoutNode } from "../Documents/Layout";
import type { UiDocument } from "../Documents/UiDocument";
import type { QuasarController } from "./QuasarController";
import type { QuasarComponentRow } from "./QuasarTypes";
import { EnsureQuasar, HasQuasar, LoadedQuasarComponent, LoadedQuasarDirective, LoadQuasarComponent, LoadQuasarDirective, QuasarRules } from "./QuasarRuntime";

/** Directives whose value is a handler: the widget gets an event of the directive's name instead ("touch-swipe"). */
const HandlerDirectives = new Set(["touch-hold", "touch-pan", "touch-repeat", "touch-swipe", "intersection", "mutation", "resize", "scroll", "scroll-fire", "drop-zone"]);

/**
 * Components that draw only inside another one (Quasar provides a key there and they look for it): where each must go,
 * by the key, and what to tell the user.
 */
const Parents: Record<string, { Key: string; Where: string; }> = {
	QDrawer: { Key: "_q_l_", Where: "a Layout (q-layout)" },
	QHeader: { Key: "_q_l_", Where: "a Layout (q-layout)" },
	QFooter: { Key: "_q_l_", Where: "a Layout (q-layout)" },
	QPageContainer: { Key: "_q_l_", Where: "a Layout (q-layout)" },
	QPageSticky: { Key: "_q_l_", Where: "a Layout (q-layout)" },
	QPageScroller: { Key: "_q_l_", Where: "a Layout (q-layout)" },
	QPage: { Key: "_q_pc_", Where: "a Page container (q-page-container) of a Layout (q-layout)" },
	QTab: { Key: "_q_tabs_", Where: "Tabs (q-tabs)" },
	QRouteTab: { Key: "_q_tabs_", Where: "Tabs (q-tabs), with Vue Router (a UI document has none: use q-tab)" },
	QStep: { Key: "_q_s_", Where: "a Stepper (q-stepper)" },
	QTimelineEntry: { Key: "_q_t_", Where: "a Timeline (q-timeline)" },
	QUploaderAddTrigger: { Key: "_q_u_", Where: "an Uploader (q-uploader)" },
};

/** Where a component must go to draw; null when it is where it can (or needs no parent). */
export function MissingParent(name: string, has: (key: string) => boolean): string | null {
	const parent = Parents[name];
	// QRouteTab needs the router even inside tabs
	return parent && (!has(parent.Key) || name === "QRouteTab") ? parent.Where : null;
}

/** "touch-swipe:mouse.left.right" -> name, argument and modifiers (Vue's own syntax for a directive). */
export function ParseDirectiveKey(key: string): { Name: string; Arg: string | undefined; Modifiers: Record<string, boolean>; } {
	const [head, ...modifiers] = key.split(".");
	const [name, arg] = head!.split(":");
	return { Name: name!, Arg: arg || undefined, Modifiers: Object.fromEntries(modifiers.filter(Boolean).map((modifier) => [modifier, true])) };
}

/** An item of a list as text: itself, or its label. */
function ItemText(item: unknown): string {
	return item !== null && typeof item === "object" && "label" in item ? String(item.label) : String(item);
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
		// read at every draw: a script or the game may hand the widget's view another controller
		const Controller = (): QuasarController => props.controller as QuasarController;
		const names = (): string[] => Object.keys(props.node.Directives ?? {}).map((key) => ParseDirectiveKey(key).Name);
		const ready = (row: QuasarComponentRow): boolean => HasQuasar(app) && LoadedQuasarComponent(row) !== undefined && names().every((name) => LoadedQuasarDirective(name) !== undefined);

		const component: ShallowRef<Component | null> = shallowRef(null);
		const failure = ref<string | null>(null);
		const parents = new Set(Object.values(Parents).map((parent) => parent.Key).filter((key) => inject(key, null) !== null));
		// A component that fails (its setup or its drawing) shows why, alone: the rest of the document - the designer's
		// canvas - keeps working.
		onErrorCaptured((error: unknown) => {
			failure.value = error instanceof Error ? error.message : String(error);
			return false;
		});
		/** What is loaded or being loaded: the component and the directives. */
		/** Loads the component and its directives, then draws it (or says why it can't). */
		const Load = async (row: QuasarComponentRow, directives: string[]): Promise<void> => {
			try {
				const [, loaded] = await Promise.all([EnsureQuasar(app), LoadQuasarComponent(row), ...directives.map(LoadQuasarDirective)]);
				component.value = loaded;
			} catch (error) {
				failure.value = (error as Error).message;
			}
		};
		// what is loaded already draws at once
		const row = Controller().Row;
		if (ready(row)) component.value = LoadedQuasarComponent(row)!;
		else void Load(row, names());
		onBeforeUnmount(() => Controller().Bind(null));

		return (): VNode => {
			const controller = Controller();
			const row = controller.Row;
			if (failure.value) return h("div", { class: "win-quasar win-quasar--failed", title: failure.value }, `${row.Name}: ${failure.value}`);
			const missing = MissingParent(row.Name, (key) => parents.has(key));
			if (missing) return h("div", { class: "win-quasar win-quasar--orphan" }, `${row.Name} goes inside ${missing}`);
			if (!component.value) return h("div", { class: "win-quasar win-quasar--loading" });

			// a new function when the controller is new, so Vue hands the instance over to it
			const attrs: Record<string, unknown> = { ...controller.Props, ref: controller.BindRef, class: ["win-quasar", controller.Props["class"] as string | undefined] };
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
			// a virtual scroll draws its items through a scoped slot: without widgets of its own, each item's text
			if (row.Name === "QVirtualScroll" && !slots["default"]) content["default"] = ((scope: { item: unknown; }) => h("div", { class: "q-pa-sm" }, ItemText(scope.item))) as () => unknown;

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
