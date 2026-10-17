[English](../../en/guides/22-contracts.md) | **Русский**

# 22. Контракты: C# и TypeScript через DI

**Контракт** — интерфейс, который знают оба языка. Его объявляют один раз, в файле `.contract`, а движок пишет рядом
TypeScript и C# для него. Реализовать контракт может любой язык, и вызвать — тоже любой: TypeScript-компонент вызывает
C#-компонент так, будто тот написан на TypeScript, и наоборот, не думая о маршаллинге. Оба рантайма работают в одном
потоке, поэтому вызов — обычный синхронный вызов.

DataStream (руководство 19) — для новостей, на которые никто не обязан отвечать («монета собрана»). Контракт — для
вопросов и команд («сколько монет осталось?», «добавь 10 очков»).

## Язык контрактов

```
// Source/Contracts/CoinHunt.contract
namespace TemplateProject;

/// Раунд, который ведёт GameRules (TypeScript).
contract IRound {
    /// Сколько монет осталось найти.
    CoinsLeft(): int;
    SecondsLeft(): double;
}

/// Серии, которые считает StreakTracker (C#).
contract IStreaks {
    Best(): int;
}

struct Hit { Damage: float; At: vec3; Tags: string[]; By: string?; }
enum Team { Red, Blue = 5 }
```

| | |
|---|---|
| `contract` | методы: `Имя( параметр: тип, ... ): тип;` (без `: тип` метод ничего не возвращает) |
| `struct` | поля: `Имя: тип;` — простые данные, передаются по значению |
| `enum` | члены, по желанию `= число` |
| типы | `bool`, `int`, `float`, `double`, `string`, `bytes`, `vec3`, `quat`, структура, перечисление; `T[]` — массив, `T?` — может быть null |
| `namespace X.Y;` | пространство имён C# и префикс имён (`TemplateProject.IRound`), о которых договариваются обе стороны |
| `///` | документация, переносится в оба языка |

Параметры начинаются со строчной буквы; имена с `_` на конце зарезервированы за сгенерированным кодом. Контракт не может
быть значением (параметром или полем): до реализаций добираются через DI. Файлы видят друг друга: структуру из одного
файла можно использовать в другом.

| Тип контракта | TypeScript | C# |
|---|---|---|
| `int`, `float`, `double` | `number` | `int`, `float`, `double` |
| `string`, `bool`, `bytes` | `string`, `boolean`, `Uint8Array` | `string`, `bool`, `byte[]` |
| `vec3`, `quat` | `Vec3`, `Quat` (движковые) | `Vector3`, `Quaternion` |
| структура | интерфейс (и `ИмяWire` — как она передаётся) | класс |
| `T?` | `T \| null` | `T?` |

Движок компилирует все `.contract` в `Source/`, когда начинается сборка игры, и снова при каждом изменении, пока идёт
`pnpm dev`: рядом появляются `Имя.contract.ts` (и `Имя.contract.cs`, если есть C#-скрипты). Их не правят руками. Ошибка
сообщается с местом — `Source/Contracts/CoinHunt.contract:4:9: Unknown type "Hits"` — проваливает сборку, а в режиме
разработки видна в браузере. Расширение VS Code подсвечивает эти файлы.

## Вызов C# из TypeScript: `@FromCSharp`

```ts
import { FromCSharp, Implements } from "@cse/scripting";
import { IRound, IStreaks } from "../Contracts/CoinHunt.contract.ts";

@Implements( IRound )
export class GameRules extends Component implements IRound {
	// C#-компонент StreakTracker на этой сущности
	@FromCSharp( IStreaks ) private readonly _streaks!: IStreaks;

	public CoinsLeft(): number { return this.Total - this.Collected; }
	public SecondsLeft(): number { return this.TimeLeft; }

	private Won(): void {
		this._toasts.Toast( `Best streak: x${ this._streaks.Best() }` );
	}
}
```

`@FromCSharp( IStreaks )` заполняет поле C#-реализацией: C#-компонентом **той же сущности**, который реализует
`IStreaks`, а если такого нет — тем, что к нему привязал C#-контейнер игры. Реализация ищется при каждом вызове, так что
компонент может появляться и исчезать. Без C#-скриптов (их нет или они не загрузились) поле всё равно заполнено и
компонент работает; каждый вызов тогда бросает исключение с объяснением причины.

## Вызов TypeScript из C#: `[FromTypeScript]`

```csharp
using CSEngine;
using CSEngine.Bridge;
using CSEngine.DI;

public sealed class StreakTracker : Component, IStreaks
{
	[Inject]
	private readonly IStreakWording _wording = null!;   // C#-сервис (ниже)

	[FromTypeScript]
	private readonly IRound _round = null!;             // GameRules на этой сущности

	private int _best;

	public int Best() => _best;                         // IStreaks: его вызывает TypeScript

	private void OnCoin( CoinCollected coin )
	{
		...
		Engine.Ui.Toast( _wording.Announce( _streak, _round.CoinsLeft() ) );
	}
}
```

`[FromTypeScript]` — зеркальный случай: TypeScript-компонент той же сущности, помеченный `@Implements( IRound )` (класс
обязан реализовать интерфейс — это проверяет компилятор), а если такого нет — привязка TypeScript-контейнера игры.
C#-компоненту ничего помечать не нужно: достаточно реализовать интерфейс.

## DI в C#

У C# свой контейнер с тем же API, что у TypeScript (руководство 20):

```csharp
public sealed class CoinHuntInstaller : Installer
{
	public override void InstallBindings( ContainerBuilder builder )
	{
		builder.Bind<IStreakWording>().To<StreakWording>().AsSingle();
		builder.Bind<IRound>().FromTypeScript();      // то, что привязал TypeScript-контейнер
	}
}
```

Движок находит и ставит каждый публичный `Installer` с конструктором без параметров из C#-кода игры (каждый класс один
раз). Сначала движок привязывает своё: `ScriptEngine`, его `World`, `Ui`, `Log`, `TimeInfo`, `Input`, `DataStream` и
`ScriptBridge`. Поля и свойства `[Inject]` C#-компонента заполняются до его `Awake`; поле, к контракту которого ничего не
привязано, попадает в отчёт об ошибке компонента, а сам компонент продолжает работать. `Bind<T>()`, `To<TImpl>()`,
`FromInstance`, `FromFactory`, `AsSingle`, `AsTransient`, `NonLazy`, `Install`, `Resolve`, `TryResolve`, `Has`,
`Inject`, `CreateChild` — как в TypeScript.

## Смешивание в инсталлерах

Любой контейнер может держать реализацию другого языка, поэтому контракт используют обычным `@Inject` / `[Inject]`, где
бы он ни был реализован:

```ts
// TypeScript: IStreaks реализован в C#
builder.Bind( IStreaks ).FromCSharp();
```

```csharp
// C#: IRound реализован в TypeScript
builder.Bind<IRound>().FromTypeScript();
```

Тогда `@Inject( IStreaks )` в любом TypeScript-компоненте получит C#-привязку `IStreaks`, а `[Inject] IRound` в C# —
TypeScript-привязку.

## Как это устроено

Вызов — массив MessagePack `[контракт, сущность, метод, аргументы]`, ответ — `[true, значение]` или `[false, ошибка]`
(исключение на другой стороне становится исключением здесь: `C# TemplateProject.IStreaks: ...`). В браузере сообщение
передаётся через память, общую для обоих рантаймов. C# держит закреплённый блок слотов (по слоту на каждый уровень
вложенности в каждую сторону, `SharedSlots`). TypeScript пишет запрос прямо в кучу WebAssembly и вызывает
`ScriptExports.CallSlot( depth, length )` (`[JSExport]`), а C# читает его на месте и пишет ответ в тот же слот. C#
вызывает TypeScript так же, через `[JSImport]` модуля рантайма `cse-bridge`. На каждый вызов не копируется и не
создаётся ни одного массива; сообщение больше слота (64 КБ) идёт старым путём, через массив байтов. Вызов стоит около
1,4 микросекунды в каждую сторону на целевом ноутбуке.

Перед вызовом C# движок отправляет C#-команды, накопленные за кадр, поэтому C#-компонент, созданный в этом
кадре, там уже есть. Структуры передаются массивами своих полей, `vec3` — как `[x, y, z]`. Преобразования делает
сгенерированный код, без рефлексии (он работает в AOT-сборке).

Вызов стоит кодирования и декодирования на каждой стороне (микросекунды): для игровой логики это нормально, для тысяч
вызовов за кадр — нет. Такие вызовы лучше собрать в один метод, принимающий массив.

Исходники: `Modules/Scripting/Source/Contracts` (компилятор), `Modules/Scripting/Source/Bridge.ts` и `CSharp/Bridge`
(два конца моста), `Modules/Common/DI/DotNet` (DI для C#), `Core/BuildTools/ContractsPlugin.ts` (сборка),
`Templates/CoinHunt` (пример).

← [21. Задачи](21-tasks.md) · Дальше → [23. Производительность](23-performance.md)
