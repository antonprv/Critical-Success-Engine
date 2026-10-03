// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../Logging/Logger";
import { PhysicsMsg, PhysState } from "./Common/CommonEnums";
import { PhysicsWasmLoader } from "./Physics/PhysicsWasmLoader";
import { PhysicsWorld } from "./Physics/PhysicsWorld";
import type { GameLogicToPhysicsMessage, PhysicsToGameLogicMessage } from "./Protocol/PhysicsGameLogicProtocol";
import type { MainToPhysicsMessage } from "./Protocol/PhysicsProtocol";

let world: PhysicsWorld | null = null;
let gameLogicPort: MessagePort | null = null;
let running = false;
let fixedTimestepMs = 1000 / 60;

// Commands that arrive before the wasm module has finished booting (GameLogic starts spawning as soon as it has a
// port, long before dotnet.js is ready) are queued here and replayed once the world exists.
let pendingMessages: GameLogicToPhysicsMessage[] = [];
let failed = false;

// Own static buffer per realm - App.ts's timer doesn't flush this one.
Logger.SetupAutoFlush();

// Fixed-timestep loop with an accumulator: the callback may fire late or in bursts (setInterval drifts under load), but
// the simulation is always advanced in exact `fixedTimestepMs` steps, so dt fed to Step() never varies. A bounded
// catch-up keeps a long stall (tab in the background) from turning into a spiral of death.
const MaxCatchUpSteps = 5;
let loopHandle: ReturnType<typeof setInterval> | null = null;
let lastTickTime = 0;
let accumulator = 0;

// Only ever called after "init" set the port (every caller runs from the loader's promise or the step loop it starts).
function Post(message: PhysicsToGameLogicMessage, transfer: Transferable[] = []): void {
	(gameLogicPort as MessagePort).postMessage(message, transfer);
}

function Tick(): void {
	if (!world) return;

	const now = performance.now();
	accumulator += now - lastTickTime;
	lastTickTime = now;

	let steps = 0;
	while (accumulator >= fixedTimestepMs && steps < MaxCatchUpSteps) {
		accumulator -= fixedTimestepMs;
		steps++;
		StepOnce(world);
	}
	if (steps === MaxCatchUpSteps) accumulator = 0; // drop the backlog instead of chasing it
}

function StepOnce(simulation: PhysicsWorld): void {
	try {
		const result = simulation.Step(fixedTimestepMs / 1000);
		const message: PhysicsToGameLogicMessage = {
			state: PhysState.Step,
			step: result.step,
			bodyCount: result.bodyCount,
			bodies: result.bodies,
			characterCount: result.characterCount,
			characters: result.characters,
			overlaps: result.overlaps,
		};
		const transfer: Transferable[] = [result.bodies, result.characters];
		if (result.overlaps) transfer.push(result.overlaps.buffer);
		Post(message, transfer);
	} catch (error) {
		Logger.LogException(error, "[PhysicsWorker] step failed - stopping the simulation:");
		SetRunning(false);
	}
}

function SetRunning(next: boolean): void {
	running = next;
	if (loopHandle !== null) {
		clearInterval(loopHandle);
		loopHandle = null;
	}
	if (running) {
		lastTickTime = performance.now();
		accumulator = 0;
		// Wake up a bit more often than the step rate so a late timer doesn't cost a whole step.
		loopHandle = setInterval(Tick, Math.max(4, fixedTimestepMs / 2));
	}
}

function HandleGameLogicMessage(message: GameLogicToPhysicsMessage): void {
	if (failed) return; // no simulation this session: don't pile up commands nobody will ever run
	if (!world) {
		pendingMessages.push(message);
		return;
	}
	world.ApplyCommands(message.commands, (reply) => Post(reply));
}

function InitializeWorld(message: MainToPhysicsMessage & { type: PhysicsMsg.Init; }): void {
	gameLogicPort = message.gameLogicPort;
	fixedTimestepMs = message.fixedTimestepMs;
	gameLogicPort.onmessage = (event: MessageEvent<GameLogicToPhysicsMessage>) => HandleGameLogicMessage(event.data);

	const watchdog = setTimeout(
		() => Logger.LogError("[PhysicsWorker] PhysicsBridge still not loaded after 15 s - dotnet.create() is hanging."),
		15_000
	);

	new PhysicsWasmLoader()
		.Load()
		.then((bridge) => {
			clearTimeout(watchdog);
			world = new PhysicsWorld(bridge);
			world.CreateWorld(message.settings);

			Post({ state: PhysState.Ready });

			const queued = pendingMessages;
			pendingMessages = [];
			for (const queuedMessage of queued) HandleGameLogicMessage(queuedMessage);

			SetRunning(true);
		})
		.catch((error) => {
			clearTimeout(watchdog);
			// Deliberately non-fatal: lets render/game-logic/audio/ui keep working (e.g. for pure-visual iteration)
			// before the physics wasm has been built even once. See PhysicsWasmLoader.ts.
			Logger.LogException(
				error,
				"[PhysicsWorker] failed to load PhysicsBridge wasm module - physics is disabled this session."
			);
			failed = true;
			pendingMessages = [];
			// Tell GameLogic right away, so it neither waits for a "ready" that will never come nor for sync acks.
			Post({ state: PhysState.Failed, message: error instanceof Error ? error.message : String(error) });
		});
}

// IMPORTANT: use addEventListener, NOT `self.onmessage = ...`.
// .NET's dotnet.js loader checks `globalThis.onmessage` at import time: if the worker already has an onmessage handler
// it is classified as a plain web worker, the runtime skips resolving its core-asset promise, and `dotnet.create()`
// then never resolves *or* rejects (a silent hang).
self.addEventListener("message", (event: MessageEvent<MainToPhysicsMessage>) => {
	const message = event.data;
	if (message.type === PhysicsMsg.Init) {
		InitializeWorld(message);
	} else {
		SetRunning(message.running);
	}
});
