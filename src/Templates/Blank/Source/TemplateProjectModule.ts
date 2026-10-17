// The primary game module of TemplateProject: the engine loads it at startup
// (see TemplateProject.cseproject). It puts the game's scenes into the engine
// (the first registered scene is the one that loads first) and its DI
// installer (Source/GameInstaller.ts).

import type EngineModule from "@cse/core/Engine/EngineModule";
import { GameModule, ModuleManager } from "@cse/core/modules";
import { GameInstaller } from "./GameInstaller";
import { BouncingBallScene } from "./Scenes/BouncingBallScene";

export default class TemplateProjectModule extends GameModule {
	public override StartupModule(): void {
		const engine = ModuleManager.Get().GetModuleChecked<EngineModule>(
			"Engine",
		);
		engine.Scenes.Register( BouncingBallScene );
		// the game's DI entry point (its components' @Inject fields)
		engine.Installers.push( new GameInstaller() );
	}
}
