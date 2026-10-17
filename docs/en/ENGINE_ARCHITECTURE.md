**English** | [Русский](../ru/ENGINE_ARCHITECTURE.md)

# Engine architecture

Five workers, one extension point.

```
main thread   DOM events, Vue + Quasar rendering of UiStore, pointer lock, AudioContext
UiWorker      UI state + logic (menu / loading / pause state machine)           Workers/Ui/UiController.ts
GameLogic     entities, components, scenes, input state, frame + physics clocks  Engine/Runtime/GameLogicRuntime.ts
PhysicsWorker CSPhysics via wasm: fixed-step loop, command execution, snapshots       Workers/Physics/PhysicsWorld.ts
RenderWorker  Babylon on an OffscreenCanvas, frame-request/frame protocol         Workers/RenderWorker.ts
AudioWorker   sound decoding; playback happens on the main thread (AudioPlayer)
```

C# exists only for the physics engine and its bridge (`Modules/Physics/Bridge/PhysicsBridge.cs`). Everything else is TypeScript.

## Scripting: entities, components, manifests

A scene is data - a list of entities, each a list of components (`Engine/Core/EntityManifest.ts`):

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

Register it in the `StartupModule` of the project's main module (`Scenes.Register(MyScene)`, guide 02) and it shows up in the pause menu.

A component is a class (`Engine/Core/Component.ts`); plain public fields are what `Comp(Type, props)` sets:

| Hook | When |
|---|---|
| `Awake` | once, after the whole batch (scene) has been created - other entities exist |
| `Start` | once, before the first Update / OnPhysicsUpdate of that component |
| `OnInputUpdate(input, dt)`, `Update(dt)`, `OnUIUpdate(ui, dt)` | every rendered frame, in that order |
| `OnPhysicsUpdate(dt)` | every fixed physics step |
| `OnCollisionEnter/Exit(other)`, `OnTriggerEnter/Exit(other)` | when a step reports an overlap starting/ending |
| `OnDestroy` | `entity.Destroy()` (end of the current pass) or scene unload |

Entities are visited in spawn order, each entity's components top to bottom (manifest order) - e.g. `PlatformMover`
must be listed before `KinematicBody`, because the body pushes whatever pose the Transform has at that moment.
A script that throws is logged and skipped; it does not take the frame down.

Built-in components: `MeshRenderer`, `StaticBody`, `RigidBody`, `KinematicBody`, `TriggerArea`, `SimpleTriggerArea`,
`Projectile`, `CharacterBody`, `MoverComponent` (+ all movement presets/traits), `CameraComponent` (first/third person with
spring arm), `FixedCamera`, `Follower`.

### C# components and the DataStream

A component can also be C# (`CSharp( "Class", fields )`, guide 18). Its TypeScript side, `CSharpComponent`, queues the
entity's lifecycle and events; after each phase's TypeScript components (input, update, UI, physics step),
`ScriptRuntime` sends them, with the transforms of the entities that have C# components and the DataStream's messages
for C#, to the .NET runtime of the project's scripts (loaded in the GameLogic worker) in **one** MessagePack call, and
applies the results. C# and TypeScript components meet in two ways: on DataStream tags (`EngineContext.Stream`,
guide 19; a link carries a message only to tags the other side subscribes to), and through **contracts** (guide 22):
interfaces declared once in `.contract` files, compiled into both languages (`Modules/Scripting/Source/Contracts`,
`Core/BuildTools/ContractsPlugin.ts`), implemented on either side and called synchronously from the other
(`ScriptBridge`: `[JSExport] Call` one way, a `[JSImport]` the other). Each side has a DI container; `@FromCSharp` /
`[FromTypeScript]` and the bindings `FromCSharp()` / `FromTypeScript()` reach the other side's implementation - a
component of the same entity first, then the other container.

## Physics boundary

`PhysicsService` (GameLogic) batches commands (one postMessage per tick) and mirrors the latest snapshot;
`PhysicsWorld.ts` (physics worker) executes them against the bridge. Bodies are addressed by entity id everywhere; bridge
handles never leave the physics worker. Queries (`SweepSphere`, `SweepProjectile`, `IsAwake`) return promises.

The character controller is split along the same line as in the Godot project: the collide-and-slide sweep and the
moving-platform carry run in the physics worker right before the step; the motor (traits, jump, gravity) runs in
`MoverComponent.OnPhysicsUpdate`. The sweep result comes back with the next snapshot, so the controller always reacts to
the previous move's floor state and clipped velocity - the same sequence of values as the synchronous Godot call.

## Scene switching

`SceneManager.Load`: destroy entities -> `ResetWorld` + `ClearScene` -> wait for both acks (ports are FIFO, so nothing from
the old scene can arrive afterwards) -> spawn manifest -> Awake/Start -> `load-finished`. While loading, scripts and
snapshots are skipped.

## UI

Vue/Quasar need a DOM, so (like audio) the UI is split: `UiController` in UiWorker owns the state machine
(boot -> loading -> awaiting-lock -> playing <-> menu), the main thread only renders `UiState` (`Ui/*.vue`) and forwards
`pointerlockchange`. Esc -> the browser drops the pointer lock -> menu. Choosing a scene -> loading overlay -> on finish the
UI asks for the pointer lock again; if the browser refuses (no recent gesture / post-Esc cooldown) the menu shows
"Play" and one click returns control.
