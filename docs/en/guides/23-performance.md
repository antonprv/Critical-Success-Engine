**English** | [Русский](../../ru/guides/23-performance.md)

# 23. Performance: the perf harness

`pnpm perf` (in `src/CSEngine/Core`) measures how fast the engine runs every test scene in a real Chromium on this
machine, with the frame rate limit off, and writes a report. The target is **600 fps** in every scenario on the target
laptop (see `task.md`, S6-05).

```bash
cd src/CSEngine/Core
pnpm perf                              # every scenario
pnpm perf -- --only coin-hunt,interop  # some of them
pnpm perf -- --runs 5 --seconds 15 --warmup 5
pnpm perf -- --update-baseline         # keep these results as the new baseline
pnpm perf -- --params aa=msaa          # an experiment: more of the page's switches
```

It builds each project like `pnpm build` (with the real physics and C# scripts), serves it, opens each scenario's scene
in a Chromium **window** (headless Chromium draws in software, SwiftShader, so it can't measure the GPU), warms up, then
measures several windows of time and keeps the median. It writes, at the repository root:

| | |
|---|---|
| `perf/REPORT.md` | the table "scenario x metric x target" (🔴 where the target isn't met), the machine, the method, the applied optimizations |
| `perf/results/<time>.json`, `latest.json` | every number, every window |
| `perf/baseline.json` | the reference: a frame rate more than 5 % below it is a regression (the command fails) |

`PERF_CHROMIUM_PATH` picks the browser (default: the system Chromium). Chromium runs without `--disable-frame-rate-limit`
and `--disable-gpu-vsync`: `?uncapped` doesn't draw on the display's clock anyway, and with them Chromium's compositor
spins a whole core, taken from the game's workers.

## What is measured

- **fps**: frames that show a **new game state** per second. The renderer may draw faster (it is decoupled from the game
  logic), drawing the same state again; that rate is reported as "draw loop fps", but it is not the game's frame rate.
- **1 % low / 0.1 % low**: the frame rate of the slowest 1 % (0.1 %) of frames - what stutters feel like.
- frame time p50 / p95 / p99; the render thread's CPU time per frame, draw calls and triangles; the game logic's time per
  frame and per call into C#; the physics step's time and bodies; the page's JS heap and the .NET heaps.

The numbers come from the engine itself: every worker keeps its samples in rings (`Source/Engine/Diagnostics/
PerfProbe.ts`, a `performance.now()` and an array write each) and the harness reads them with
`worker.evaluate( () => __csePerf.Take() )`. The GPU and its renderer string are in the report's header.

## The page's switches

| | |
|---|---|
| `?scene=<id>` | start in that scene instead of the first (also handy while working on one) |
| `?uncapped` | no frame rate limit: the render loop draws as soon as a new game state is there, with at most four frames in flight on the GPU, instead of following the display |
| `?aa=msaa`, `?aa=off` | smooth edges by multisampling (MSAA) instead of the default FXAA pass, or not at all. FXAA is the default: on a weak GPU multisampling costs most in heavy scenes (2 000 balls: 490 fps with MSAA, 690 with FXAA) |

## The scenarios

The Games Sample's scenes, and the perf suite's (`src/Perf/PerfSuite`): `empty`, `entities-10k` (10 000 static boxes),
`static-100k` (one mesh of 100 352 triangles), `physics-2000` (2 000 balls stirred by a paddle, so they stay awake),
`interop` (TypeScript and C# calling each other 500 times a frame each), `ui-heavy` (120 labels changed every frame). The
scenarios `task.md` lists for systems that don't exist yet (CSTables, keyframes, Forward+, BSP, SDF, the Electron build)
are in the report as "not measurable yet". A scenario of your own is a line in `src/CSEngine/Core/Perf/Scenarios.mjs`: a
project, a scene, optionally `Act( page )` to drive it before measuring.

← [22. Contracts](22-contracts.md)
