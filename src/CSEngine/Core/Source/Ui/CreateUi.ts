// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { createApp, type App as VueApp } from "vue";
import { Notify, Quasar } from "quasar";
import "quasar/dist/quasar.css";
import "./styles/theme.css";

import App from "./App.vue";
import type { UiStore } from "./UiStore";

/**
 * Mounts the Vue + Quasar UI over the canvas. This is the whole main-thread UI: it renders UiStore and calls
 * `store.Actions` - all state and logic live in UiWorker (see Workers/Ui/UiController.ts).
 */
export function CreateUi(store: UiStore, mountPoint: HTMLElement): VueApp {
	const app = createApp(App);
	app.use(Quasar, {
		plugins: { Notify },
		// Toasts are XP tray balloons (styles/theme.css): bottom right, black on pale yellow.
		config: { notify: { position: "bottom-right", timeout: 2600, color: "transparent", textColor: "black", classes: "xp-balloon" } },
	});
	app.provide("uiStore", store);
	app.mount(mountPoint);
	return app;
}
