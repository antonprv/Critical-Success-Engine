**English** | [Русский](../../ru/guides/20-dependency-injection.md)

# 20. Dependency injection

A component asks for what it needs by **contract** (an interface) and the game's DI container gives it the
implementation, before the component's `Awake`. The component never names the implementation, and never reaches
into the engine for it: swap the implementation in one installer, and every component that asks for the contract gets
the new one. `this.Engine` still works, for quick experiments; the templates use contracts throughout.

## Asking: `@Inject`

```ts
// Templates/Blank/Source/Scripts/LandingToast.ts
import { Inject } from "@cse/di";
import { IDataStream, IUiSubsystem } from "@cse/core/Engine/DI/Contracts";

export class LandingToast extends Component {
	@Inject( IDataStream ) private readonly _stream!: IDataStream;

	@Inject( IUiSubsystem ) private readonly _ui!: IUiSubsystem;

	public override Start(): void {
		this._stream.Subscribe<Landing>( "Ball.Landed", ( landing ) => this._ui.Toast( `Landing ${ landing.Count }` ) );
	}
}
```

The fields are filled when the component is added to its entity, so they are there in `Awake` already. There is no
reflection: `@Inject` records the field once, when the class is defined, and filling it is an array lookup by the
contract's id. A field nothing is bound to is logged (`[DI] Class on "Entity": Class.Field needs IContract, and nothing
is bound to it`) and the component still runs.

## The engine's contracts

`@cse/core/Engine/DI/Contracts` - each an interface (the public surface of the engine's class) and its contract under
the same name:

| Contract | What it is |
|---|---|
| `IInputSubsystem` | the player's input: actions, keys, the pointer |
| `IPhysicsSubsystem` | the simulation: bodies, queries |
| `IRenderSubsystem` | the renderer |
| `IUiSubsystem` | the page's HUD lines, toasts |
| `IAudioSubsystem` | sound |
| `ISettingsSubsystem` | the game's settings |
| `IStorage` | what the player chose, kept between sessions |
| `IDataAssets` | the project's data assets |
| `IScenes` | scenes: the current one, loading another |
| `IWorld` | the entities |
| `ITime` | frame and step times |
| `IDataStream` | the DataStream (guide 19) |
| `IGameUi` (`@cse/ui/game`) | the UI plugin: the game's UI documents |

## Binding: installers

A contract of your own is an interface and a `Contract` with the same name:

```ts
import { Contract } from "@cse/di";

export interface IScoreBoard {
	Add( points: number ): void;
}
export const IScoreBoard = Contract<IScoreBoard>( "IScoreBoard" );
```

Every template has one entry point, `Source/GameInstaller.ts`, which its module installs at startup
(`engine.Installers.push( new GameInstaller() )`). The engine binds its own contracts first; the game's installer adds
the rest, and can be made of other installers:

```ts
export class GameInstaller extends Installer<EngineContext> {
	public InstallBindings( builder: ContainerBuilder ): void {
		builder.Install( new GameUiInstaller() );          // the UI plugin's IGameUi
		builder.Install( new EnemiesInstaller() );         // composition: one installer per area of the game
		builder.Bind( IScoreBoard ).To( ScoreBoard ).AsSingle();
	}
}
```

The binding API follows Zenjex (Zenject's):

| | |
|---|---|
| `Bind( C ).To( Class )` | an instance of the class (no constructor arguments; its own `@Inject` fields are filled) |
| `Bind( C ).FromInstance( obj )`, `BindInstance( C, obj )` | this object (the container won't dispose it) |
| `Bind( C ).FromFactory( ( container ) => ... )` | whatever the factory returns |
| `.AsSingle()` | one instance, made on first use (the default) |
| `.AsTransient()` | a new one every time |
| `.NonLazy()` | one instance, made when the container is built; its `Initialize()` is called |
| `builder.Install( installer, context )` | another installer's bindings (an installer class installs once per container, so shared ones compose) |

Binding a contract twice is an error, so is a binding with no source (`To`, `FromInstance`, `FromFactory`).

A contract both TypeScript and C# know is declared in a `.contract` file; `Bind( C ).FromCSharp()` binds one
implemented in C#, and `@FromCSharp( C )` asks C# for it directly: guide 22.

## Scenes

A scene can have bindings of its own: `installer` in its manifest. They live in a child container of the game's, for as
long as the scene is loaded; components of the scene see both, the scene's first. When the scene goes, its container
goes with it, and the singletons it made are disposed (`Dispose()` when they have one).

```ts
export const ArenaScene: SceneManifest = {
	id: "arena",
	// ...
	installer: new ArenaInstaller(), // e.g. Bind( IWaveSpawner ).To( ArenaWaves ).AsSingle()
	entities: [ /* ... */ ],
};
```

Sources: `Modules/Common/DI` (`@cse/di`: contracts, builder, container, `@Inject`), `Core/Source/Engine/DI` (the engine's
contracts, its installer, the game's containers).

← [19. DataStream](19-datastream.md) · Next → [21. Tasks](21-tasks.md)
