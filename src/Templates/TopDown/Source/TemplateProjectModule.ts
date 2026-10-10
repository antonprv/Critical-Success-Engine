// The primary game module of TemplateProject: the engine loads it at startup (see TemplateProject.cseproject).
// It puts the game's scenes into the engine; the first registered scene is the one that loads first.

import type EngineModule from "@cse/core/Engine/EngineModule";
import { GameModule, ModuleManager } from "@cse/core/modules";
import { TopDownScene } from "./Scenes/TopDownScene";

export default class TemplateProjectModule extends GameModule {
	public override StartupModule(): void {
		ModuleManager.Get().GetModuleChecked<EngineModule>("Engine").Scenes.Register(TopDownScene);
	}
}
