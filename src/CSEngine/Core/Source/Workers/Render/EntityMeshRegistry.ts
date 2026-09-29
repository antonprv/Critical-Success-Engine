// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { MeshBuilder, Quaternion } from "@babylonjs/core";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import type { AssetLoader } from "../../Game/AssetLoader";
import { RendMesh, type RendOpType as RendOp } from "../Common/CommonEnums";
import type { GameLogicToRenderMessage } from "../Protocol/RenderGameLogicProtocol";
import { TRANSFORM_STRIDE } from "../Protocol/TransformProtocol";

/**
 * Owns the entityId -> AbstractMesh map and everything that touches it:
 * spawning per MeshDescriptor kind, removal, and applying transform batches.
 * Knows nothing about the Engine/Scene lifecycle (see RenderScene) and
 * nothing about MessagePorts directly - a gltf spawn that finishes loading
 * is reported through {@link OnGltfLoaded} rather than posting a message
 * itself, so this class stays free of protocol/port concerns.
 */
export class EntityMeshRegistry {
	private readonly _scene: Scene;
	private readonly _assetLoader: AssetLoader;
	private readonly _meshes = new Map<number, AbstractMesh>();

	public OnGltfLoaded?: (entityId: number) => void;

	public constructor(scene: Scene, assetLoader: AssetLoader) {
		this._scene = scene;
		this._assetLoader = assetLoader;
	}

	public SpawnEntity(message: Extract<GameLogicToRenderMessage, { operation: RendOp.SpawnEntity; }>): void {
		// Spawns are infrequent (once per entity, not once per tick), so the destructure
		// here isn't worth avoiding the way ApplyTransformBatch's hot loop below is.
		const [px, py, pz, qx, qy, qz, qw] = message.transform;

		switch (message.mesh.shape) {
			case RendMesh.Sphere: {
				const mesh = MeshBuilder.CreateSphere(`entity-${message.entityId}`, { diameter: message.mesh.diameter }, this._scene);
				EntityMeshRegistry.ApplyTransform(mesh, px, py, pz, qx, qy, qz, qw);
				this._meshes.set(message.entityId, mesh);
				break;
			}
			case RendMesh.Box: {
				const mesh = MeshBuilder.CreateBox(
					`entity-${message.entityId}`,
					{ width: message.mesh.size[0], height: message.mesh.size[1], depth: message.mesh.size[2] },
					this._scene
				);
				EntityMeshRegistry.ApplyTransform(mesh, px, py, pz, qx, qy, qz, qw);
				this._meshes.set(message.entityId, mesh);
				break;
			}
			case RendMesh.Gltf: {
				this._assetLoader.AddMesh(
					"background",
					`entity-${message.entityId}`,
					message.mesh.rootUrl,
					message.mesh.sceneFilename,
					(meshes) => {
						const root = meshes[0];
						if (!root) return;
						EntityMeshRegistry.ApplyTransform(root, px, py, pz, qx, qy, qz, qw);
						this._meshes.set(message.entityId, root);
						this.OnGltfLoaded?.(message.entityId);
					}
				);
				this._assetLoader.LoadBackgroundInBackground();
				break;
			}
		}
	}

	public RemoveEntity(entityId: number): void {
		this._meshes.get(entityId)?.dispose();
		this._meshes.delete(entityId);
	}

	/**
	 * `buffer` is TRANSFORM_STRIDE-wide float64 groups: [entityId, posX, posY, posZ,
	 * quatX, quatY, quatZ, quatW] - see TransformBatchPayload in TransformProtocol.ts.
	 * Reading it directly here (rather than a per-entity object array) is the whole
	 * point of making this message Transferable: no structured-clone copy at either
	 * hop, and no per-entity object/array allocation on this end either.
	 */
	public ApplyTransformBatch(buffer: ArrayBuffer, entityCount: number): void {
		const view = new Float64Array(buffer);
		for (let entity = 0; entity < entityCount; entity++) {
			const base = entity * TRANSFORM_STRIDE;
			const mesh = this._meshes.get(view[base]!);
			if (mesh) {
				EntityMeshRegistry.ApplyTransform(
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

	private static ApplyTransform(
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
}
