[English](../../en/guides/07-coin-hunt.md) | **Русский**

# 07. Coin Hunt: целая игра

Соберём настоящую мини-игру из того, что есть: арена, игрок, девять монет, лифт, таймер (по умолчанию 60 секунд), победа/поражение, рестарт по `R`.
Это шаблон проекта **Coin Hunt** (`src/Templates/CoinHunt`): игры всех шаблонов собраны в Games Sample, так что выбери в меню **Coin Hunt (sample game)**
или запусти шаблон отдельно: `CSE_PROJECT=../../Templates/CoinHunt pnpm dev` (из `src/CSEngine/Core`). Файлы:

- сцена: `Source/Scenes/CoinHuntScene.ts`
- скрипты: `Source/Scripts/CoinHunt.ts` (три компонента)
- данные правил: `Source/Data/CoinHuntRules.ts` и `Content/Data/CoinHuntRules.csedata` (гайд 15)
- HUD: UI-документ `Content/UI/CoinHuntHud.ui.json`, указанный в `Content/UI/Ui.manifest.json` (гайд 13)
- управление: файл ввода `Content/Input/CoinHunt.input.json` (гайд 14)
- главный модуль, который регистрирует сцену: `Source/TemplateProjectModule.ts` (гайд 02)
- тест, который играет в неё без браузера: `Core/Tests/GameLogicRuntime.test.ts` → *coin hunt sample game*

Пойдём так, как писал бы с нуля. Каждый шаг можно запустить отдельно.

## План: кто за что отвечает

| Сущность | Компоненты | Роль |
|---|---|---|
| `Game` | `GameRules` | судья: считает монеты, ведёт таймер, решает победу/поражение, рестарт, показывает HUD |
| `Coin N` (×9) | `MeshRenderer`, `Spinner`, `Coin` | собираемая монета; тег `coin` |
| `Player` | `MeshRenderer`, `FallRespawn`, `MoverComponent` | игрок; тег `player` |
| `Camera` | `CameraComponent` | вид от третьего лица |
| арена, `Lift` | статика, `PlatformMover` + `KinematicBody` | где бегаем |

Правило дизайна: **один компонент - одна ответственность, общаются по имени/тегу**. Монета ничего не знает про таймер, а таймер - про то,
как устроены монеты: монета просто говорит судье «меня подобрали».

## Шаг 1. Арена и игрок

Полы, стены, блоки, рампа и лифт - те же, что в гайдах 02 и 04 (`StaticBox`, `PlatformMover` + `KinematicBody`). Игрок и камера - из гайда 05.
Запусти сцену без монет и убедись, что бегается, прыгается и лифт тебя везёт.

## Шаг 2. Монета - это триггер

Монета - **сфера-датчик**: она ни с чем не сталкивается, но сообщает, когда в неё что-то вошло. Для этого есть `TriggerArea`; мы наследуемся и
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

- **Фильтр по тегу `player`.** Ящик или пуля, пролетающие через монету, её не подберут.
- **`this.Entity.Destroy()`** - монета исчезает вместе с телом-датчиком и мешем (оба убираются в `OnDestroy` своих компонентов - вручную чистить не надо).

Как монета выглядит в манифесте (крутящийся диск, форма датчика чуть больше диска - «щедрый» радиус подбора):

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

Обрати внимание на `rotation: StandingUp`: цилиндр в Babylon лежит вдоль Y, а монету нужно поставить на ребро. `Spinner` вращает вокруг мировой оси Y - у диска на ребре
получается вращение «как у монетки на столе», потому что поворот накладывается поверх стартового.

## Шаг 3. Судья - `GameRules`

```ts
export const enum CoinHuntState {
	Playing = 0,
	Won,
	Lost,
}

/** The HUD's UI document, by its Id in the project's UI manifest. */
const HudId = "CoinHuntHud";

/**
 * The referee: counts coins, runs the clock, decides win/lose, restarts on R. One of these lives on an entity called
 * "Game"; everything else finds it by name.
 */
export class GameRules extends Component {
	private _ui: GameUi | null = null;
	private readonly _hudText = new Map<string, string>();
	public TimeLimitSeconds = 60;
	/** The data asset with the rules (Content/Data/CoinHuntRules.csedata). */
	public RulesId = "CoinHuntRules";
	public CoinTag = "coin";

	public Total = 0;
	public Collected = 0;
	public TimeLeft = 0;
	public State: CoinHuntState = CoinHuntState.Playing;

	public override Start(): void {
		// Start runs after EVERY entity's Awake, so all coins already exist here (Awake would be too early to count them).
		this.Total = this.Engine.World.FindByTag(this.CoinTag).length;
		// Coin Hunt's own setting: the time limit (it applies when a game starts). Its default and choices come from the
		// project's CoinHuntRules data asset; a project without one uses this component's own limit.
		const rules = this.Engine.Data.Has(this.RulesId) ? this.Engine.Data.Get(CoinHuntRules, this.RulesId) : null;
		const own = String(rules?.TimeLimitSeconds ?? this.TimeLimitSeconds);
		const choices = [...new Set([...(rules?.TimeLimitChoices ?? [30, 60, 90]).map(String), own])].sort((a, b) => Number(a) - Number(b));
		const limit = this.Engine.Settings.Declare({ Key: "TimeLimit", Label: "Time limit (seconds)", Category: "Coin Hunt", Kind: "Choice", Default: own, Choices: choices });
		this.TimeLimitSeconds = Number(limit);
		this.TimeLeft = this.TimeLimitSeconds;
	}

	public Collect(): void {
		if (this.State !== CoinHuntState.Playing) return;

		this.Collected++;
		if (this.Collected >= this.Total) {
			this.State = CoinHuntState.Won;
			const seconds = (this.TimeLimitSeconds - this.TimeLeft).toFixed(1);
			this.Engine.Ui.Toast(`All coins collected in ${seconds} s! Press R to play again.`);
		}
	}

	public override Update(dt: number): void {
		if (this.State !== CoinHuntState.Playing) return;

		this.TimeLeft = Math.max(0, this.TimeLeft - dt);
		if (this.TimeLeft === 0) {
			this.State = CoinHuntState.Lost;
			this.Engine.Ui.Toast("Time's up! Press R to try again.");
		}
	}

	public override OnInputUpdate(input: InputService): void {
		if (this.State !== CoinHuntState.Playing && input.ActionJustPressed("Restart")) {
			const scene = this.Engine.Scenes.CurrentSceneId;
			if (scene) void this.Engine.Scenes.Load(scene); // everything, this component included, is rebuilt from the manifest
		}
	}

	/** The HUD is a UI document (Content/UI/CoinHuntHud.ui.json): shown with the game, its labels changed when their text does. */
	public override OnUIUpdate(): void {
		if (!this._ui) {
			this._ui = GetGameUi();
			this._ui.Show(HudId);
		}
		this.SetHudText("Coins", `Coins: ${this.Collected} / ${this.Total}`);
		this.SetHudText("Time", this.State === CoinHuntState.Playing ? `Time: ${this.TimeLeft.toFixed(1)}` : this.State === CoinHuntState.Won ? "YOU WIN - R to restart" : "TIME'S UP - R to restart");
	}

	/** Leaving the scene (or restarting it) takes the HUD away; the new game shows it again. */
	public override OnDestroy(): void {
		this._ui?.Hide(HudId);
	}

	private SetHudText(widget: string, text: string): void {
		if (this._hudText.get(widget) === text) return;
		this._hudText.set(widget, text);
		this._ui!.SetText(HudId, widget, text);
	}
}
```

Что здесь стоит запомнить:

- **Монеты считаем в `Start`, а не в `Awake`.** `Start` идёт после `Awake` *всех* сущностей, так что к этому моменту все монеты точно существуют. Подсчёт по тегу не требует
  менять `GameRules` при добавлении монеты: нарисовал ещё одну с тегом `coin` - и `Total` вырос сам.
- **Лимит времени - настройка, подкреплённая данными.** Значение по умолчанию и варианты (30, 60, 90) берутся из data asset `CoinHuntRules`
  (`Content/Data/CoinHuntRules.csedata`, правится без пересборки, гайд 15); `Settings.Declare` выводит их на экран настроек как выбор «Time limit (seconds)»
  (гайд 14), и выбор игрока применяется при старте игры. Проект без файла данных использует собственный `TimeLimitSeconds` компонента.
- **Состояние явное** (`const enum CoinHuntState`: `Playing`, `Won`, `Lost`) и в одном месте. Остальные проверки - `if (this.State !== CoinHuntState.Playing) return`.
- **Рестарт - это перезагрузка сцены.** `Scenes.Load(текущая)` выгружает всё (`OnDestroy` у всех) и пересобирает из манифеста: монеты на местах, таймер заново, счёт 0.
  Писать «сбросить всё вручную» не нужно - сцена-как-данные даёт это бесплатно. Клавиша - **действие `Restart`** из файла ввода (`R`, а на геймпаде `Start`), а не зашитая в код клавиша.
- **HUD - это UI-документ.** `OnUIUpdate` при первом вызове показывает `CoinHuntHud` через `GetGameUi()`, затем меняет подписи `Coins` и `Time` - и только когда их текст действительно изменился
  (иначе сообщение уходило бы каждый кадр). `OnDestroy` прячет документ, так что уход со сцены (или её рестарт) убирает HUD, а новая игра показывает его снова.

Судью мы вешаем на **отдельную пустую сущность** `Game`: у неё нет ни меша, ни тела - просто «место для логики».

## Шаг 4. Документ HUD

`Content/UI/CoinHuntHud.ui.json` сделан в UI Designer (гайд 11): окно в правом верхнем углу (привязано к правому краю, так что остаётся там при любом размере экрана) с двумя подписями по имени
`Coins` и `Time`. Скрипты обращаются к виджетам по этим именам (`ui.SetText(HudId, "Coins", ...)`). Документ указан в `Content/UI/Ui.manifest.json` под Id `CoinHuntHud`, а дескриптор проекта
включает UI-плагин (`"Plugins": [{ "Name": "UI", "Enabled": true }]`), который и показывает документы поверх игры (гайд 13). Хочешь другой вид? Открой документ в дизайнере,
измени и сохрани: скрипт не меняется, пока имена подписей те же.

## Шаг 5. Управление

Сцена говорит `input: "CoinHunt"`, значит, в неё играют с файлом ввода `Content/Input/CoinHunt.input.json` (гайд 14): карта `OnFoot` с `MoveForward/Back/Left/Right`
(WASD и стрелки, левый стик), `Jump` (Space, `A`), `Look...` (правый стик), `ToggleView` (`V`) и `Restart` (`R`, `Start`). Компоненты движка (`MoverComponent`, `CameraComponent`) знают эти имена по соглашению,
а `GameRules` спрашивает `Restart`. Игрок может переназначить всё на экране настроек.

## Шаг 6. Падение с арены

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

Компонент ставится в манифест игрока **перед** `MoverComponent`. Причина - порядок хуков: сначала `FallRespawn.OnPhysicsUpdate` обнуляет скорость и
переносит игрока на старт, потом мувер в том же шаге считает ход с чистого листа. Если поставить после, мувер успеет в этом шаге отправить ход с падающей скоростью.

## Шаг 7. Сборка сцены

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

Высоты монет посчитаны как «верх блока + 1 м»: **центр капсулы находится на метр выше ступней**. Если ставишь предмет, который должен «лежать» на блоке высотой 1,
центр ставь на `1 + половина размера предмета`.

## Шаг 8. Играй и проверяй

- Собери все девять до конца таймера - тост «All coins collected in … s! Press R to play again.», «YOU WIN» в HUD.
- Дай таймеру дойти до нуля - «Time's up!», `R` перезапускает.
- Спрыгни с арены - окажешься на старте.
- Открой настройки (меню паузы → Settings) и поменяй «Time limit (seconds)»: новое значение применится к следующей игре.
- Самые дальние монеты: на площадке после рампы и над лифтом (поднимись и прыгни).

Автоматическая проверка того же (без браузера): `pnpm test -- GameLogicRuntime` → *coin hunt sample game*: подбор монеты, фильтр «не игрок», победа, поражение + рестарт, респаун.

## Как развивать дальше

| Хочешь | Где смотреть |
|---|---|
| Больше времени / монет | `TimeLimitSeconds` / `TimeLimitChoices` в `Content/Data/CoinHuntRules.csedata` (без пересборки); добавь `CoinAt(...)` и позицию в `CoinPositions` |
| Звук подбора | `this.Engine.Audio.PlaySound("coin", this.Transform.Position)` в `Coin.OnBodyEntered` (звук нужно положить в `AudioBank`) |
| Движущиеся враги, отбрасывающие на старт | рецепт `Hazard` + `PlatformMover` (гайд 08) |
| Батут до далёкой монеты | рецепт `LaunchPad` (гайд 08) |
| Двойной прыжок | рецепт `DoubleJumpMover` (гайд 08) |
| Несколько уровней | вторая сцена `coin-hunt-2` (регистрируется в главном модуле, гайд 02) и в `GameRules` - `Scenes.Load("coin-hunt-2")` при победе |
| Полоса времени вместо цифр | добавь полосу прогресса в `CoinHuntHud.ui.json` в дизайнере и задавай её через `ui.SetValue(HudId, "TimeBar", процент)` (гайд 13) |

Дальше → [08. Рецепты](08-recipes.md)
