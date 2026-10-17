// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient declarations (Quasar's sources) reach every package that compiles this file only this way
/// <reference path="./QuasarSources.d.ts" />
import type { App, Component, Directive } from "vue";
import { PortalHost } from "../Core/KitContext";
import type { JsonValue } from "../Documents/Json";
import { QuasarComponentTable, QuasarDirectiveTable } from "./QuasarTable.generated";
import type { QuasarComponentRow } from "./QuasarTypes";

/**
 * Quasar is loaded the first time a document shows a Quasar widget, not before: a game without Quasar widgets
 * downloads none of it (its install, its CSS, its components; each component is a chunk of its own).
 */

/** Options of Quasar's install every app gets (the services add their plugins on their own). */
export interface QuasarInstallOptions {
	config?: Record<string, unknown>;
}

const installed = new WeakMap<App, Promise<void>>();
const components = new Map<string, Component>();
const directives = new Map<string, Directive>();
let styles: Promise<unknown> | null = null;
let installOptions: QuasarInstallOptions = {};

/** What Quasar is installed with in apps that install it from now on (the brand colours, the notify defaults...). */
export function ConfigureQuasar(options: QuasarInstallOptions): void {
	installOptions = options;
}

/** Quasar's CSS (in its own cascade layer, under the themes) and the icon and Roboto fonts; once per page. */
export function LoadQuasarStyles(): Promise<unknown> {
	return styles ??= import("./QuasarStyles");
}

/** Installs Quasar into a Vue app once (its $q, Platform, Screen, Dark, Lang, IconSet) and loads its styles. */
export function EnsureQuasar(app: App): Promise<void> {
	let install = installed.get(app);
	if (!install) {
		install = (async () => {
			const [{ default: installQuasar }, { changeGlobalNodesTarget }] = await Promise.all([import("quasar/src/install-quasar.js"), import("quasar/src/utils/private.config/nodes.js"), LoadQuasarStyles()]);
			if (!app.config.globalProperties["$q"]) installQuasar(app, { ...installOptions });
			// Pop-ups go into the element that wears the theme (KitContext), not straight into <body>.
			changeGlobalNodesTarget(PortalHost());
		})();
		installed.set(app, install);
	}
	return install;
}

/** Whether a Vue app has Quasar (its $q) already. */
export function HasQuasar(app: App): boolean {
	return app.config.globalProperties["$q"] !== undefined;
}

export function FindQuasarComponent(type: string): QuasarComponentRow | undefined {
	return QuasarComponentTable.find((row) => row.Type === type);
}

/** A component that was loaded already (draws at once); undefined until LoadQuasarComponent did. */
export function LoadedQuasarComponent(row: QuasarComponentRow): Component | undefined {
	return components.get(row.Name);
}

export async function LoadQuasarComponent(row: QuasarComponentRow): Promise<Component> {
	const loaded = components.get(row.Name);
	if (loaded) return loaded;
	const component = (await row.Load()).default;
	components.set(row.Name, component);
	return component;
}

/** A directive by its layout name ("ripple", "touch-pan", "close-popup"); undefined for an unknown one. */
export function LoadedQuasarDirective(name: string): Directive | undefined {
	return directives.get(name);
}

export async function LoadQuasarDirective(name: string): Promise<Directive> {
	const loaded = directives.get(name);
	if (loaded) return loaded;
	const row = QuasarDirectiveTable.find((entry) => entry.Attr === `v-${name}`);
	if (!row) throw new Error(`Quasar has no directive "${name}"`);
	const directive = (await row.Load()).default;
	directives.set(name, directive);
	return directive;
}

//#region validation rules

/**
 * A validation rule a layout file can hold (a QInput's rules): one of Quasar's own rule names ("email", "date",
 * "hexColor"...), or one of these.
 */
export interface RuleSpec {
	Rule: "required" | "min-length" | "max-length" | "min" | "max" | "pattern";
	/** The limit (a length, a number) or the pattern. */
	Value?: number | string;
	/** What the field says when the rule fails. */
	Message?: string;
}

type RuleFunction = (value: unknown) => true | string;

const Length = (value: unknown): number => (value === null || value === undefined ? 0 : Array.isArray(value) ? value.length : String(value).length);

function RuleOf(spec: RuleSpec): RuleFunction {
	const message = spec.Message;
	switch (spec.Rule) {
		case "required": return (value) => (Length(value) > 0 || value === true || typeof value === "number") || (message ?? "Required");
		case "min-length": return (value) => Length(value) >= Number(spec.Value) || (message ?? `At least ${spec.Value} characters`);
		case "max-length": return (value) => Length(value) <= Number(spec.Value) || (message ?? `At most ${spec.Value} characters`);
		case "min": return (value) => Number(value) >= Number(spec.Value) || (message ?? `At least ${spec.Value}`);
		case "max": return (value) => Number(value) <= Number(spec.Value) || (message ?? `At most ${spec.Value}`);
		case "pattern": {
			const pattern = new RegExp(String(spec.Value ?? ""));
			return (value) => pattern.test(String(value ?? "")) || (message ?? "Doesn't match the pattern");
		}
	}
}

/** The rules of a layout file as Quasar takes them: names stay names, specs become functions; anything else is dropped. */
export function QuasarRules(rules: JsonValue | undefined): (string | RuleFunction)[] {
	if (!Array.isArray(rules)) return [];
	const out: (string | RuleFunction)[] = [];
	for (const rule of rules) {
		if (typeof rule === "string") out.push(rule);
		else if (rule !== null && typeof rule === "object" && !Array.isArray(rule) && typeof rule["Rule"] === "string") out.push(RuleOf(rule as unknown as RuleSpec));
	}
	return out;
}

//#endregion
