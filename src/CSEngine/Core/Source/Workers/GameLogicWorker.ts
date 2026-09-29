// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { PhysState, RendOpType, SoundAction } from "./Common/CommonEnums";
import { DemoScene } from "./GameLogic/DemoScene";
import { PlayerInput } from "./GameLogic/PlayerInput";
import type { GameLogicToAudioMessage } from "./Protocol/GameLogicAudioProtocol";
import type { MainToGameLogicMessage } from "./Protocol/GameLogicProtocol";
import { type PhysicsToGameLogicMessage } from "./Protocol/PhysicsGameLogicProtocol";
import type { GameLogicToRenderMessage, RenderToGameLogicMessage } from "./Protocol/RenderGameLogicProtocol";

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
let physicsReady = false;

let nextEntityId = 1;
const demoScene = new DemoScene(nextEntityId++, nextEntityId++);

const playerInput = new PlayerInput();
playerInput.OnJumpPressed = () => {
	if (physicsReady && physicsPort) {
		demoScene.ApplyJumpImpulse(physicsPort);
	}
};

function HandlePhysicsMessage(message: PhysicsToGameLogicMessage): void {
	switch (message.state) {
		case PhysState.Ready:
			physicsReady = true;
			if (physicsPort) demoScene.SpawnBodies(physicsPort);
			break;
		case PhysState.Transforms: {
			// PhysicsWorker only ever sends this when entityCount > 0, so no length check needed here.
			// We never touch `message.buffer`'s contents - just relabel and hand ownership straight on to
			// RenderWorker, transferred again so this hop stays zero-copy too.
			if (!renderPort) break;
			const batch: GameLogicToRenderMessage = {
				operation: RendOpType.TransformBatch,
				step: message.step,
				entityCount: message.entityCount,
				buffer: message.buffer,
			};
			renderPort.postMessage(batch, [message.buffer]);
			break;
		}
		case PhysState.OverlapEvents: {
			for (const overlapEvent of message.events) {
				if (!overlapEvent.entered)
					continue;

				const sound: GameLogicToAudioMessage = {
					action: SoundAction.PlaySound,
					soundId: "impact"
				};

				audioPort?.postMessage(sound);
			}
			break;
		}
	}
}

function HandleRenderMessage(message: RenderToGameLogicMessage): void {
	switch (message.type) {
		case "ready":
			// Both ports may become ready in either order - spawning only once
			// both have said "ready" avoids racing spawn-entity/spawn-*-body
			// messages ahead of either worker finishing its own init().
			if (renderPort) demoScene.SpawnVisuals(renderPort);
			break;
		case "asset-loaded":
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

			renderPort.onmessage = (e: MessageEvent<RenderToGameLogicMessage>) => HandleRenderMessage(e.data);
			physicsPort.onmessage = (e: MessageEvent<PhysicsToGameLogicMessage>) => HandlePhysicsMessage(e.data);
			break;
		}
		case "input":
			playerInput.Handle(message.event);
			break;
	}
};
