**English** | [Русский](../../ru/guides/04-physics.md)

# 04. Physics

The physics is the real BEPU (in wasm); it lives in a separate worker and steps at a fixed **60 Hz**. Your scripts
in `GameLogic` talk to it through the body components and through `this.Engine.Physics`.

## How it works (so you understand the delays)

```
GameLogic ──commands (batched per step)──▶ PhysicsWorker ──simulation step──▶ state snapshot ──▶ GameLogic
```

- Everything you ask of the physics (impulse, velocity, teleport, a character move) is executed on the **next** step.
- Everything you read (`LinearVelocity`, a body's position) is the state **after the last** step.
- Queries (`SweepSphere` and the like) are **asynchronous**: they return a `Promise`.

For a game this usually doesn't matter (16 ms), but it explains why, for example, "set a velocity and read it right back" returns the old one.

## The kinds of bodies

| Component | What it is | What moves it |
|---|---|---|
| `StaticBody` | the level: walls, floor, terrain | never moves |
| `RigidBody` | an ordinary dynamic object | the simulation; you - with impulses/velocities |
| `KinematicBody` | a platform, a door - a body you control | your script (through `Transform`), but it pushes others |
| `TriggerArea` | an invisible "zone": collides with nothing, only reports entering/leaving | shouldn't move (or `BuildAsStatic = false` - follows the entity) |
| `SimpleTriggerArea` | a lightweight zone for **one** target (usually the player), without the physics | - |
| `CharacterBody` / `MoverComponent` | a capsule character (see 05) | collide-and-slide |
| `Projectile` | a fast small sphere: a bullet, a rocket | its own checks, no tunnelling |

Common body fields: `Shape`, `Layer`, `Mask`. `RigidBody` also has `Mass` and `ContinuousDetection`.

## Shapes

`Shapes.Box(w, h, d)` - **full** sizes. `Sphere(r)`. `Capsule(r, fullHeight)`. `Cylinder(r, h)`.
`ConvexHull([x0,y0,z0, …])` - the convex hull of a point cloud (dynamic or static). `TriangleMesh(vertices, scale)` -
**static only** (terrain, complex geometry): a flat list of triangles. The engine compensates `ConvexHull`'s centre of mass
by itself - the entity's position stays where the "origin" of your points is.

## Layers and masks

Every body has a `Layer` ("who am I") and a `Mask` ("who do I interact with"). Two bodies interact when
**each sees the other**: `(A.Layer & B.Mask) != 0` and `(B.Layer & A.Mask) != 0`.

```ts
CollisionLayer.World      // 1   the level
CollisionLayer.Character  // 2   player/NPC
CollisionLayer.Projectile // 4
CollisionLayer.Trigger    // 8
CollisionLayer.Prop       // 16  crates, balls
CollisionLayer.Debris     // 32
CollisionLayer.All        // -1  all bits (in int32; the bridge needs it that way)
```

For your own layers, add bits in `Engine/Core/CollisionLayer.ts` (`Enemy = 1 << 6`) and combine with `|`:
`Mask: CollisionLayer.World | CollisionLayer.Prop`. Typical setups: a bullet (`Layer: Projectile`,
`Mask: World | Prop`) doesn't see the player; a trigger sees everyone; a crate (`Prop`) sees the world, other crates and the player.

## Collisions and triggers

- `OnTriggerEnter(other)` / `OnTriggerExit(other)` - called on **both sides**, `other` is the second entity. For a trigger
  it's easier to extend `TriggerArea` and override `OnBodyEntered(body)` / `OnBodyExited(body)` (this is how `Coin`, `TriggerZone`, `LaunchPad` are made).
- `OnCollisionEnter(other)` / `OnCollisionExit(other)` - the start/end of contact between solid bodies. By the physics layer's code, contacts
  are generated when the pair includes a **dynamic** body (or a trigger): a crate hits a wall - there's an event; the player (a kinematic)
  walks on a static floor - no event (for "am I standing on the ground" there's `IsOnFloor`, see 05).

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

## Pushing, accelerating, teleporting

`RigidBody` (component methods):

```ts
body.ApplyImpulse(new Vec3(0, 6, 0));               // a push (mass is taken into account), through the centre
body.ApplyImpulse(impulse, worldPoint);             // a push at a point - it will spin
body.SetLinearVelocity(new Vec3(5, 0, 0));          // set the velocity
body.SetAngularVelocity(new Vec3(0, 3, 0));
body.Teleport(new Vec3(0, 5, 0));                   // move (velocities are kept - zero them yourself if needed)
body.LinearVelocity                                  // the last known velocity (read)
```

Sleeping bodies wake up from these calls by themselves.

**Moving the `Transform.Position` of a `RigidBody` is useless** - the body owns the pose; `Transform` is overwritten from the simulation every step.

## Platforms and doors: kinematics

`KinematicBody` is a body you control. The secret is the order of components: first a script moves the `Transform`
(`PushPhysicsPose` - so the picture is smoothed), **then** `KinematicBody` in its `OnPhysicsUpdate` reports the new pose to the physics.
The physics derives the velocity from the displacement itself - so whoever stands on the platform rides with it, and crates on it don't slide off.

```ts
Ent("Lift", [
	Comp(MeshRenderer, { Mesh: MeshForShape(shape), Color: [0.85, 0.7, 0.25] }),
	Comp(PlatformMover, { Axis: [0, 1, 0], Distance: 1.5, PeriodSeconds: 6 }),   // 1. moves the Transform
	Comp(KinematicBody, { Shape: shape, Layer: CollisionLayer.World }),         // 2. reports the pose to the physics
], { position: [2, 1.6, -9] }),
```

Swap them and the platform will lag a step behind and the character will start to "slide" on it. The ready-made `PlatformMover` and `Door` are in
`Game/Scripts/`.

## Queries: "what's ahead?"

`this.Engine.Physics.SweepSphere(origin, direction, distance, radius, layer, mask, excludeEntity?)` "sweeps" a sphere
and returns a `Promise` with the first hit: `hit`, `distance`, `point`, `normal`, `hitEntityId`. With a small radius it is an
ordinary "raycast". The pattern is **one question at a time**:

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

The camera's spring arm (`CameraComponent`) and the bullet (`Projectile`) work the same way.

## Projectiles

`Projectile` (radius, `Velocity`, `ApplyGravity`, `Gravity`, `MaxLifetimeSeconds`, `DestroyOnHit`) moves with checks, not with the
solver: it doesn't "bounce" but **stops at the point of impact** and reports exactly once - at any speed it doesn't pass
through a wall. To find out what it hit, implement `OnProjectileHit(point, normal, hitEntity)` on any component of the same entity
(an example is `BulletHit` and `Shooter` in `Game/Scripts/Scripts.ts`, used in the *Character test room* scene). After a hit
or once `MaxLifetimeSeconds` runs out, the projectile calls `Despawn`: a bullet from a pool goes back into it, the others are destroyed.
`Shooter` takes bullets from an `EntityPool` of `MaxBullets` (see guide 03, "A pool instead of Spawn/Destroy").

## Pitfalls

| Symptom | What to check |
|---|---|
| A fast small object flies through a thin wall | `ContinuousDetection: true` on the `RigidBody`; make the wall thicker; for bullets - `Projectile` |
| An object doesn't collide | Layers/masks (the "each sees the other" rule); whether both bodies exist at all |
| Right after `Spawn` a command to the body "didn't work" | Give it from `Start` (guide 03) |
| `TriangleMesh` on a dynamic body | Not allowed: static only. For a moving one - `ConvexHull` |
| The platform "drifts" relative to the player | Component order: the movement script **before** `KinematicBody` |
| An object flew off strangely after a teleport | `Teleport` doesn't zero the velocity - `SetLinearVelocity(new Vec3())` |
| No physics at all | The wasm isn't built: see 01; in that case a toast about it appears at startup |

Next → [05. Player and camera](05-player-and-camera.md)
