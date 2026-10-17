// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient declarations (Quasar's sources) reach every package that compiles this file only this way
/// <reference path="./QuasarSources.d.ts" />
import { createApp, customRef, type App, type Ref } from "vue";
import { OnPortalTheme } from "../Core/KitContext";
import { CloneJson, IsJson, type JsonValue } from "../Documents/Json";
import { EnsureQuasar } from "./QuasarRuntime";
import { QuasarLanguageTable } from "./QuasarTable.generated";
import type { QuasarLanguagePack } from "./QuasarTypes";

/**
 * Quasar's plugins as the engine's services: notifications, dialogs, bottom sheets, loading screens and bars,
 * full screen - for node graphs, UI scripts and the game's GameUi alike. They overlap with the engine's own systems
 * where they should: Quasar's LocalStorage and SessionStorage keep their data in the engine's stores (SettingsStorage),
 * dark mode follows the theme, Quasar's texts follow the language (CSTables). Everything is loaded on first use.
 */

//#region stores

/** What Quasar's storage plugins keep their data in: SettingsStorage has this shape. */
export interface KeyValueStore {
	readonly Keys: string[];
	Has(key: string): boolean;
	Get<T extends JsonValue>(key: string, fallback: T): T;
	Set(key: string, value: JsonValue): void;
	Delete(key: string): void;
}

/** A store that lives as long as the page (a session's). */
export class MemoryStore implements KeyValueStore {
	private readonly _values = new Map<string, JsonValue>();

	public get Keys(): string[] { return [...this._values.keys()]; }

	public Has(key: string): boolean {
		return this._values.has(key);
	}

	public Get<T extends JsonValue>(key: string, fallback: T): T {
		return this._values.has(key) ? CloneJson(this._values.get(key) as T) : fallback;
	}

	public Set(key: string, value: JsonValue): void {
		this._values.set(key, CloneJson(value));
	}

	public Delete(key: string): void {
		this._values.delete(key);
	}
}

/** A value as a store keeps it: JSON (a date as its ISO text; anything else JSON can't hold as its text). */
function Storable(value: unknown): JsonValue {
	if (value instanceof Date) return value.toISOString();
	return IsJson(value) ? value : String(value);
}

/**
 * Quasar's web storage API (what its LocalStorage and SessionStorage plugins offer) over a store, its keys under a
 * prefix so they don't meet the store's own.
 */
export function WebStorageOver(store: KeyValueStore, prefix = "quasar."): Record<string, unknown> {
	const keys = (): string[] => store.Keys.filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
	const has = (key: string): boolean => store.Has(prefix + key);
	const get = (key: string): JsonValue => store.Get(prefix + key, null);
	const set = (key: string, value: unknown): void => store.Set(prefix + key, Storable(value));
	const remove = (key: string): void => store.Delete(prefix + key);
	return {
		has, hasItem: has,
		getLength: () => keys().length,
		getItem: get,
		getIndex: (index: number) => (index < keys().length ? get(keys()[index]!) : null),
		getKey: (index: number) => keys()[index] ?? null,
		getAll: () => Object.fromEntries(keys().map((key) => [key, get(key)])),
		getAllKeys: keys,
		set, setItem: set,
		remove, removeItem: remove,
		clear: () => keys().forEach(remove),
		isEmpty: () => keys().length === 0,
		/** A ref of one key: reading reads the store, writing writes it. */
		useStorage: (key: string, options: { default?: () => unknown; } = {}): Ref<unknown> => customRef((track, trigger) => ({
			get: () => {
				track();
				return has(key) ? get(key) : options.default?.() ?? null;
			},
			set: (value: unknown) => {
				if (value === null || value === undefined) remove(key);
				else set(key, value);
				trigger();
			},
		})),
	};
}

/**
 * Where Quasar's LocalStorage and SessionStorage keep their data: the engine's stores (the host's SettingsStorage for
 * local, the page's memory for session by default). Set before the first Quasar widget, or at any time after.
 */
export async function ConfigureQuasarStorage(local: KeyValueStore, session: KeyValueStore = new MemoryStore()): Promise<void> {
	const [{ default: localPlugin }, { default: sessionPlugin }] = await Promise.all([import("quasar/src/plugins/storage/LocalStorage.js"), import("quasar/src/plugins/storage/SessionStorage.js")]);
	// Quasar's own plugin objects are what `import { LocalStorage } from "quasar"` gives: they work through ours now.
	// An app that installs the plugin gets the same as $q.localStorage / $q.sessionStorage.
	Object.assign(localPlugin, WebStorageOver(local), { install: ({ $q }: { $q: Record<string, unknown>; }) => { $q["localStorage"] = localPlugin; } });
	Object.assign(sessionPlugin, WebStorageOver(session), { install: ({ $q }: { $q: Record<string, unknown>; }) => { $q["sessionStorage"] = sessionPlugin; } });
}

//#endregion

//#region services

type Q = Record<string, unknown> & { notify: (options: unknown) => () => void; dialog: (options: unknown) => DialogChain; bottomSheet: (options: unknown) => DialogChain; loading: { show: (options?: unknown) => void; hide: () => void; isActive: boolean; }; loadingBar: { start: (speed?: number) => void; stop: () => void; increment: (amount?: number) => void; isActive: boolean; }; fullscreen: { toggle: () => Promise<void>; isActive: boolean; }; dark: { set: (mode: boolean | "auto") => void; isActive: boolean; }; lang: { set: (pack: QuasarLanguagePack) => void; isoName: string; }; };
type DialogChain = { onOk: (fn: (data?: unknown) => void) => DialogChain; onCancel: (fn: () => void) => DialogChain; onDismiss: (fn: () => void) => DialogChain; };

/** What a dialog ended with: OK (and the prompt's or options' value) or not. */
export interface DialogOutcome {
	Ok: boolean;
	Data: JsonValue;
}

const Plugins = {
	Notify: () => import("quasar/src/plugins/notify/Notify.js"),
	Dialog: () => import("quasar/src/plugins/dialog/Dialog.js"),
	BottomSheet: () => import("quasar/src/plugins/bottom-sheet/BottomSheet.js"),
	Loading: () => import("quasar/src/plugins/loading/Loading.js"),
	LoadingBar: () => import("quasar/src/plugins/loading-bar/LoadingBar.js"),
	AppFullscreen: () => import("quasar/src/plugins/app-fullscreen/AppFullscreen.js"),
};

/** Options as Quasar takes them: a message alone, or Quasar's own option object (JSON, as a layout or GameUi sends it). */
export type QuasarOptions = string | Record<string, JsonValue>;

const Options = (options: QuasarOptions): Record<string, JsonValue> => (typeof options === "string" ? { message: options } : options);

/** The page's Quasar services: one app of their own, Quasar and the plugins installed into it on first use. */
export class QuasarServices {
	private readonly _app: App = createApp({});
	private _ready: Promise<Q> | null = null;
	private _dark = false;

	public constructor() {
		// Quasar's dark mode (which its plugins' pop-ups read) is the theme's.
		OnPortalTheme((dark) => {
			this._dark = dark;
			if (this._ready) void this._ready.then((q) => q.dark.set(dark));
		});
	}

	/** Quasar's $q with every service's plugin installed. */
	public Ready(): Promise<Q> {
		return this._ready ??= (async () => {
			await EnsureQuasar(this._app);
			const q = this._app.config.globalProperties["$q"] as unknown as Q;
			for (const load of Object.values(Plugins)) {
				const { default: plugin } = await load();
				plugin.install!({ $q: q, parentApp: this._app });
			}
			q.dark.set(this._dark);
			return q;
		})();
	}

	/** A notification (Quasar's Notify): a text, or Quasar's options (type, caption, position, timeout, actions...). Returns its dismiss. */
	public async Notify(options: QuasarOptions): Promise<() => void> {
		return (await this.Ready()).notify(Options(options));
	}

	/** A dialog (Quasar's Dialog: alert, confirm, prompt, options): ends with OK and its data, or with cancel. */
	public async Dialog(options: QuasarOptions): Promise<DialogOutcome> {
		const q = await this.Ready();
		return new Promise((resolve) => {
			q.dialog(Options(options))
				.onOk((data) => resolve({ Ok: true, Data: data === undefined ? null : Storable(data) }))
				.onCancel(() => resolve({ Ok: false, Data: null }));
		});
	}

	/** A bottom sheet of actions (Quasar's BottomSheet): the action picked, or null. */
	public async BottomSheet(options: QuasarOptions): Promise<JsonValue> {
		const q = await this.Ready();
		return new Promise((resolve) => {
			q.bottomSheet(Options(options))
				.onOk((action) => resolve(Storable(action)))
				.onCancel(() => resolve(null));
		});
	}

	/** The page-wide loading screen (Quasar's Loading). */
	public async ShowLoading(options: QuasarOptions = {}): Promise<void> {
		(await this.Ready()).loading.show(Options(options));
	}

	public async HideLoading(): Promise<void> {
		(await this.Ready()).loading.hide();
	}

	/** The loading bar at the page's edge (Quasar's LoadingBar). */
	public async LoadingBar(action: "start" | "stop" | "increment", amount?: number): Promise<void> {
		const bar = (await this.Ready()).loadingBar;
		if (action === "start") bar.start();
		else if (action === "stop") bar.stop();
		else bar.increment(amount);
	}

	/**
	 * The page full screen or back (Quasar's AppFullscreen); whether it is now. Where the page can't be (a frame that
	 * doesn't allow it, a browser that refuses without a click) nothing changes.
	 */
	public async ToggleFullscreen(): Promise<boolean> {
		const fullscreen = (await this.Ready()).fullscreen;
		try {
			await fullscreen.toggle();
		} catch {
			// not capable, or refused: stays as it is
		}
		return fullscreen.isActive;
	}

	/** Quasar's own texts (a date picker's months, a table's paging) in a language: false when Quasar has none for it. */
	public async SetLanguage(code: string): Promise<boolean> {
		const load = QuasarLanguageTable[code] ?? QuasarLanguageTable[code.split("-")[0]!] ?? Object.entries(QuasarLanguageTable).find(([name]) => name.startsWith(`${code}-`))?.[1];
		if (!load) return false;
		const [q, { default: pack }] = await Promise.all([this.Ready(), load()]);
		q.lang.set(pack as QuasarLanguagePack);
		return true;
	}

	/** The language Quasar's own texts are in now ("en-US" until set). */
	public async Language(): Promise<string> {
		return (await this.Ready()).lang.isoName;
	}
}

let services: QuasarServices | null = null;

/** The page's Quasar services (made on first use). */
export function GetQuasarServices(): QuasarServices {
	return services ??= new QuasarServices();
}

//#endregion
