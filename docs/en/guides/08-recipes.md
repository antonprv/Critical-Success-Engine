**English** | [Русский](../../ru/guides/08-recipes.md)

# 08. Recipes

Short ready-made components. The code is from `Core/Source/Engine/Gameplay/Recipes.ts`, it's compiled and tested (`Tests/Recipes.test.ts`):
copy what you need.

## A sliding door

It opens when the player is closer than `TriggerDistance`. The body is kinematic: the door pushes crates and other dynamic bodies, and it **stops** the player
(their move runs into the door like a wall), but doesn't push them out - kinematics don't collide with each other, so don't lower
the door onto a player standing in the doorway.
**The order of components matters**: `Door` moves the `Transform`, `KinematicBody` after it reports the new pose to the physics.

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
	Comp(Door, { TriggerDistance: 4, OpenHeight: 3, Speed: 3 }),       // 1. moves the Transform
	Comp(KinematicBody, { Shape: DoorShape, Layer: CollisionLayer.World }), // 2. reports to the physics
], { position: [0, 2, 0] }),
```

## A falling-crate spawner

Drops a crate every `IntervalSeconds`; when there are more than `MaxCrates` crates, the oldest disappears. A model for "creating entities from a script".

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

Crates that fell off the arena don't pile up: `MaxCrates` removes the old ones - this protects against an entity leak.

## A trap (sends you back to the start)

Any entity that is closer than `Radius` to the player returns them to `SpawnPoint`. Attach it to a moving "spikes" platform
(`PlatformMover`) - you get a patrol.

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

(Here the trap has no body - it checks the distance itself. If you need an actual physical contact, make a `TriggerArea` and call `Teleport` in `OnBodyEntered`.)

## A trampoline

A trigger that launches whoever enters it. The mover's velocity is changed in the trigger callback - and it runs inside the physics step,
right before the mover's `OnPhysicsUpdate`, so the push isn't overwritten (see the rule in guide 05).

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

`Speed: 14` with gravity −20 gives a rise of about 4.9 m (`v²/(2g)`).

## Sprint

Hold Shift - go faster. It changes a number in the mover's profile (the profile is shared by all movement modes). The key comes from the `Sprint` action of the project's input file (in the First Person template - Shift and the left stick's click, guide 14); you can change `Action` in the manifest.

```ts
/** Hold Left Shift to run faster. Works by scaling the mover's profile (the profile is shared by all movement modes). */
export class Sprint extends Component {
	public Multiplier = 1.6;
	/** The input action that sprints (Shift, the left stick's click). */
	public Action = "Sprint";

	private _baseSpeed = 0;
	private _mover!: MoverComponent;

	public override Start(): void {
		this._mover = this.Entity.RequireComponent(MoverComponent);
		this._baseSpeed = this._mover.Profile!.MaxSpeed; // the mover created its profile in Awake, which ran before every Start
	}

	public override OnInputUpdate(input: InputService): void {
		this._mover.Profile!.MaxSpeed = this._baseSpeed * (input.IsActionDown(this.Action) ? this.Multiplier : 1);
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

It reads `MaxSpeed` in `Start` (the profile is created in the mover's `Awake`, and `Awake` runs before all `Start`s) - so the order of the components doesn't matter.

## Double jump

This is a "trait" - a piece of movement logic (see guide 05). It fires only when jump is pressed in the air, nobody has performed the jump yet in this tick
(`ctx.JumpConsumed`) and there are air jumps left; on the ground the counter is refilled.

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
Comp(DoubleJumpMover, { InitialMode: MovementPreset.Custom }),   // instead of MoverComponent
```

One nuance worth knowing: the "air" jumps are refilled only after the **first** landing - a player who spawned in the air doesn't have them yet.
If you want it otherwise, initialise `_airJumpsLeft = MaxAirJumps` in the field.

## Cheat sheet: what to apply to what

| I want | The basis |
|---|---|
| A moving platform/door/lift | `KinematicBody` + a script that moves the `Transform` **before** it |
| An object that reacts to the player touching it | `TriggerArea` + `OnBodyEntered` |
| Damage, score, a timer | a separate "referee" component on an empty entity, communicating by name/tag |
| Something that appears during the game | `this.Engine.World.Spawn(Ent(...))` |
| Reset the level | `this.Engine.Scenes.Load(this.Engine.Scenes.CurrentSceneId!)` |
| Change the movement physics | a `MoverComponent` subclass + `GetCustomTraits()` |

Next → [09. When something doesn't work](09-troubleshooting.md)
