# 03. Свои компоненты

Компонент — класс, который наследует `Component`. Это **единственная точка расширения**: всё, что делает игру игрой,
пишется как компоненты. Если ты работал с Unity (`MonoBehaviour`) или Godot (скрипт на ноде) — идея та же, только
у одной сущности может быть сколько угодно компонентов.

## Минимальный компонент

```ts
/** Bobs up and down forever. A purely script-driven entity: no physics, just a Transform written every frame. */
export class Hover extends Component {
	public Amplitude = 0.5;
	public Speed = 2;

	private _baseY = 0;

	public override Start(): void {
		this._baseY = this.Transform.Position.Y;
	}

	public override Update(_dt: number): void {
		this.Transform.Position.Y = this._baseY + Math.sin(this.Engine.Time.Elapsed * this.Speed) * this.Amplitude;
	}
}
```

Подключается так (в манифесте сцены):

```ts
Ent("Crystal", [
	Comp(MeshRenderer, { Mesh: Meshes.Box(0.5, 0.5, 0.5), Color: [0.4, 0.9, 1] }),
	Comp(Hover, { Amplitude: 0.3, Speed: 3 }),   // публичные поля = то, что можно задать из манифеста
], { position: [0, 1.5, 0] }),
```

Правила:

- Конструктор **без параметров**. Настройка — только публичными полями (`Comp(Тип, { поле: значение })`).
- В манифесте задаются *данные*, не методы. Приватные поля (`_baseY`) — твоё внутреннее состояние.
- Хуки переопределяются с ключевым словом **`override`** (в проекте включён `noImplicitOverride`): опечатка в имени хука
  (`Updte`) сразу станет ошибкой компиляции, а не «скрипт почему-то не работает».

## Хуки жизненного цикла

| Хук | Когда вызывается |
|---|---|
| `Awake()` | один раз, **после создания всей партии** (сцены) — другие сущности уже существуют, но их `Start` ещё не было |
| `Start()` | один раз, перед первым `Update`/`OnPhysicsUpdate` этого компонента; все `Awake` к этому моменту уже выполнены |
| `OnInputUpdate(input, dt)` | каждый кадр, **первым** |
| `Update(dt)` | каждый кадр, вторым |
| `OnUIUpdate(ui, dt)` | каждый кадр, третьим — тут обновляют HUD |
| `OnPhysicsUpdate(dt)` | каждый **физический шаг** (фиксированные 60 Гц, `dt` постоянный, не зависит от FPS) |
| `OnCollisionEnter/Exit(other)` | начало/конец контакта тел (см. 04) |
| `OnTriggerEnter/Exit(other)` | кто-то вошёл в триггер/вышел (см. 04) |
| `OnDestroy()` | сущность уничтожена или сцена выгружается |

Порядок обхода: сущности — в порядке создания; компоненты одной сущности — **сверху вниз, как в манифесте**.

**Awake или Start?** Простое правило: в `Awake` — подготовь *себя*, в `Start` — общайся с *другими*. Пример, где это
критично: тело `RigidBody` создаётся в его `Awake`; если твой компонент в своём `Awake` попросит у тела скорость,
команда уйдёт в физику *раньше*, чем команда создания тела, и будет проигнорирована. В `Start` порядок уже правильный:

```ts
/**
 * Gives a RigidBody a starting velocity.
 * Why Start and not Awake: the body is created in RigidBody.Awake, and a command for a body that does not exist yet
 * is ignored. Start runs after EVERY Awake, so the body's spawn command is already queued ahead of this one.
 */
export class InitialVelocity extends Component {
	public Velocity: Vec3Tuple = [0, 0, 0];

	public override Start(): void {
		this.Entity.RequireComponent(RigidBody).SetLinearVelocity(Vec3.FromTuple(this.Velocity));
	}
}
```

## Что доступно через `this.*`

| | |
|---|---|
| `this.Entity` | сущность-хозяин: `Name`, `Tags`, `Transform`, `Id`, `Active`, `Destroy()` |
| `this.Transform` | поза сущности: `Position` (Vec3), `Rotation` (Quat) |
| `this.Engine.World` | поиск и создание сущностей |
| `this.Engine.Input` | клавиатура/мышь |
| `this.Engine.Ui` | HUD и тосты |
| `this.Engine.Physics` | физика (запросы, импульсы — чаще через компоненты тел) |
| `this.Engine.Scenes` | загрузка сцен |
| `this.Engine.Time` | `Delta`, `FixedDelta`, `Elapsed`, `FrameCount` |
| `this.Engine.Audio`, `this.Engine.Render` | звук; низкоуровневый рендер |

## Время

Всё в **секундах**. В `Update(dt)` и `OnPhysicsUpdate(dt)` двигай вещи как `скорость * dt`. Таймеры — накопителями
(`_age += dt`), не `setTimeout`: накопитель честно останавливается вместе с игрой и сбрасывается вместе со сценой.

```ts
/** Destroys its entity after a few seconds. */
export class Lifetime extends Component {
	public Seconds = 3;

	private _age = 0;

	public override Update(dt: number): void {
		this._age += dt;
		if (this._age >= this.Seconds) this.Entity.Destroy();
	}
}
```

## Ввод

`this.Engine.Input` (и параметр `input` в `OnInputUpdate`):

- `IsKeyDown("KeyW")` — зажата ли клавиша. Коды — как в `KeyboardEvent.code`: `KeyW`, `Space`, `ShiftLeft`, `Digit1`…
- `JustPressed("Space")` — нажата **в этом кадре** (для `Update`/`OnInputUpdate`).
- `JustPressedPhysics("Space")` — нажата с прошлого физического шага (для `OnPhysicsUpdate`; короткий тап не потеряется).
- Мышь: кнопки как `"Mouse0"` (левая), `"Mouse1"`, …; `ConsumeLookDelta()` — сдвиг в пикселях с прошлого вызова.
- `GetInputVector()` — WASD/стрелки как `[x, y]` (вперёд = **отрицательный** y, как в Godot).

Пока игра не захватила мышь (меню на экране), весь ввод «пустой» — клавиши не нажимаются, мышь не копится.

## Спавн и уничтожение

`this.Engine.World.Spawn(манифест)` создаёт сущность *прямо сейчас*, но её `Awake`/`Start` выполнятся в начале следующего
прохода (поэтому «поговорить» с её компонентами можно со следующего кадра, а не в той же строке). `entity.Destroy()` — отложенное:
`OnDestroy` и физика/меш уберутся в конце текущего прохода, не посреди чьего-то хука.

```ts
/** Left click: throw a ball from the camera. Shows spawning entities from a script. */
export class BallGun extends Component {
	public Speed = 15;

	public override OnInputUpdate(input: InputService): void {
		if (!input.JustPressed("Mouse0")) return;

		const camera = this.Engine.World.FindByName("Camera")?.GetComponent(CameraComponent);
		if (!camera) return;

		const direction = camera.GetForwardDirection();
		const shape = Shapes.Sphere(0.3);

		this.Engine.World.Spawn(Ent("Thrown Ball", [
			Comp(MeshRenderer, { Mesh: MeshForShape(shape), Color: [1, 0.5, 0.2] }),
			Comp(RigidBody, { Shape: shape, Mass: 1, Layer: CollisionLayer.Prop }),
			Comp(InitialVelocity, { Velocity: direction.Mul(this.Speed).ToTuple() }),
			Comp(Lifetime, { Seconds: 10 }),
		], { position: camera.Transform.Position.Add(direction.Mul(1.5)).ToTuple() }));
	}
}
```

Обрати внимание: начальную скорость мы отдаём не прямым вызовом (тела ещё нет), а компонентом `InitialVelocity`.

## Поиск сущностей и общение между компонентами

- `World.FindByName("Player")`, `World.FindByTag("coin")`, `World.Get(id)`.
- `entity.GetComponent(Тип)` (может вернуть `undefined`), `entity.RequireComponent(Тип)` (бросит понятную ошибку).
- Общение — через поиск: компонент находит «Game» по имени и вызывает его метод (так сделаны монеты в Coin Hunt, гайд 07).
  Событий-шины нет и не нужно: сцена маленькая, поиск по имени дешёвый.

```ts
/** Finding other entities: by name, and talking to their components. */
export class Greeter extends Component {
	public TargetName = "Player";

	public override Start(): void {
		const target = this.Engine.World.FindByName(this.TargetName);
		if (!target) {
			this.Engine.Ui.Toast(`${this.Entity.Name}: nobody called "${this.TargetName}" here`);
			return;
		}
		this.Engine.Ui.Toast(`${this.Entity.Name} sees ${target.Name} at ${target.Transform.Position.ToString()}`);
	}
}
```

**Ищи в `Start`, а не в `Awake`** — иначе искомая сущность может быть ещё не создана (в `Awake` все сущности партии уже есть,
но надёжнее привычка «`Start` для связей»). И **не храни ссылки на сущности между сценами**: при смене сцены всё создаётся заново.

## HUD

```ts
/** HUD line with the frame rate. */
export class FpsCounter extends Component {
	public override OnUIUpdate(ui: UiService, dt: number): void {
		if (dt > 0) ui.SetHud("fps", `FPS: ${(1 / dt).toFixed(0)}`);
	}
}
```

`SetHud(ключ, текст)` — ключ нужен, чтобы независимые компоненты не затирали строки друг друга. `SetHud(ключ, null)` убирает строку.
Тосты: `this.Engine.Ui.Toast("Текст")`. Подробнее — гайд 06.

## Ошибки в скриптах

Если хук бросает исключение, движок **пишет в лог** `[Script] ИмяКласса.Хук threw on entity "…"` и продолжает кадр —
остальные скрипты работают. Ищи эту строку в консоли.

## Шпаргалка по подводным камням

| Ловушка | Что делать |
|---|---|
| Двигаю `Transform.Position` у `RigidBody`, а тело не двигается | Тело главнее. Телепорт — `rigidBody.Teleport(позиция)` (см. 04) |
| Команда телу сразу после `Spawn` игнорируется | Отдай её в `Start()` другого компонента |
| Хук не вызывается | `Enabled = false` у компонента или `Active = false` у сущности; опечатка без `override`; хук не того такта (физика ≠ кадр) |
| `Entity.Destroy()` и тут же использую сущность | Она ещё жива до конца прохода, но `IsDestroyed` уже `true` — проверяй его |
| Ссылка на сущность «протухла» после рестарта | Не хранить между сценами; искать заново в `Start` |

Дальше → [04. Физика](04-physics.md)
