// The game's DI entry point: what its components get through @Inject fields.
// The engine's subsystems (IInputSubsystem, IPhysicsSubsystem, IUiSubsystem,
// IDataStream, IWorld...) are bound by the engine itself; this adds the UI
// plugin's IGameUi and the game's own services. Split it into more installers
// as the game grows: builder.Install( new EnemiesInstaller() ).

import { Installer, type ContainerBuilder } from "@cse/di";
import type { EngineContext } from "@cse/core/Engine/Core/EngineContext";
import { GameUiInstaller } from "@cse/ui/game";

export class GameInstaller extends Installer<EngineContext> {
	public InstallBindings( builder: ContainerBuilder ): void {
		// the UI plugin's GameUi, as IGameUi
		builder.Install( new GameUiInstaller() );
		// the game's own services, by contract:
		// builder.Bind( IScoreBoard ).To( ScoreBoard ).AsSingle();
		// or, implemented in C# (a contract of a .contract file):
		// builder.Bind( IScoreBoard ).FromCSharp();
	}
}
