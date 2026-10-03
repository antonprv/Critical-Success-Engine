# 05. Игрок и камера

В сцене *Character test room* и в *Coin Hunt* игрок - это сущность с тремя вещами: меш-капсула, `MoverComponent` (бег, прыжок)
и камера в отдельной сущности `Camera`, которая за ним следует. Разберём, как это устроено и как менять.

## Минимальный игрок

```ts
const PlayerShape = Shapes.Capsule(0.5, 2);          // радиус 0.5, полная высота 2 м

Ent("Player", [
	Comp(MeshRenderer, { Mesh: MeshForShape(PlayerShape), Color: [0.9, 0.9, 0.95] }),
	Comp(MoverComponent, { CameraName: "Camera" }),   // CameraName - имя сущности с камерой (по умолчанию как раз "Camera")
], { position: [0, 1.2, 8], tags: ["player"] }),

Ent("Camera", [Comp(CameraComponent, { TargetName: "Player", EyeHeight: 0.6 })]),
```

Три правила, о которые обычно спотыкаются:

1. **Имена связаны строками**: `CameraName: "Camera"` у мувера и `TargetName: "Player"` у камеры. Переименовал сущность - поменяй и поле.
2. **Точка отсчёта игрока - центр капсулы.** Высота глаз `EyeHeight` отсчитывается от центра: капсула высотой 2 м, глаза на 0.6 м выше центра - это 1.6 м от пола.
   Появляться нужно с `position.y ≥ 1.0 + небольшой зазор` над полом (иначе капсула окажется в полу).
3. **Тег `player`** - по нему монеты и ловушки узнают игрока. Это просто соглашение, движок его не требует.

## Как движется игрок (и почему задержка в один шаг - не баг)

Каждый физический шаг `MoverComponent` делает цепочку:

1. читает результат прошлого хода персонажа (стоит ли на полу, какая скорость осталась после скольжения по стенам),
2. читает ввод и превращает его в «желаемое направление» относительно камеры (только по горизонтали),
3. прогоняет скорость через **трейты** выбранного режима (гравитация, трение, разгон, прыжок…),
4. просит физику: «передвинь капсулу на `Velocity × dt`, скользя вдоль препятствий».

Сам ход считается в физическом воркере, а результат приходит со следующим снимком. Следствие: персонаж реагирует на
пол/стену с запаздыванием в один шаг (16 мс) - зато последовательность значений та же, что у синхронного `MoveAndSlide` в Godot.

Практическое правило: **меняй `Velocity` персонажа из `OnPhysicsUpdate` или из колбэков столкновений/триггеров** (они
выполняются внутри физического шага). Если выставить `Velocity` из `Update`, следующий снимок перезапишет его результатом
прошлого хода (см. рецепт «трамплин» в 08 - он как раз так и сделан правильно).

## Режимы движения

`InitialMode` (и клавиши `1`…`5` в игре) выбирают набор трейтов:

| Режим | Ощущение |
|---|---|
| `Quake` | классический квейковский разгон, бросок бокового ускорения в воздухе |
| `Realistic` | трение и плавная остановка, ограниченный контроль в воздухе |
| `Hybrid` | аркадный: скорость плавно «подтягивается» к целевой |
| `Doom3` | как в Doom 3 (единицы пересчитываются из дюймов) |
| `QuakeStrafeDoom2016` | по умолчанию: трение Doom 3 на земле + квейковский стрейф в воздухе |
| `Custom` | твой список трейтов (см. ниже) |

## Настройка без кода: профиль

`Profile` - набор чисел, общий для режимов: `MaxSpeed`, `GroundAcceleration`, `GroundFriction`, `AirAcceleration`,
`AirMaxSpeed`, `AirControl`, `JumpHeight`, `JumpBufferTime`, `CoyoteTime`. Если не задан - создаётся стандартный (`JumpHeight` 1.8).

```ts
const PlayerShape = Shapes.Capsule(0.5, 2);

/** A faster, floatier player: profile values override the defaults for every movement mode. */
export const TunedPlayer: EntityManifest = Ent("Player", [
	Comp(MeshRenderer, { Mesh: MeshForShape(PlayerShape), Color: [0.9, 0.9, 0.95] }),
	Comp(MoverComponent, {
		InitialMode: MovementPreset.Hybrid,
		Profile: Object.assign(new MProfile(), { MaxSpeed: 9, JumpHeight: 2.4, AirMaxSpeed: 10, CoyoteTime: 0.2 }),
	}),
], { position: [0, 1.2, 8], tags: ["player"] });

export const TunedCamera: EntityManifest = Ent("Camera", [
	Comp(CameraComponent, { TargetName: "Player", EyeHeight: 0.6, ThirdPerson: true, ArmLength: 6, FovDegrees: 80, MouseSensitivity: 0.08 }),
]);
```

Что значат две «человеческие» настройки прыжка:

- `JumpBufferTime` - нажал пробел *чуть раньше* приземления, прыжок всё равно случится;
- `CoyoteTime` - нажал *чуть позже* схода с края, прыжок всё равно случится.

Какие поля профиля действительно используются, зависит от режима (например, `AirControl` читает только `Hybrid`/`Realistic`) - если число
«ничего не меняет», посмотри в `Engine/Components/Mover/Traits/Traits.ts`, какие трейты у режима и что они читают.

## Капсула и пол

Поля `CharacterBody` (от него наследуется `MoverComponent`): `Radius`, `Height`, `MaxSlideIterations` (4), `SkinWidth` (0.015),
`MaxFloorAngleDegrees` (46 - склон круче считается стеной) и `FloorProbeDistance` (0.08). Что отдаёт персонаж:
`IsOnFloor`, `FloorNormal`, `GroundEntityId` (на чём стоим), `Velocity`.

**Ступенек нет.** Персонаж не умеет автоматически шагать на ступеньки: любой вертикальный выступ для него - стена.
Поэтому в тестовых сценах вместо лестниц рампы и блоки, на которые надо **запрыгнуть**. Лестницы делай рампой (≤ 46°).

**Телепорт:** `characterBody.Teleport(позиция)` ставит персонажа и обнуляет скорость (иначе после падения респаун унёс бы скорость падения с собой).

## Свой набор трейтов (например, двойной прыжок или ветер)

Режим - это просто список трейтов; **трейт** - маленький объект, получающий скорость и меняющий её. Свой режим делается наследованием
от `MoverComponent` и переопределением `GetCustomTraits()`; включается `InitialMode: MovementPreset.Custom`.

```ts
/** A steady sideways push while airborne. A trait is one small piece of movement: it gets the velocity and changes it. */
export class WindTrait extends MovementTrait {
	public Push = new Vec3(3, 0, 0); // m/s^2

	public override Process(ctx: MovementContext, velocity: Vec3, delta: number): void {
		if (ctx.IsOnFloor) return;
		velocity.AddInPlace(this.Push.Mul(delta));
	}
}

/** The default Quake-style movement plus wind. Use with `Comp(WindyMover, { InitialMode: MovementPreset.Custom })`. */
export class WindyMover extends MoverComponent {
	protected override GetCustomTraits(): IMovementTrait[] {
		// The default mode's traits (built by the base class), plus wind on top.
		return [...this.BuildTraitsForPreset(MovementPreset.QuakeStrafeDoom2016), new WindTrait()];
	}
}
```

```ts
Ent("Player", [
	Comp(MeshRenderer, { Mesh: MeshForShape(PlayerShape) }),
	Comp(WindyMover, { InitialMode: MovementPreset.Custom }),   // вместо MoverComponent
], { position: [0, 1.2, 8], tags: ["player"] }),
```

Порядок трейтов в списке важен (они исполняются сверху вниз). Хочешь двойной прыжок - готовый `DoubleJumpMover` лежит в
`Game/Scripts/Recipes.ts` (рецепты, гайд 08). Контекст, который получает трейт (`MovementContext`): `WishDirection`, `JumpRequested`,
`JumpConsumed` (поставь `true`, если сам выполнил прыжок), `IsOnFloor`, `Gravity`, `Profile`, `Delta`.

## Камера

`CameraComponent` - мышиный обзор + слежение за целью:

| Поле | По умолчанию | Что делает |
|---|---|---|
| `TargetName` | `"Player"` | за кем следит |
| `EyeHeight` | 1.6 | высота «глаз» над точкой цели (для капсулы-центра ставь ~0.6) |
| `MouseSensitivity` | 0.1 | градусов на пиксель |
| `FovDegrees` | 70 | угол обзора по вертикали |
| `MinPitch` / `MaxPitch` | −85 / 85 | пределы взгляда вверх/вниз |
| `ThirdPerson` | false | вид от третьего лица |
| `ArmLength`, `ArmRadius`, `ArmMargin` | 4, 0.2, 0.05 | «штанга»: максимальная дистанция, толщина, отступ от стены |
| `ToggleKey` | `"KeyV"` | клавиша переключения вида |

От третьего лица камера на штанге: каждый кадр (с учётом ожидающего ответа) в сторону «назад» летит сфера, и камера подтягивается к игроку, если
позади стена. Работает только с телами слоя `World`. Для «неподвижной» сцены (шарики, диорамы) есть `FixedCamera` (`LookAt`, `FovDegrees`).

Из своего кода: `camera.GetForwardDirection()` / `GetRightDirection()` - куда смотрит камера (так мувер строит «вперёд»),
`camera.Yaw`/`Pitch` (в градусах) можно читать и писать.

Дальше → [06. Интерфейс](06-ui.md)
