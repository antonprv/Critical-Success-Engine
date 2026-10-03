// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../Logging/Logger";
import { RendOpType as RendOp } from "./Common/CommonEnums";
import { EntityMeshRegistry } from "./Render/EntityMeshRegistry";
import { RenderScene } from "./Render/RenderScene";
import type { CameraPose, GameLogicToRenderMessage, RenderToGameLogicMessage } from "./Protocol/RenderGameLogicProtocol";
import type { MainToRenderMessage } from "./Protocol/RenderProtocol";

// Own static buffer per realm - App.ts's timer doesn't flush this one.
Logger.SetupAutoFlush();

/**
 * Frame protocol: the render worker owns the display clock. Once per displayed frame it asks GameLogic for a frame
 * ("frame-request") - as long as fewer than MaxOutstanding requests are unanswered, so a slow GameLogic cannot build up
 * an ever-growing queue - and draws whatever the LATEST received frame says (poses + camera). The answer to a request
 * therefore shows up one or two displays frames later; GameLogic interpolates physics poses to hide that.
 */
const MaxOutstanding = 2;

// Only for "resize", which may arrive before "init"; everything after init gets the scene and registry passed in.
let renderScene: RenderScene | null = null;

let nextFrameId = 1;
let outstanding = 0;
let pendingFrame: { buffer: ArrayBuffer; entityCount: number; camera: CameraPose | null; } | null = null;

self.onmessage = (event: MessageEvent<MainToRenderMessage>) => {
	const message = event.data;
	switch (message.type) {
		case "init":
			Init(message);
			break;
		case "resize":
			renderScene?.Resize(message.width, message.height, message.devicePixelRatio);
			break;
		case "set-inspector-visible":
			// Inspector needs `document`, which a worker doesn't have - intentionally a no-op (see RenderScene).
			break;
	}
};

function Init(message: Extract<MainToRenderMessage, { type: "init"; }>): void {
	const scene = new RenderScene(message.canvas, message.width, message.height, message.devicePixelRatio);
	const registry = new EntityMeshRegistry(scene.Scene, scene.AssetLoader);
	renderScene = scene;
	const gameLogicPort = message.gameLogicPort;
	const Post = (reply: RenderToGameLogicMessage): void => gameLogicPort.postMessage(reply);

	registry.OnGltfLoaded = (entityId) => Post({ type: "asset-loaded", entityId });
	gameLogicPort.onmessage = (e: MessageEvent<GameLogicToRenderMessage>) => HandleGameLogicMessage(e.data, scene, registry, Post);

	scene.RunRenderLoop(() => BeforeRender(scene, registry, Post));
	Post({ type: "ready" });
}

function BeforeRender(scene: RenderScene, registry: EntityMeshRegistry, Post: (message: RenderToGameLogicMessage) => void): void {
	if (pendingFrame) {
		registry.ApplyTransformBatch(pendingFrame.buffer, pendingFrame.entityCount);
		if (pendingFrame.camera) scene.PoseCamera(pendingFrame.camera);
		pendingFrame = null;
	}

	if (outstanding < MaxOutstanding) {
		outstanding++;
		Post({ type: "frame-request", frameId: nextFrameId++, time: performance.now() });
	}
}

function HandleGameLogicMessage(
	message: GameLogicToRenderMessage,
	renderScene: RenderScene,
	registry: EntityMeshRegistry,
	Post: (message: RenderToGameLogicMessage) => void
): void {

	switch (message.operation) {
		case RendOp.SpawnEntity:
			registry.Spawn(message.entityId, message.mesh, message.transform, message.color);
			break;
		case RendOp.RemoveEntity:
			registry.Remove(message.entityId);
			break;
		case RendOp.SetVisible:
			registry.SetVisible(message.entityId, message.visible);
			break;
		case RendOp.SetColor:
			registry.SetColor(message.entityId, message.color);
			break;
		case RendOp.SetEnvironment:
			renderScene.SetClearColor(...message.clearColor);
			break;
		case RendOp.ClearScene:
			registry.Clear();
			pendingFrame = null;
			break;
		case RendOp.Frame:
			outstanding = Math.max(0, outstanding - 1);
			// Latest frame wins: an older one that was never drawn is simply superseded.
			pendingFrame = { buffer: message.buffer, entityCount: message.entityCount, camera: message.camera };
			break;
		case RendOp.Sync:
			Post({ type: "sync-ack", token: message.token });
			break;
	}
}
