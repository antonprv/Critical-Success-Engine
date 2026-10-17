[English](../en/ENGINE_ARCHITECTURE.md) | **Русский**

# Архитектура движка

Пять воркеров, одна точка расширения.

```
main thread   DOM-события, отрисовка UiStore (Vue + Quasar), pointer lock, AudioContext
UiWorker      состояние и логика UI (автомат меню / загрузки / паузы)              Workers/Ui/UiController.ts
GameLogic     сущности, компоненты, сцены, состояние ввода, такты кадра и физики   Engine/Runtime/GameLogicRuntime.ts
PhysicsWorker CSPhysics через wasm: цикл фиксированного шага, выполнение команд, снимки Workers/Physics/PhysicsWorld.ts
RenderWorker  Babylon на OffscreenCanvas, протокол frame-request/frame            Workers/RenderWorker.ts
AudioWorker   декодирование звука; воспроизведение идёт в главном потоке (AudioPlayer)
```

C# есть только для физического движка и его моста (`Modules/Physics/Bridge/PhysicsBridge.cs`). Всё остальное - TypeScript.

## Скриптинг: сущности, компоненты, манифесты

Сцена - это данные: список сущностей, каждая - список компонентов (`Engine/Core/EntityManifest.ts`):

```ts
export const MyScene: SceneManifest = {
  id: "my-scene", name: "My scene", description: "...",
  gravity: [0, -20, 0],
  entities: [
    StaticBox("Floor", [20, 1, 20], [0, -0.5, 0], [0.5, 0.5, 0.5]),
    Ent("Ball", [
      Comp(MeshRenderer, { Mesh: Meshes.Sphere(0.5) }),
      Comp(RigidBody, { Shape: Shapes.Sphere(0.5), Mass: 1 }),
      Comp(JumpOnSpace),
    ], { position: [0, 5, 0] }),
  ],
};
```

Зарегистрируйте её в `StartupModule` главного модуля проекта (`Scenes.Register(MyScene)`, гайд 02) - и она появится в меню паузы.

Компонент - это класс (`Engine/Core/Component.ts`); простые публичные поля - то, что выставляет `Comp(Type, props)`:

| Хук | Когда |
|---|---|
| `Awake` | один раз, после создания всей партии (сцены) - другие сущности уже существуют |
| `Start` | один раз, перед первым Update / OnPhysicsUpdate этого компонента |
| `OnInputUpdate(input, dt)`, `Update(dt)`, `OnUIUpdate(ui, dt)` | каждый отрисованный кадр, именно в таком порядке |
| `OnPhysicsUpdate(dt)` | каждый фиксированный шаг физики |
| `OnCollisionEnter/Exit(other)`, `OnTriggerEnter/Exit(other)` | когда шаг сообщает о начале/конце перекрытия |
| `OnDestroy` | `entity.Destroy()` (в конце текущего прохода) или выгрузка сцены |

Сущности обходятся в порядке создания, компоненты каждой сущности - сверху вниз (в порядке манифеста) - например, `PlatformMover`
должен стоять до `KinematicBody`, потому что тело передаёт ту позу, которая в этот момент лежит в Transform.
Скрипт, бросивший исключение, пишется в лог и пропускается; кадр он не валит.

Встроенные компоненты: `MeshRenderer`, `StaticBody`, `RigidBody`, `KinematicBody`, `TriggerArea`, `SimpleTriggerArea`,
`Projectile`, `CharacterBody`, `MoverComponent` (+ все пресеты и трейты движения), `CameraComponent` (от первого/третьего лица с
пружинной штангой), `FixedCamera`, `Follower`.

### Компоненты на C# и DataStream

Компонент может быть и на C# (`CSharp( "Класс", поля )`, руководство 18). Его TypeScript-сторона, `CSharpComponent`,
копит жизненный цикл и события сущности; после компонентов TypeScript каждой фазы (ввод, обновление, UI, шаг физики)
`ScriptRuntime` отправляет их вместе с трансформами сущностей, у которых есть C#-компоненты, и сообщениями DataStream
для C# в рантайм .NET скриптов проекта (он загружается в воркере GameLogic) **одним** вызовом MessagePack и применяет
результаты. Компоненты на C# и TypeScript встречаются двумя способами: на тегах DataStream (`EngineContext.Stream`,
руководство 19; связь переносит сообщение только в теги, на которые подписана другая сторона) и через **контракты**
(руководство 22) — интерфейсы, объявленные один раз в файлах `.contract` и скомпилированные в оба языка
(`Modules/Scripting/Source/Contracts`, `Core/BuildTools/ContractsPlugin.ts`). Контракт реализуется на одной стороне и
синхронно вызывается с другой (`ScriptBridge`: `[JSExport] Call` в одну сторону, `[JSImport]` в другую). У каждой
стороны свой DI-контейнер; `@FromCSharp` / `[FromTypeScript]` и привязки `FromCSharp()` / `FromTypeScript()` находят
реализацию другой стороны — сначала компонент той же сущности, затем её контейнер.

## Граница физики

`PhysicsService` (GameLogic) собирает команды в пачку (один postMessage за такт) и зеркалит последний снимок;
`PhysicsWorld.ts` (воркер физики) выполняет их через мост. Тела везде адресуются по id сущности; хендлы моста
никогда не покидают воркер физики. Запросы (`SweepSphere`, `SweepProjectile`, `IsAwake`) возвращают промисы.

Контроллер персонажа разделён по той же линии, что и в проекте на Godot: проверка collide-and-slide и перенос
движущейся платформой выполняются в воркере физики прямо перед шагом; мотор (трейты, прыжок, гравитация) работает в
`MoverComponent.OnPhysicsUpdate`. Результат проверки приходит со следующим снимком, поэтому контроллер всегда реагирует на
состояние пола и срезанную скорость предыдущего хода - та же последовательность значений, что у синхронного вызова в Godot.

## Переключение сцен

`SceneManager.Load`: уничтожить сущности -> `ResetWorld` + `ClearScene` -> дождаться обоих подтверждений (порты работают по FIFO, так что
ничего от старой сцены потом не придёт) -> создать манифест -> Awake/Start -> `load-finished`. Пока идёт загрузка, скрипты и
снимки пропускаются.

## UI

Vue/Quasar нужен DOM, поэтому (как и звук) UI разделён: `UiController` в UiWorker владеет автоматом состояний
(boot -> loading -> awaiting-lock -> playing <-> menu), главный поток только рисует `UiState` (`Ui/*.vue`) и пересылает
`pointerlockchange`. Esc -> браузер снимает pointer lock -> меню. Выбор сцены -> экран загрузки -> по завершении
UI снова просит pointer lock; если браузер отказывает (нет свежего жеста / пауза после Esc), в меню остаётся
«Play», и один щелчок возвращает управление.
