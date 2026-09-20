// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type {
	GameLogicToAudioMessage,
	GameLogicToPhysicsMessage,
	GameLogicToRenderMessage,
	InputEvent,
	MainToGameLogicMessage,
	PhysicsToGameLogicMessage,
	RenderToGameLogicMessage,
} from "./protocol";

/**
 * The authoritative simulation-side owner of "what entities exist and what
 * they are". Nothing in here touches a DOM API or a Babylon/wasm handle
 * directly - it only ever sends descriptors across the two ports below and
 * reacts to what comes back. That's the whole point of the split: this file
 * can run gameplay/AI logic freely without ever blocking on - or being
 * blocked by - a render frame or a physics step.
 */

let renderPort: MessagePort | null = null;
let physicsPort: MessagePort | null = null;
let audioPort: MessagePort | null = null;

let nextEntityId = 1;
const pressedKeys = new Set<string>();

/** Demo content: one falling sphere over a static ground plane, so the
 * worker split has something visible to prove out end to end once
 * physics-wasm is built (see physics-wasm/BUILD.md). Replace with real
 * level/entity spawning once you have some. */
function spawnDemoScene(): void {
	if (!renderPort || !physicsPort) return;

	const groundEntityId = nextEntityId++;
	const groundSpawnRender: GameLogicToRenderMessage = {
		type: "spawn-entity",
		entityId: groundEntityId,
		mesh: { kind: "box", size: 10 },
		transform: [0, -0.5, 0, 0, 0, 0, 1],
	};
	renderPort.postMessage(groundSpawnRender);

	const groundSpawnPhysics: GameLogicToPhysicsMessage = {
		type: "spawn-static-body",
		entityId: groundEntityId,
		shape: { kind: "box", size: [10, 1, 10] },
		transform: [0, -0.5, 0, 0, 0, 0, 1],
		layer: 1,
		mask: 0xffffffff,
	};
	physicsPort.postMessage(groundSpawnPhysics);

	const ballEntityId = nextEntityId++;
	const ballSpawnRender: GameLogicToRenderMessage = {
		type: "spawn-entity",
		entityId: ballEntityId,
		mesh: { kind: "sphere", diameter: 1 },
		transform: [0, 5, 0, 0, 0, 0, 1],
	};
	renderPort.postMessage(ballSpawnRender);

	const ballSpawnPhysics: GameLogicToPhysicsMessage = {
		type: "spawn-dynamic-body",
		entityId: ballEntityId,
		shape: { kind: "sphere", radius: 0.5 },
		transform: [0, 5, 0, 0, 0, 0, 1],
		mass: 1,
		layer: 1,
		mask: 0xffffffff,
	};
	physicsPort.postMessage(ballSpawnPhysics);

	demoBallEntityId = ballEntityId;
}

let demoBallEntityId: number | null = null;
let renderReady = false;
let physicsReady = false;
let demoSceneSpawned = false;

function trySpawnDemoScene(): void {
	if (demoSceneSpawned || !renderReady || !physicsReady) return;
	demoSceneSpawned = true;
	spawnDemoScene();
}

function handlePhysicsMessage(message: PhysicsToGameLogicMessage): void {
	switch (message.type) {
		case "ready":
			physicsReady = true;
			trySpawnDemoScene();
			break;
		case "transforms": {
			if (!renderPort || message.entities.length === 0) break;
			const batch: GameLogicToRenderMessage = { type: "transform-batch", entities: message.entities };
			renderPort.postMessage(batch);
			break;
		}
		case "overlap-events": {
			for (const overlapEvent of message.events) {
				if (!overlapEvent.entered) continue;
				const sound: GameLogicToAudioMessage = { type: "play-sound", soundId: "impact" };
				audioPort?.postMessage(sound);
			}
			break;
		}
	}
}

function handleRenderMessage(message: RenderToGameLogicMessage): void {
	switch (message.type) {
		case "ready":
			// Both ports may become ready in either order - spawning only once
			// both have said "ready" avoids racing spawn-entity/spawn-*-body
			// messages ahead of either worker finishing its own init().
			renderReady = true;
			trySpawnDemoScene();
			break;
		case "asset-loaded":
			break;
	}
}

function handleInput(event: InputEvent): void {
	switch (event.kind) {
		case "keydown":
			pressedKeys.add(event.code);
			if (event.code === "Space" && demoBallEntityId !== null && physicsPort) {
				const impulse: GameLogicToPhysicsMessage = {
					type: "apply-impulse",
					entityId: demoBallEntityId,
					impulse: [0, 6, 0],
					offset: [0, 0, 0],
				};
				physicsPort.postMessage(impulse);
			}
			break;
		case "keyup":
			pressedKeys.delete(event.code);
			break;
		case "pointermove":
		case "pointerdown":
		case "pointerup":
			// Hook up camera look / interaction here once there's a real camera
			// rig driven from this worker instead of render.worker's placeholder one.
			break;
	}
}

self.onmessage = (event: MessageEvent<MainToGameLogicMessage>) => {
	const message = event.data;
	switch (message.type) {
		case "init": {
			renderPort = message.renderPort;
			physicsPort = message.physicsPort;
			audioPort = message.audioPort;

			renderPort.onmessage = (e: MessageEvent<RenderToGameLogicMessage>) => handleRenderMessage(e.data);
			physicsPort.onmessage = (e: MessageEvent<PhysicsToGameLogicMessage>) => handlePhysicsMessage(e.data);
			break;
		}
		case "input":
			handleInput(message.event);
			break;
	}
};
