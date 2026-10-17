[English](../../en/guides/20-dependency-injection.md) | **Русский**

# 20. Внедрение зависимостей (DI)

Компонент просит нужное ему по **контракту** (интерфейсу), а DI-контейнер игры даёт реализацию — ещё до `Awake`
компонента. Компонент не называет реализацию и не лезет за ней в движок: поменяй реализацию в одном инсталлере, и все
компоненты, просящие этот контракт, получат новую. `this.Engine` по-прежнему работает — для быстрых экспериментов;
шаблоны везде используют контракты.

## Как просить: `@Inject`

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

Поля заполняются, когда компонент добавляется на сущность, поэтому в `Awake` они уже есть. Рефлексии нет: `@Inject`
записывает поле один раз, при определении класса, а заполнение — это поиск в массиве по id контракта. Поле, к контракту
которого ничего не привязано, попадает в журнал (`[DI] Класс on "Сущность": Класс.Поле needs IКонтракт, and nothing is
bound to it`), а компонент всё равно работает.

## Контракты движка

`@cse/core/Engine/DI/Contracts` — у каждого интерфейс (публичная поверхность класса движка) и контракт с тем же именем:

| Контракт | Что это |
|---|---|
| `IInputSubsystem` | ввод игрока: действия, клавиши, указатель |
| `IPhysicsSubsystem` | симуляция: тела, запросы |
| `IRenderSubsystem` | рендер |
| `IUiSubsystem` | строки HUD страницы, тосты |
| `IAudioSubsystem` | звук |
| `ISettingsSubsystem` | настройки игры |
| `IStorage` | выбор игрока, сохраняемый между сессиями |
| `IDataAssets` | файлы данных проекта |
| `IScenes` | сцены: текущая, загрузка другой |
| `IWorld` | сущности |
| `ITime` | время кадра и шага |
| `IDataStream` | DataStream (руководство 19) |
| `IGameUi` (`@cse/ui/game`) | плагин UI: UI-документы игры |

## Как связывать: инсталлеры

Свой контракт — это интерфейс и `Contract` с тем же именем:

```ts
import { Contract } from "@cse/di";

export interface IScoreBoard {
	Add( points: number ): void;
}
export const IScoreBoard = Contract<IScoreBoard>( "IScoreBoard" );
```

В каждом шаблоне одна точка входа, `Source/GameInstaller.ts`, которую модуль шаблона ставит при запуске
(`engine.Installers.push( new GameInstaller() )`). Движок сначала связывает свои контракты; инсталлер игры добавляет
остальное и может состоять из других инсталлеров:

```ts
export class GameInstaller extends Installer<EngineContext> {
	public InstallBindings( builder: ContainerBuilder ): void {
		builder.Install( new GameUiInstaller() );          // IGameUi плагина UI
		builder.Install( new EnemiesInstaller() );         // композиция: инсталлер на каждую часть игры
		builder.Bind( IScoreBoard ).To( ScoreBoard ).AsSingle();
	}
}
```

API привязок повторяет Zenjex (то есть Zenject):

| | |
|---|---|
| `Bind( C ).To( Класс )` | экземпляр класса (без аргументов конструктора; его собственные поля `@Inject` заполняются) |
| `Bind( C ).FromInstance( obj )`, `BindInstance( C, obj )` | этот объект (контейнер не будет его освобождать) |
| `Bind( C ).FromFactory( ( container ) => ... )` | то, что вернёт фабрика |
| `.AsSingle()` | один экземпляр, создаётся при первом обращении (по умолчанию) |
| `.AsTransient()` | новый каждый раз |
| `.NonLazy()` | один экземпляр, создаётся при сборке контейнера; вызывается его `Initialize()` |
| `builder.Install( installer, context )` | привязки другого инсталлера (класс инсталлера ставится в контейнер один раз, поэтому общие инсталлеры спокойно комбинируются) |

Привязать контракт дважды — ошибка, как и привязка без источника (`To`, `FromInstance`, `FromFactory`).

Контракт, который знают и TypeScript, и C#, объявляют в файле `.contract`; `Bind( C ).FromCSharp()` привязывает
реализацию на C#, а `@FromCSharp( C )` запрашивает её у C# напрямую: руководство 22.

## Сцены

У сцены могут быть свои привязки: `installer` в её манифесте. Они живут в дочернем контейнере игры, пока сцена
загружена; компоненты сцены видят обе, сначала сценовые. Когда сцена уходит, её контейнер уходит вместе с ней, а
созданные им одиночки освобождаются (`Dispose()`, если он у них есть).

```ts
export const ArenaScene: SceneManifest = {
	id: "arena",
	// ...
	installer: new ArenaInstaller(), // например, Bind( IWaveSpawner ).To( ArenaWaves ).AsSingle()
	entities: [ /* ... */ ],
};
```

Исходники: `Modules/Common/DI` (`@cse/di`: контракты, билдер, контейнер, `@Inject`), `Core/Source/Engine/DI` (контракты
движка, его инсталлер, контейнеры игры).

← [19. DataStream](19-datastream.md) · Дальше → [21. Задачи](21-tasks.md)
