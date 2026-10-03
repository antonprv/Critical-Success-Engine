# 07. Coin Hunt: игра целиком

Соберём настоящую мини-игру из того, что есть: арена, игрок, девять монет, лифт, таймер на 60 секунд, победа/поражение, рестарт по `R`.
Она уже лежит в проекте и зарегистрирована — выбери **Coin Hunt (sample game)** в меню. Файлы:

- сцена: `Source/Game/Scenes/CoinHuntScene.ts`
- скрипты: `Source/Game/Scripts/CoinHunt.ts` (три компонента)
- тест, который играет в неё без браузера: `Tests/GameLogicRuntime.test.ts` → *coin hunt sample game*

Идём так, как писали бы её с нуля. Каждый шаг можно запускать отдельно.

## План: кто за что отвечает

| Сущность | Компоненты | Роль |
|---|---|---|
| `Game` | `GameRules` | судья: считает монеты, ведёт таймер, решает победа/поражение, рестарт |
| `Coin N` (×9) | `MeshRenderer`, `Spinner`, `Coin` | подбираемая монета; тег `coin` |
| `Player` | `MeshRenderer`, `FallRespawn`, `MoverComponent` | игрок; тег `player` |
| `Camera` | `CameraComponent` | вид от третьего лица |
| арена, `Lift` | статика, `PlatformMover` + `KinematicBody` | где бегаем |

Правило проектирования: **один компонент — одна обязанность, общаются по имени/тегу**. Монета ничего не знает про таймер, а таймер ничего
не знает про устройство монет: монета лишь говорит судье «меня подобрали».

## Шаг 1. Арена и игрок

Полы, стены, блоки, рампа и лифт — это то же, что в гайдах 02 и 04 (`StaticBox`, `PlatformMover` + `KinematicBody`). Игрок и камера — из гайда 05.
Запусти сцену без монет и убедись, что бегаешь, прыгаешь и лифт тебя возит.

## Шаг 2. Монета — триггер

Монета — **сфера-датчик**: ни с чем не сталкивается, но сообщает, когда в неё вошли. Для этого есть `TriggerArea`; наследуемся и
переопределяем `OnBodyEntered`:

```ts
/** A pickup: a sensor volume that vanishes when the player touches it. */
export class Coin extends TriggerArea {
	protected override OnBodyEntered(body: Entity): void {
		// Only the player picks coins up (a crate or a bullet drifting through does nothing).
		if (!body.Tags.has("player")) return;

		this.Engine.World.FindByName("Game")?.GetComponent(GameRules)?.Collect();
		this.Entity.Destroy();
	}
}
```

Две детали:

- **Фильтр по тегу `player`.** Ящик или пуля, пролетевшие сквозь монету, её не подберут.
- **`this.Entity.Destroy()`** — монета исчезает вместе с телом-датчиком и мешем (оба убираются в `OnDestroy` своих компонентов — вручную чистить ничего не надо).

Как монета выглядит в манифесте (вращающийся диск, форма датчика чуть больше диска — «щедрый» радиус подбора):

```ts
const StandingUp = Quat.FromAxisAngle(Vec3.Right(), Math.PI / 2).ToTuple(); // a cylinder lies along Y; turn it into a coin on its edge
const CoinShape = Shapes.Sphere(0.6); // pickup radius - a bit generous on purpose
const LiftShape = Shapes.Box(4, 0.4, 4);
const PlayerShape = Shapes.Capsule(0.5, 2);

function CoinAt(index: number, position: Vec3Tuple): EntityManifest {
	return Ent(`Coin ${index}`, [
		Comp(MeshRenderer, { Mesh: Meshes.Cylinder(0.35, 0.08), Color: [1, 0.82, 0.2] }),
		Comp(Spinner, { RadiansPerSecond: 2.5 }),
		Comp(Coin, { Shape: CoinShape }),
	], { position, rotation: StandingUp, tags: ["coin"] });
}
```

Заметь `rotation: StandingUp`: цилиндр в Babylon лежит вдоль Y, а монету надо поставить на ребро. `Spinner` вращает вокруг оси Y мира — на ребре диск
крутится «как монетка на столе», потому что поворот применяется поверх стартового.

## Шаг 3. Судья — `GameRules`

```ts
/**
 * The referee: counts coins, runs the clock, decides win/lose, restarts on R. One of these lives on an entity called
 * "Game"; everything else finds it by name.
 */
export class GameRules extends Component {
	public TimeLimitSeconds = 60;
	public CoinTag = "coin";

	public Total = 0;
	public Collected = 0;
	public TimeLeft = 0;
	public State: GameState = "playing";

	public override Start(): void {
		// Start runs after EVERY entity's Awake, so all coins already exist here (Awake would be too early to count them).
		this.Total = this.Engine.World.FindByTag(this.CoinTag).length;
		this.TimeLeft = this.TimeLimitSeconds;
	}

	public Collect(): void {
		if (this.State !== "playing") return;

		this.Collected++;
		if (this.Collected >= this.Total) {
			this.State = "won";
			const seconds = (this.TimeLimitSeconds - this.TimeLeft).toFixed(1);
			this.Engine.Ui.Toast(`All coins collected in ${seconds} s! Press R to play again.`);
		}
	}

	public override Update(dt: number): void {
		if (this.State !== "playing") return;

		this.TimeLeft = Math.max(0, this.TimeLeft - dt);
		if (this.TimeLeft === 0) {
			this.State = "lost";
			this.Engine.Ui.Toast("Time's up! Press R to try again.");
		}
	}

	public override OnInputUpdate(input: InputService): void {
		if (this.State !== "playing" && input.JustPressed("KeyR")) {
			const scene = this.Engine.Scenes.CurrentSceneId;
			if (scene) void this.Engine.Scenes.Load(scene); // everything, this component included, is rebuilt from the manifest
		}
	}

	public override OnUIUpdate(ui: UiService): void {
		ui.SetHud("game.coins", `Coins: ${this.Collected} / ${this.Total}`);
		ui.SetHud("game.time", this.State === "playing" ? `Time: ${this.TimeLeft.toFixed(1)}` : this.State === "won" ? "YOU WIN - R to restart" : "TIME'S UP - R to restart");
	}
}
```

Что здесь стоит запомнить:

- **Считаем монеты в `Start`, а не в `Awake`.** `Start` идёт после `Awake` *всех* сущностей, так что к этому моменту все монеты точно существуют. Подсчёт по тегу не требует
  менять `GameRules` при добавлении монеты: нарисовал ещё одну с тегом `coin` — и `Total` вырос сам.
- **Состояние — явное** (`"playing" | "won" | "lost"`) и в одном месте. Все остальные проверки — `if (State !== "playing") return`.
- **Рестарт — это перезагрузка сцены.** `Scenes.Load(текущая)` выгружает всё (`OnDestroy` у всех) и собирает заново из манифеста: монеты на местах, таймер 60, счёт 0.
  Не надо писать «сбрось всё вручную» — сцена-как-данные даёт это бесплатно.
- **Подпись HUD** — `OnUIUpdate`: две строки со своими ключами.

Судью кладём на **отдельную пустую сущность** `Game`: у неё нет ни меша, ни тела — просто «место для логики».

## Шаг 4. Падение с арены

```ts
/** Falls off the arena -> back to the start. List it BEFORE the mover so the mover starts its tick from the cleared velocity. */
export class FallRespawn extends Component {
	public KillY = -8;
	public SpawnPoint: Vec3Tuple = [0, 1.2, 8];

	public override OnPhysicsUpdate(): void {
		if (this.Transform.Position.Y >= this.KillY) return;
		this.Entity.RequireComponent(CharacterBody).Teleport(Vec3.FromTuple(this.SpawnPoint));
	}
}
```

Компонент стоит в манифесте игрока **до** `MoverComponent`. Причина в порядке хуков: сначала `FallRespawn.OnPhysicsUpdate` обнуляет скорость и
перекидывает на старт, потом мувер в том же шаге считает ход с чистого листа. Если поставить после, мувер успеет в этом шаге отправить ход со скоростью падения.

## Шаг 5. Собираем сцену

```ts
const CoinPositions: Vec3Tuple[] = [
	// on the floor
	[-9, 1, 9], [9, 1, 9], [-10, 1, 3], [0, 1, -9], [10, 1, -8],
	// on the hop blocks (block top + 1 m, because the player's origin is its centre)
	[4, 2, 0], [8, 2.5, 0],
	// on the raised deck at the top of the ramp
	[-6, 3.75, -8.8],
	// above the lift: ride it up and jump
	[2, 4.6, -9],
];
```

```ts
		//#region Player, camera, rules
		Ent("Player", [
			Comp(MeshRenderer, { Mesh: MeshForShape(PlayerShape), Color: [0.9, 0.9, 0.95] }),
			Comp(FallRespawn, { KillY: -8, SpawnPoint: [0, 1.2, 8] }), // before the mover - see FallRespawn
			Comp(MoverComponent, { CameraName: "Camera" }),
		], { position: [0, 1.2, 8], tags: ["player"] }),

		Ent("Forward Marker", [
			Comp(MeshRenderer, { Mesh: Meshes.Box(0.2, 0.2, 1), Color: [0.9, 0.3, 0.25] }),
			Comp(Follower, { TargetName: "Player", Offset: [0, 0, -0.5] }),
		]),

		Ent("Camera", [Comp(CameraComponent, { TargetName: "Player", EyeHeight: 0.6, ThirdPerson: true, ArmLength: 5 })]),

		Ent("Game", [Comp(GameRules, { TimeLimitSeconds: 60 })]),
```

Монеты на высоте считались как «верх блока + 1 м»: **центр капсулы — в метре над ногами**. Если ставишь предмет, который должен «лежать» на блоке высотой 1 —
центр ставь на `1 + половина_размера_предмета`.

## Шаг 6. Играем и проверяем

- Собери все девять до конца таймера — тост «All coins collected in … s! Press R to play again.», в HUD «YOU WIN».
- Дай таймеру дойти до нуля — «Time's up!», `R` перезапускает.
- Спрыгни с арены — окажешься на старте.
- Самые дальние монеты: на площадке после рампы и над лифтом (заехать наверх и прыгнуть).

Автоматическая проверка того же самого (без браузера): `pnpm test -- GameLogicRuntime` → *coin hunt sample game*: подбор монеты, фильтр «не игрок», победа, поражение + рестарт, респаун.

## Как её развивать

| Хочешь | Куда смотреть |
|---|---|
| Больше времени / монет | `TimeLimitSeconds` в манифесте; добавь `CoinAt(...)` и позицию в `CoinPositions` |
| Звук подбора | `this.Engine.Audio.PlaySound("coin", this.Transform.Position)` в `Coin.OnBodyEntered` (звук надо положить в банк `AudioBank`) |
| Движущиеся враги, отбрасывающие на старт | рецепт `Hazard` + `PlatformMover` (гайд 08) |
| Трамплин на дальнюю монету | рецепт `LaunchPad` (гайд 08) |
| Двойной прыжок | рецепт `DoubleJumpMover` (гайд 08) |
| Несколько уровней | вторая сцена `coin-hunt-2` и в `GameRules` — `Scenes.Load("coin-hunt-2")` при победе |
| Шкала времени вместо цифр | `ui.SetBar("time", "Time", this.TimeLeft / this.TimeLimitSeconds)` |

Дальше → [08. Рецепты](08-recipes.md)
