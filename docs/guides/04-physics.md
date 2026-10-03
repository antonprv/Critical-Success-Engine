# 04. Физика

Физика - настоящий BEPU (в wasm), живёт в отдельном воркере и шагает с фиксированной частотой **60 Гц**. Твои скрипты
в `GameLogic` с ней общаются через компоненты тел и через `this.Engine.Physics`.

## Как это устроено (чтобы понимать задержки)

```
GameLogic ──команды (пачкой за шаг)──▶ PhysicsWorker ──шаг симуляции──▶ снимок состояния ──▶ GameLogic
```

- Всё, что ты просишь у физики (импульс, скорость, телепорт, ход персонажа), исполняется на **следующем** шаге.
- Всё, что ты читаешь (`LinearVelocity`, позиция тела), - состояние **после последнего** шага.
- Запросы (`SweepSphere` и т.п.) - **асинхронные**: возвращают `Promise`.

Для игры это обычно неважно (16 мс), но объясняет, почему, например, «поставил скорость и тут же прочитал» вернёт старое.

## Какие бывают тела

| Компонент | Что это | Двигается |
|---|---|---|
| `StaticBody` | уровень: стены, пол, рельеф | никогда |
| `RigidBody` | обычный динамический предмет | симуляцией; ты - импульсами/скоростями |
| `KinematicBody` | платформа, дверь - тобой управляемое тело | твоим скриптом (через `Transform`), но толкает остальных |
| `TriggerArea` | невидимая «зона»: ни с чем не сталкивается, только сообщает о входе/выходе | не должна (или `BuildAsStatic = false` - следует за сущностью) |
| `SimpleTriggerArea` | облегчённая зона для **одной** цели (обычно игрока), без участия физики | - |
| `CharacterBody` / `MoverComponent` | капсула-персонаж (см. 05) | collide-and-slide |
| `Projectile` | быстрая маленькая сфера: пуля, ракета | своими проверками, без туннелирования |

Общие поля тела: `Shape` (форма), `Layer`, `Mask`. У `RigidBody` ещё `Mass` и `ContinuousDetection`.

## Формы

`Shapes.Box(w, h, d)` - **полные** размеры. `Sphere(r)`. `Capsule(r, полнаяВысота)`. `Cylinder(r, h)`.
`ConvexHull([x0,y0,z0, …])` - выпуклая оболочка облака точек (динамическая или статическая). `TriangleMesh(вершины, масштаб)` -
**только для статики** (рельеф, сложная геометрия): плоский список треугольников. Центр масс у `ConvexHull` движок
компенсирует сам - позиция сущности остаётся там, где «начало координат» твоих точек.

## Слои и маски

У каждого тела есть `Layer` («кто я») и `Mask` («с кем я взаимодействую»). Два тела взаимодействуют, когда
**каждый видит другого**: `(A.Layer & B.Mask) != 0` и `(B.Layer & A.Mask) != 0`.

```ts
CollisionLayer.World      // 1   уровень
CollisionLayer.Character  // 2   игрок/NPC
CollisionLayer.Projectile // 4
CollisionLayer.Trigger    // 8
CollisionLayer.Prop       // 16  ящики, шары
CollisionLayer.Debris     // 32
CollisionLayer.All        // -1  все биты (в int32; так нужно мосту)
```

Свои слои - добавь биты в `Engine/Core/CollisionLayer.ts` (`Enemy = 1 << 6`) и комбинируй `|`:
`Mask: CollisionLayer.World | CollisionLayer.Prop`. Типичные настройки: пуля (`Layer: Projectile`,
`Mask: World | Prop`) не видит игрока; триггер видит всех; ящик (`Prop`) видит мир, других ящиков и игрока.

## Столкновения и триггеры

- `OnTriggerEnter(other)` / `OnTriggerExit(other)` - вызываются **у обеих сторон**, `other` - вторая сущность. Для триггера
  проще наследоваться от `TriggerArea` и переопределить `OnBodyEntered(body)` / `OnBodyExited(body)` (так сделаны `Coin`, `TriggerZone`, `LaunchPad`).
- `OnCollisionEnter(other)` / `OnCollisionExit(other)` - начало/конец контакта твёрдых тел. По коду физического слоя контакты
  порождаются, когда в паре есть **динамическое** тело (или триггер): ящик ударился о стену - событие есть; игрок (кинематика)
  идёт по статичному полу - события нет (для «стою ли я на земле» есть `IsOnFloor`, см. 05).

```ts
/** Pushes any rigid body that hits this entity away from it. Put it next to a StaticBody (or any body). */
export class Bumper extends Component {
	public Strength = 8;

	public override OnCollisionEnter(other: Entity): void {
		const body = other.GetComponent(RigidBody);
		if (!body) return;

		const away = other.Transform.Position.Sub(this.Transform.Position);
		away.Y = 0.3; // a little lift
		body.ApplyImpulse(away.Normalized().Mul(this.Strength));
	}
}
```

## Толкать, разгонять, телепортировать

`RigidBody` (методы компонента):

```ts
body.ApplyImpulse(new Vec3(0, 6, 0));               // толчок (масса учитывается), через центр
body.ApplyImpulse(импульс, мироваяТочка);           // толчок в точку - раскрутит
body.SetLinearVelocity(new Vec3(5, 0, 0));          // выставить скорость
body.SetAngularVelocity(new Vec3(0, 3, 0));
body.Teleport(new Vec3(0, 5, 0));                   // переместить (скорости сохранятся - обнули сам, если нужно)
body.LinearVelocity                                  // последняя известная скорость (читать)
```

Спящие тела просыпаются от этих вызовов сами.

**Двигать `Transform.Position` у `RigidBody` бесполезно** - хозяин позы тело; `Transform` каждый шаг перезаписывается из симуляции.

## Платформы и двери: кинематика

`KinematicBody` - тело, которым управляешь ты. Секрет в порядке компонентов: сначала скрипт двигает `Transform`
(`PushPhysicsPose` - чтобы картинка сглаживалась), **потом** `KinematicBody` в своём `OnPhysicsUpdate` сообщает физике новую позу.
Физика сама выводит из смещения скорость - поэтому тот, кто стоит на платформе, едет вместе с ней, а ящики на ней не слетают.

```ts
Ent("Lift", [
	Comp(MeshRenderer, { Mesh: MeshForShape(shape), Color: [0.85, 0.7, 0.25] }),
	Comp(PlatformMover, { Axis: [0, 1, 0], Distance: 1.5, PeriodSeconds: 6 }),   // 1. двигает Transform
	Comp(KinematicBody, { Shape: shape, Layer: CollisionLayer.World }),         // 2. сообщает позу физике
], { position: [2, 1.6, -9] }),
```

Поменяй их местами - платформа будет отставать на шаг и персонаж начнёт «скользить» по ней. Готовые `PlatformMover` и `Door` - в
`Game/Scripts/`.

## Запросы: «что впереди?»

`this.Engine.Physics.SweepSphere(начало, направление, дальность, радиус, слой, маска, исключитьСущность?)` «протаскивает» сферу
и возвращает `Promise` с первым попаданием: `hit`, `distance`, `point`, `normal`, `hitEntityId`. С маленьким радиусом это
обычный «рейкаст». Шаблон - **один вопрос за раз**:

```ts
/** Shows the distance to whatever is in front of this entity. Physics queries are asynchronous: they return promises. */
export class RangeFinder extends Component {
	public MaxDistance = 50;

	private _inFlight = false;

	public override OnPhysicsUpdate(): void {
		if (this._inFlight) return; // one question at a time
		this._inFlight = true;

		const forward = this.Transform.Rotation.Rotate(Vec3.Forward());

		void this.Engine.Physics
			.SweepSphere(
				this.Transform.Position, forward, this.MaxDistance, 0.05,
				CollisionLayer.All, CollisionLayer.World | CollisionLayer.Prop, this.Entity.Id
			)
			.then((result) => {
				this._inFlight = false;
				this.Engine.Ui.SetHud("range", result.hit ? `Range: ${result.distance.toFixed(1)} m` : "Range: -");
			});
	}
}
```

Так же устроена пружинная штанга камеры (`CameraComponent`) и пуля (`Projectile`).

## Снаряды

`Projectile` (радиус, `Velocity`, `ApplyGravity`, `Gravity`, `MaxLifetimeSeconds`, `DestroyOnHit`) двигается проверками, а не
решателем: не «отскакивает», а **останавливается в точке попадания** и сообщает ровно один раз - на любой скорости не проходит
сквозь стену. Чтобы узнать, во что попал, реализуй на любом компоненте этой же сущности `OnProjectileHit(point, normal, hitEntity)`
(пример - `BulletHit` и `Shooter` в `Game/Scripts/Scripts.ts`, они используются в сцене *Character test room*). После попадания
или по истечении `MaxLifetimeSeconds` снаряд вызывает `Despawn`: пуля из пула возвращается в него, остальные уничтожаются.
`Shooter` берёт пули из `EntityPool` на `MaxBullets` штук (см. гайд 03, «Пул вместо Spawn/Destroy»).

## Подводные камни

| Симптом | Что проверить |
|---|---|
| Быстрый мелкий предмет пролетает сквозь тонкую стену | `ContinuousDetection: true` у `RigidBody`; утолщить стену; для пуль - `Projectile` |
| Предмет не сталкивается | Слои/маски (правило «каждый видит другого»); оба ли тела вообще есть |
| Сразу после `Spawn` команда телу «не сработала» | Отдавай её из `Start` (гайд 03) |
| `TriangleMesh` на динамическом теле | Нельзя: только статика. Для движущегося - `ConvexHull` |
| Платформа «плывёт» относительно игрока | Порядок компонентов: скрипт движения **до** `KinematicBody` |
| Предмет улетел странно после телепорта | `Teleport` не обнуляет скорость - `SetLinearVelocity(new Vec3())` |
| Физики нет вообще | Не собран wasm: см. 01; в этом случае при старте будет тост об этом |

Дальше → [05. Игрок и камера](05-player-and-camera.md)
