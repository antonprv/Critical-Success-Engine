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
	{ Id: "sdf", Project: PerfSuite, Scene: "sdf", Description: "PerfSuite: an SDF world baked at load, a hole moving through it and a pit dug every second (meshed in the SDF worker's pool), 200 balls landing on its chunks." },
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

