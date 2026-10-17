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

## Physics

A mesh-tier chunk is an ordinary CSPhysics static. The physics worker takes `PhysOpType.SdfChunk` (a key, the chunk's
positions and indices) and `RemoveSdfChunk`: a new chunk becomes a static, a rebuilt one swaps its shape in place
(`SetStaticShape`; bodies on it wake up), and the old mesh is freed.

## What's next

The module isn't wired into the engine's workers yet (the world in GameLogic, replicas in the render and physics
workers, the scene from its manifest) and doesn't feed chunks to the physics by itself; there are no multi-level
clipmaps on the GPU, no cone marching and no tier A (WebGPU). The plan
and estimates are in `docs/stage6-estimates.md`, the questions in `docs/stage6-questions.md`, what's done in
`docs/stage6-progress.md` (in Russian, like `task.md`).
