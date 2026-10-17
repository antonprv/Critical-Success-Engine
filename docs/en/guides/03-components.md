**English** | [Русский](../../ru/guides/03-components.md)

# 03. Custom components

A component is a class that extends `Component`. It is the **only extension point**: everything that makes a game a game
is written as components. If you've worked with Unity (`MonoBehaviour`) or Godot (a script on a node), the idea is the same, except
one entity can have any number of components.

## A minimal component

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

It's attached like this (in the scene manifest):

```ts
Ent("Crystal", [
	Comp(MeshRenderer, { Mesh: Meshes.Box(0.5, 0.5, 0.5), Color: [0.4, 0.9, 1] }),
	Comp(Hover, { Amplitude: 0.3, Speed: 3 }),   // public fields = what can be set from the manifest
], { position: [0, 1.5, 0] }),
```

Rules:

- The constructor takes **no parameters**. Configuration is only through public fields (`Comp(Type, { field: value })`).
- The manifest sets *data*, not methods. Private fields (`_baseY`) are your internal state.
- Hooks are overridden with the **`override`** keyword (`noImplicitOverride` is enabled in the project): a typo in a hook name
  (`Updte`) immediately becomes a compile error, instead of "the script somehow doesn't work".

## Lifecycle hooks

| Hook | When it's called |
|---|---|
| `Awake()` | once, **after the whole batch (the scene) is created** - other entities already exist, but their `Start` hasn't run yet |
| `Start()` | once, before this component's first `Update`/`OnPhysicsUpdate`; all `Awake`s have already run by then |
| `OnInputUpdate(input, dt)` | every frame, **first** |
| `Update(dt)` | every frame, second |
| `OnUIUpdate(ui, dt)` | every frame, third - this is where the HUD is updated |
| `OnPhysicsUpdate(dt)` | every **physics step** (a fixed 60 Hz, `dt` is constant and doesn't depend on FPS) |
| `OnCollisionEnter/Exit(other)` | start/end of contact between bodies (see 04) |
| `OnTriggerEnter/Exit(other)` | someone entered/left a trigger (see 04) |
| `OnDisable()` / `OnEnable()` | the entity was turned off / back on (`entity.Active`), for example returned to a pool and taken from it |
| `OnDestroy()` | the entity is destroyed or the scene is unloading |

Traversal order: entities - in creation order; the components of one entity - **top to bottom, as in the manifest**.

**Awake or Start?** A simple rule: in `Awake` - prepare *yourself*, in `Start` - talk to *others*. An example where this
is critical: a `RigidBody`'s body is created in its `Awake`; if your component asks the body for a velocity in its own `Awake`,
the command goes to the physics *before* the body-creation command and is ignored. In `Start` the order is already right:

```ts
/** Gives the rigid body a starting velocity once the body exists - and again each time the entity is reused. */
export class InitialVelocity extends Component {
	public Velocity: Vec3Tuple = [0, 0, 0];

	public override Start(): void {
		this.Launch();
	}

	public override OnEnable(): void {
		this.Launch();
	}

	private Launch(): void {
		this.Entity.RequireComponent(RigidBody).SetLinearVelocity(Vec3.FromTuple(this.Velocity));
	}
}
```

## What's available through `this.*`

| | |
|---|---|
| `this.Entity` | the owning entity: `Name`, `Tags`, `Transform`, `Id`, `Active`, `Destroy()` |
| `this.Transform` | the entity's pose: `Position` (Vec3), `Rotation` (Quat) |
| `this.Engine.World` | finding and creating entities |
| `this.Engine.Input` | keyboard/mouse |
| `this.Engine.Ui` | HUD and toasts |
| `this.Engine.Physics` | physics (queries, impulses - more often through the body components) |
| `this.Engine.Scenes` | loading scenes |
| `this.Engine.Time` | `Delta`, `FixedDelta`, `Elapsed`, `FrameCount` |
| `this.Engine.Audio`, `this.Engine.Render` | sound; low-level rendering |
| `this.Engine.Stream` | the DataStream: messages by tag (guide 19) |

The same subsystems come by contract too, which is how the templates get them: a field such as
`@Inject( IInputSubsystem ) private readonly _input!: IInputSubsystem;` is filled before `Awake` (guide 20). And a
component can be written in C# (guide 18).

## Time

Everything is in **seconds**. In `Update(dt)` and `OnPhysicsUpdate(dt)` move things as `speed * dt`. Timers - with accumulators
(`_age += dt`), not `setTimeout`: an accumulator honestly stops together with the game and resets together with the scene.

```ts
/** Removes its entity after `Seconds` - back to its pool if it came from one. */
export class Lifetime extends Component {
	public Seconds = 3;

	private _age = 0;

	public override OnEnable(): void {
		this._age = 0;
	}

	public override Update(dt: number): void {
		this._age += dt;
		if (this._age >= this.Seconds) Despawn(this.Entity);
	}
}
```

## Input

`this.Engine.Input` (and the `input` parameter in `OnInputUpdate`). The game doesn't ask "is Space pressed" but "is the Jump action pressed": the actions and their keys, mouse buttons and gamepad bindings are described by the project's input file, and the player can remap them (guide 14). So in your own components, use actions:

- `IsActionDown("Jump")` - the action is held (keyboard, mouse, gamepad or an on-screen button).
- `ActionJustPressed("Fire")` - pressed **in this frame** (for `Update`/`OnInputUpdate`); `ActionJustPressedPhysics("Fire")` - pressed since the last physics step (for `OnPhysicsUpdate`; a short tap won't be lost).
- `ActionValue("Accelerate")` - a value 0..1 (triggers and sticks are analogue).
- `GetMoveVector()` - the active map's `Move...` actions as `[x, y]` with a length of at most 1 (forward = **negative** y, as in Godot); `GetInputVector()` is the same.
- `ConsumeLookDelta()` - the mouse movement in pixels since the last call; `ConsumeWheel()` - the wheel.

Actions exist only in the maps the project describes: if the active map has no `Fire` action, it is simply never pressed. There are raw codes too: `IsKeyDown("KeyW")`, `JustPressed("Space")`, `JustPressedPhysics("Space")` (the codes are the same as `KeyboardEvent.code`: `KeyW`, `Space`, `ShiftLeft`, `Digit1`…; mouse buttons are `"Mouse0"` (left), `"Mouse1"`, …). But such a key can't be remapped and doesn't work with a gamepad.

While the game hasn't captured the mouse (a menu is on screen), all input is "empty" - keys aren't pressed, the mouse doesn't accumulate.

## Spawning and destroying

`this.Engine.World.Spawn(manifest)` creates an entity *right now*, but its `Awake`/`Start` run at the start of the next
pass (so you can "talk" to its components from the next frame, not on the same line). `entity.Destroy()` is deferred:
`OnDestroy` and the physics/mesh are removed at the end of the current pass, not in the middle of someone's hook.

```ts
/** Click to throw a ball where the camera looks. Balls come from a pool and go back to it after 10 seconds. */
export class BallGun extends Component {
	public Speed = 15;
	public MaxBalls = 16;

	private _balls: EntityPool | null = null;

	public override OnInputUpdate(input: InputService): void {
		if (!input.ActionJustPressed("Fire")) return;

		const camera = this.Engine.World.FindByName("Camera")?.GetComponent(CameraComponent);
		if (!camera) return;

		const direction = camera.GetForwardDirection();
		this._balls ??= new EntityPool(this.Engine.World, BallGun.Ball, { MaxSize: this.MaxBalls });
		this._balls.Acquire(camera.Transform.Position.Add(direction.Mul(1.5)), (ball) => {
			ball.RequireComponent(InitialVelocity).Velocity = direction.Mul(this.Speed).ToTuple();
		});
	}

	private static Ball() {
		const shape = Shapes.Sphere(0.3);
		return Ent("Thrown Ball", [
			Comp(MeshRenderer, { Mesh: MeshForShape(shape), Color: [1, 0.5, 0.2] }),
			Comp(RigidBody, { Shape: shape, Mass: 1, Layer: CollisionLayer.Prop }),
			Comp(InitialVelocity),
			Comp(Lifetime, { Seconds: 10 }),
		]);
	}
}
```

`Fire` is an action from the project's input file (the First Person template binds it to the left mouse button, guide 14); in a project whose active map has no `Fire`, the gun doesn't shoot.

Note: we hand over the initial velocity not with a direct call (there's no body yet), but through the `InitialVelocity` component.

**A pool instead of Spawn/Destroy.** Things that appear often and live briefly (bullets, balls, effects) are better not created
anew every time, but taken from an `EntityPool` (`Engine/Core/EntityPool.ts`):

- `pool.Acquire(position, prepare)` hands out a free entity, creates a new one, or, if the pool is full (`MaxSize`), reuses
  the oldest active one. `prepare` is called before the entity wakes up or is switched on: set the velocity, colour and so on there;
- `Despawn(entity)` returns an entity to its pool, and simply destroys an entity that isn't from a pool. That's why `Lifetime` and `Projectile`
  work the same with and without a pool;
- an entity returned to the pool is switched off (`Active = false`): `MeshRenderer` hides the mesh, the physics body leaves the simulation.
  When it's handed out again, `OnEnable` fires: the body is recreated at the new place. Reset your own state (timers, counters)
  in `OnEnable`, as `Lifetime` and `InitialVelocity` do.

## Finding entities and talking between components

- `World.FindByName("Player")`, `World.FindByTag("coin")`, `World.Get(id)`.
- `entity.GetComponent(Type)` (may return `undefined`), `entity.RequireComponent(Type)` (throws a clear error).
- Communication goes through lookup: a component finds "Game" by name and calls its method (this is how the coins in Coin Hunt work, guide 07).
  There's no event bus and none is needed: scenes are small, lookup by name is cheap.

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

**Look in `Start`, not in `Awake`** - otherwise the entity you're looking for may not be created yet (in `Awake` all the entities of the batch already exist,
but the habit of "`Start` for links" is more reliable). And **don't keep references to entities between scenes**: on a scene change everything is created anew.

## HUD

```ts
/** HUD line with the frame rate. */
export class FpsCounter extends Component {
	public override OnUIUpdate(ui: UiService, dt: number): void {
		if (dt > 0) ui.SetHud("fps", `FPS: ${(1 / dt).toFixed(0)}`);
	}
}
```

`SetHud(key, text)` - the key is there so independent components don't overwrite each other's lines. `SetHud(key, null)` removes the line.
Toasts: `this.Engine.Ui.Toast("Text")`. More in guide 06.

## Errors in scripts

If a hook throws an exception, the engine **writes to the log** `[Script] ClassName.Hook threw on entity "…"` and carries on with the frame -
the other scripts keep working. Look for this line in the console.

## Cheat sheet of pitfalls

| Pitfall | What to do |
|---|---|
| I move the `Transform.Position` of a `RigidBody` and the body doesn't move | The body takes precedence. Teleport with `rigidBody.Teleport(position)` (see 04) |
| A command to the body right after `Spawn` is ignored | Give it in another component's `Start()` |
| A hook isn't called | `Enabled = false` on the component or `Active = false` on the entity; a typo without `override`; a hook of the wrong tick (physics ≠ frame) |
| `Entity.Destroy()` and I use the entity right away | It's still alive until the end of the pass, but `IsDestroyed` is already `true` - check it |
| A reference to an entity went stale after a restart | Don't keep it between scenes; look it up again in `Start` |

Next → [04. Physics](04-physics.md)
