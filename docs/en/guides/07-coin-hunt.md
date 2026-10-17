**English** | [Русский](../../ru/guides/07-coin-hunt.md)

# 07. Coin Hunt: a whole game

Let's build a real mini-game from what we have: an arena, a player, nine coins, a lift, a timer (60 seconds by default), win/lose, restart with `R`.
It is the **Coin Hunt** project template (`src/Templates/CoinHunt`): the games of all the templates are in Games Sample, so pick **Coin Hunt (sample game)** in the menu,
or run the template on its own: `CSE_PROJECT=../../Templates/CoinHunt pnpm dev` (from `src/CSEngine/Core`). The files:

- the scene: `Source/Scenes/CoinHuntScene.ts`
- the scripts: `Source/Scripts/CoinHunt.ts` (three components)
- the rules data: `Source/Data/CoinHuntRules.ts` and `Content/Data/CoinHuntRules.csedata` (guide 15)
- the HUD: the UI document `Content/UI/CoinHuntHud.ui.json`, listed in `Content/UI/Ui.manifest.json` (guide 13)
- the controls: the input file `Content/Input/CoinHunt.input.json` (guide 14)
- the main module that registers the scene: `Source/TemplateProjectModule.ts` (guide 02)
- a test that plays it without a browser: `Core/Tests/GameLogicRuntime.test.ts` → *coin hunt sample game*

We'll go the way you'd write it from scratch. Each step can be run on its own.

## The plan: who is responsible for what

| Entity | Components | Role |
|---|---|---|
| `Game` | `GameRules` | the referee: counts coins, runs the timer, decides win/lose, restart, shows the HUD |
| `Coin N` (×9) | `MeshRenderer`, `Spinner`, `Coin` | a collectable coin; the `coin` tag |
| `Player` | `MeshRenderer`, `FallRespawn`, `MoverComponent` | the player; the `player` tag |
| `Camera` | `CameraComponent` | a third-person view |
| the arena, `Lift` | statics, `PlatformMover` + `KinematicBody` | where we run around |

A design rule: **one component - one responsibility, communicate by name/tag**. A coin knows nothing about the timer, and the timer knows nothing
about how coins are built: a coin just says "I was picked up" on the DataStream, and the referee hears it.

## Step 1. The arena and the player

The floors, walls, blocks, ramp and lift are the same as in guides 02 and 04 (`StaticBox`, `PlatformMover` + `KinematicBody`). The player and camera are from guide 05.
Run the scene without coins and make sure you can run, jump and the lift carries you.

## Step 2. A coin is a trigger

A coin is a **sensor sphere**: it collides with nothing, but reports when something enters it. For this there's `TriggerArea`; we extend it and
override `OnBodyEntered`:

```ts
/** What a coin publishes when the player picks it up (on "Coin.Collected"). */
export interface CoinCollected {
	Coin: string;
}

/** A pickup: a sensor volume that vanishes when the player touches it. It doesn't know the rules: it says "Coin.Collected". */
export class Coin extends TriggerArea {
	@Inject(IDataStream) private readonly _stream!: IDataStream;

	protected override OnBodyEntered(body: Entity): void {
		// Only the player picks coins up (a crate or a bullet drifting through does nothing).
		if (!body.Tags.has("player")) return;

		this._stream.Publish<CoinCollected>("Coin.Collected", { Coin: this.Entity.Name });
		this.Entity.Destroy();
	}
}
```

Three details:

- **The coin doesn't know the referee.** It publishes `"Coin.Collected"` on the DataStream (guide 19) and whoever cares listens: the
  `GameRules` count it, the C# `StreakTracker` (guide 18) counts streaks. Adding a third listener changes nothing here.
- **`@Inject(IDataStream)`** - the coin gets the stream from the game's DI container before its `Awake` (guide 20), by contract, not by
  reaching into the engine.
- **The `player` tag filter.** A crate or a bullet flying through a coin won't pick it up.
- **`this.Entity.Destroy()`** - the coin disappears together with the sensor body and the mesh (both are removed in their components' `OnDestroy` - nothing needs cleaning by hand).

What a coin looks like in the manifest (a spinning disc, the sensor shape slightly larger than the disc - a "generous" pickup radius):

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

Note `rotation: StandingUp`: a cylinder in Babylon lies along Y, but the coin needs to stand on its edge. `Spinner` rotates around the world's Y axis - on its edge the disc
spins "like a coin on a table", because the rotation is applied on top of the starting one.

## Step 3. The referee - `GameRules`

```ts
export const enum CoinHuntState {
	Playing = 0,
	Won,
	Lost,
}

/** The HUD's UI document, by its Id in the project's UI manifest. */
const HudId = "CoinHuntHud";

/**
 * The referee: counts coins, runs the clock, decides win/lose, restarts on R. It knows no coin: coins publish
 * "Coin.Collected" on the DataStream, it listens. Everything it uses of the engine comes by contract (@Inject).
 */
export class GameRules extends Component {
	@Inject(IGameUi) private readonly _ui!: IGameUi;
	@Inject(IUiSubsystem) private readonly _toasts!: IUiSubsystem;
	@Inject(IWorld) private readonly _world!: IWorld;
	@Inject(IDataAssets) private readonly _data!: IDataAssets;
	@Inject(ISettingsSubsystem) private readonly _settings!: ISettingsSubsystem;
	@Inject(IScenes) private readonly _scenes!: IScenes;
	@Inject(IDataStream) private readonly _stream!: IDataStream;
	private _collected: Subscription | null = null;
	private _showing = false;
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
		this.Total = this._world.FindByTag(this.CoinTag).length;
		this._collected = this._stream.Subscribe<CoinCollected>("Coin.Collected", () => this.Collect());
		// Coin Hunt's own setting: the time limit (it applies when a game starts). Its default and choices come from the
		// project's CoinHuntRules data asset; a project without one uses this component's own limit.
		const rules = this._data.Has(this.RulesId) ? this._data.Get(CoinHuntRules, this.RulesId) : null;
		const own = String(rules?.TimeLimitSeconds ?? this.TimeLimitSeconds);
		const choices = [...new Set([...(rules?.TimeLimitChoices ?? [30, 60, 90]).map(String), own])].sort((a, b) => Number(a) - Number(b));
		const limit = this._settings.Declare({ Key: "TimeLimit", Label: "Time limit (seconds)", Category: "Coin Hunt", Kind: "Choice", Default: own, Choices: choices });
		this.TimeLimitSeconds = Number(limit);
		this.TimeLeft = this.TimeLimitSeconds;
	}

	public Collect(): void {
		if (this.State !== CoinHuntState.Playing) return;

		this.Collected++;
		if (this.Collected >= this.Total) {
			this.State = CoinHuntState.Won;
			const seconds = (this.TimeLimitSeconds - this.TimeLeft).toFixed(1);
			this._toasts.Toast(`All coins collected in ${seconds} s! Press R to play again.`);
		}
	}

	public override Update(dt: number): void {
		if (this.State !== CoinHuntState.Playing) return;

		this.TimeLeft = FMath.Max(0, this.TimeLeft - dt);
		if (this.TimeLeft === 0) {
			this.State = CoinHuntState.Lost;
			this._toasts.Toast("Time's up! Press R to try again.");
		}
	}

	public override OnInputUpdate(input: InputService): void {
		if (this.State !== CoinHuntState.Playing && input.ActionJustPressed("Restart")) {
			const scene = this._scenes.CurrentSceneId;
			if (scene) void this._scenes.Load(scene); // everything, this component included, is rebuilt from the manifest
		}
	}

	/** The HUD is a UI document (Content/UI/CoinHuntHud.ui.json): shown with the game, its labels changed when their text does. */
	public override OnUIUpdate(): void {
		if (!this._showing) {
			this._showing = true;
			this._ui.Show(HudId);
		}
		this.SetHudText("Coins", `Coins: ${this.Collected} / ${this.Total}`);
		this.SetHudText("Time", this.State === CoinHuntState.Playing ? `Time: ${this.TimeLeft.toFixed(1)}` : this.State === CoinHuntState.Won ? "YOU WIN - R to restart" : "TIME'S UP - R to restart");
	}

	/** Leaving the scene (or restarting it) takes the HUD away; the new game shows it again. */
	public override OnDestroy(): void {
		this._collected?.Dispose();
		if (this._showing) this._ui.Hide(HudId);
	}

	private SetHudText(widget: string, text: string): void {
		if (this._hudText.get(widget) === text) return;
		this._hudText.set(widget, text);
		this._ui.SetText(HudId, widget, text);
	}
}
```

What's worth remembering here:

- **We count coins in `Start`, not in `Awake`.** `Start` runs after the `Awake` of *all* entities, so by that moment all the coins definitely exist. Counting by tag doesn't require
  changing `GameRules` when a coin is added: you drew another one with the `coin` tag - and `Total` grew by itself.
- **The time limit is a setting backed by data.** The default and the choices (30, 60, 90) come from the `CoinHuntRules` data asset
  (`Content/Data/CoinHuntRules.csedata`, editable without a rebuild, guide 15); `Settings.Declare` puts them into the settings screen as a "Time limit (seconds)" choice
  (guide 14), and the player's choice applies when a game starts. A project without the data file uses the component's own `TimeLimitSeconds`.
- **The state is explicit** (`const enum CoinHuntState`: `Playing`, `Won`, `Lost`) and in one place. All the other checks are `if (this.State !== CoinHuntState.Playing) return`.
- **A restart is a scene reload.** `Scenes.Load(current)` unloads everything (`OnDestroy` for all) and rebuilds from the manifest: coins in place, the timer reset, the score 0.
  There's no need to write "reset everything by hand" - a scene-as-data gives you this for free. The key is the **`Restart` action** of the input file (`R`, and `Start` on a gamepad), not a hard-coded key.
- **The HUD is a UI document.** `OnUIUpdate` shows `CoinHuntHud` through the injected `IGameUi` on the first call, then changes the `Coins` and `Time` labels - and only when their text actually changes
  (otherwise it would send a message every frame). `OnDestroy` hides the document, so leaving the scene (or restarting it) takes the HUD away and the new game shows it again.

We put the referee on a **separate empty entity** `Game`: it has no mesh and no body - just a "place for logic".

## Step 4. The HUD document

`Content/UI/CoinHuntHud.ui.json` is made in the UI Designer (guide 11): a window in the top right corner (anchored to the right, so it stays there at any screen size) with two labels named
`Coins` and `Time`. Scripts address widgets by those names (`ui.SetText(HudId, "Coins", ...)`). The document is listed in `Content/UI/Ui.manifest.json` under the Id `CoinHuntHud`, and the project's
descriptor enables the UI plugin (`"Plugins": [{ "Name": "UI", "Enabled": true }]`), which is what shows documents over the game (guide 13). Want a different look? Open the document in the designer,
change it and save: the script doesn't change as long as the label names stay.

## Step 5. The controls

The scene says `input: "CoinHunt"`, so it is played with the input file `Content/Input/CoinHunt.input.json` (guide 14): the `OnFoot` map with `MoveForward/Back/Left/Right`
(WASD and the arrows, the left stick), `Jump` (Space, `A`), `Look...` (the right stick), `ToggleView` (`V`) and `Restart` (`R`, `Start`). The engine's components (`MoverComponent`, `CameraComponent`) know these names by convention,
and `GameRules` asks for `Restart`. The player can remap everything on the settings screen.

## Step 6. Falling off the arena

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

The component goes in the player's manifest **before** `MoverComponent`. The reason is the hook order: first `FallRespawn.OnPhysicsUpdate` zeroes the velocity and
moves the player to the start, then the mover in the same step computes the move from a clean slate. If you put it after, the mover will have time in this step to send a move with the fall velocity.

## Step 7. Assembling the scene

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

The coins' heights were computed as "the top of the block + 1 m": **the capsule's centre is a metre above the feet**. If you place an object that should "lie" on a block 1 high,
put its centre at `1 + half the object's size`.

## Step 8. Play and check

- Collect all nine before the timer ends - a toast "All coins collected in … s! Press R to play again.", "YOU WIN" in the HUD.
- Let the timer reach zero - "Time's up!", `R` restarts.
- Jump off the arena - you end up at the start.
- Open the settings (the pause menu → Settings) and change "Time limit (seconds)": the new value applies to the next game.
- The farthest coins: on the platform after the ramp and above the lift (ride up and jump).

An automated check of the same thing (without a browser): `pnpm test -- GameLogicRuntime` → *coin hunt sample game*: picking up a coin, the "not the player" filter, a win, a loss + restart, the respawn.

## How to develop it further

| You want | Where to look |
|---|---|
| More time / coins | `TimeLimitSeconds` / `TimeLimitChoices` in `Content/Data/CoinHuntRules.csedata` (no rebuild); add a `CoinAt(...)` and a position in `CoinPositions` |
| A pickup sound | `this.Engine.Audio.PlaySound("coin", this.Transform.Position)` in `Coin.OnBodyEntered` (the sound has to be put in the `AudioBank`) |
| Moving enemies that knock you back to the start | the `Hazard` recipe + `PlatformMover` (guide 08) |
| A trampoline to a faraway coin | the `LaunchPad` recipe (guide 08) |
| A double jump | the `DoubleJumpMover` recipe (guide 08) |
| Several levels | a second scene `coin-hunt-2` (registered in the main module, guide 02) and in `GameRules` - `Scenes.Load("coin-hunt-2")` on a win |
| A time bar instead of digits | add a progress bar to `CoinHuntHud.ui.json` in the designer and set it with `ui.SetValue(HudId, "TimeBar", percent)` (guide 13) |

Next → [08. Recipes](08-recipes.md)
