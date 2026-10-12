**English** | [Русский](../../ru/guides/02-first-scene.md)

# 02. First scene

A scene is **data**. You describe which entities exist and what components they're made of; the engine creates them,
calls the hooks and removes them on unload. No "imperative" object creation in `main`.

We'll make the **Ball pit** scene: a box and twelve balls falling into it.

## The coordinate system

- Right-handed, **Y up**, "forward" = **−Z** (like Godot and BEPU - which is why poses from the physics go into the renderer as is).
- Units are **metres**. Angles are radians. Colours are `[r, g, b]` in the range 0…1.
- A rotation is a quaternion `[x, y, z, w]`; it's easier to get one from `Quat.FromAxisAngle(axis, angle).ToTuple()`.

## Step 1. The scene file

Create `Source/Game/Scenes/BallPitScene.ts` (the finished version is in `Game/GuideExamples/BallPitScene.ts`):

```ts
import { CollisionLayer } from "../../Engine/Core/CollisionLayer";
import { Comp, Ent, type EntityManifest, type SceneManifest } from "../../Engine/Core/EntityManifest";
import { MeshForShape, Shapes } from "../../Engine/Core/Shapes";
import { FixedCamera } from "../../Engine/Components/Camera/CameraComponent";
import { MeshRenderer } from "../../Engine/Components/MeshRenderer";
import { RigidBody } from "../../Engine/Components/Physics/PhysicsBodies";
import { StaticBox } from "../SceneHelpers";
import { HudText } from "../Scripts/Scripts";
```

```ts
const BallShape = Shapes.Sphere(0.5);

function Ball(index: number): EntityManifest {
	// Colours are 0..1 rgb; this just walks round the colour wheel.
	const color: [number, number, number] = [
		(Math.sin(index * 1.7) + 1) / 2,
		(Math.sin(index * 1.7 + 2) + 1) / 2,
		(Math.sin(index * 1.7 + 4) + 1) / 2,
	];

	return Ent(`Ball ${index}`, [
		Comp(MeshRenderer, { Mesh: MeshForShape(BallShape), Color: color }),
		Comp(RigidBody, { Shape: BallShape, Mass: 1, Layer: CollisionLayer.Prop }),
	], { position: [(index % 4) - 1.5, 3 + index * 1.2, Math.floor(index / 4) - 1] });
}

export const BallPitScene: SceneManifest = {
	id: "ball-pit",
	name: "Ball pit",
	description: "Twelve balls fall into a box.",
	gravity: [0, -20, 0],
	clearColor: [0.1, 0.12, 0.18],
	entities: [
		StaticBox("Floor", [12, 1, 12], [0, -0.5, 0], [0.4, 0.45, 0.5]),
		StaticBox("Wall West", [1, 3, 12], [-6.5, 1.5, 0], [0.3, 0.33, 0.4]),
		StaticBox("Wall East", [1, 3, 12], [6.5, 1.5, 0], [0.3, 0.33, 0.4]),
		StaticBox("Wall North", [14, 3, 1], [0, 1.5, -6.5], [0.3, 0.33, 0.4]),
		StaticBox("Wall South", [14, 3, 1], [0, 1.5, 6.5], [0.3, 0.33, 0.4]),

		...Array.from({ length: 12 }, (_, index) => Ball(index)),

		Ent("Camera", [Comp(FixedCamera, { LookAt: [0, 1, 0], FovDegrees: 60 })], { position: [0, 9, 12] }),
		Ent("Hints", [Comp(HudText, { Lines: ["Esc - menu / scene select"] })]),
	],
};
```

## Step 2. Register the scene

In `Source/Game/GameScenes.ts`:

```ts
registry.Register(BouncingBallScene).Register(CharacterTestScene).Register(CoinHuntScene).Register(BallPitScene);
```

(don't forget `import { BallPitScene } from "./Scenes/BallPitScene";`). The first registered scene is loaded at startup,
the rest are available in the menu via `Esc`.

## Step 3. Run it

`pnpm dev` → Play → `Esc` → pick *Ball pit*. The balls should fall into the box (if the physics is built - see 01).

## Breakdown

**`Ent(name, components, options)`** - one entity. Options: `position`, `rotation`, `tags`. Components are attached and later
called **in the order they're listed** - this matters (see 04, platforms).

**`Comp(Type, { fields })`** - "add this component and set these fields". The fields are checked by the compiler: a typo
in a field name or a wrong type is a build error. Only *data* is set (not methods), right after creation, before `Awake`.

**A ball = two components, not one.** This is the engine's key idea:

- `MeshRenderer` is responsible for **how it looks** (mesh + colour);
- `RigidBody` is responsible for **how it behaves physically** (shape + mass + layers).

They know nothing about each other, so the collider shape and the mesh don't have to match (invisible walls, simplified colliders,
and so on). To avoid writing the numbers twice, there's `MeshForShape(shape)` - a mesh of the same dimensions.

**`Shapes.*`** - collider shapes: `Box(w, h, d)` (full sizes), `Sphere(r)`, `Capsule(r, fullHeight)`,
`Cylinder(r, h)`, `ConvexHull(points)`, `TriangleMesh(vertices)` (static only). **`Meshes.*`** - the same for the picture.

**`StaticBox(...)`** from `Game/SceneHelpers.ts` is just a shortcut: an entity with a box mesh and a static box collider.
Open the file and look, it's short - your own helpers are written the same way (`DynamicBox`, `DynamicShape` are there too).

**The camera.** A scene needs an entity with a camera component. `FixedCamera` stays in place and looks at `LookAt`;
`CameraComponent` follows the player (see 05). With no camera the renderer keeps its default position.

**`gravity`, `clearColor`** - the scene's world settings (on load the physics world is recreated with this gravity).

## Common mistakes

| Symptom | Cause |
|---|---|
| The object exists but isn't visible | No `MeshRenderer`, or its `Mesh` isn't set |
| The object is visible but falls through / hangs | No body (`StaticBody`/`RigidBody`) or the physics isn't built |
| The ball is stuck inside the floor | The position in the manifest is already inside the collider: start higher |
| The scene didn't show up in the menu | Not registered in `GameScenes.ts`, or its `id` matches another one |
| The error "Scene … is already registered" | Two `id`s are the same |

## Exercises

1. Make the balls different sizes (`Shapes.Sphere(0.3 + …)`) and masses (`Mass`).
2. Add a sloped plane: `StaticBox(…, { rotationX: 0.4 })`.
3. Change the hint text on screen: it's the `Lines` field of the `HudText` component (it's already in the scene).

Next → [03. Custom components](03-components.md)
