**English** | [Русский](../../ru/guides/24-sdf.md)

# 24. The SDF world

The `Modules/Engine/SDF` module (`@cse/sdf`) is a world of signed distance fields on top of Babylon, following `plan.md`:
an ordered list of edits as the one source of truth, the exact field on the CPU, a cache of distances in bricks, a mesh
tier for weak devices, and a ray-marched layer that shares the depth buffer with Babylon's ordinary meshes.

```bash
cd src/CSEngine/Modules/Engine/SDF
pnpm dev          # the demo: http://127.0.0.1:5177/
pnpm test         # unit tests (100% coverage per file)
pnpm test:e2e     # the depth check in Chromium (after pnpm build)
pnpm bench        # timings of the CPU side
```

## The edit list

The world is a list of edits (`EditList`). An edit is a shape (sphere, box, rounded box, capsule, torus, cylinder,
ellipsoid), a pose and a uniform scale, a boolean operation with what comes before it (union, subtraction,
intersection and their smooth versions with radius `SmoothK`), a material, flags and a physics mode. Order matters:
the operations don't commute.

```ts
import { EditList, GroundPlane, SdfField, SdfOp, SdfShape } from "@cse/sdf";

const edits = new EditList();
const field = new SdfField( edits, new GroundPlane( 0 ) );   // L0: the ground

edits.Add( { Shape: SdfShape.Sphere, Position: [ 0, 1.6, 0 ], Params: [ 2, 0, 0, 0 ], MaterialId: 1 } );

// a hole you can move: an ordinary edit, not an irreversible mutation
const hole = edits.Add( {
	Shape: SdfShape.Sphere,
	Op: SdfOp.SmoothSubtract,
	Params: [ 0.9, 0, 0, 0 ],
	SmoothK: 0.3,
} );

edits.Update( hole.Id, { Position: [ 1, 0.2, 3 ] } );
```

Each edit packs into 64 bytes (`PackEdit`), the layout a GPU buffer takes. What else the list gives:

| | |
|---|---|
| `Version` | grows with every change; a worker reports which version it has caught up with |
| `Watch()` | its own stream of "changed boxes" for each consumer (bricks, chunks, physics) |
| `TakeDelta()` / `ApplyDelta()` | the changes as one transferable buffer for another worker; the same ids on the other side |
| `Serialize()` / `EditList.Deserialize()` | saving (a versioned binary format; preview edits aren't saved) |
| `Candidates( box )` | the edits that can change something in a region, in order (BVH; intersections always) |

## The field

`SdfField` gives the distance, the material, the normal (4 samples on a tetrahedron) and raycasts (sphere tracing over
only the edits on the ray's path). It is the reference for gameplay and physics. For sampling many points of one region
there is `field.Compile( edits )` - an `SdfProgram`: the edits packed into one array, the shapes and operations inlined
in the loop; the results equal `Evaluate`'s.

```ts
const hit = field.Raycast( [ 0, 5, 10 ], [ 0, -0.3, -1 ], 100 );   // T, Position, Normal, MaterialId, or null
const program = field.Compile( edits.Candidates( regionBox ) );
const d = program.Distance( x, y, z );
```

The base layer L0 is `GroundPlane` or `NoiseTerrain` (hills of value-noise octaves with a Lipschitz correction, so a
ray doesn't step through a hillside).

## Bricks

`SdfVolume` is one level of the cache (plan.md sections 5-6): an M³ window of the brick map around the eye with
toroidal addressing, an R8 atlas of 10³ slots (a brick of 8³ cells plus an apron for trilinear filtering),
copy-on-write when a brick is replaced. `Update()` takes the changed boxes, grows them by the encoded range, marks the
cells there stale and rebuilds at most `Budget` cells per call, nearest to the eye first; a stale brick stays visible
until its replacement is ready. `Sample( x, y, z )` reads the cache the way the GPU does (trilinearly).

For drawing, `Materials: true` keeps each node's materials in a second atlas of the same slots, `RangeSpacings` widens
the encoded range (occlusion and soft shadows read the field farther out than marching does: 8 spacings, as the dense
grid) and `Bounds` samples only the world inside a box. `SdfRaymarchLayer` takes such a volume instead of a dense grid:
`SdfBrickTexture` sends the atlases and the map (a texel a cell: a slot, solid, or how many cells of empty space lie
around, so a ray crosses it in long steps), later only the slots written and the map when it changed, and the shaders
compile with `SDF_BRICKS`. On scenes the size of the demo it is slower than the dense grid (two dependent reads a
step: 131 vs 88 fps at 1080p) and not smaller; it is the ground for the clipmaps of large worlds, where a dense volume
doesn't fit. The demo shows it with `?bricks=1`.

## The mesh tier

`SdfMeshChunks` builds the world as triangles around a center (the player): Surface Nets per chunk with shared borders
(no cracks, no double faces), gradient normals, baked AO, 16-bit indices. An edit remeshes only the chunks it reaches;
a chunk far from the surface is skipped after one sample at its center. This is how weak phones see the world (section
23), and the same chunks the physics needs (section 9.2).

## In a Babylon scene

```ts
import { DenseSdfGrid, SdfMeshChunks } from "@cse/sdf";
import { SdfMeshLayer, SdfRaymarchLayer } from "@cse/sdf/render";

// tier B: ray marching a dense grid, the depth goes into the shared buffer
const layer = new SdfRaymarchLayer( scene, new DenseSdfGrid( field, bounds, 160 ) );

// tier C: meshes
const meshes = new SdfMeshLayer( scene, new SdfMeshChunks( field, { CellSize: 0.2, ChunkCells: 20 } ) );
scene.onBeforeRenderObservable.add( () => meshes.Update() );
```

`SdfRaymarchLayer` draws the back faces of a box around the grid; the fragment shader marches the 3D texture, lights
the hit in the same pass (the sun and sky come from the scene's `DirectionalLight` and `HemisphericLight`, plus AO
and soft shadows through the field) and writes `gl_FragDepth`, so meshes in front of and behind the SDF surface are
sorted by the ordinary depth test. `DebugView`: normals, steps per pixel, distance bands. It needs WebGL2.

Before the screen pass the box is drawn into a target with a texel per 8x8 pixels (`ConeTiles`, by default `[ 8 ]`;
coarsest first for several levels, `[]` turns it off): a texel marches one cone around all its pixels' rays until a
surface comes nearer than the cone's radius, and every ray on screen starts there (cone marching, plan.md 20.1).
Empty space before a surface is crossed once a tile; where the cone met nothing the pixel is done without a step.
Every pixel still finds its own hit: on the still test scenes the picture is the same to the pixel, on a slab's edges
seen at a grazing angle a pixel may fall either way (sphere tracing decides those by where its steps land). The demo:
330 → 565 fps on mostly empty space, the march alone (`?view=2`) 230 → 350. It needs float render targets
(`SdfConeMarch.Supported`); without them the rays start at the box. The dynamic edits' hulls take `ConeTiles` too
(`MeshLayerOptions`), off by default: a hull's ray starts at its sphere, which the edit mostly fills - there the extra
pass costs more than it saves.

Both the ray-marched box and the dynamic edits' hulls are marched with a **checkerboard** (`Checkerboard`, on by default;
plan.md 21.7, after Decima): a frame marches half the corners of the pixel grid - those whose x + y + parity is even -
into a target of a texel a corner, the parity flips every frame, and the pixels on screen are resolved from their two
corners of this frame and, reprojected through the previous frame's camera and kept where they saw the same surface, the
two the previous frame marched. Half the rays a frame, four samples a pixel, no accumulation past two frames (no TAA
smear); edges come out smoother, a little softer. A corner's ray is built from its corner, not from where its texel
rasterizes, and the pass draws with the screen's view-projection (Babylon would fit one to the target's shape). Measured:
tier B 64 → 93 fps (`light`), 77 → 118 (`showcase`), 552 → 602 (`depth`); the hulls 235 → 259 (`sdf-dynamic-16`),
762 → 801 (`sdf-splats`). Lighting halves; the march saves less than half (a group of rays marches as long as its
longest, and the checkerboard's groups span twice the screen). In motion it flickers no more than without. It needs float
render targets, as the cones do; `?checker=0` turns it off in the demo.

`ChooseTier( DetectCapabilities( gl, "gpu" in navigator ) )` picks the tier from the device's capabilities, a short
benchmark and the player's choice.

## The baked base and the last edits

The editor keeps every edit and, when it builds, bakes them into one sampled field - `SdfBakedLayer`: cells of 8³
samples, a 9³ brick (distance and material, a byte each) for the cells near the surface, only the center distance
for the rest (a lower bound: rays still take long steps). The game holds an `SdfWorld`: that base and at most
`MaxEdits` recent edits. When there are more, the oldest are folded into the base (`Fold`: only the cells an edit
reaches are sampled again); edits flagged `Keep` (a moving hole) are never folded.

```ts
import { SdfBakedLayer, SdfEditFlags, SdfOp, SdfShape, SdfWorld } from "@cse/sdf";

// the editor's build: all its edits -> one base (it can be saved too: Serialize)
const base = SdfBakedLayer.Bake( editorField, { Bounds: bounds, Spacing: 0.1 } );

// in the game
const world = new SdfWorld( base, { MaxEdits: 16 } );
const hole = world.Add( { Shape: SdfShape.Sphere, Op: SdfOp.Subtract, Flags: SdfEditFlags.Keep } );
world.Add( { Shape: SdfShape.Sphere, Op: SdfOp.Subtract, Position: hit.Position } );   // digging
```

Folds travel in the edit list's deltas, so a replica of the world in a worker (`SdfWorld.FromBase` + `ApplyDelta`)
folds the same edits in the same order and matches the main world bit for bit. For that every number of an edit is
rounded to float32 as it enters the list - what the packed form and the GPU see anyway.

## The mesh tier in workers

`SdfMeshWorkers` is the same mesh tier, but each chunk is meshed by one of a pool of workers (the cores but one by
default), each holding a replica of the world. The pool takes the world's deltas and sends them on itself; chunks
not there yet are meshed before rebuilds, and a chunk still being meshed isn't sent again. The Babylon layer doesn't
care where its chunks come from:

```ts
import { CreateMeshWorker, SdfMeshWorkers } from "@cse/sdf";

const chunks = new SdfMeshWorkers( world, { CellSize: 0.2, ChunkCells: 20, Radius: 2 }, CreateMeshWorker );
const meshes = new SdfMeshLayer( scene, chunks );
```

Meshing skips what it can (plan.md 21.8 items 1-2): the chunk's nodes go in blocks of 4³, and a block whose center is
farther from the surface than the block reaches takes that one sample for all its nodes; the others are sampled with
only the edits that reach them (`ChunkOptions.SkipEmpty`, `Region`). The mesh is the same, the physics' chunks too:
0.95 → 0.61 ms for a chunk of ground, 5.0 → 3.4 ms for one with 37 edits in reach.

## Levels of detail

With `Levels` (chunk options, or `Levels` in the scene's `sdf` field) the chunks grow with the distance: a chunk of
level L has cells 2^L as big and as many of them. The last level's chunks fill `Radius` around the center; nearer,
each splits into its eight of the next finer level, down to level 0 within about `Radius` chunks of the player (an
octree, so chunks of different levels never overlap). Keys of level 0 stay `"x,y,z"`, the others are `"L:x,y,z"`.

```ts
// cells 0.25 m near, 4 m at level 4: a 320 m land in ~600 chunks
const chunks = new SdfMeshWorkers( world, { CellSize: 0.25, ChunkCells: 16, Radius: 2, Levels: 5 }, CreateMeshWorker );
```

- **Seams.** Where levels meet the borders don't match, so with more than one level every chunk builds one more row
  of quads (its mesh reaches half a cell past it on every side: neighbours overlap) and hangs skirts two cells deep
  from its open borders into the solid (`Skirts`). The physics never gets the skirts (`SdfMeshData.SkirtFrom`).
- **No blinking.** As the player moves, a chunk that leaves the area stays drawn until what replaces it is built;
  one that leaves altogether goes at once. The area is laid out again only after a move of an eighth of a chunk.
- **Shading.** The baked occlusion steps by level 0's cell at every level, so the shading doesn't change where the
  levels meet.
- **Steady shadows.** The sun's shadow map keeps its place while its casters stay in the box it was fitted to; refitted,
  its size is rounded to a step of 2^(1/4) and its center to a texel, and its normal bias grows with its texels. A map
  fitted anew every frame slid its texels over the world as chunks came and went, and the acne on every slope crawled.
- **Shadows.** Only levels below `ShadowLevels` (the mesh layer's option, default 2) cast into the sun's shadow map:
  the map fits its casters, and the far levels would spread it over the whole world (acne on every slope). Far
  shadows are cascades' job (the renderer, S6-06). All levels receive.
- **Physics.** It takes the chunks of the levels below `PhysicsLevels` (scene option, default 2); far chunks only cost
  it shapes. The SDF worker sees to the area and the pool at most every `PoolMs` (4 ms): GameLogic ticks every
  frame, and work on every tick of an uncapped game would queue ticks faster than they are taken.
- **Limits.** What is thinner than a level's cell vanishes at that distance (a 2 m slab under 4 m cells, a thin tower).
  The world under the ground must be deep enough for the coarsest cell. The mesh layer's `Triangles` is what is drawn
  now (the budget of plan.md 23.4).

The perf scene `sdf-lod`: a 256 m land, five levels, the camera flying round it at 15 m/s - 647 fps on the test
laptop, the camera still - 622 (125k triangles).

## Physics

A mesh-tier chunk is an ordinary CSPhysics static. The physics worker takes `PhysOpType.SdfChunk` (a key, the chunk's
positions and indices) and `RemoveSdfChunk`: a new chunk becomes a static, a rebuilt one swaps its shape in place
(`SetStaticShape`; bodies on it wake up), and the old mesh is freed.

## SDF in the engine

A scene declares its SDF world in its manifest's `sdf` field: the baked base (the editor's build file by URL, or edits
baked as the scene loads), the limit of recent edits and the mesh tier's settings. The world lives in a worker of its
own, the SDF worker: GameLogic holds only the recent edits and sends them once a frame as a delta, with the point the
chunks are built around (the camera, or the point `FocusAhead` in front of it); the chunks go from the SDF worker
straight to the renderer and the physics.

```ts
export const Level: SceneManifest = {
	id: "level", name: "Level", description: "…",
	sdf: {
		Base: { Url: "levels/level.sdf" },     // or { Bake: { Edits, Ground, Bounds, Spacing } }
		MaxEdits: 16,
		CellSize: 0.25, ChunkCells: 16, Radius: 3,
		FocusAhead: 20,
		Start: [ 0, 0, 0 ],                    // meshed first, before entities spawn
	},
	entities: [ … ],
};
```

A scene doesn't spawn its entities until the SDF worker has meshed the area around `Start` (for the renderer and
the physics alike), so bodies never fall through ground that isn't built yet. While the scene loads the worker
meshes around `Start`; set it where the camera's focus will be. The wait gives up after 30 s with a warning, and
a world that failed to load (`LoadError`) isn't waited for.

From a script - `this.Engine.Sdf`:

```ts
const hole = this.Engine.Sdf.Add( { Shape: SdfShape.Sphere, Op: SdfOp.Subtract, Flags: SdfEditFlags.Keep } );
this.Engine.Sdf.Update( hole.Id, { Position: [ x, y, z ] } );   // the id is known at once
const hit = await this.Engine.Sdf.Raycast( origin, dir );        // answered a frame later
```

## Light, shadows and occlusion

`SdfRenderContext` ties the SDF world and the scene's meshes together: they share the sun's shadow map (meshes shadow
the SDF world and the other way round; drawn at most `ShadowHz` times a second), and an ordinary mesh's material gets a
plugin that darkens it by the SDF world's occlusion (two samples of the volume per vertex) and by the other meshes'
(each mesh stands in as a sphere). The engine makes the context for an SDF scene by itself; `?shadows=off` and
`?sdfao=off` on the page switch both off for a test.

Tier B keeps two dear parts of its light off the hot path (plan.md 21.8):

- `LightResolution` (default 0.5 of the screen across and down): `SdfLightBuffer` marches the soft shadow and the
  occlusion at that resolution; the full-resolution pass still lights every pixel itself, taking those two factors
  from the four nearest texels that saw the same surface, and marching them itself where none did. 1080p: 94 → 113 fps
  (`light`), 112 → 132 (`showcase`).
- `ShadowCache` (default on): `SdfShadowCache` marches the box into the sun's view once and keeps it while the shadow
  map's matrix, the box, the field and the dynamic edits stay the same; the shadow pass then reads a texel instead of
  marching. While the edits keep changing it stays out of the way. 114 → 133 fps, the same frame.

## Dynamic edits

Edits that move every frame - a hole that follows the tunnel gun, a blob that floats, a splat in flight - are kept
apart from the edit list: no version, no delta, nothing folded, saved or meshed for drawing. The GPU draws them on top of
the world (the ray marcher, or a hull around each over the mesh tier), so moving one costs a few uniforms. At most
`MAX_DYNAMIC_EDITS` (16) at once.

```ts
const hole = this.Engine.Sdf.AddDynamic( {
	Shape: SdfShape.Sphere, Op: SdfOp.SmoothSubtract, Params: [ 1.5, 0, 0, 0 ], SmoothK: 0.4,
	Flags: SdfDynamicFlags.Physics,   // optional: the physics feels it too
} );
this.Engine.Sdf.UpdateDynamic( hole.Id, { Position: [ x, y, z ] } );   // every frame, for free
this.Engine.Sdf.RemoveDynamic( hole.Id );
```

With `SdfDynamicFlags.Physics` the SDF worker meshes the chunks the edit reaches again for the physics alone (never for
drawing), with the edit applied, at most 20 times a second and only once the physics took the last ones: balls fall
into a moving hole and roll over a moving blob. The chunks the edit leaves get their own meshes back.

## Layers and masks

An edit has a `Layer` (one bit of eight) and a `Mask` (the layers it merges with; all by default). Where an edit's mask
has the layer of the surface it meets, they merge: a smooth union fills the seam with a fillet and the two materials fade
into each other over `SmoothK`. Where it doesn't, they meet with a hard seam and keep their own materials - but still
shadow and occlude each other. A cut (`Subtract`) only cuts the layers of its mask.

```ts
world.Add( { Shape: SdfShape.Torus, Layer: 2, Mask: 2, MaterialId: 4 } );   // a torus that never melts into the rest
```

Dynamic edits and splats take the same `Layer` and `Mask`.

## Splats

A splat is a soft blob that sticks where it lands (paint, mud, slime). In the engine: an entity with a `Projectile` and
an `SdfSplat`. In flight it is a dynamic edit stretched along its velocity; where the projectile hits, `Engine.Sdf.Splat`
leaves an ordinary edit, an ellipsoid flattened against the surface (`SplatEdit`: its volume kept, a little sunk in),
merged with what it hit if the layers allow. Any number pile up: the oldest fold into the base.

```ts
Ent( "Splat", [
	Comp( Projectile, { Radius: 0.15, ApplyGravity: true } ),
	Comp( SdfSplat, { Radius: 0.22, MaterialId: 2, Layer: 1, Mask: ALL_LAYERS } ),
] );
```

## Splat grass

`sdf.Grass` in a scene's manifest grows grass over the SDF world: blades scattered over the surface where it is of one
of `OnMaterials`, drawn as thin instances in tiles of 8 m (a tile out of view isn't drawn; a far one draws only a
share of its blades, past `LodDistance`). Whatever moves over it - every mesh the context knows, as a sphere - presses
the blades flat, away from it; they stand up again over `Recover` seconds. A dynamic edit that takes the ground away
takes the blades too. Where the grass's mask has the ground's layer, the roots fade into the ground's colour.

```ts
sdf: { …, Grass: { Bounds: [ -13, -13, 13, 13 ], Density: 40, Height: 0.35, Recover: 2.5 } },
```

## Curves, bodies, craters

A tube along a curve - a worm, a root, a cable; with Op Subtract, a tunnel - is a round cone per piece (SdfShape.RoundCone:
a segment with a radius at each end), each ending in the sphere the next one starts with, so it has no seams:

```ts
this.Engine.Sdf.AddCurve( {
	Points: [ [ 0, 0.3, 0 ], [ 3, 0.8, 1 ], [ 6, 0.3, 0 ] ],   // a Catmull-Rom spline through them
	Radii: [ 0.3, 0.5, 0.2 ],                                   // the radius at each point
	MaterialId: 4,
} );
```

`SdfWorm` grows one: its head wanders from where the entity stands and lays a piece every `Piece` metres (real edits: the
physics feels them, the oldest fold into the base). `SdfBody` draws an entity as a shape of the SDF world that follows its
transform - put it on a rigid body of the same size, and a cube pushed by the physics melts into the floor as it slides.
`SdfSplat` with `Carve` takes matter away where it hits: a crater, deeper than wide; shots that keep hitting one spot go
through.

When a surface comes back over bodies (a moving hole the physics felt has gone by), the physics worker pushes the bodies
that ended up inside it up and out - a step at a time, faster the deeper they are (1 to 8 m/s), never teleported. Inside
means the first surface straight above the body, in any chunk, faces up; under an overhang it faces down, and the body
stays. Bodies past the meshed area (`Radius` chunks around the focus) have nothing under
them: keep play inside it, or fence it.

## Fractals

A base can be a formula instead of a bake: `MandelbulbBase` (power, iterations, a Julia constant, sphere inversion -
"inside the Mandelbulb", the default world of the fractal templates: `InvertedMandelbulb()`). The field is the escape-time
estimate 0.5 r ln r / dr, taken back to world units by the inversion's scale (it is conformal) and bounded near the
center. A base has no bounds, so the world's old edits fold into an `SdfSparseLayer`: only the cells they touched keep
samples, the formula answers everywhere else. Bases travel as `SdfBaseDescriptor` (workers, saves, scenes: an engine
scene says `Base: { Analytic: InvertedMandelbulb( 20 ) }`). Samplers pass the detail they can hold (`SdfProgram.Detail`:
a chunk its cell, a grid its spacing) and the orbit stops where the next iteration would only add finer noise. The
demo shows the cave with `?scene=fractal`; the perf scene `sdf-fractal` runs at 759 fps.

A fractal has no known floor: `FindStandingPlace( field, near )` finds one - points tried in a spiral outward, each
dropped onto the floor below, which must face up and leave room for a body - and an engine scene asks for it with
`StartOnSurface` (the place is meshed first and comes back as `Sdf.Start`; `Sdf.FindStandingPlace` asks later). Point
lights (four at most) light the ray-marched SDF as Babylon's standard materials light the meshes: a lantern in a cave.

### The formula language

A fractal can be written as a formula (`FormulaBase`, descriptor `{ Kind: "Formula", Options }`): one source, compiled to
JavaScript for the CPU (meshing, physics, rays; every vec3 three numbers, no allocation per sample) and to GLSL for the
GPU (`SdfFormulaVolume`: the ray marcher evaluates it as it is, parameters as uniforms). A formula is a few blocks over
the orbit's state - `z` and `c` (vec3, both start at the point), `dr` (starts at 1), read-only `p`, `r` (|z|), `i`:

```
param float power = 8 in [2, 16];   // parameters: float or vec3, a default, a range for the editor
init { c = vec3(0.2, 0.6, 0.1); }   // once (optional): here, a Julia set
iterate {                           // every iteration
	float theta = acos(clamp(z.z / max(r, 1e-30), -1, 1)) * power;
	float phi = atan(z.y, z.x) * power;
	float rp = pow(r, power - 1);
	dr = rp * power * dr;
	z = rp * r * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + c;
}
distance { return 0.5 * log(r) * r / dr; }   // optional: this is the default
```

Statements: `float` / `vec3` locals, `=`, `+=`, `-=`, `*=`, `/=` (a float spreads over a vec3 in `*=` and `/=`), `if` /
`else`, `return` in `distance`. Functions: abs, sign, floor, fract, sqrt, sin, cos, tan, asin, acos, exp, log, min, max,
mod, pow (of |x|, as the GPU), atan(y, x), clamp, mix, length, dot, cross, normalize, vec3. A mistake is a
`FormulaError` with its line and column. The frame around every formula (`FractalFrameOptions`) places and scales it,
inverts it in a sphere, cuts the iterations by detail and fades two materials by the orbit trap. Presets
(`FormulaPresets`): the inverted Mandelbrot (`InvertedMandelbrot()`, the default world), Mandelbulb, Mandelbox, Menger
sponge. An end-to-end check marches the same pixels on the CPU: the GPU's picture differs on 0.35 % of them (silhouettes).

## What's next

Not yet: tier B in the engine (ray marching works in the module's demo, not in the render worker), multi-level clipmaps
on the GPU, cone marching and tier A (WebGPU). The plan and estimates are in `docs/stage6-estimates.md`, the
questions in `docs/stage6-questions.md`, what's done in `docs/stage6-progress.md` (in Russian, like `task.md`).
