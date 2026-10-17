// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import {
	CreateCylinder,
} from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

import {
	AssetPriority,
	type AssetLoader,
} from "../../Engine/Assets/AssetLoader";
import { RendMesh } from "../Common/CommonEnums";
import type { MeshDescriptor } from "../Protocol/RenderGameLogicProtocol";
import type { FlatTransform } from "../Protocol/TransformProtocol";
import { TRANSFORM_STRIDE } from "../Protocol/TransformProtocol";
import { PrimitiveBatch, type InstanceInfo } from "./PrimitiveBatch";

type Tuple3 = [number, number, number];

const DefaultColor: Tuple3 = [0.75, 0.78, 0.82];

/**
 * A primitive: a shape with sizes that one batch (one mesh) draws for every
 * entity that has it.
 */
type Primitive = Exclude<
	MeshDescriptor,
	{ shape: RendMesh.Triangles | RendMesh.Gltf; }
>;

/** Where an entity is drawn: an instance of a batch, or a mesh of its own. */
type Entry = { Batch: PrimitiveBatch; Slot: number; } | { Mesh: AbstractMesh; };

/**
 * A sphere's rings and segments by its size: a small ball needs far fewer
 * triangles than a big one to look round (24 at 2 m and above, 8 at the least).
 */
export function SphereSegments( diameter: number ): number {
	return FMath.Max( 8, FMath.Min( 24, FMath.Round( 2 + diameter * 10 ) ) );
}

/**
 * Owns what draws each entity and everything that touches it: spawning per
 * MeshDescriptor kind, colours, visibility, removal, and applying transform
 * batches. Primitives (spheres, boxes, capsules, cylinders) of one shape and
 * size share one mesh (a PrimitiveBatch of thin instances: one draw call for
 * all of them); triangle soups and glTF models are meshes of their own. Knows
 * nothing about the Engine/Scene lifecycle (RenderScene) and nothing about
 * MessagePorts - a gltf spawn that finishes loading is reported through
 * {@link OnGltfLoaded}.
 */
export class EntityMeshRegistry {
	private readonly _scene: Scene;

	private readonly _assetLoader: AssetLoader;

	private readonly _entries = new Map<number, Entry>();

	private readonly _batches = new Map<string, PrimitiveBatch>();

	private readonly _materials = new Map<string, StandardMaterial>();

	public OnGltfLoaded?: ( entityId: number ) => void;

	public constructor( scene: Scene, assetLoader: AssetLoader ) {
		this._scene = scene;
		this._assetLoader = assetLoader;
		// what changed in the batches goes to the GPU once, right before
		// drawing
		scene.onBeforeRenderObservable.add( () => {
			for ( const batch of this._batches.values() ) {
				batch.Flush();
			}
		} );
	}

	public Spawn(
		entityId: number,
		descriptor: MeshDescriptor,
		transform: FlatTransform,
		color?: Tuple3,
	): void {
		this.Remove( entityId );

		const name = `entity-${ entityId }`;
		let mesh: AbstractMesh;

		switch ( descriptor.shape ) {
			case RendMesh.Triangles:
				mesh = EntityMeshRegistry.BuildTriangleMesh(
					name,
					descriptor.vertices,
					this._scene,
				);
				if ( color ) {
					mesh.material = this.GetMaterial( color, true );
				}
				break;
			case RendMesh.Gltf:
				this._assetLoader.AddMesh(
					AssetPriority.Background,
					name,
					descriptor.rootUrl,
					descriptor.sceneFilename,
					( meshes ) => {
						const root = meshes[0];

						if ( !root ) {
							return;
						}
						EntityMeshRegistry.ApplyTransform(
							root,
							transform[0],
							transform[1],
							transform[2],
							transform[3],
							transform[4],
							transform[5],
							transform[6],
						);
						this._entries.set( entityId, { Mesh: root } );
						this.OnGltfLoaded?.( entityId );
					},
				);
				this._assetLoader.LoadBackgroundInBackground();
				return;
			default: {
				const batch = this.BatchFor( descriptor );
				const slot = batch.Add(
					entityId,
					transform,
					color ?? DefaultColor,
				);
				this._entries.set( entityId, { Batch: batch, Slot: slot } );
				return;
			}
		}

		EntityMeshRegistry.ApplyTransform(
			mesh,
			transform[0],
			transform[1],
			transform[2],
			transform[3],
			transform[4],
			transform[5],
			transform[6],
		);
		this._entries.set( entityId, { Mesh: mesh } );
	}

	public Remove( entityId: number ): void {
		const entry = this._entries.get( entityId );

		if ( !entry ) {
			return;
		}
		this._entries.delete( entityId );
		if ( "Mesh" in entry ) {
			entry.Mesh.dispose();
			return;
		}
		const moved = entry.Batch.Remove( entry.Slot );

		if ( moved !== null ) {
			( this._entries.get( moved ) as {
				Slot: number;
			} ).Slot = entry.Slot;
		}
	}

	public SetVisible( entityId: number, visible: boolean ): void {
		const entry = this._entries.get( entityId );

		if ( entry && "Mesh" in entry ) {
			entry.Mesh.setEnabled( visible );
		}
		else {
			entry?.Batch.SetVisible( entry.Slot, visible );
		}
	}

	public SetColor( entityId: number, color: Tuple3 ): void {
		const entry = this._entries.get( entityId );

		if ( entry && "Mesh" in entry ) {
			entry.Mesh.material = this.GetMaterial( color, false );
		}
		else {
			entry?.Batch.SetColor( entry.Slot, color );
		}
	}

	/**
	 * What draws an entity, for tests and tools: its pose, colour and whether
	 * it shows; `Batched` when it is an instance of a shared mesh. Null when
	 * nothing does (yet: a glTF still loading).
	 */
	public Describe( entityId: number ): ( InstanceInfo
		& { Batched: boolean; } ) | null {
		const entry = this._entries.get( entityId );

		if ( !entry ) {
			return null;
		}
		if ( !( "Mesh" in entry ) ) {
			return { ...entry.Batch.Describe( entry.Slot ), Batched: true };
		}
		const mesh = entry.Mesh;
		const material = mesh.material as StandardMaterial | null;
		const rotation = mesh.rotationQuaternion!;

		return {
			Position: [mesh.position.x, mesh.position.y, mesh.position.z],
			Rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
			Color: material
				? material.diffuseColor.asArray() as Tuple3
				: DefaultColor,
			Visible: mesh.isEnabled(),
			Batched: false,
		};
	}

	/**
	 * Drops what draws every entity (scene unload): their meshes and the
	 * batches. Materials are kept - they are shared and tiny.
	 */
	public Clear(): void {
		for ( const entry of this._entries.values() ) {
			if ( "Mesh" in entry ) {
				entry.Mesh.dispose();
			}
		}
		this._entries.clear();
		for ( const batch of this._batches.values() ) {
			batch.Dispose();
		}
		this._batches.clear();
	}

	/**
	 * `buffer` is TRANSFORM_STRIDE-wide float64 groups: [entityId, posX, posY,
	 * posZ, quatX, quatY, quatZ, quatW]. Read in place: the message is
	 * Transferable, so there is no structured-clone copy at either hop and no
	 * per-entity allocation.
	 */
	public ApplyTransformBatch(
		buffer: ArrayBuffer,
		entityCount: number,
	): void {
		const view = new Float64Array( buffer );

		for ( let entity = 0; entity < entityCount; entity++ ) {
			const base = entity * TRANSFORM_STRIDE;
			const entry = this._entries.get( view[base]! );

			if ( !entry ) {
				continue;
			}
			if ( "Mesh" in entry ) {
				EntityMeshRegistry.ApplyTransform(
					entry.Mesh, view[base + 1]!, view[base + 2]!,
					view[base + 3]!,
					view[base + 4]!, view[base + 5]!, view[base + 6]!,
					view[base + 7]!,
				);
			}
			else {
				entry.Batch.SetPose(
					entry.Slot, view[base + 1]!, view[base + 2]!,
					view[base + 3]!,
					view[base + 4]!, view[base + 5]!, view[base + 6]!,
					view[base + 7]!,
				);
			}
		}
	}

	/** The batch of a primitive's shape and size (made on first use). */
	private BatchFor( descriptor: Primitive ): PrimitiveBatch {
		const key = JSON.stringify( descriptor );
		let batch = this._batches.get( key );

		if ( !batch ) {
			batch = new PrimitiveBatch(
				this.BuildPrimitive( `batch-${ key }`, descriptor ),
				this.GetMaterial( [1, 1, 1], false ),
			);
			this._batches.set( key, batch );
		}
		return batch;
	}

	private BuildPrimitive( name: string, descriptor: Primitive ): Mesh {
		switch ( descriptor.shape ) {
			case RendMesh.Sphere:
				return CreateSphere(
					name,
					{
						diameter: descriptor.diameter,
						segments: SphereSegments( descriptor.diameter ),
					},
					this._scene,
				);
			case RendMesh.Box:
				return CreateBox(
					name,
					{
						width: descriptor.size[0],
						height: descriptor.size[1],
						depth: descriptor.size[2],
					},
					this._scene,
				);
			case RendMesh.Capsule:
				return CreateCapsule(
					name,
					{
						radius: descriptor.radius,
						height: descriptor.height,
						tessellation: 24,
					},
					this._scene,
				);
			default:
				return CreateCylinder(
					name,
					{
						diameter: descriptor.diameter,
						height: descriptor.height,
						tessellation: 32,
					},
					this._scene,
				);
		}
	}

	private GetMaterial(
		color: Tuple3,
		doubleSided: boolean,
	): StandardMaterial {
		const key = `${ color.join( "," ) }|${ doubleSided ? 2 : 1 }`;
		let material = this._materials.get( key );

		if ( !material ) {
			material = new StandardMaterial( `mat-${ key }`, this._scene );
			material.diffuseColor = new Color3( color[0], color[1], color[2] );
			material.specularColor = new Color3( 0.12, 0.12, 0.12 );
			material.backFaceCulling = !doubleSided;
			this._materials.set( key, material );
		}
		return material;
	}

	/**
	 * Flat triangle soup -> flat-shaded mesh (vertices are never shared, so
	 * per-vertex normals are the face normals).
	 */
	private static BuildTriangleMesh(
		name: string,
		vertices: number[],
		scene: Scene,
	): Mesh {
		const vertexCount = FMath.Floor( vertices.length / 3 );
		const indices = Array.from( { length: vertexCount }, ( _, i ) => i );
		const normals: number[] = [];
		VertexData.ComputeNormals( vertices, indices, normals );

		const mesh = new Mesh( name, scene );
		const data = new VertexData();
		data.positions = vertices;
		data.indices = indices;
		data.normals = normals;
		data.applyToMesh( mesh );
		return mesh;
	}

	private static ApplyTransform(
		mesh: AbstractMesh, px: number, py: number, pz: number, qx: number,
		qy: number, qz: number, qw: number,
	): void {
		mesh.position.set( px, py, pz );
		mesh.rotationQuaternion ??= new Quaternion();
		mesh.rotationQuaternion.set( qx, qy, qz, qw );
	}
}
