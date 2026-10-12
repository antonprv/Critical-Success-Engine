**English** | [Русский](../../ru/guides/07-coin-hunt.md)

# 07. Coin Hunt: a whole game

Let's build a real mini-game from what we have: an arena, a player, nine coins, a lift, a 60-second timer, win/lose, restart with `R`.
It's already in the project and registered - pick **Coin Hunt (sample game)** in the menu. The files:

- the scene: `Source/Game/Scenes/CoinHuntScene.ts`
- the scripts: `Source/Game/Scripts/CoinHunt.ts` (three components)
- a test that plays it without a browser: `Tests/GameLogicRuntime.test.ts` → *coin hunt sample game*

We'll go the way you'd write it from scratch. Each step can be run on its own.

## The plan: who is responsible for what

| Entity | Components | Role |
|---|---|---|
| `Game` | `GameRules` | the referee: counts coins, runs the timer, decides win/lose, restart |
| `Coin N` (×9) | `MeshRenderer`, `Spinner`, `Coin` | a collectable coin; the `coin` tag |
| `Player` | `MeshRenderer`, `FallRespawn`, `MoverComponent` | the player; the `player` tag |
| `Camera` | `CameraComponent` | a third-person view |
| the arena, `Lift` | statics, `PlatformMover` + `KinematicBody` | where we run around |

A design rule: **one component - one responsibility, communicate by name/tag**. A coin knows nothing about the timer, and the timer knows nothing
about how coins are built: a coin just tells the referee "I was picked up".

## Step 1. The arena and the player

The floors, walls, blocks, ramp and lift are the same as in guides 02 and 04 (`StaticBox`, `PlatformMover` + `KinematicBody`). The player and camera are from guide 05.
Run the scene without coins and make sure you can run, jump and the lift carries you.

## Step 2. A coin is a trigger

A coin is a **sensor sphere**: it collides with nothing, but reports when something enters it. For this there's `TriggerArea`; we extend it and
override `OnBodyEntered`:

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

Two details:

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
	public State: CoinHuntState = CoinHuntState.Playing;

	public override Start(): void {
		// Start runs after EVERY entity's Awake, so all coins already exist here (Awake would be too early to count them).
		this.Total = this.Engine.World.FindByTag(this.CoinTag).length;
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
		if (this.State !== CoinHuntState.Playing && input.JustPressed("KeyR")) {
			const scene = this.Engine.Scenes.CurrentSceneId;
			if (scene) void this.Engine.Scenes.Load(scene); // everything, this component included, is rebuilt from the manifest
		}
	}

	public override OnUIUpdate(ui: UiService): void {
		ui.SetHud("game.coins", `Coins: ${this.Collected} / ${this.Total}`);
		ui.SetHud("game.time", this.State === CoinHuntState.Playing ? `Time: ${this.TimeLeft.toFixed(1)}` : this.State === CoinHuntState.Won ? "YOU WIN - R to restart" : "TIME'S UP - R to restart");
	}
}
```

What's worth remembering here:

- **We count coins in `Start`, not in `Awake`.** `Start` runs after the `Awake` of *all* entities, so by that moment all the coins definitely exist. Counting by tag doesn't require
  changing `GameRules` when a coin is added: you drew another one with the `coin` tag - and `Total` grew by itself.
- **The state is explicit** (`const enum CoinHuntState`: `Playing`, `Won`, `Lost`) and in one place. All the other checks are `if (this.State !== CoinHuntState.Playing) return`.
- **A restart is a scene reload.** `Scenes.Load(current)` unloads everything (`OnDestroy` for all) and rebuilds from the manifest: coins in place, the timer 60, the score 0.
  There's no need to write "reset everything by hand" - a scene-as-data gives you this for free.
- **The HUD captions** - `OnUIUpdate`: two lines with their own keys.

We put the referee on a **separate empty entity** `Game`: it has no mesh and no body - just a "place for logic".

## Step 4. Falling off the arena

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

## Step 5. Assembling the scene

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

## Step 6. Play and check

- Collect all nine before the timer ends - a toast "All coins collected in … s! Press R to play again.", "YOU WIN" in the HUD.
- Let the timer reach zero - "Time's up!", `R` restarts.
- Jump off the arena - you end up at the start.
- The farthest coins: on the platform after the ramp and above the lift (ride up and jump).

An automated check of the same thing (without a browser): `pnpm test -- GameLogicRuntime` → *coin hunt sample game*: picking up a coin, the "not the player" filter, a win, a loss + restart, the respawn.

## How to develop it further

| You want | Where to look |
|---|---|
| More time / coins | `TimeLimitSeconds` in the manifest; add a `CoinAt(...)` and a position in `CoinPositions` |
| A pickup sound | `this.Engine.Audio.PlaySound("coin", this.Transform.Position)` in `Coin.OnBodyEntered` (the sound has to be put in the `AudioBank`) |
| Moving enemies that knock you back to the start | the `Hazard` recipe + `PlatformMover` (guide 08) |
| A trampoline to a faraway coin | the `LaunchPad` recipe (guide 08) |
| A double jump | the `DoubleJumpMover` recipe (guide 08) |
| Several levels | a second scene `coin-hunt-2` and in `GameRules` - `Scenes.Load("coin-hunt-2")` on a win |
| A time bar instead of digits | `ui.SetBar("time", "Time", this.TimeLeft / this.TimeLimitSeconds)` |

Next → [08. Recipes](08-recipes.md)
