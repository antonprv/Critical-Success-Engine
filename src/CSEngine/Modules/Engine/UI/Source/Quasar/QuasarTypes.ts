// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Component, Directive } from "vue";
import type { JsonValue } from "../Documents/Json";

/** A Quasar component as the runtime knows it (QuasarTable.generated.ts). */
export interface QuasarComponentRow {
	/** Quasar's name: "QBtn". */
	Name: string;
	/** The widget type in layout files: "q-btn". */
	Type: string;
	/** The palette group. */
	Group: string;
	/** Width and height when dropped from the palette. */
	Size: [number, number];
	/** Has a model-value (v-model): the widget's value. */
	Model: boolean;
	/** Its slots: child widgets go into one of them (the default one unless they name another). */
	Slots: string[];
	/** Every event it emits: each one is an event of the widget's controller. */
	Events: string[];
	/** Props it starts with when dropped from the palette. */
	Starter: Record<string, JsonValue>;
	/** Text its default slot shows while it holds no widgets. */
	Text?: string;
	/** Widgets it starts with when dropped from the palette. */
	Children?: ChildTemplate[];
	/** The component itself, in its own chunk. */
	Load: () => Promise<{ default: Component; }>;
}

/** A widget a container starts with (a tab of a tab bar): its type, props, text, slot and own children. */
export interface ChildTemplate {
	Type: string;
	Props?: Record<string, JsonValue>;
	Content?: string;
	Slot?: string;
	Children?: ChildTemplate[];
}

export interface QuasarDirectiveRow {
	/** "Ripple". */
	Name: string;
	/** "v-ripple". */
	Attr: string;
	Load: () => Promise<{ default: Directive; }>;
}

/** The kinds of Quasar props a layout file can hold (QuasarCatalog.generated.json). */
export type QuasarPropKind = "text" | "number" | "boolean" | "choice" | "json" | "rules";

export interface QuasarPropInfo {
	/** Quasar's name: "icon-right". */
	Key: string;
	Kind: QuasarPropKind;
	/** Quasar's own category of the prop (style, content, behavior, model...): the inspector's sections. */
	Category: string;
	Description: string;
	Default?: JsonValue;
	Choices?: string[];
	Examples?: string[];
	Required?: boolean;
}

/** What the designer knows about a component (its palette entry, inspector and code). */
export interface QuasarComponentInfo {
	Name: string;
	Type: string;
	Group: string;
	Docs: string;
	Module: string;
	Size: [number, number];
	Model: boolean;
	Props: QuasarPropInfo[];
	/** Props JSON can't hold (elements, functions): set from scripts. */
	Unsupported: string[];
	Starter: Record<string, JsonValue>;
	Text?: string;
	Children?: ChildTemplate[];
	Slots: string[];
	Events: string[];
	Methods: string[];
}

export interface QuasarDirectiveInfo {
	Name: string;
	Attr: string;
	Docs: string;
	Module: string;
	/** The types its value may have. */
	Value: string[];
	Description: string;
	Arg: string | null;
	Modifiers: string[];
}

export interface QuasarPluginInfo {
	Name: string;
	Docs: string;
	/** null: not installable (Brand is a set of CSS variables). */
	Module: string | null;
	Injection: string | null;
	Methods: string[];
}

/** One of Quasar's language packs (quasar/lang): its texts and plural rules, by Quasar. */
export interface QuasarLanguagePack {
	isoName: string;
	nativeName: string;
	rtl?: boolean;
	[key: string]: unknown;
}

export interface QuasarCatalog {
	Version: string;
	/** Quasar's language packs: "en-US", "ru", "zh-CN"... */
	Languages: string[];
	Components: QuasarComponentInfo[];
	Directives: QuasarDirectiveInfo[];
	Plugins: QuasarPluginInfo[];
}
