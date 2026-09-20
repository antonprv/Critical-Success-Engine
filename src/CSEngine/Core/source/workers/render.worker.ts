// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Engine, Scene, ArcRotateCamera, Vector3, Quaternion, HemisphericLight, MeshBuilder } from "@babylonjs/core";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import "@babylonjs/loaders";

import { AssetLoader } from "../game/AssetLoader";

import type {
	EntityTransform,
	GameLogicToRenderMessage,
	MainToRenderMessage,
	RenderToGameLogicMessage,
} from "./protocol";

/**
 * Everything that used to live in Game.ts's constructor + runRenderLoop now
 * lives here, running on its own thread against an OffscreenCanvas. This
 * worker owns no gameplay state - it only ever draws what gamelogic.worker
 * tells it to, via spawn-entity/transform-batch/remove-entity messages on the
 * direct port handed to it at init.
 *
 * KNOWN LIMITATION: Babylon's Inspector (scene.debugLayer) manipulates the
 * DOM directly (creates its own overlay elements) and needs `document`,
 * which doesn't exist inside a worker. DebugTools.enableInspectorToggle
 * (from ../game/DebugTools) is NOT called here for that reason - see
 * docs/THREADING_ARCHITECTURE.md "Dev tooling" for the options if you want
 * it back (the practical one: keep a non-worker fallback render path for
 * `pnpm dev`, and only use the worker split in real builds).
 */

let engine: Engine | null = null;
let scene: Scene | null = null;
let assetLoader: AssetLoader | null = null;
let gameLogicPort: MessagePort | null = null;

const entityMeshes = new Map<number, AbstractMesh>();

function applyTransform(mesh: AbstractMesh, transform: EntityTransform["transform"]): void {
	const [px, py, pz, qx, qy, qz, qw] = transform;
	mesh.position.set(px, py, pz);
	if (!mesh.rotationQuaternion) {
		mesh.rotationQuaternion = new Quaternion();
	}
	mesh.rotationQuaternion.set(qx, qy, qz, qw);
}

function spawnEntity(message: Extract<GameLogicToRenderMessage, { type: "spawn-entity" }>): void {
	if (!scene) return;

	switch (message.mesh.kind) {
		case "sphere": {
			const mesh = MeshBuilder.CreateSphere(`entity-${message.entityId}`, { diameter: message.mesh.diameter }, scene);
			applyTransform(mesh, message.transform);
			entityMeshes.set(message.entityId, mesh);
			break;
		}
		case "box": {
			const mesh = MeshBuilder.CreateBox(
				`entity-${message.entityId}`,
				{ width: message.mesh.size[0], height: message.mesh.size[1], depth: message.mesh.size[2] },
				scene
			);
			applyTransform(mesh, message.transform);
			entityMeshes.set(message.entityId, mesh);
			break;
		}
		case "gltf": {
			assetLoader?.addMesh("background", `entity-${message.entityId}`, message.mesh.rootUrl, message.mesh.sceneFilename, (meshes) => {
				const root = meshes[0];
				if (!root) return;
				applyTransform(root, message.transform);
				entityMeshes.set(message.entityId, root);
				const reply: RenderToGameLogicMessage = { type: "asset-loaded", entityId: message.entityId };
				gameLogicPort?.postMessage(reply);
			});
			assetLoader?.loadBackgroundInBackground();
			break;
		}
	}
}

function handleGameLogicMessage(message: GameLogicToRenderMessage): void {
	switch (message.type) {
		case "spawn-entity":
			spawnEntity(message);
			break;
		case "remove-entity": {
			entityMeshes.get(message.entityId)?.dispose();
			entityMeshes.delete(message.entityId);
			break;
		}
		case "transform-batch": {
			for (const entry of message.entities) {
				const mesh = entityMeshes.get(entry.entityId);
				if (mesh) applyTransform(mesh, entry.transform);
			}
			break;
		}
		case "camera-pose": {
			// Left as a hook: swap in whatever camera object your gameplay code
			// actually drives (ArcRotateCamera target, FreeCamera position, ...).
			// The default scene below only sets up an ArcRotateCamera for the
			// placeholder sphere, so there's nothing meaningful to move yet.
			break;
		}
	}
}

function init(message: Extract<MainToRenderMessage, { type: "init" }>): void {
	// Must happen before the Engine reads the canvas size: OffscreenCanvas keeps its 300x150 default otherwise.
	message.canvas.width = Math.max(1, Math.round(message.width * message.devicePixelRatio));
	message.canvas.height = Math.max(1, Math.round(message.height * message.devicePixelRatio));
	engine = new Engine(message.canvas as unknown as HTMLCanvasElement, true, undefined, true);
	scene = new Scene(engine);
	assetLoader = new AssetLoader(scene);
	gameLogicPort = message.gameLogicPort;

	// Placeholder scene, ported as-is from the old Game.ts - swap for real
	// camera/lighting setup once gamelogic.worker is driving real entities.
	const camera = new ArcRotateCamera("Camera", -Math.PI / 2, Math.PI / 3, 15, new Vector3(0, 1, 0), scene);
	// No canvas.attachControl(): pointer input is captured on the main thread
	// (see orchestrator.ts) and forwarded through gamelogic.worker instead, so
	// two things aren't fighting over the same pointer events.
	void camera;

	new HemisphericLight("light1", new Vector3(1, 1, 0), scene);

	gameLogicPort.onmessage = (event: MessageEvent<GameLogicToRenderMessage>) => handleGameLogicMessage(event.data);

	engine.runRenderLoop(() => scene?.render());

	const readyMessage: RenderToGameLogicMessage = { type: "ready" };
	gameLogicPort.postMessage(readyMessage);

	if (message.devMode) {
		console.log("[render.worker] running in dev mode (Inspector unavailable inside a worker - see file header comment).");
	}
}

self.onmessage = (event: MessageEvent<MainToRenderMessage>) => {
	const message = event.data;
	switch (message.type) {
		case "init":
			init(message);
			break;
		case "resize": {
			if (!engine) break;
			const canvas = engine.getRenderingCanvas();
			if (canvas) {
				canvas.width = Math.round(message.width * message.devicePixelRatio);
				canvas.height = Math.round(message.height * message.devicePixelRatio);
			}
			engine.resize();
			break;
		}
		case "set-inspector-visible":
			// See the file header comment - Inspector needs `document` and can't
			// run inside this worker. Intentionally a no-op.
			break;
	}
};
