// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type {
	FlatTransform,
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

/** Demo content: one falling sphere over a static ground slab. Visuals and physics bodies are spawned
 * independently - visuals as soon as render.worker is ready, bodies as soon as physics.worker is - so a
 * slow or failed physics-wasm load never leaves the screen empty. */
const demoGroundEntityId = nextEntityId++;
const demoBallEntityId = nextEntityId++;
const GROUND_SIZE: [number, number, number] = [10, 1, 10];
const GROUND_TRANSFORM: FlatTransform = [0, -0.5, 0, 0, 0, 0, 1];
const BALL_TRANSFORM: FlatTransform = [0, 5, 0, 0, 0, 0, 1];

let physicsReady = false;
let demoVisualsSpawned = false;
let demoBodiesSpawned = false;

function spawnDemoVisuals(): void {
	if (demoVisualsSpawned || !renderPort) return;
	demoVisualsSpawned = true;

	const ground: GameLogicToRenderMessage = {
		type: "spawn-entity",
		entityId: demoGroundEntityId,
		mesh: { kind: "box", size: GROUND_SIZE },
		transform: GROUND_TRANSFORM,
	};
	renderPort.postMessage(ground);

	const ball: GameLogicToRenderMessage = {
		type: "spawn-entity",
		entityId: demoBallEntityId,
		mesh: { kind: "sphere", diameter: 1 },
		transform: BALL_TRANSFORM,
	};
	renderPort.postMessage(ball);
}

function spawnDemoBodies(): void {
	if (demoBodiesSpawned || !physicsPort) return;
	demoBodiesSpawned = true;

	const ground: GameLogicToPhysicsMessage = {
		type: "spawn-static-body",
		entityId: demoGroundEntityId,
		shape: { kind: "box", size: GROUND_SIZE },
		transform: GROUND_TRANSFORM,
		layer: 1,
		mask: -1, // all bits (int32)
	};
	physicsPort.postMessage(ground);

	const ball: GameLogicToPhysicsMessage = {
		type: "spawn-dynamic-body",
		entityId: demoBallEntityId,
		shape: { kind: "sphere", radius: 0.5 },
		transform: BALL_TRANSFORM,
		mass: 1,
		layer: 1,
		mask: -1,
	};
	physicsPort.postMessage(ball);
}

function handlePhysicsMessage(message: PhysicsToGameLogicMessage): void {
	switch (message.type) {
		case "ready":
			physicsReady = true;
			spawnDemoBodies();
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
			spawnDemoVisuals();
			break;
		case "asset-loaded":
			break;
	}
}

function handleInput(event: InputEvent): void {
	switch (event.kind) {
		case "keydown":
			pressedKeys.add(event.code);
			if (event.code === "Space" && physicsReady && physicsPort) {
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
