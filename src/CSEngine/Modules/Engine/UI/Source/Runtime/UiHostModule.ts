// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ModuleInterface, ModuleManager } from "@cse/core/modules";
import { createApp, h, type App } from "vue";
import WinThemeProvider from "../Components/WinThemeProvider.vue";
import { WinTheme } from "../Core/Themes";
import { UiManager, type UiManagerOptions } from "../Documents/UiManager";
import WinUiHost from "../Documents/WinUiHost.vue";
import type { UiChannels } from "./GameUi";
import { EngineScreens, WithEngineDocuments, type EnginePage } from "./EngineScreens";
import { ControlsScreen, EngineControlsId } from "./ControlsScreen";
import { SettingsScreen } from "./SettingsScreen";
import { TouchControls } from "./TouchControls";
import WinTouchOverlay from "./WinTouchOverlay.vue";
import { UiHostBridge } from "./UiHostBridge";

/** What the page's Engine module offers this module: its channels and the project's UI documents. */
type PageEngine = ModuleInterface & { Channels: UiChannels; ProjectUi: Pick<UiManagerOptions, "Manifest" | "Load">; PageUi?: EnginePage | null; };

/** The UI plugin's page module: draws the project's UI documents over the game and runs the game's commands on them. */
export default class UiHostModule extends ModuleInterface {
	public Manager!: UiManager;
	private _bridge!: UiHostBridge;
	private _screens: EngineScreens | null = null;
	private _settings!: SettingsScreen;
	private _controls!: ControlsScreen;
	private _touch: TouchControls | null = null;
	private _app!: App;
	private _element!: HTMLElement;

	public override StartupModule(): void {
		const engine = ModuleManager.Get().GetModuleChecked<PageEngine>("Engine");
		// The project's documents, and the engine's own screens it doesn't replace.
		this.Manager = new UiManager(WithEngineDocuments(engine.ProjectUi));
		this._bridge = new UiHostBridge(this.Manager, engine.Channels);
		// The engine's menu and loading screen, drawn as documents (on a page that offers them).
		// Arrange touch: the controls screen steps aside while the touch controls are arranged, and comes back on Done.
		this._controls = new ControlsScreen(this.Manager, engine.Channels, undefined, () => {
			this.Manager.Hide(EngineControlsId);
			this._touch?.StartArranging(() => this._controls.Open());
		});
		this._settings = new SettingsScreen(this.Manager, engine.Channels, () => this._controls.Open());
		this._screens = engine.PageUi ? new EngineScreens(this.Manager, engine.PageUi, () => this._settings.Open()) : null;
		// The touch scheme over the game (on a page that offers its menu and pause).
		this._touch = engine.PageUi ? new TouchControls(engine.Channels, engine.PageUi) : null;

		// A layer over the game canvas, under the engine's own menus and HUD (#ui) when they are there.
		this._element = document.createElement("div");
		this._element.className = "cse-ui-host";
		this._element.style.cssText = "position: fixed; inset: 0; pointer-events: none; z-index: 1;";
		const engineUi = document.getElementById("ui");
		if (engineUi) document.body.insertBefore(this._element, engineUi);
		else document.body.appendChild(this._element);
		const touch = this._touch;
		this._app = createApp({
			render: () => h(WinThemeProvider, { theme: WinTheme.XpBlue }, () => [h(WinUiHost, { manager: this.Manager }), touch ? h(WinTouchOverlay, { touch }) : null]),
		});
		this._app.mount(this._element);
	}

	public override ShutdownModule(): void {
		this._bridge.Dispose();
		this._screens?.Dispose();
		this._settings.Dispose();
		this._controls.Dispose();
		this._touch?.Dispose();
		this._app.unmount();
		this._element.remove();
	}
}
