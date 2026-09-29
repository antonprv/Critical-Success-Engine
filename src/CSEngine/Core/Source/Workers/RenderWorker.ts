// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	ArcRotateCamera,
	Engine,
	HemisphericLight,
	MeshBuilder,
	Quaternion,
	Scene,
	Vector3
} from "@babylonjs/core";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import "@babylonjs/loaders";

import { AssetLoader } from "../Game/AssetLoader";
import { Logger } from "../Logging/Logger";

import { RendMesh, RendOpType } from "./Common/CommonEnums";
import type { GameLogicToRenderMessage, RenderToGameLogicMessage } from "./Protocol/RenderGameLogicProtocol";
import type { MainToRenderMessage } from "./Protocol/RenderProtocol";
import { TRANSFORM_STRIDE, type TransformBatchPayload } from "./Protocol/TransformProtocol";

// Own static buffer per realm - App.ts's timer doesn't flush this one.
Logger.SetupAutoFlush();

let engine: Engine | null = null;
let scene: Scene | null = null;
let assetLoader: AssetLoader | null = null;
let gameLogicPort: MessagePort | null = null;

const entityMeshes = new Map<number, AbstractMesh>();

//#region public Callback

self.onmessage = (event: MessageEvent<MainToRenderMessage>) => {
	const message = event.data;
	switch (message.type) {
		case "init":
			_Init(message);
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

//#endregion

//#region Private Methods

function _Init(message: Extract<MainToRenderMessage, { type: "init"; }>): void {
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

	gameLogicPort.onmessage = (event: MessageEvent<GameLogicToRenderMessage>) => _HandleGameLogicMessage(event.data);

	engine.runRenderLoop(() => scene?.render());

	const readyMessage: RenderToGameLogicMessage = { type: "ready" };
	gameLogicPort.postMessage(readyMessage);
}

function _HandleGameLogicMessage(message: GameLogicToRenderMessage): void {
	switch (message.type) {
		case RendOpType.SpawnEntity:
			_SpawnEntity(message);
			break;
		case RendOpType.RemoveEntity: {
			entityMeshes.get(message.entityId)?.dispose();
			entityMeshes.delete(message.entityId);
			break;
		}
		case RendOpType.TransformBatch: {
			_TransformEntity(message);
			break;
		}
		case RendOpType.PoseCamera: {
			// Left as a hook: swap in whatever camera object your gameplay code
			// actually drives (ArcRotateCamera target, FreeCamera position, ...).
			// The default scene below only sets up an ArcRotateCamera for the
			// placeholder sphere, so there's nothing meaningful to move yet.
			break;
		}
	}
}

function _SpawnEntity(message: Extract<GameLogicToRenderMessage, { type: RendOpType.SpawnEntity; }>): void {
	if (!scene) return;

	// Spawns are infrequent (once per entity, not once per tick), so the destructure
	// here isn't worth avoiding the way the transform-batch hot loop below is.
	const [px, py, pz, qx, qy, qz, qw] = message.transform;

	switch (message.mesh.kind) {
		case RendMesh.Sphere: {
			const mesh = MeshBuilder.CreateSphere(`entity-${message.entityId}`, { diameter: message.mesh.diameter }, scene);
			_ApplyTransform(mesh, px, py, pz, qx, qy, qz, qw);
			entityMeshes.set(message.entityId, mesh);
			break;
		}
		case RendMesh.Box: {
			const mesh = MeshBuilder.CreateBox(
				`entity-${message.entityId}`,
				{ width: message.mesh.size[0], height: message.mesh.size[1], depth: message.mesh.size[2] },
				scene
			);
			_ApplyTransform(mesh, px, py, pz, qx, qy, qz, qw);
			entityMeshes.set(message.entityId, mesh);
			break;
		}
		case RendMesh.Gltf: {
			assetLoader?.AddMesh("background", `entity-${message.entityId}`, message.mesh.rootUrl, message.mesh.sceneFilename, (meshes) => {
				const root = meshes[0];
				if (!root) return;
				_ApplyTransform(root, px, py, pz, qx, qy, qz, qw);
				entityMeshes.set(message.entityId, root);
				const reply: RenderToGameLogicMessage = { type: "asset-loaded", entityId: message.entityId };
				gameLogicPort?.postMessage(reply);
			});
			assetLoader?.LoadBackgroundInBackground();
			break;
		}
	}
}

function _ApplyTransform(
	mesh: AbstractMesh,
	px: number,
	py: number,
	pz: number,
	qx: number,
	qy: number,
	qz: number,
	qw: number
): void {
	mesh.position.set(px, py, pz);
	if (!mesh.rotationQuaternion) {
		mesh.rotationQuaternion = new Quaternion();
	}
	mesh.rotationQuaternion.set(qx, qy, qz, qw);
}

// message.buffer is TRANSFORM_STRIDE-wide float64 groups: [entityId, posX, posY, posZ,
// quatX, quatY, quatZ, quatW] - see TransformBatchPayload in protocol.ts. Reading it
// directly here (rather than the old per-entity object array) is the whole point of
// making this message Transferable: no structured-clone copy at either hop, and no
// per-entity object/array allocation on this end either.
function _TransformEntity(message: { type: RendOpType.TransformBatch; } & TransformBatchPayload) {
	const view = new Float64Array(message.buffer);
	for (let entity = 0; entity < message.entityCount; entity++) {
		const base = entity * TRANSFORM_STRIDE;
		const mesh = entityMeshes.get(view[base]!);
		if (mesh) {
			_ApplyTransform(
				mesh,
				view[base + 1]!,
				view[base + 2]!,
				view[base + 3]!,
				view[base + 4]!,
				view[base + 5]!,
				view[base + 6]!,
				view[base + 7]!
			);
		}
	}
}

//#endregion
