// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// What the perf harness (Run.mjs) measures. Each scenario is a scene of a project (Project: a .cseproject or a
// project folder, as CSE_PROJECT takes it; null = the Games Sample), opened with ?scene=<id>, played (Play) and
// optionally driven (Act) before the measurement.

/** The frame rate every scenario must reach on the target laptop (task.md, S6-05). */
export const TargetFps = 600;

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The perf suite project (src/Perf/PerfSuite): one scene per kind of load. */
const PerfSuite = resolve( dirname( fileURLToPath( import.meta.url ) ), "../../../Perf/PerfSuite" );

export const Scenarios = [
	{ Id: "empty", Project: PerfSuite, Scene: "empty", Description: "PerfSuite: a camera and nothing else - the engine's own cost per frame." },
	{ Id: "entities-10k", Project: PerfSuite, Scene: "entities-10k", Description: "PerfSuite: 10 000 static boxes, no physics - the cost per drawn entity (stands in for \"10 000 sprites\": the engine has no sprites yet)." },
	{ Id: "static-100k", Project: PerfSuite, Scene: "static-100k", Description: "PerfSuite: one static mesh of 100 352 triangles." },
	{ Id: "physics-2000", Project: PerfSuite, Scene: "physics-2000", Description: "PerfSuite: 2 000 dynamic balls (CSPhysics) stirred by a kinematic paddle, so they stay awake." },
	{ Id: "interop", Project: PerfSuite, Scene: "interop", Description: "PerfSuite: TypeScript calls a C# component 500 times a frame through a contract, and it calls TypeScript 500 times back." },
	{ Id: "sdf", Project: PerfSuite, Scene: "sdf", Description: "PerfSuite: an SDF world baked at load, a hole moving through it (a dynamic edit, drawn by the GPU and felt by the physics), a pit dug every second (meshed in the SDF worker's pool, given to the physics), 200 balls landing on its chunks; the sun's shadows and the occlusion both ways." },
	{ Id: "sdf-dynamic", Project: PerfSuite, Scene: "sdf-dynamic", Description: "PerfSuite: 4 dynamic edits (holes and blobs, 1.5 m) moving every frame through the SDF world, 200 balls falling into the holes and rolling over the blobs: drawn by the GPU's ray-marched hulls and cut chunks, remeshed for the physics alone." },
	{ Id: "sdf-dynamic-16", Project: PerfSuite, Scene: "sdf-dynamic-16", Description: "PerfSuite: a stress test, 16 dynamic edits (the most there can be) moving every frame, all felt by the physics, 200 balls: the hulls' pixels add up." },
	{ Id: "sdf-grass", Project: PerfSuite, Scene: "sdf-grass", Description: "PerfSuite: splat grass over an SDF world, 200 balls stirred through it by a kinematic paddle, flattening the blades they roll over; a hole circling, felt by the physics." },
	{ Id: "sdf-splats", Project: PerfSuite, Scene: "sdf-splats", Description: "PerfSuite: SDF splats thrown at a wall (12 in flight as dynamic edits), each stuck where it lands as an edit (remeshed), the pile growing; every other one on its own layer." },
	{ Id: "sdf-push", Project: PerfSuite, Scene: "sdf-push", Description: "PerfSuite: three SDF cubes on rigid bodies, melting into the SDF floor as they slide, pushed by SDF balls a cannon fires at them (dynamic edits following bodies)." },
	{ Id: "sdf-breach", Project: PerfSuite, Scene: "sdf-breach", Description: "PerfSuite: carving SDF shots at one spot of an SDF wall: craters deepening until the shots drill through and fly on through the hole." },
	{ Id: "sdf-worm", Project: PerfSuite, Scene: "sdf-worm", Description: "PerfSuite: a worm of the SDF world growing over the floor (a curve of round cones, a real edit every 0.4 m), 60 balls rolling off it." },
	{ Id: "sdf-lod", Project: PerfSuite, Scene: "sdf-lod", Description: "PerfSuite: a 256 m SDF land meshed with five levels of detail (cells 0.25 m near, 4 m far), the camera flying round it: chunks split and merge all the time." },
	{ Id: "sdf-fractal", Project: PerfSuite, Scene: "sdf-fractal", Description: "PerfSuite: inside an inverted Mandelbulb (no bounds, nothing baked): the fractal meshed in the pool with five levels of detail as the camera circles the cave." },
	{ Id: "sdf-digging", Project: PerfSuite, Scene: "sdf-digging", Description: "PerfSuite: ten pits dug a second into the SDF world under 200 balls: remeshing in the pool, the renderer's volume sampled again, chunks swapped in the physics." },
	{ Id: "ui-heavy", Project: PerfSuite, Scene: "ui-heavy", Description: "PerfSuite: a UI document of 120 labels, all changed every frame from the game thread." },
	{ Id: "bouncing-ball", Project: null, Scene: "bouncing-ball", Description: "Blank template: a ball, the ground, a C# component (Games Sample)." },
	{ Id: "character-test", Project: null, Scene: "character-test", Description: "First Person template: a room with a ramp, platforms, crates, a trigger (Games Sample)." },
	{ Id: "coin-hunt", Project: null, Scene: "coin-hunt", Description: "Coin Hunt template: coins, a HUD document, C# and TypeScript calling each other (Games Sample)." },
	{ Id: "third-person", Project: null, Scene: "third-person", Description: "Third Person template: an arena with a follow camera (Games Sample)." },
	{ Id: "top-down", Project: null, Scene: "top-down", Description: "Top-Down template: an arena seen from above (Games Sample)." },
];

/** What task.md (S6-05) lists but the engine can't show yet: in the report, not measured. */
export const Pending = [
	{ Id: "cstables", Description: "CSTables lookup micro-benchmark - CSTables is S6-01, not built yet." },
	{ Id: "keyframes-10k", Description: "10 000 keyframe tracks - keyframes are S6-10, not built yet." },
	{ Id: "forward-plus-lights", Description: "Forward against Forward+ with many lights - the renderer is S6-06, not built yet." },
	{ Id: "bsp-map", Description: "A BSP map - the map compiler is S6-04, not built yet." },
	{ Id: "electron", Description: "The same scenes in the Electron build - Electron game builds are S6-07, not built yet." },
];

