# Building physics-wasm (PhysicsBridge)

This compiles your actual `Framework.Physics` (BEPUphysics2 wrapper) to a real
browser WebAssembly module, so `PhysicsWorker.ts` runs the same simulation
code as your Godot project - not a JS reimplementation and not Rapier/Cannon.

Status of the current `PhysicsBridge.cs`: it was compile-checked (C# only, against the real Integration/Bepu/FastMath
sources with net8 reference assemblies) but the browser-wasm build and its behaviour in a browser have not been run by the
author of the last change - treat the commands below as the intended path, and the failure points at the bottom as the
first places to look. The project targets net10.0; the output goes to
`CSEngine/Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework` (which is where Vite looks, see
`Core/vite.config.ts`).

## One-time setup

```bash
dotnet workload install wasm-tools
```

## Build

```bash
cd physics-wasm/Bridge
dotnet build -c Release
```

Output lands in `Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/`, containing
`_framework/dotnet.js`, `_framework/dotnet.wasm`, `_framework/*.dll` (your
managed assemblies, shipped as data files the runtime loads), and `main.js`/
`index.html` (only used for the manual smoke test below).

For a smaller, longer-loading-time-optimized build once everything actually
works, swap to `dotnet publish -c Release` and turn `RunAOTCompilation`/
`PublishTrimmed` back on in `PhysicsBridge.csproj` (left off for the first
build - see "If it doesn't build" below).

## Wire it into LanternFestival

`Source/Workers/Physics/PhysicsWasmLoader.ts` loads the runtime from
`/physics-wasm/_framework/dotnet.js`. Nothing has to be copied by hand - the
Vite build already handles it (`src/CSEngine/Core/BuildTools/PhysicsWasmPlugin.ts`):

- `pnpm dev` serves `src/CSEngine/Binaries/Physics/Release/net10.0/browser-wasm/AppBundle/_framework`
  (what `devops/build-physics.sh` publishes) directly under `/physics-wasm/_framework/`;
- `pnpm build` copies that folder into `src/CSEngine/Binaries/Core/physics-wasm/_framework`,
  so `pnpm preview` and any static host serve it from the same URL.

To use a runtime from somewhere else, set `PHYSICS_WASM_DIR` (absolute, or relative
to `src/CSEngine/Core`) for `pnpm dev` / `pnpm build`. Without a published runtime
the site still builds and runs - just without physics (the game says so on screen).

## Manual smoke test (before wiring up the worker)

Serve the AppBundle folder with any static file server (it must be served
over http(s), not `file://`, for wasm streaming compilation) and open
`index.html`. `main.js` boots the runtime and logs a hint; from the devtools
console:

```js
PhysicsBridge.CreateWorld(0, -20, 0, 8, 1, false, 0.8, 2);   // gravity, velocityIterations, substeps, multithreading, friction, maxRecoveryVelocity
const shape = PhysicsBridge.AddSphereShape(0.5);
// shape, pos(3), quat(4), mass, layer, mask, ownerId, kind(0 solid), continuousDetection
const body = PhysicsBridge.AddDynamicBody(shape, 0, 5, 0, 0, 0, 0, 1, 1, 1, -1, 1, 0, false);
PhysicsBridge.Step(0.016); // -> 14 numbers: [bodyId, pos(3), quat(4), linearVelocity(3), angularVelocity(3)] - y a hair below 5, linear y about -0.3
```

If that returns a falling sphere's transform, the wasm build itself is good
and any remaining problem is in `PhysicsWorker.ts`'s own loading/boot code,
not the C# side.

## If it doesn't build

- **Restore fails / can't reach NuGet**: this project itself has zero
  `PackageReference`s (checked - only the two vendored FastMath projects had
  any, and only under a `net462` condition that's been removed here), so a
  restore failure means your environment can't reach `nuget.org` at all, not
  a problem with this project's dependencies.
- **CS0121 "ambiguous call" all over the vendored Bepu code**: this is the
  duplicate-compilation trap the original `Physics/Core/Build.md` in your
  Setup project warns about - it happens when Bepu's `.cs` files get compiled
  into two assemblies at once. Shouldn't occur here (`vendor/BepuPhysics` and
  `vendor/BepuUtilities` are separate project directories, each built into
  its own DLL, and `Bridge/` only references them via `ProjectReference`,
  never globs their source directly) - but if you move files around, keep
  each vendored project's source inside its own project directory and out of
  `Bridge/`.
- **Trimming/AOT-related build failures**: `PublishTrimmed` and
  `RunAOTCompilation` are off in `PhysicsBridge.csproj` on purpose for the
  first build. Both interact badly with unsafe/reflection-heavy code until
  you've confirmed the plain interpreted build works; turn them on one at a
  time afterwards if you want the smaller/faster output.
- **A `PlatformNotSupportedException` or silent wrong results from
  `Avx.IsSupported` code paths**: `Tree_BinnedBuilder.cs`, `Tree_SelfQueries.cs`,
  and `Bodies*.cs` under `vendor/BepuPhysics` branch on `Avx.IsSupported` (false
  under wasm) with what looks like a portable fallback in every case I checked
  - but I did not build this myself to confirm every fallback path is actually
  exercised correctly under wasm. If `Step()` throws or returns garbage
  transforms, this is the first place to look.

## Extending the bridge

Everything in `Bridge/PhysicsBridge.cs` follows one pattern: flatten Vector3/Quaternion into individual `double`
parameters (JSExport's built-in marshaler doesn't know those struct types), mint your own `int` id for any handle you
hand back to JS, and keep the real `Physics` handle in one of the `Dictionary<int, T>` fields. Variable-length input
(point clouds, triangle soups) goes in as `[JSMarshalAs<JSType.Array<JSType.Number>>] double[]`, multi-value results
come back as a flat `double[]` whose layout is documented on the method.

The whole `PhysicsWorld` API is exposed now (convex hulls, triangle meshes, dynamic/kinematic/static bodies, character
moves, projectile and sphere sweeps, velocity/awake getters and setters). To add a method: write it in `PhysicsBridge.cs`,
mirror its signature in `Core/Source/Workers/Physics/PhysicsBridgeContract.ts`, use it from `PhysicsWorld.ts` (that file
is the only TypeScript that talks to the bridge), and expose it to scripts through `PhysicsService` if gameplay code
needs it.

One known soft spot: `MoveCharacter` takes 16 parameters. If the JS marshaller ever complains, pack the four
`CharacterMoveOptions` values (and `layer`/`mask`) into a `double[]` parameter instead.
