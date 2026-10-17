# Performance report

Measured 2026-10-17T00:52:50.724Z by `pnpm perf` (src/CSEngine/Core/Perf/Run.mjs). Target: **600 fps** in every scenario.

## The machine

- CPU: 12th Gen Intel(R) Core(TM) i3-1215U (8 threads), 7.5 GB RAM; power: AC
- GPU: Intel Corporation Alder Lake-UP3 GT1 [UHD Graphics] (rev 0c) - WebGL renderer: ANGLE (Intel, Mesa Intel(R) Graphics (ADL GT2), OpenGL ES 3.2)
- Browser: Chromium 155.0.8059.79, a window of 1280x720, flags: --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --ignore-gpu-blocklist --enable-gpu-rasterization
- Method: 3 s warm-up, then 3 windows of 10 s; the median window is reported, fps min..max shows the spread.

## Results

fps counts frames that show a new game state; "draw loop" is how often the renderer drew (it may draw the same state again).

| Scenario | fps | min..max | 1% low | 0.1% low | frame p50 / p99, ms | draw loop fps | render CPU p50, ms | logic p50, ms | physics step p50, ms | draws | triangles | vs baseline | target |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| empty | **1683.9** | 1660.8..1692.7 | 236.7 | 137.8 | 0.1 / 2.7 | 1683.9 | 0 | 0 | 0.2 | 1 | 0 | -0.6 % | 🟢 600 |
| entities-10k | **990.7** | 980.7..993.5 | 256.5 | 120.3 | 0.7 / 3.2 | 990.7 | 0.1 | 0.6 | 0.2 | 2 | 120000 | +27.2 % | 🟢 600 |
| static-100k | **938.2** | 933.1..939.8 | 193 | 102.6 | 0.4 / 3.5 | 938.2 | 0.1 | 0 | 0.2 | 2 | 100352 | -2.6 % | 🟢 600 |
| physics-2000 | **697.5** | 695.6..698.1 | 157.9 | 86.2 | 0.7 / 4 | 697.5 | 0.1 | 0.4 | 9 | 6 | 800072 | +46.3 % | 🟢 600 |
| interop | **1022.2** | 1010.5..1048.6 | 445.7 | 193 | 0.9 / 1.7 | 1022.2 | 0 | 0.9 | 0.1 | 1 | 0 | -1.4 % | 🟢 600 |
| ui-heavy | **1498** | 1489.5..1587.4 | 203.4 | 104.9 | 0.2 / 3.5 | 1498 | 0 | 0 | 0.2 | 1 | 0 | -5.3 % 🔴 regression | 🟢 600 |
| bouncing-ball | **1590.6** | 1565..1628.1 | 247.8 | 128.8 | 0.2 / 2.8 | 1590.6 | 0 | 0 | 0.2 | 3 | 796 | -0.5 % | 🟢 600 |
| character-test | **1461.3** | 1455..1463 | 232.6 | 116.9 | 0.3 / 3 | 1461.3 | 0.1 | 0 | 0.4 | 14 | 1932 | -0.2 % | 🟢 600 |
| coin-hunt | **1624.6** | 1621.7..1630.3 | 245.6 | 129.6 | 0.4 / 2.9 | 1624.6 | 0.1 | 0.1 | 0.3 | 11 | 1956 | -0.1 % | 🟢 600 |
| third-person | **1525.4** | 1508.8..1528.3 | 238 | 108.5 | 0.3 / 2.9 | 1525.4 | 0.1 | 0 | 0.2 | 9 | 780 | +0.3 % | 🟢 600 |
| top-down | **1607.8** | 1600.3..1608.4 | 254.6 | 127.1 | 0.2 / 2.8 | 1607.8 | 0 | 0 | 0.3 | 7 | 804 | -0.5 % | 🟢 600 |
| cstables | - | - | - | - | - | - | - | - | - | - | - | - | 🔴 not measurable yet |
| keyframes-10k | - | - | - | - | - | - | - | - | - | - | - | - | 🔴 not measurable yet |
| forward-plus-lights | - | - | - | - | - | - | - | - | - | - | - | - | 🔴 not measurable yet |
| bsp-map | - | - | - | - | - | - | - | - | - | - | - | - | 🔴 not measurable yet |
| sdf | - | - | - | - | - | - | - | - | - | - | - | - | 🔴 not measurable yet |
| electron | - | - | - | - | - | - | - | - | - | - | - | - | 🔴 not measurable yet |

## Scenarios

- **empty**: PerfSuite: a camera and nothing else - the engine's own cost per frame.
- **entities-10k**: PerfSuite: 10 000 static boxes, no physics - the cost per drawn entity (stands in for "10 000 sprites": the engine has no sprites yet).
- **static-100k**: PerfSuite: one static mesh of 100 352 triangles.
- **physics-2000**: PerfSuite: 2 000 dynamic balls (CSPhysics) stirred by a kinematic paddle, so they stay awake.
- **interop**: PerfSuite: TypeScript calls a C# component 500 times a frame through a contract, and it calls TypeScript 500 times back.
- **ui-heavy**: PerfSuite: a UI document of 120 labels, all changed every frame from the game thread.
- **bouncing-ball**: Blank template: a ball, the ground, a C# component (Games Sample).
- **character-test**: First Person template: a room with a ramp, platforms, crates, a trigger (Games Sample).
- **coin-hunt**: Coin Hunt template: coins, a HUD document, C# and TypeScript calling each other (Games Sample).
- **third-person**: Third Person template: an arena with a follow camera (Games Sample).
- **top-down**: Top-Down template: an arena seen from above (Games Sample).
- **cstables** (not measured): CSTables lookup micro-benchmark - CSTables is S6-01, not built yet.
- **keyframes-10k** (not measured): 10 000 keyframe tracks - keyframes are S6-10, not built yet.
- **forward-plus-lights** (not measured): Forward against Forward+ with many lights - the renderer is S6-06, not built yet.
- **bsp-map** (not measured): A BSP map - the map compiler is S6-04, not built yet.
- **sdf** (not measured): An SDF scene - the SDF renderer (plan.md) is not built yet.
- **electron** (not measured): The same scenes in the Electron build - Electron game builds are S6-07, not built yet.

## Applied optimizations

What was found on the target laptop (Core i3-1215U, Intel UHD Graphics, 7.5 GB) and done about it. Numbers are frames
per second drawn with a new game state.

A correction first: the early "after" numbers of this work (11 000 fps for an empty scene, 8 000 for 100 000
triangles) were wrong. Frames were counted when a new game state **arrived** at the renderer, not when it was **drawn**;
while the GPU was busy, states arrived and were replaced without ever being shown. Since then `fresh` is counted in
`RenderScene` when a frame with a new state is drawn, and every number below is measured that way.

| # | Problem (how it was found) | Done | Where | Gain | Quality |
|---|---|---|---|---|---|
| 1 | Every scenario ran at 61 fps with 0.1 ms of work a frame: the render worker's requestAnimationFrame follows the display, Chromium's flags don't lift it (a plain page with the same flags drew 4 000+ fps) | `?uncapped`: the render loop is scheduled by a message to itself instead of requestAnimationFrame | `RenderScene.Uncap` | 61 -> over 600 | none |
| 2 | Uncapped, the loop redrew the same game state up to 14 000 times a second and the GPU process stalled for 100-130 ms every ~130 ms (a Chromium trace: `CrGpuMain` tasks of 130 ms, the worker waiting on them): commands piled up faster than the GPU ran them | the loop draws only when there is a new game state and sleeps otherwise (no spinning core); at most four frames in flight on the GPU (`fenceSync`, polled without blocking). Two were measured, three and four: the fence's status reaches a worker only between tasks, so two in flight left the GPU idle | `RenderScene.RunRenderLoop`, `Wake`, `GpuBusy`, `MaxFramesInFlight` | empty, 2 -> 4 in flight: 868 -> 1 690; 1 % low ~50 -> ~200 | at most 4 frames of input latency (~2.5 ms at 1 600 fps) |
| 3 | The perf counters themselves (see above) | `fresh` = frames drawn with a new game state; the draw loop's rate is reported apart | `RenderScene`, `Perf/Metrics.mjs` | honest numbers | - |
| 4 | Every frame the game logic sent every entity's pose (640 KB a frame for 10 000 entities, a new buffer each time) and the renderer moved every mesh | only poses that changed since the last frame are sent; the frame buffer is reused | `GameLogicRuntime.PostFrame`, `Transform.SentPose` | entities-10k logic 1.8 -> 0.8 ms | none |
| 5 | A mesh per entity: 10 000 boxes were ~9 000 draw calls and 39 ms of CPU a frame; 2 000 balls 12.5 ms | spheres, boxes, capsules and cylinders of one shape and size are one mesh of thin instances (per-instance matrix and colour, one draw call) | `PrimitiveBatch`, `EntityMeshRegistry` | entities-10k 25 -> 877; physics-2000 70 -> ~500 | none (white material x instance colour; e2e pixel tests unchanged) |
| 6 | 2 000 balls of 0.6 m were 5.4 million triangles: every sphere had 24 rings | a sphere's rings follow its size (8 at the least, 24 from 2.2 m) | `SphereSegments` | physics-2000: 5.4 M -> 0.8 M triangles, 315 -> 454 fps | small balls are less round up close |
| 7 | A busy UI (120 labels changed every frame) froze the page: hundreds of game frames a second each redid the DOM | changes of widgets are applied once per display frame on the page, the last one winning | `UiHostBridge` | ui-heavy: hang -> ~5 000 | none (the screen shows the newest text each frame) |
| 8 | C# and TypeScript calling each other: 1.7 ms a frame for 1 000 calls, pauses of 230 ms (garbage of every call on both sides) | requests and answers through pinned memory both runtimes share (one slot per depth; only a length crosses), reused writers on the TypeScript side, the contract's header written once, numbers read without boxing in C#, the implementation found once per entity | `SharedSlots`, `SlotCalls`, `ScriptBridge`, `MessagePackReader` | interop 70 -> ~800; a call 2.09 -> 1.38 us | none |
| 9 | The C# scripts never loaded in the browser: the game logic worker's `self.onmessage` made dotnet.js take it for a plain worker, and `create()` never settled | the worker listens with addEventListener (as the physics worker does) | `GameLogicWorker` | the C# components run | - |
| 10 | physics-2000 stayed GPU-bound with multisampling (MSAA 4x fills four samples a pixel of 2 000 overlapping balls) | FXAA (one pass over the finished frame) is the default; `?aa=msaa` and `?aa=off` remain | `RenderScene.UseFxaa`, `Antialias` | physics-2000: MSAA ~490, FXAA ~690, off ~780 | FXAA: slightly softer edges |
| 11 | The physics scene's paddle went through the balls (seen on screen, not in the numbers): a kinematic body that had stood still fell asleep, and the velocity and pose the engine gave it every step went into the sleeping island's data - it never woke, and its bounds in the broad phase stayed where it fell asleep. Bodies asleep under it were never touched | a velocity other than zero, or a pose that differs, given to a sleeping body wakes it (a body told the same pose every step still sleeps); the paddle is taller than the heap and the balls start a little off the grid (dropped exactly onto each other they stood in columns) | `PhysicsWorld.SetBodyPose`, `SetLinearVelocity`, `SetAngularVelocity` (C#), `PerfScenes` | the scene is a real load: ~980 balls awake | - |
| 12 | Chromium's `--disable-frame-rate-limit` / `--disable-gpu-vsync` made its compositor spin a whole core (870 000 tasks in 3 s); `?uncapped` doesn't need them (it doesn't draw on the display's clock) | the harness runs without them | `Perf/Run.mjs` | physics step under load 11.0 -> 8.1 ms (the CPU it was losing) | - |
| 13 | The game logic made 115 MB of garbage in 3 s of an empty scene (sampled with V8's heap profiler over CDP): minor GCs of 5-6 ms. The input snapshot for C# built every frame even without C# components; the action map looked up through a new string key, the codes of an action made anew (two arrays) and closures, several times per action per frame; `Set.clear()` of empty sets (V8 makes a new table); a fixed camera's look-at quaternion; a buffer copy of an empty frame | the map in force and the codes of an action are kept until they change; plain loops; the input snapshot is taken only if C# components will get it; the phase object is reused; sets are cleared only if not empty; a fixed camera keeps its pose while it stays put; an empty frame is one shared buffer | `InputSystem.Map`, `InputMap.Codes`, `InputService`, `GameLogicRuntime.RunScripts`, `FixedCamera`, `EmptyFrame` | logic garbage 115 -> 21 MB / 3 s; minor GCs in 3 s: 4 -> 2 | none |
| - | Tried and dropped: sending the camera only when it moves. Measured slower (entities-10k 983 -> 770 fps, six runs against two; why Babylon draws faster with the camera set every frame is not known) | - | - | - | - |
| 14 | The render loop: the time stamps of a closure's number variables were boxed at every frame; Babylon's own frame time monitor; the loop asked the GPU again and again while it was busy | stamps in a Float64Array; the monitor off; after 0.3 ms of asking, the loop sleeps 1 ms at a time | `RenderScene.RunRenderLoop`, `Uncap` | less garbage and CPU in the render worker | - |

What is left, measured and understood:

- **The physics step** (~980 awake balls in contact, 8 solver iterations): 4.7 ms on a performance core, 8.1 ms on an
  efficiency core (Node, the same bundle), 6 ms in the browser at 60 fps and 8 ms uncapped (the GPU and the other
  workers share the CPU's power budget). A profile with function names (`--profiling-funcs`) shows solver 44 %, collision
  detection 38 %, the interpreter 1.4 % (the AOT profile covers the hot path); the same scene on desktop .NET with AVX2
  takes 2.5 ms for 2 000 awake bodies. `-O3` instead of `-Oz` for the native code gave nothing (4.6 vs 4.7 ms). Four
  solver iterations instead of eight would save 22 % and cost stiffness in every game, so it is not done silently.
- **1 % low** (~220 fps, a frame of ~4.5 ms in 100): what remains are worker tasks of ~5 ms with no script in them (V8's
  own work, or the thread moved by the OS) and the rarer minor GCs. Every scenario's 1 % low is still above 120 fps.

Upscaling was not needed.
