**English** | [Русский](../../ru/guides/18-csharp-scripting.md)

# 18. Components in C#

A component can be written in C# as well as in TypeScript, and both kinds sit on the same entities, side by side. C# is
the choice for code that should not be easy to read back from the shipped game: a published game's C# is compiled to
WebAssembly machine code with the IL stripped, where TypeScript ships as (minified) JavaScript.

Every template has an example: Blank's `BallWatcher` (C#) and `LandingToast` (TypeScript), FirstPerson's
`TriggerTally`, ThirdPerson's `WalkMilestones`, TopDown's `VisitTimer`, Coin Hunt's `StreakTracker`.

## A C# component

The project's C# lives in `Source/**/*.cs`; the `.csproj` at the project's root (every template has one,
`TemplateProject.csproj`) builds it. A component is a public class deriving from `CSEngine.Component` with a
parameterless constructor:

```csharp
// Templates/Blank/Source/Scripts/BallWatcher.cs
using CSEngine;

using FastMath;

namespace TemplateProject;

/// <summary>What "Ball.Landed" carries: TypeScript sees it as { Count, Height }.</summary>
public sealed record Landing( int Count, float Height );

public sealed class BallWatcher : Component
{
	/// <summary>Set from the scene (CSharp( "BallWatcher", { HudKey: ... } )).</summary>
	public string HudKey = "ball.height";

	private int _landings;
	private float _highest;

	public override void OnUIUpdate( float dt )
	{
		float height = Transform.Position.Y;
		_highest = FMath.Max( _highest, height );
		Engine.Ui.SetHud( HudKey, $"Ball height: {height:0.0} m" );
	}

	public override void OnCollisionEnter( Entity other )
	{
		if ( other.Name != "Ground" )
		{
			return;
		}
		_landings++;
		Engine.Stream.Publish( "Ball.Landed", new Landing( _landings, _highest ) );
		_highest = 0;
	}
}
```

The hooks are the TypeScript ones (guide 03), with the same meaning and order: `Awake`, `Start`, `OnInputUpdate`,
`Update`, `OnUIUpdate`, `OnPhysicsUpdate`, `OnCollisionEnter/Exit`, `OnTriggerEnter/Exit`, `OnEnable`, `OnDisable`,
`OnDestroy`. Through `Engine` a component reaches:

| | |
|---|---|
| `Engine.Stream` | the DataStream shared with TypeScript (guide 19) |
| `Engine.Time` | `Delta`, `Elapsed`, `FrameCount`, `PhysicsStepCount` |
| `Engine.Ui` | `Toast(text)`, `SetHud(key, text)` |
| `Engine.Log` | `Info`, `Warning`, `Error` (the engine's log) |
| `Engine.Input` | the actions: `IsActionDown`, `ActionJustPressed`, `ActionValue`, `MoveVector` (also the `input` of `OnInputUpdate`) |
| `Engine.World` | the entities C# knows: `Find(name)`, `Get(id)` |

`Transform.Position` and `Transform.Rotation` (`System.Numerics`) are the entity's: kept in step with TypeScript
around every phase, and what C# changes goes back after it. `Entity.Destroy()` destroys the entity at the end of the
phase; `Entity.GetComponent<T>()` finds another C# component on it. For math, the engine's `FastMath` (`FMath`) is there
as in the engine's own code.

## Putting it in a scene

```ts
// Templates/Blank/Source/Scenes/BouncingBallScene.ts
import { CSharp } from "@cse/core/Engine/Components/CSharp";

Ent( "Ball", [
	Comp( MeshRenderer, { Mesh: MeshForShape( BallShape ), Color: [0.95, 0.6, 0.2] } ),
	Comp( RigidBody, { Shape: BallShape, Mass: 1, Layer: CollisionLayer.Prop } ),
	Comp( JumpOnSpace, { Impulse: 6 } ),
	// written in C#: Source/Scripts/BallWatcher.cs
	CSharp( "BallWatcher", { HudKey: "ball.height" } ),
], { position: [0, 5, 0] } ),
```

`CSharp( "Class", { Field: value } )` names the class (its full name when two share one) and gives its public fields
and properties their values before `Awake`, the way `Comp` does for a TypeScript component. In each phase the C#
components run **after** the TypeScript ones, in manifest order among themselves.

## Talking to TypeScript

C# and TypeScript talk in two ways. For calls - a question that needs an answer, a command - a component asks for a
**contract** both languages know (`[FromTypeScript]` in C#, `@FromCSharp` in TypeScript, declared in a `.contract`
file): guide 22. For news anyone may listen to, they publish and subscribe on DataStream tags (guide 19). A message is a plain C# class, struct or record on this side and a plain object on the other, so there is
no marshalling to write:

```ts
// Templates/Blank/Source/Scripts/LandingToast.ts - listens to the C# BallWatcher
export interface Landing { Count: number; Height: number; }

export class LandingToast extends Component {
	private _landed: Subscription | null = null;

	public override Start(): void {
		this._landed = this.Engine.Stream.Subscribe<Landing>( "Ball.Landed", ( landing ) =>
			this.Engine.Ui.Toast( `Landing ${ landing.Count }, from ${ landing.Height.toFixed( 1 ) } m` ) );
	}

	public override OnDestroy(): void {
		this._landed?.Dispose();
	}
}
```

The other way round works the same: TopDown's TypeScript `VisitPad` publishes `"Pad.Visited"`, and the C# `VisitTimer`
subscribes with `Engine.Stream.Subscribe<PadVisit>( "Pad.Visited", OnVisit )`, `PadVisit` being a C# record with the same
field names.

## Building and running

Nothing to do by hand. `pnpm dev` builds the scripts (Debug, quick) when it starts and again when a `.cs` file changes,
then reloads the page; `pnpm build` publishes them (Release: AOT-compiled, IL stripped, gzipped) into the site's
`scripts-wasm/`. A project without a `.csproj` loads no .NET runtime at all. If the scripts do not build, the error is
in the dev server's output and the game runs without its C# components (each one says so in the log).

Requirements: the .NET 10 SDK with `dotnet workload install wasm-tools` (the same as for the physics).

## In the editor

A project made from a template has `.cse/Engine.props` telling its `.csproj` where the engine is (written when it is
created; the VSCodium extension, `Tools/CSEngineSupport`, keeps it up to date when `cse.enginePath` changes). With a C#
extension installed, the project's C# sees the engine's library: completion, go to definition, no red underlines. The
templates inside the repository find the engine around them. The project's `.editorconfig` is the engine's code style
(the same rules as the TypeScript: tabs, spaces inside parentheses, braces always).

## How it works

```
GameLogic worker: TypeScript components ── per phase, one call ──▶ .NET (ScriptHost): C# components
                  (CSharpComponent)       commands: create, lifecycle, events, transforms, input, DataStream batch
                                       ◀── results: moved transforms, DataStream batch, HUD, toasts, logs, destroys
```

`CSharpComponent` (the TypeScript side of a C# component) queues its entity's lifecycle and events; once per phase,
after the TypeScript components, `ScriptRuntime` sends them to the .NET runtime in one MessagePack batch with the
transforms of the entities that have C# components, and applies the answer. A component that throws is reported (class
and entity) and the others keep running. Sources: `Modules/Scripting` (C#: `CSharp/`, the build: `Sdk/`, TypeScript:
`Source/`), `Core/Source/Engine/Components/CSharp.ts`, `Core/BuildTools/ScriptsWasmPlugin.ts`.

Next → [19. DataStream](19-datastream.md)
