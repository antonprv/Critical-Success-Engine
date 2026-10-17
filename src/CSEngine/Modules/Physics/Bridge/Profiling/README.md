# Profile-guided AOT for PhysicsBridge

The Release build of PhysicsBridge is AOT-compiled **from a profile** (`aot.profile` in this folder). Without it the
AOT build compiles fine but crashes on the first `Step()`:

```
RuntimeError: null function or function signature mismatch
  at ...NarrowPhase_1_TCallbacks_GSHAREDVT_OnPrepare...
```

## Why

On WebAssembly, Mono's AOT compiler deliberately does not compile methods of generic classes instantiated over value
types as real instances (`add_generic_class_with_depth` in `mono/mini/aot-compiler.c`, the `TARGET_WASM` branch). It
emits shared "gsharedvt" code instead. CSPhysics's hot paths are exactly that kind of method: `ConvexCollisionTask<...>`,
the solver's `TypeProcessor<...>`, `NarrowPhase<TCallbacks>`, `Solver<TCallbacks>`. gsharedvt code is slow, and in
.NET 10.0.12 it also crashes here.

Methods listed in an AOT profile are compiled as concrete instances. The SDK also adds `profile-only`, so everything
missing from the profile runs in the interpreter. That is correct but about 15x slower, and it also makes
`dotnet.native.wasm` much smaller.

## When to re-record

Re-record whenever the physics code changes in a way that adds or renames methods on the hot path: CSPhysics, Integration,
the bridge API, new shapes or features. A stale profile does not break anything. Code it doesn't cover just runs
interpreted.

```bash
src/CSEngine/Modules/Physics/Bridge/Profiling/record-aot-profile.sh
```

The script:
1. builds the interpreted profiling variant (`dotnet publish -c Release -p:CseAotProfile=true`: AOT profiler on,
   `AotProfiling.cs` compiled in);
2. runs `scenario.mjs` on it in Node, writes `aot.profile`;
3. rebuilds the normal Release bundle with the new profile. `Bridge.csproj` drops the stale AOT bitcode when
   `aot.profile` changes, because the SDK's own up-to-date check ignores it.

Commit `aot.profile` together with the code change.

`scenario.mjs` is the whole coverage: every shape on the ground, on a mesh and on every other shape, a 2000-body pile,
triggers, CCD, kinematics, sleep/wake, all sweeps, character moves, removal. If you add a PhysicsBridge feature, add it
to the scenario too. Otherwise it stays interpreted in the release build.

## Checking a build

```bash
src/CSEngine/Modules/Physics/Bridge/Profiling/check-physics.sh            # smoke test of the published bundle
src/CSEngine/Modules/Physics/Bridge/Profiling/check-physics.sh 500,2000   # + ms/Step benchmark for those body counts
```

Both run in Node against a temporary decompressed copy of the AppBundle (`unpack-bundle.sh`). The
`Jiterpreter table N is not yet initialized` lines are Node-only noise.

Reference numbers (Node 20, x64), ms per `Step(1/60)`:

| bodies | interpreter | AOT (profiled) |
|-------:|------------:|---------------:|
|    500 |        18.4 |           1.25 |
|   2000 |        76.4 |           4.59 |
