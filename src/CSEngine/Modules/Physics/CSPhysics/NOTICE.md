# CSPhysics

CSPhysics (`CSPhysics`, `CSPhysics.Utilities`) is a modified fork of [bepuphysics2](https://github.com/bepu/bepuphysics2)
by Ross Nordby, licensed under the Apache License 2.0 (see [LICENSE.md](LICENSE.md)). The original copyright and license
apply to the code that came from it.

Changes made in this fork, summarized:

- Renamed: namespaces `BepuPhysics` → `CSPhysics`, `BepuUtilities` → `CSPhysics.Utilities`; assemblies likewise.
- Built for the browser: .NET WebAssembly, AOT-compiled from a profile (see `../Bridge/Profiling/README.md`); code
  changed where the Mono wasm AOT compiler mis-compiles it (marked with `CSE:` comments).
- Scalar math goes through the engine's FastMath library (`Modules/Common/Math`) instead of `Math`/`MathF`; the wide
  math (`Vector.Max/Min/Abs/Floor/SquareRoot`, `MathHelper` trigonometry) through FastMath's `FMathWide`, which is
  `Vector<T>` itself in the SIMD build and FastMath per lane in the build for hosts without WebAssembly SIMD
  (`CSE_NO_SIMD`, see `../Bridge/BUILD.md`).
- `Simulation.Create` can take explicit collision/sweep registries and constraint registration, so the integration
  registers only the types it uses.
- `Simulation.Overlaps` and `SweepTask.Overlaps`/`PreorderedOverlap`: exact overlap tests without contact generation,
  which the integration's triggers (sensors, Box3D-style: no contact constraints, events by sorted merge) are built on
  (see `../Integration`).
- Formatted to the engine's style (tabs, LF, braces).

Changes that work around the wasm AOT compiler carry `CSE:` comments; the rest are listed above, and the history of
every file is in the repository.
