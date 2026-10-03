// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { onUnmounted, reactive } from "vue";
import type { EventHub, EventMap } from "./EventHub";

/**
 * Makes a controller reactive, so changes made from code (`button.SetEnabled(false)`) show up on screen. Create the
 * controllers you pass to components through this and keep that reference; the raw object is not watched.
 */
export function UseControl<T extends object>(controller: T): T {
	return reactive(controller) as T;
}

/** Re-emits the given controller events as Vue events of the component, until the component unmounts. */
export function ForwardEvents<E extends EventMap>(events: EventHub<E>, emit: (event: never, ...args: never[]) => void, names: (keyof E & string)[]): void {
	const offs = names.map((name) => events.On(name, (...args) => (emit as (event: string, ...a: unknown[]) => void)(name, ...args)));
	onUnmounted(() => offs.forEach((off) => off()));
}
