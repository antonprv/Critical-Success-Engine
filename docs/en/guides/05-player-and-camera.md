**English** | [Русский](../../ru/guides/05-player-and-camera.md)

# 05. Player and camera

In the *Character test room* scene and in *Coin Hunt* the player is an entity with three things: a capsule mesh, a `MoverComponent` (running, jumping)
and a camera in a separate `Camera` entity that follows it. Let's go through how it works and how to change it.

## A minimal player

```ts
const PlayerShape = Shapes.Capsule(0.5, 2);          // radius 0.5, full height 2 m

Ent("Player", [
	Comp(MeshRenderer, { Mesh: MeshForShape(PlayerShape), Color: [0.9, 0.9, 0.95] }),
	Comp(MoverComponent, { CameraName: "Camera" }),   // CameraName - the name of the camera entity (the default is exactly "Camera")
], { position: [0, 1.2, 8], tags: ["player"] }),

Ent("Camera", [Comp(CameraComponent, { TargetName: "Player", EyeHeight: 0.6 })]),
```

Three rules people usually trip over:

1. **Names are linked by strings**: `CameraName: "Camera"` on the mover and `TargetName: "Player"` on the camera. If you rename an entity, change the field too.
2. **The player's reference point is the centre of the capsule.** The eye height `EyeHeight` is measured from the centre: a 2 m capsule with eyes 0.6 m above the centre is 1.6 m from the floor.
   Spawn with `position.y ≥ 1.0 + a small gap` above the floor (otherwise the capsule ends up in the floor).
3. **The `player` tag** - coins and traps recognise the player by it. It's just a convention, the engine doesn't require it.

## How the player moves (and why a one-step delay is not a bug)

Every physics step `MoverComponent` runs a chain:

1. reads the result of the character's previous move (whether it's on the floor, what velocity is left after sliding along walls),
2. reads the input and turns it into a "desired direction" relative to the camera (horizontal only),
3. runs the velocity through the **traits** of the selected mode (gravity, friction, acceleration, jump…),
4. asks the physics: "move the capsule by `Velocity × dt`, sliding along obstacles".

The move itself is computed in the physics worker, and the result arrives with the next snapshot. The consequence: the character reacts to the
floor/wall with a one-step lag (16 ms) - but the sequence of values is the same as with the synchronous `MoveAndSlide` in Godot.

A practical rule: **change a character's `Velocity` from `OnPhysicsUpdate` or from collision/trigger callbacks** (they
run inside the physics step). If you set `Velocity` from `Update`, the next snapshot overwrites it with the result of the
previous move (see the "trampoline" recipe in 08 - it is done exactly the right way).

## Movement modes

`InitialMode` (and the `1`…`5` keys in the game) select a set of traits:

| Mode | Feel |
|---|---|
| `Quake` | classic Quake acceleration, a burst of sideways acceleration in the air |
| `Realistic` | friction and a smooth stop, limited control in the air |
| `Hybrid` | arcade: the velocity is smoothly "pulled" toward the target |
| `Doom3` | like Doom 3 (units are converted from inches) |
| `QuakeStrafeDoom2016` | the default: Doom 3 friction on the ground + Quake strafing in the air |
| `Custom` | your own list of traits (see below) |

## Tuning without code: the profile

`Profile` is a set of numbers shared by the modes: `MaxSpeed`, `GroundAcceleration`, `GroundFriction`, `AirAcceleration`,
`AirMaxSpeed`, `AirControl`, `JumpHeight`, `JumpBufferTime`, `CoyoteTime`. If it isn't set, a standard one is created (`JumpHeight` 1.8).

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

What the two "human" jump settings mean:

- `JumpBufferTime` - you pressed space *a bit before* landing, and the jump still happens;
- `CoyoteTime` - you pressed *a bit after* leaving the edge, and the jump still happens.

Which profile fields are actually used depends on the mode (for example, `AirControl` is read only by `Hybrid`/`Realistic`) - if a number
"changes nothing", look in `Engine/Components/Mover/Traits/Traits.ts` to see which traits the mode has and what they read.

## The capsule and the floor

The fields of `CharacterBody` (`MoverComponent` inherits from it): `Radius`, `Height`, `MaxSlideIterations` (4), `SkinWidth` (0.015),
`MaxFloorAngleDegrees` (46 - a steeper slope counts as a wall) and `FloorProbeDistance` (0.08). What the character exposes:
`IsOnFloor`, `FloorNormal`, `GroundEntityId` (what we're standing on), `Velocity`.

**No steps.** The character can't automatically step up onto stairs: any vertical ledge is a wall to it.
That's why the test scenes have ramps and blocks you have to **jump onto** instead of stairs. Make stairs as a ramp (≤ 46°).

**Teleport:** `characterBody.Teleport(position)` places the character and zeroes the velocity (otherwise after a fall the respawn would carry the fall velocity along).

## Your own set of traits (for example, a double jump or wind)

A mode is just a list of traits; a **trait** is a small object that receives the velocity and changes it. You make your own mode by extending
`MoverComponent` and overriding `GetCustomTraits()`; it's enabled with `InitialMode: MovementPreset.Custom`.

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
	Comp(WindyMover, { InitialMode: MovementPreset.Custom }),   // instead of MoverComponent
], { position: [0, 1.2, 8], tags: ["player"] }),
```

The order of traits in the list matters (they run top to bottom). If you want a double jump, the ready-made `DoubleJumpMover` is in
`Game/Scripts/Recipes.ts` (recipes, guide 08). The context a trait receives (`MovementContext`): `WishDirection`, `JumpRequested`,
`JumpConsumed` (set it to `true` if you performed the jump yourself), `IsOnFloor`, `Gravity`, `Profile`, `Delta`.

## The camera

`CameraComponent` - mouse look + following a target:

| Field | Default | What it does |
|---|---|---|
| `TargetName` | `"Player"` | who it follows |
| `EyeHeight` | 1.6 | the height of the "eyes" above the target's point (for a capsule centre use ~0.6) |
| `MouseSensitivity` | 0.1 | degrees per pixel |
| `FovDegrees` | 70 | the vertical field of view |
| `MinPitch` / `MaxPitch` | −85 / 85 | the limits of looking up/down |
| `ThirdPerson` | false | third-person view |
| `ArmLength`, `ArmRadius`, `ArmMargin` | 4, 0.2, 0.05 | the "boom": maximum distance, thickness, offset from a wall |
| `ToggleKey` | `"KeyV"` | the key that switches the view |

In third person the camera is on a boom: every frame (accounting for a pending answer) a sphere is swept "backwards", and the camera is pulled in toward the player if
there's a wall behind. It works only with bodies of the `World` layer. For a "static" scene (balls, dioramas) there's `FixedCamera` (`LookAt`, `FovDegrees`).

From your own code: `camera.GetForwardDirection()` / `GetRightDirection()` - where the camera is looking (this is how the mover builds "forward"),
`camera.Yaw`/`Pitch` (in degrees) can be read and written.

Next → [06. UI](06-ui.md)
