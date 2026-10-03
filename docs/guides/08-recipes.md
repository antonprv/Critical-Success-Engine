# 08. Рецепты

Короткие готовые компоненты. Код - из `Source/Game/Scripts/Recipes.ts`, он компилируется и протестирован (`Tests/Recipes.test.ts`):
копируй нужное себе.

## Раздвижная дверь

Открывается, когда игрок ближе `TriggerDistance`. Тело кинематическое: ящики и другие динамические тела дверь толкает, а игрока она **останавливает**
(его ход упирается в дверь как в стену), но не выталкивает - кинематика с кинематикой между собой не сталкиваются, поэтому не опускай
дверь на игрока, стоящего в проёме.
**Порядок компонентов важен**: `Door` двигает `Transform`, `KinematicBody` после него сообщает физике новую позу.

```ts
/**
 * A sliding door: rises while the player is within `TriggerDistance`, sinks back otherwise. Put it on an entity with a
 * KinematicBody, listed BEFORE the KinematicBody (it moves the Transform, the body then reports that pose to the physics world).
 */
export class Door extends Component {
	public PlayerName = "Player";
	public TriggerDistance = 4;
	public OpenHeight = 3;
	public Speed = 3;

	private _closedY = 0;
	private _player: Entity | undefined;

	public override Start(): void {
		this._closedY = this.Transform.Position.Y;
	}

	public override OnPhysicsUpdate(dt: number): void {
		this._player ??= this.Engine.World.FindByName(this.PlayerName);
		if (!this._player) return;

		const position = this.Transform.Position;
		const near = position.DistanceTo(this._player.Transform.Position) < this.TriggerDistance;
		const target = this._closedY + (near ? this.OpenHeight : 0);

		const maxStep = this.Speed * dt;
		const y = position.Y + Math.max(-maxStep, Math.min(maxStep, target - position.Y));
		this.Transform.PushPhysicsPose(new Vec3(position.X, y, position.Z), this.Transform.Rotation);
	}
}
```

```ts
const DoorShape = Shapes.Box(4, 4, 0.4);

Ent("Door", [
	Comp(MeshRenderer, { Mesh: MeshForShape(DoorShape), Color: [0.5, 0.5, 0.6] }),
	Comp(Door, { TriggerDistance: 4, OpenHeight: 3, Speed: 3 }),       // 1. двигает Transform
	Comp(KinematicBody, { Shape: DoorShape, Layer: CollisionLayer.World }), // 2. сообщает физике
], { position: [0, 2, 0] }),
```

## Спавнер падающих ящиков

Раз в `IntervalSeconds` роняет ящик; когда ящиков больше `MaxCrates`, старейший исчезает. Образец «создавать сущности из скрипта».

```ts
/** Drops a physics crate above this entity every few seconds; once `MaxCrates` exist, the oldest one disappears. */
export class CrateSpawner extends Component {
	public IntervalSeconds = 2;
	public MaxCrates = 10;
	public CrateSize = 0.6;

	private _timer = 0;
	private _crates: Entity[] = [];

	public override Update(dt: number): void {
		this._timer += dt;
		if (this._timer < this.IntervalSeconds) return;
		this._timer = 0;

		this._crates = this._crates.filter((crate) => !crate.IsDestroyed);
		if (this._crates.length >= this.MaxCrates) this._crates.shift()!.Destroy();

		const shape = Shapes.Box(this.CrateSize, this.CrateSize, this.CrateSize);
		const origin = this.Transform.Position;
		const jitter = (Math.random() - 0.5) * 0.5;

		this._crates.push(this.Engine.World.Spawn(Ent("Crate", [
			Comp(MeshRenderer, { Mesh: MeshForShape(shape), Color: [0.75, 0.55, 0.3] }),
			Comp(RigidBody, { Shape: shape, Mass: 1, Layer: CollisionLayer.Prop }),
		], { position: [origin.X + jitter, origin.Y, origin.Z + jitter] })));
	}
}
```

```ts
Ent("Spawner", [Comp(CrateSpawner, { IntervalSeconds: 2, MaxCrates: 10 })], { position: [0, 8, 0] }),
```

Ящики, которые провалились за арену, не копятся: `MaxCrates` убирает старые - это защита от утечки сущностей.

## Ловушка (отправляет на старт)

Любая сущность, которая ближе `Radius` к игроку, возвращает его на `SpawnPoint`. Повесь на движущуюся платформу-«шипы»
(`PlatformMover`) - получится патруль.

```ts
/** Sends the player back to a spawn point when they get closer than `Radius` (move this entity with PlatformMover for a patrol). */
export class Hazard extends Component {
	public PlayerName = "Player";
	public Radius = 1.2;
	public SpawnPoint: Vec3Tuple = [0, 1.2, 8];

	public override OnPhysicsUpdate(): void {
		const player = this.Engine.World.FindByName(this.PlayerName);
		if (!player) return;

		if (this.Transform.Position.DistanceTo(player.Transform.Position) >= this.Radius) return;

		player.GetComponent(CharacterBody)?.Teleport(Vec3.FromTuple(this.SpawnPoint));
		this.Engine.Ui.Toast("Ouch!");
	}
}
```

```ts
Ent("Spikes", [
	Comp(MeshRenderer, { Mesh: Meshes.Box(1, 0.4, 1), Color: [0.9, 0.2, 0.2] }),
	Comp(PlatformMover, { Axis: [1, 0, 0], Distance: 3, PeriodSeconds: 4 }),
	Comp(Hazard, { Radius: 1.2, SpawnPoint: [0, 1.2, 8] }),
], { position: [0, 0.2, 0] }),
```

(Здесь у ловушки нет тела - она проверяет расстояние сама. Если нужен именно физический контакт, сделай `TriggerArea` и в `OnBodyEntered` вызови `Teleport`.)

## Трамплин

Триггер, который подбрасывает вошедшего. Скорость мувера меняется в колбэке триггера - а он выполняется внутри физического шага,
прямо перед `OnPhysicsUpdate` мувера, поэтому толчок не затирается (см. правило в гайде 05).

```ts
/**
 * Launch pad: anything with a mover that steps on it gets shot upwards. Changing a character's Velocity from a trigger
 * callback is fine: overlap callbacks run inside the physics step, right before every OnPhysicsUpdate - which is exactly
 * where the mover reads its velocity.
 */
export class LaunchPad extends TriggerArea {
	public Speed = 14;

	protected override OnBodyEntered(body: Entity): void {
		const mover = body.GetComponent(MoverComponent);
		if (mover) mover.Velocity.Y = this.Speed;
	}
}
```

```ts
Ent("Launch Pad", [
	Comp(MeshRenderer, { Mesh: Meshes.Box(2, 0.2, 2), Color: [0.2, 0.9, 0.5] }),
	Comp(LaunchPad, { Speed: 14, Shape: Shapes.Box(2, 0.5, 2) }),
], { position: [0, 0.1, 0] }),
```

`Speed: 14` при гравитации −20 даёт подъём примерно на 4,9 м (`v²/(2g)`).

## Спринт

Зажал Shift - быстрее. Меняет число в профиле мувера (профиль общий для всех режимов движения).

```ts
/** Hold Left Shift to run faster. Works by scaling the mover's profile (the profile is shared by all movement modes). */
export class Sprint extends Component {
	public Multiplier = 1.6;
	public Key = "ShiftLeft";

	private _baseSpeed = 0;
	private _mover!: MoverComponent;

	public override Start(): void {
		this._mover = this.Entity.RequireComponent(MoverComponent);
		this._baseSpeed = this._mover.Profile!.MaxSpeed; // the mover created its profile in Awake, which ran before every Start
	}

	public override OnInputUpdate(input: InputService): void {
		this._mover.Profile!.MaxSpeed = this._baseSpeed * (input.IsKeyDown(this.Key) ? this.Multiplier : 1);
	}
}
```

```ts
Ent("Player", [
	Comp(MeshRenderer, { Mesh: MeshForShape(PlayerShape) }),
	Comp(MoverComponent),
	Comp(Sprint, { Multiplier: 1.6 }),
], { position: [0, 1.2, 8], tags: ["player"] }),
```

Читает `MaxSpeed` в `Start` (профиль создан в `Awake` мувера, а `Awake` идёт перед всеми `Start`) - так что не важно, в каком порядке стоят компоненты.

## Двойной прыжок

Это «трейт» - кусочек логики движения (см. гайд 05). Он срабатывает, только когда в воздухе нажат прыжок, прыжок ещё никем не совершён в этом тике
(`ctx.JumpConsumed`) и остались воздушные прыжки; на земле счётчик пополняется.

```ts
/**
 * Extra jumps in mid-air. Traits are small objects the mover runs in list order every physics step; this one only acts
 * when a jump was requested this tick, nobody else consumed it (`ctx.JumpConsumed`) and we are airborne.
 */
export class DoubleJumpTrait extends MovementTrait {
	public MaxAirJumps = 1;
	private _airJumpsLeft = 0;

	public override Process(ctx: MovementContext, velocity: Vec3, _delta: number): void {
		if (ctx.IsOnFloor) {
			this._airJumpsLeft = this.MaxAirJumps;
			return;
		}
		if (!ctx.JumpRequested || ctx.JumpConsumed || this._airJumpsLeft <= 0) return;

		this._airJumpsLeft--;
		velocity.Y = Math.sqrt(2 * Math.max(0.0001, -ctx.Gravity.Y) * ctx.Profile.JumpHeight);
		ctx.JumpConsumed = true;
	}
}
```

```ts
/** The QuakeStrafeDoom2016 preset's traits plus a double jump. Use it with `InitialMode: MovementPreset.Custom`. */
export class DoubleJumpMover extends MoverComponent {
	protected override GetCustomTraits(): IMovementTrait[] {
		return [
			new GravityTrait(),
			new JumpTrait(),
			new DoubleJumpTrait(),
			new Doom3FrictionTrait(),
			new Doom3GroundAccelTrait(),
			new StrafeAirControlTrait(),
		];
	}
}
```

```ts
Comp(DoubleJumpMover, { InitialMode: MovementPreset.Custom }),   // вместо MoverComponent
```

Один нюанс, о котором стоит знать: «воздушные» прыжки пополняются только после **первого** приземления - игрок, появившийся в воздухе, их ещё не имеет.
Если нужно иначе, инициализируй `_airJumpsLeft = MaxAirJumps` в поле.

## Шпаргалка: что к чему применять

| Хочу | Основа |
|---|---|
| Двигающуюся платформу/дверь/лифт | `KinematicBody` + скрипт, двигающий `Transform` **до** него |
| Предмет, который реагирует на касание игрока | `TriggerArea` + `OnBodyEntered` |
| Урон, очки, таймер | отдельный компонент-«судья» на пустой сущности, общение по имени/тегу |
| Что-то, что появляется во время игры | `this.Engine.World.Spawn(Ent(...))` |
| Обнулить уровень | `this.Engine.Scenes.Load(this.Engine.Scenes.CurrentSceneId!)` |
| Изменить физику движения | наследник `MoverComponent` + `GetCustomTraits()` |

Дальше → [09. Если что-то не работает](09-troubleshooting.md)
