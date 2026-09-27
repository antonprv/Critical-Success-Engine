// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { PhysicsWasmLoader } from "./Physics/PhysicsWasmLoader";
import { PhysicsWorld } from "./Physics/PhysicsWorld";
import {
	PhysToGameMsg,
	type GameLogicToPhysicsMessage,
	type PhysicsToGameLogicMessage
} from "./Protocol/PhysicsGameLogicProtocol";

import type { MainToPhysicsMessage } from "./Protocol/PhysicsProtocol";

let world: PhysicsWorld | null = null;
let gameLogicPort: MessagePort | null = null;
let running = false;
let fixedTimestepMs = 1000 / 60;

// Fixed-timestep loop. setInterval drifts under load, which is fine here -
// gameplay networking/replay determinism isn't a goal for LanternFestival
// yet; if it becomes one, replace this with an accumulator driven by
// performance.now() so dt fed to Step() is always exactly fixedTimestepMs
// regardless of when the callback actually fires.
let loopHandle: ReturnType<typeof setInterval> | null = null;

function StepOnce(): void {
	if (!world || !gameLogicPort) return;

	const { transforms, overlapEvents } = world.StepOnce(fixedTimestepMs);
	if (transforms) {
		gameLogicPort.postMessage(transforms, [transforms.buffer]);
	}
	if (overlapEvents) {
		gameLogicPort.postMessage(overlapEvents);
	}
}

function SetRunning(next: boolean): void {
	running = next;
	if (loopHandle !== null) {
		clearInterval(loopHandle);
		loopHandle = null;
	}
	if (running) {
		loopHandle = setInterval(StepOnce, fixedTimestepMs);
	}
}

function InitializeWorld(message: MainToPhysicsMessage & { type: "init"; }): void {
	gameLogicPort = message.gameLogicPort;
	fixedTimestepMs = message.fixedTimestepMs;
	gameLogicPort.onmessage = (event: MessageEvent<GameLogicToPhysicsMessage>) => world?.HandleGameLogicMessage(event.data);

	const watchdog = setTimeout(
		() => console.error("[PhysicsWorker] PhysicsBridge still not loaded after 15 s - dotnet.create() is hanging."),
		15_000
	);

	const loader = new PhysicsWasmLoader();
	loader
		.Load()
		.then((bridge) => {
			clearTimeout(watchdog);
			world = new PhysicsWorld(bridge);
			world.CreateWorld(message.gravity, 8, 1, false);
			const readyMessage: PhysicsToGameLogicMessage = { type: PhysToGameMsg.Ready };
			gameLogicPort?.postMessage(readyMessage);
			SetRunning(true);
		})
		.catch((error) => {
			clearTimeout(watchdog);
			// Deliberately non-fatal: lets render/game-logic/audio keep working
			// (e.g. for pure-visual iteration) before physics-wasm has been built
			// even once. See PhysicsWasmLoader.ts.
			console.error(
				"[PhysicsWorker] failed to load PhysicsBridge wasm module - physics is disabled this session.",
				error
			);
		});
}

// IMPORTANT: use addEventListener, NOT `self.onmessage = ...`.
// .NET 10's dotnet.js loader checks `globalThis.onmessage` at import time: if the worker already has an
// onmessage handler it is classified as a plain web worker, the runtime skips resolving its core-asset
// promise, and `dotnet.create()` then never resolves *or* rejects (a silent hang).
self.addEventListener("message", (event: MessageEvent<MainToPhysicsMessage>) => {
	const message = event.data;
	if (message.type === "init") {
		InitializeWorld(message);
	} else if (message.type === "set-running") {
		SetRunning(message.running);
	}
});
