[English](../../en/guides/18-csharp-scripting.md) | **Русский**

# 18. Компоненты на C#

Компонент можно написать не только на TypeScript, но и на C#, и оба вида живут на одних и тех же сущностях бок о бок.
C# выбирают для кода, который не должен легко читаться из готовой игры: в опубликованной игре C# скомпилирован в
машинный код WebAssembly без IL, а TypeScript поставляется (минифицированным) JavaScript.

Пример есть в каждом шаблоне: в Blank — `BallWatcher` (C#) и `LandingToast` (TypeScript), в FirstPerson — `TriggerTally`,
в ThirdPerson — `WalkMilestones`, в TopDown — `VisitTimer`, в Coin Hunt — `StreakTracker`.

## Компонент на C#

C#-код проекта лежит в `Source/**/*.cs`, собирает его `.csproj` в корне проекта (он есть в каждом шаблоне,
`TemplateProject.csproj`). Компонент — публичный класс, наследник `CSEngine.Component`, с конструктором без параметров:

```csharp
// Templates/Blank/Source/Scripts/BallWatcher.cs
using CSEngine;

using FastMath;

namespace TemplateProject;

/// <summary>Что несёт "Ball.Landed": TypeScript видит это как { Count, Height }.</summary>
public sealed record Landing( int Count, float Height );

public sealed class BallWatcher : Component
{
	/// <summary>Задаётся из сцены (CSharp( "BallWatcher", { HudKey: ... } )).</summary>
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

Хуки те же, что в TypeScript (руководство 03), с тем же смыслом и в том же порядке: `Awake`, `Start`, `OnInputUpdate`,
`Update`, `OnUIUpdate`, `OnPhysicsUpdate`, `OnCollisionEnter/Exit`, `OnTriggerEnter/Exit`, `OnEnable`, `OnDisable`,
`OnDestroy`. Через `Engine` компоненту доступны:

| | |
|---|---|
| `Engine.Stream` | DataStream, общий с TypeScript (руководство 19) |
| `Engine.Time` | `Delta`, `Elapsed`, `FrameCount`, `PhysicsStepCount` |
| `Engine.Ui` | `Toast(text)`, `SetHud(key, text)` |
| `Engine.Log` | `Info`, `Warning`, `Error` (журнал движка) |
| `Engine.Input` | действия: `IsActionDown`, `ActionJustPressed`, `ActionValue`, `MoveVector` (это же `input` в `OnInputUpdate`) |
| `Engine.World` | сущности, известные C#: `Find(name)`, `Get(id)` |

`Transform.Position` и `Transform.Rotation` (`System.Numerics`) — это положение сущности: оно синхронизируется с
TypeScript вокруг каждой фазы, а то, что поменял C#, уходит обратно после неё. `Entity.Destroy()` уничтожает сущность в
конце фазы, `Entity.GetComponent<T>()` находит на ней другой C#-компонент. Для математики есть `FastMath` (`FMath`)
движка — как в коде самого движка.

## Как поставить его в сцену

```ts
// Templates/Blank/Source/Scenes/BouncingBallScene.ts
import { CSharp } from "@cse/core/Engine/Components/CSharp";

Ent( "Ball", [
	Comp( MeshRenderer, { Mesh: MeshForShape( BallShape ), Color: [0.95, 0.6, 0.2] } ),
	Comp( RigidBody, { Shape: BallShape, Mass: 1, Layer: CollisionLayer.Prop } ),
	Comp( JumpOnSpace, { Impulse: 6 } ),
	// написан на C#: Source/Scripts/BallWatcher.cs
	CSharp( "BallWatcher", { HudKey: "ball.height" } ),
], { position: [0, 5, 0] } ),
```

`CSharp( "Класс", { Поле: значение } )` называет класс (полным именем, если короткое совпадает у двух) и до `Awake`
задаёт значения его публичных полей и свойств — так же, как `Comp` для компонента на TypeScript. В каждой фазе
C#-компоненты выполняются **после** компонентов на TypeScript, а между собой — в порядке манифеста.

## Как говорить с TypeScript

C# и TypeScript общаются двумя способами. Для вызовов — вопроса, на который нужен ответ, или команды — компонент
запрашивает **контракт**, который знают оба языка (`[FromTypeScript]` в C#, `@FromCSharp` в TypeScript; объявлен в файле
`.contract`): руководство 22. Для новостей, которые может слушать кто угодно, они публикуют сообщения в теги DataStream и
подписываются на них (руководство 19). Сообщение на этой стороне — обычный класс, структура или record C#, на той —
обычный объект, так что писать маршаллинг не нужно:

```ts
// Templates/Blank/Source/Scripts/LandingToast.ts — слушает C#-компонент BallWatcher
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

В обратную сторону всё так же: в TopDown `VisitPad` на TypeScript публикует `"Pad.Visited"`, а `VisitTimer` на C#
подписывается через `Engine.Stream.Subscribe<PadVisit>( "Pad.Visited", OnVisit )`, где `PadVisit` — record C# с теми же
именами полей.

## Сборка и запуск

Руками ничего делать не нужно. `pnpm dev` собирает скрипты (Debug, быстро) при старте и заново при изменении любого
`.cs`, после чего перезагружает страницу; `pnpm build` публикует их (Release: AOT-компиляция, IL вырезан, gzip) в
`scripts-wasm/` сайта. Проект без `.csproj` вообще не загружает рантайм .NET. Если скрипты не собрались, ошибка будет в
выводе dev-сервера, а игра запустится без своих C#-компонентов (каждый сообщит об этом в журнал).

Нужно: .NET 10 SDK и `dotnet workload install wasm-tools` (то же, что для физики).

## В редакторе

У проекта, созданного из шаблона, есть `.cse/Engine.props`: он говорит `.csproj`, где лежит движок (пишется при
создании, а расширение для VSCodium, `Tools/CSEngineSupport`, обновляет его при смене `cse.enginePath`). С установленным
расширением для C# код проекта видит библиотеку движка: автодополнение, переход к определению, без красного
подчёркивания. Шаблоны внутри репозитория находят движок вокруг себя. `.editorconfig` проекта — это стиль кода движка
(те же правила, что и для TypeScript: табы, пробелы внутри скобок, фигурные скобки всегда).

## Как это устроено

```
Воркер GameLogic: компоненты TypeScript ── за фазу один вызов ──▶ .NET (ScriptHost): компоненты C#
                  (CSharpComponent)       команды: создание, жизненный цикл, события, трансформы, ввод, пачка DataStream
                                       ◀── результаты: сдвинутые трансформы, пачка DataStream, HUD, тосты, журнал, уничтожения
```

`CSharpComponent` (TypeScript-сторона компонента на C#) копит жизненный цикл и события своей сущности; раз за фазу,
после компонентов TypeScript, `ScriptRuntime` отправляет их в рантайм .NET одной пачкой MessagePack вместе с
трансформами сущностей, у которых есть C#-компоненты, и применяет ответ. Компонент, бросивший исключение, попадает в
журнал (класс и сущность), остальные продолжают работать. Исходники: `Modules/Scripting` (C#: `CSharp/`, сборка: `Sdk/`,
TypeScript: `Source/`), `Core/Source/Engine/Components/CSharp.ts`, `Core/BuildTools/ScriptsWasmPlugin.ts`.

Дальше → [19. DataStream](19-datastream.md)
