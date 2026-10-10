# 12. Модули: как в Unreal Engine

Движок, игра и инструменты собираются из модулей. Модуль - класс с `StartupModule` / `ShutdownModule`, описанный
дескриптором (имя, тип, фаза загрузки, зависимости). Его код подключается динамическим `import()`, поэтому Vite кладёт
модуль в отдельный файл, и браузер скачивает его только тогда, когда модуль загружается. Главный модуль - игра.

Код: `Source/Engine/Modules/ModuleManager.ts` (модули), `Source/Engine/Modules/Plugins.ts` (плагины, проект),
`Source/Project.ts` (проект этого репозитория).

## Соответствие Unreal

| Unreal | Здесь |
|---|---|
| `IModuleInterface` | класс `ModuleInterface`: `StartupModule`, `ShutdownModule`, `PostLoadCallback`, `PreUnloadCallback`, `SupportsDynamicReloading`, `IsGameModule` |
| `FDefaultGameModuleImpl` | `GameModule` |
| `IMPLEMENT_PRIMARY_GAME_MODULE` | `Primary: true` в дескрипторе; `ModuleManager.Get().PrimaryGameModule` |
| `FModuleManager::Get()` | `ModuleManager.Get()` - свой в каждом потоке (воркере), как свой в каждом процессе |
| `LoadModule`, `LoadModuleChecked`, `LoadModuleWithFailureReason` | те же имена; загрузка асинхронная (`await`) |
| `GetModule`, `GetModuleChecked`, `IsModuleLoaded`, `QueryModule(s)`, `UnloadModule` | те же имена |
| `OnModulesChanged` | событие `modules-changed` (`ModuleLoaded`, `ModuleUnloaded`) |
| `EModuleLoadResult` | `ModuleLoadResult`: `FileNotFound`, `FileIncompatible`, `CouldNotBeLoadedByOS`, `FailedToInitialize` |
| `ELoadingPhase` | `LoadingPhase`: `EarliestPossible` ... `PostEngineInit`, `None` - только по требованию |
| `EHostType` | `ModuleType`: `Runtime`, `Editor`, `Developer` |
| `PublicDependencyModuleNames` | `Dependencies` |
| `.uplugin`, `IPluginManager` | `PluginDescriptor`, `PluginManager` |
| `.uproject` | `ProjectDescriptor` |

## Свой модуль

```ts
// Source/Game/InventoryModule.ts
export default class InventoryModule extends ModuleInterface {
	public readonly Items = new ItemDatabase();
	public override StartupModule(): void { /* регистрирует то, что модуль даёт */ }
	public override ShutdownModule(): void { /* отменяет StartupModule */ }
}

// Source/Project.ts - в Modules проекта (или в Modules плагина)
{ Name: "Inventory", Type: ModuleType.Runtime, LoadingPhase: LoadingPhase.None, Dependencies: ["Engine"],
  Load: () => import("./Game/InventoryModule") }

// где он нужен
const inventory = await ModuleManager.Get().LoadModuleChecked<InventoryModule>("Inventory");
```

Модуль получает то, что дают другие модули, так же, как в Unreal: `ModuleManager.Get().GetModuleChecked<EngineModule>("Engine")`.
Так главный модуль игры (`Source/Game/GamesSampleModule.ts`) регистрирует свои сцены в модуле движка.

## Загрузка

- При старте `InitEngine(проект, плагины)` регистрирует модули проекта и включённых плагинов и проходит фазы по
  порядку. Модуль с фазой `None` сам не загружается - только `LoadModule`.
- Зависимости грузятся раньше модуля, даже если их фаза позже. Цикл зависимостей распознаётся и называется:
  `Circular dependency: A -> B -> A`.
- Цель сборки: в игре (`BuildTarget.Game`) модули `Editor` не грузятся, `Developer` - только в отладочной сборке;
  в редакторе (`BuildTarget.Editor`) грузится всё.
- Выгрузить нельзя модуль, от которого зависит загруженный, и модуль с `SupportsDynamicReloading() === false`
  (так устроен модуль `Engine`).
- Одновременные `LoadModule` одного модуля ждут одну и ту же загрузку.

## Потоки

Движок работает в нескольких потоках (страница и воркеры), и у каждого свой `ModuleManager` - как у каждого процесса
в Unreal. Поле `Thread` дескриптора говорит, где модуль работает: `GameLogic` (по умолчанию - игра, сцены, скрипты),
`Main` (страница: DOM, Vue, то, что рисуется поверх игры) или `Any` (модуль `Engine`). Менеджер потока грузит только
свои модули; чужие при старте пропускает, а на явный `LoadModule` отвечает причиной
(`Host runs on the Main thread, not GameLogic`). Страница поднимает свой менеджер (`ModuleManager.Initialize`) до
запуска воркеров.

## Каналы между потоками

Половинки плагина в разных потоках разговаривают через `Channels` модуля `Engine` (`Core/Source/Engine/Core/Channels.ts`):

```ts
const channels = ModuleManager.Get().GetModuleChecked<EngineModule>("Engine").Channels;
channels.Post("ui", { op: "show", id: "Hud" });           // в другой поток
const off = channels.On("ui", (payload) => { /* ... */ }); // из другого потока
```

Движок не знает, что внутри сообщений: он только переносит их (игровой воркер <-> UI-воркер <-> страница). То, что
отправлено до подключения потока, ждёт и уходит по порядку.

## Плагины и проект

Плагин - именованный набор модулей с версией. `EnabledByDefault` включает его, если проект не выключил; проект
перечисляет нужные плагины (`{ Name, Enabled }`); плагин может требовать другие плагины - они включаются раньше.
Чего не хватает, `InitEngine` возвращает списком, и поток игры пишет это в лог, а не падает.

## Что уже модули

- `Engine` - сервисы движка (реестр сцен); фаза `EarliestPossible`.
- `GamesSample` - главный модуль игры; фаза `Default`.

Дальше в модули переезжают тулкит, редактор интерфейсов и редактор кода (тип `Editor`, загрузка по требованию).
