// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { inject, type InjectionKey } from "vue";
import { WinKit } from "./Kits";

/** The look a part of the page is drawn in, as WinThemeProvider gives it to what is inside. */
export interface KitContext {
	readonly Kit: WinKit;
	/** The theme is dark (a dark Tailwind or Quasar theme): Quasar's components get their dark look. */
	readonly Dark: boolean;
}

export const KitContextKey: InjectionKey<KitContext> = Symbol("cse.kit");

/** The look around a component (the Classic kit, light, outside any provider). */
export function UseKit(): KitContext {
	return inject(KitContextKey, { Kit: WinKit.Classic, Dark: false });
}

//#region pop-ups

/**
 * Quasar puts its pop-ups (dialogs, menus, tooltips, notifications) into one element of its own, outside every theme
 * provider: that element (#cse-portals, at the end of <body>) wears the classes of the theme shown last - a provider
 * that goes gives them back to the one before - so pop-ups look like the rest, and nothing else on the page changes.
 */
const stack: { owner: object; classes: string[]; dark: boolean; }[] = [];
let host: HTMLElement | null = null;
const listeners: ((dark: boolean) => void)[] = [];

/** Calls back with whether the pop-ups' theme is dark, now and whenever it changes (Quasar's dark mode follows it). */
export function OnPortalTheme(listener: (dark: boolean) => void): void {
	listeners.push(listener);
	listener(stack.at(-1)?.dark ?? false);
}

/** The element Quasar's pop-ups go into (created on first use). */
export function PortalHost(): HTMLElement {
	if (!host || !host.isConnected) {
		host = document.getElementById("cse-portals") ?? Object.assign(document.createElement("div"), { id: "cse-portals" });
		if (!host.isConnected) document.body.append(host);
		Apply();
	}
	return host;
}

function Apply(): void {
	const top = stack.at(-1);
	for (const listener of listeners) listener(top?.dark ?? false);
	if (!host) return;
	host.className = ["win-root", "win-portals", ...(top?.classes ?? ["win-kit--classic", "win-family--luna", "win-theme--xp-blue"])].join(" ");
}

/** Puts a provider's classes on the pop-ups (again, when they change); dark: its theme is dark. */
export function ShowPortalTheme(owner: object, classes: string[], dark = false): void {
	const index = stack.findIndex((entry) => entry.owner === owner);
	if (index >= 0) stack.splice(index, 1);
	stack.push({ owner, classes, dark });
	Apply();
}

/** The provider is gone: the pop-ups wear the theme shown before it. */
export function HidePortalTheme(owner: object): void {
	const index = stack.findIndex((entry) => entry.owner === owner);
	if (index >= 0) stack.splice(index, 1);
	Apply();
}

//#endregion
