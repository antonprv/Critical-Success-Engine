// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { DataAssetUrls, DefaultInputManifest, InputManifests, LoadUiDocument, UiManifest } from "virtual:cse/project";
import { ChannelHub } from "./Core/Channels";
import type { ProjectInput } from "./Input/InputActions";
import { GetPageUi, type PageUi } from "./Core/PageUi";
import { ModuleInterface } from "./Modules/ModuleManager";
import { SceneRegistry } from "./Scenes/SceneRegistry";

/** The engine's own module: the services game modules reach through ModuleManager.Get().GetModuleChecked("Engine"). */
export default class EngineModule extends ModuleInterface {
	/** The scenes the game offers (the pause menu lists them; the first loads at startup). */
	public readonly Scenes = new SceneRegistry();
	/** Plugin messages between this thread and the other side (the game logic worker and the page). */
	public readonly Channels = new ChannelHub();
	/** The project's UI documents: its manifest and how to read a document (the UI plugin shows them). */
	public readonly ProjectUi = { Manifest: UiManifest, Load: LoadUiDocument };
	/** The project's input manifests (its actions and bindings) and the one in use at start. */
	public readonly ProjectInput: ProjectInput = { Manifests: InputManifests, Default: DefaultInputManifest };
	/** The project's data assets (.csedata): where each sits, by Id, relative to the game's folder. */
	public readonly ProjectData: Record<string, string> = DataAssetUrls;

	/** On the page: its menu and loading screen, for the plugin that draws them (null in the workers). */
	public get PageUi(): PageUi | null {
		return GetPageUi();
	}

	/** The engine never unloads while the program runs. */
	public override SupportsDynamicReloading(): boolean {
		return false;
	}
}
