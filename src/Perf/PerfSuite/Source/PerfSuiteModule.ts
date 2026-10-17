// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The perf suite's game module: its scenes, one per kind of load
// (Scenes/PerfScenes.ts), and the UI plugin.

import type EngineModule from "@cse/core/Engine/EngineModule";
import { GameModule, ModuleManager } from "@cse/core/modules";
import { GameUiInstaller } from "@cse/ui/game";
import { Installer, type ContainerBuilder } from "@cse/di";
import { PerfScenes } from "./Scenes/PerfScenes";

class PerfInstaller extends Installer {
	public InstallBindings( builder: ContainerBuilder ): void {
		builder.Install( new GameUiInstaller() );
	}
}

export default class PerfSuiteModule extends GameModule {
	public override StartupModule(): void {
		const engine = ModuleManager.Get()
			.GetModuleChecked<EngineModule>( "Engine" );

		for ( const scene of PerfScenes ) {
			engine.Scenes.Register( scene );
		}
		engine.Installers.push( new PerfInstaller() );
	}
}
