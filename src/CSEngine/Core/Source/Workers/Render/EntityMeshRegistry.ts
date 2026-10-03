// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

import type { AssetLoader } from "../../Game/AssetLoader";
import { RendMesh } from "../Common/CommonEnums";
import type { MeshDescriptor } from "../Protocol/RenderGameLogicProtocol";
import type { FlatTransform } from "../Protocol/TransformProtocol";
import { TRANSFORM_STRIDE } from "../Protocol/TransformProtocol";

type Tuple3 = [number, number, number];

/**
 * Owns the entityId -> AbstractMesh map and everything that touches it: spawning per MeshDescriptor kind, colours,
 * visibility, removal, and applying transform batches. Knows nothing about the Engine/Scene lifecycle (RenderScene) and
 * nothing about MessagePorts - a gltf spawn that finishes loading is reported through {@link OnGltfLoaded}.
 */
export class EntityMeshRegistry {
	private readonly _scene: Scene;
	private readonly _assetLoader: AssetLoader;
	private readonly _meshes = new Map<number, AbstractMesh>();
	private readonly _materials = new Map<string, StandardMaterial>();

	public OnGltfLoaded?: (entityId: number) => void;

	public constructor(scene: Scene, assetLoader: AssetLoader) {
		this._scene = scene;
		this._assetLoader = assetLoader;
	}

	public Spawn(entityId: number, descriptor: MeshDescriptor, transform: FlatTransform, color?: Tuple3): void {
		this.Remove(entityId);

		const name = `entity-${entityId}`;
		let mesh: AbstractMesh | null = null;

		switch (descriptor.shape) {
			case RendMesh.Sphere:
				mesh = CreateSphere(name, { diameter: descriptor.diameter, segments: 24 }, this._scene);
				break;
			case RendMesh.Box:
				mesh = CreateBox(name, { width: descriptor.size[0], height: descriptor.size[1], depth: descriptor.size[2] }, this._scene);
				break;
			case RendMesh.Capsule:
				mesh = CreateCapsule(name, { radius: descriptor.radius, height: descriptor.height, tessellation: 24 }, this._scene);
				break;
			case RendMesh.Cylinder:
				mesh = CreateCylinder(name, { diameter: descriptor.diameter, height: descriptor.height, tessellation: 32 }, this._scene);
				break;
			case RendMesh.Triangles:
				mesh = EntityMeshRegistry.BuildTriangleMesh(name, descriptor.vertices, this._scene);
				break;
			case RendMesh.Gltf:
				this._assetLoader.AddMesh("background", name, descriptor.rootUrl, descriptor.sceneFilename, (meshes) => {
					const root = meshes[0];
					if (!root) return;
					EntityMeshRegistry.ApplyTransform(root, transform[0], transform[1], transform[2], transform[3], transform[4], transform[5], transform[6]);
					this._meshes.set(entityId, root);
					this.OnGltfLoaded?.(entityId);
				});
				this._assetLoader.LoadBackgroundInBackground();
				return;
		}

		EntityMeshRegistry.ApplyTransform(mesh, transform[0], transform[1], transform[2], transform[3], transform[4], transform[5], transform[6]);
		if (descriptor.shape !== RendMesh.Triangles || color) mesh.material = this.GetMaterial(color ?? [0.75, 0.78, 0.82], descriptor.shape === RendMesh.Triangles);
		this._meshes.set(entityId, mesh);
	}

	public Remove(entityId: number): void {
		this._meshes.get(entityId)?.dispose();
		this._meshes.delete(entityId);
	}

	public SetVisible(entityId: number, visible: boolean): void {
		this._meshes.get(entityId)?.setEnabled(visible);
	}

	public SetColor(entityId: number, color: Tuple3): void {
		const mesh = this._meshes.get(entityId);
		if (mesh) mesh.material = this.GetMaterial(color, false);
	}

	/** Drops every entity mesh (scene unload). Materials are kept - they are shared and tiny. */
	public Clear(): void {
		for (const mesh of this._meshes.values()) mesh.dispose();
		this._meshes.clear();
	}

	/**
	 * `buffer` is TRANSFORM_STRIDE-wide float64 groups: [entityId, posX, posY, posZ, quatX, quatY, quatZ, quatW]. Read in
	 * place: the message is Transferable, so there is no structured-clone copy at either hop and no per-entity allocation.
	 */
	public ApplyTransformBatch(buffer: ArrayBuffer, entityCount: number): void {
		const view = new Float64Array(buffer);
		for (let entity = 0; entity < entityCount; entity++) {
			const base = entity * TRANSFORM_STRIDE;
			const mesh = this._meshes.get(view[base]!);
			if (mesh) {
				EntityMeshRegistry.ApplyTransform(
					mesh, view[base + 1]!, view[base + 2]!, view[base + 3]!,
					view[base + 4]!, view[base + 5]!, view[base + 6]!, view[base + 7]!
				);
			}
		}
	}

	private GetMaterial(color: Tuple3, doubleSided: boolean): StandardMaterial {
		const key = `${color.join(",")}|${doubleSided ? 2 : 1}`;
		let material = this._materials.get(key);
		if (!material) {
			material = new StandardMaterial(`mat-${key}`, this._scene);
			material.diffuseColor = new Color3(color[0], color[1], color[2]);
			material.specularColor = new Color3(0.12, 0.12, 0.12);
			material.backFaceCulling = !doubleSided;
			this._materials.set(key, material);
		}
		return material;
	}

	/** Flat triangle soup -> flat-shaded mesh (vertices are never shared, so per-vertex normals are the face normals). */
	private static BuildTriangleMesh(name: string, vertices: number[], scene: Scene): Mesh {
		const vertexCount = Math.floor(vertices.length / 3);
		const indices = Array.from({ length: vertexCount }, (_, i) => i);
		const normals: number[] = [];
		VertexData.ComputeNormals(vertices, indices, normals);

		const mesh = new Mesh(name, scene);
		const data = new VertexData();
		data.positions = vertices;
		data.indices = indices;
		data.normals = normals;
		data.applyToMesh(mesh);
		return mesh;
	}

	private static ApplyTransform(
		mesh: AbstractMesh, px: number, py: number, pz: number, qx: number, qy: number, qz: number, qw: number
	): void {
		mesh.position.set(px, py, pz);
		mesh.rotationQuaternion ??= new Quaternion();
		mesh.rotationQuaternion.set(qx, qy, qz, qw);
	}
}
