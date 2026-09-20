# Building physics-wasm (PhysicsBridge)

This compiles your actual `Framework.Physics` (BEPUphysics2 wrapper) to a real
browser WebAssembly module, so `physics.worker.ts` runs the same simulation
code as your Godot project - not a JS reimplementation and not Rapier/Cannon.

I could not run any of this myself in the sandbox I built it in (no NuGet
access there), so treat the commands below as the intended path, not a
verified one - the most likely failure points are called out at the bottom.

## One-time setup

```bash
dotnet workload install wasm-tools
```

## Build

```bash
cd physics-wasm/Bridge
dotnet build -c Release
```

Output lands in `bin/Release/net8.0/browser-wasm/AppBundle/`, containing
`_framework/dotnet.js`, `_framework/dotnet.wasm`, `_framework/*.dll` (your
managed assemblies, shipped as data files the runtime loads), and `main.js`/
`index.html` (only used for the manual smoke test below).

For a smaller, longer-loading-time-optimized build once everything actually
works, swap to `dotnet publish -c Release` and turn `RunAOTCompilation`/
`PublishTrimmed` back on in `PhysicsBridge.csproj` (left off for the first
build - see "If it doesn't build" below).

## Wire it into LanternFestival

`physics.worker.ts` expects the AppBundle's `_framework/` directory to be
fetchable at `/physics-wasm/_framework/...` from the built site. Copy it
there as part of your existing asset pipeline:

- **webpack**: add another pattern to the `copy-webpack-plugin` config already
  in `webpack.config.js`:
  ```js
  { from: "physics-wasm/Bridge/bin/Release/net8.0/browser-wasm/AppBundle/_framework", to: "physics-wasm/_framework" }
  ```
- **vite**: drop the same `_framework` folder into `public/physics-wasm/_framework/`
  so Vite serves it as a static asset.

## Manual smoke test (before wiring up the worker)

Serve the AppBundle folder with any static file server (it must be served
over http(s), not `file://`, for wasm streaming compilation) and open
`index.html`. `main.js` boots the runtime and logs a hint; from the devtools
console:

```js
PhysicsBridge.CreateWorld(0, -20, 0, 8, 1, false);
const shape = PhysicsBridge.AddSphereShape(0.5);
const body = PhysicsBridge.AddDynamicBody(shape, 0,5,0, 0,0,0,1, 1, 1, 0xffffffff, 1, false);
PhysicsBridge.Step(0.016); // -> Float64Array [1, 0, 4.9968, 0, 0,0,0,1]
```

If that returns a falling sphere's transform, the wasm build itself is good
and any remaining problem is in `physics.worker.ts`'s own loading/boot code,
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

Everything in `Bridge/PhysicsBridge.cs` follows one pattern: flatten
Vector3/Quaternion into individual `double` parameters (JSExport's built-in
marshaler doesn't know about those struct types), mint your own `int` id for
any handle you hand back to JS, and store the real `Framework.Physics` handle
in one of the `Dictionary<int, T>` fields. `AddConvexHullShape`,
`AddTriangleMeshShape`, `SweepProjectile`, and `SweepSphereCast` aren't wired
up yet because they take `ReadOnlySpan<Vector3>` - add a
`[JSMarshalAs<JSType.Array<JSType.Number>>] double[] flattenedPoints`
parameter and rebuild the span from it the same way `Step()`'s method already
builds a flat array to return one.
