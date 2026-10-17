**English** | [Русский](../../ru/guides/22-contracts.md)

# 22. Contracts: C# and TypeScript through DI

A **contract** is an interface both languages know. You declare it once, in a `.contract` file; the engine writes the
TypeScript and the C# of it next to the file. Either language can implement it, and either can call it: a TypeScript
component calls a C# component as if it were TypeScript, and the other way round, with no thought about marshalling.
Both runtimes share one thread, so a call is a plain synchronous call.

The DataStream (guide 19) is for news nobody has to answer ("a coin was collected"). A contract is for questions and
commands ("how many coins are left?", "add 10 points").

## The contract language

```
// Source/Contracts/CoinHunt.contract
namespace TemplateProject;

/// The round, kept by GameRules (TypeScript).
contract IRound {
    /// Coins still to find.
    CoinsLeft(): int;
    SecondsLeft(): double;
}

/// The streaks, counted by StreakTracker (C#).
contract IStreaks {
    Best(): int;
}

struct Hit { Damage: float; At: vec3; Tags: string[]; By: string?; }
enum Team { Red, Blue = 5 }
```

| | |
|---|---|
| `contract` | methods: `Name( param: type, ... ): type;` (no `: type` - nothing is returned) |
| `struct` | fields: `Name: type;` - plain data, passed by value |
| `enum` | members, optionally `= number` |
| types | `bool`, `int`, `float`, `double`, `string`, `bytes`, `vec3`, `quat`, a struct, an enum; `T[]` an array, `T?` may be null |
| `namespace X.Y;` | the C# namespace, and the prefix of the names (`TemplateProject.IRound`) both sides agree on |
| `///` | documentation, carried into both languages |

Parameters start with a small letter; names ending with `_` are kept for the generated code. A contract can't be a
value (a parameter or a field): implementations are reached through DI. Files see each other: a struct of one file can
be used in another.

| Contract type | TypeScript | C# |
|---|---|---|
| `int`, `float`, `double` | `number` | `int`, `float`, `double` |
| `string`, `bool`, `bytes` | `string`, `boolean`, `Uint8Array` | `string`, `bool`, `byte[]` |
| `vec3`, `quat` | `Vec3`, `Quat` (the engine's) | `Vector3`, `Quaternion` |
| struct | an interface (and `NameWire`, how it crosses) | a class |
| `T?` | `T \| null` | `T?` |

The engine compiles every `.contract` under `Source/` when the game starts building, and again whenever one changes
while `pnpm dev` runs: `Name.contract.ts` (and `Name.contract.cs` with C# scripts) appear next to it. Don't edit them.
A mistake is reported with its place - `Source/Contracts/CoinHunt.contract:4:9: Unknown type "Hits"` - fails a build
and shows in the browser in development. The VS Code extension highlights the files.

## Calling C# from TypeScript: `@FromCSharp`

```ts
import { FromCSharp, Implements } from "@cse/scripting";
import { IRound, IStreaks } from "../Contracts/CoinHunt.contract.ts";

@Implements( IRound )
export class GameRules extends Component implements IRound {
	// the C# StreakTracker on this entity
	@FromCSharp( IStreaks ) private readonly _streaks!: IStreaks;

	public CoinsLeft(): number { return this.Total - this.Collected; }
	public SecondsLeft(): number { return this.TimeLeft; }

	private Won(): void {
		this._toasts.Toast( `Best streak: x${ this._streaks.Best() }` );
	}
}
```

`@FromCSharp( IStreaks )` fills the field with the C# implementation: a C# component **of the same entity** that
implements `IStreaks`, else what the game's C# container binds to it. It is looked up on every call, so the component
can come and go. Without the C# scripts (none, or they failed to load) the field is still filled and the component runs;
each call then throws, saying why.

## Calling TypeScript from C#: `[FromTypeScript]`

```csharp
using CSEngine;
using CSEngine.Bridge;
using CSEngine.DI;

public sealed class StreakTracker : Component, IStreaks
{
	[Inject]
	private readonly IStreakWording _wording = null!;   // a C# service (below)

	[FromTypeScript]
	private readonly IRound _round = null!;             // GameRules, on this entity

	private int _best;

	public int Best() => _best;                         // IStreaks: TypeScript calls it

	private void OnCoin( CoinCollected coin )
	{
		...
		Engine.Ui.Toast( _wording.Announce( _streak, _round.CoinsLeft() ) );
	}
}
```

`[FromTypeScript]` is the mirror: a TypeScript component of the same entity marked `@Implements( IRound )` (the class
must implement the interface - the compiler checks), else what the game's TypeScript container binds. A C# component
needs nothing to be found: implementing the interface is enough.

## DI in C#

C# has its own container, with the same API as the TypeScript one (guide 20):

```csharp
public sealed class CoinHuntInstaller : Installer
{
	public override void InstallBindings( ContainerBuilder builder )
	{
		builder.Bind<IStreakWording>().To<StreakWording>().AsSingle();
		builder.Bind<IRound>().FromTypeScript();      // what TypeScript's container binds
	}
}
```

Every public `Installer` with a parameterless constructor in the game's C# is found and installed (each class once).
The engine binds its own first: `ScriptEngine`, its `World`, `Ui`, `Log`, `TimeInfo`, `Input`, `DataStream` and the
`ScriptBridge`. `[Inject]` fields and properties of a C# component are filled before its `Awake`; a field nothing is
bound to is reported for the component, which still runs. `Bind<T>()`, `To<TImpl>()`, `FromInstance`, `FromFactory`,
`AsSingle`, `AsTransient`, `NonLazy`, `Install`, `Resolve`, `TryResolve`, `Has`, `Inject`, `CreateChild` - as in
TypeScript.

## Mixing in installers

Either container can hold the other language's implementation, so a contract is used by plain `@Inject` / `[Inject]`
wherever it is implemented:

```ts
// TypeScript: IStreaks is implemented in C#
builder.Bind( IStreaks ).FromCSharp();
```

```csharp
// C#: IRound is implemented in TypeScript
builder.Bind<IRound>().FromTypeScript();
```

Then `@Inject( IStreaks )` in any TypeScript component resolves to C#'s binding of `IStreaks`, and `[Inject] IRound`
in C# to TypeScript's.

## How it works

A call is a MessagePack array `[contract, entity, method, args]`, answered with `[true, value]` or `[false, error]`
(an exception on the other side becomes an exception here: `C# TemplateProject.IStreaks: ...`). In the browser the
message crosses through memory both runtimes share: C# keeps a pinned block of slots (one per depth of nesting each way,
`SharedSlots`), TypeScript writes the request into the WebAssembly heap and calls `ScriptExports.CallSlot( depth,
length )` (`[JSExport]`); C# reads it in place and writes the answer back into the slot. C# calls TypeScript the same
way through a `[JSImport]` of the runtime's `cse-bridge` module. No array is copied or made per call; a message larger
than a slot (64 KB) takes the byte array way. A call costs about 1.4 microseconds each way on the target laptop.

Before a call into C# the engine sends the C# commands queued this frame, so a C# component made
this frame already exists there. Structs cross as arrays of their fields, `vec3` as `[x, y, z]`. The generated code
does the conversion; no reflection is involved (it runs AOT-compiled).

A call costs an encode and a decode on each side (microseconds): fine for gameplay logic, not for thousands of calls
per frame - batch those into one method taking an array.

Sources: `Modules/Scripting/Source/Contracts` (the compiler), `Modules/Scripting/Source/Bridge.ts` and
`CSharp/Bridge` (the two ends), `Modules/Common/DI/DotNet` (C# DI), `Core/BuildTools/ContractsPlugin.ts` (the build),
`Templates/CoinHunt` (the example).

← [21. Tasks](21-tasks.md) · Next → [23. Performance](23-performance.md)
