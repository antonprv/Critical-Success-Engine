// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { EditList } from "../Edits/EditList";
import type { SdfEdit } from "../Edits/SdfEdit";
import { SdfDynamicEdits } from "../Edits/SdfDynamicEdits";
import { SdfField } from "../Field/SdfField";
import { SdfMeshChunks } from "../Mesh/MeshChunks";
import type { SdfMeshData } from "../Mesh/SurfaceNets";
import { SdfWorld } from "../World/SdfWorld";

/** Main thread -> mesh worker. */
export type ToMeshWorker =
	| {
		Type: "init";
		/** The baked base (SdfBakedLayer.Serialize), or none. */
		Base: ArrayBuffer | null;
		/** The recent edits now (EditList.Serialize), or none. */
		Edits: ArrayBuffer | null;
		/** The main world's version they are at. */
		Version: number;
		CellSize: number;
		ChunkCells: number;
		Ao: boolean;
		/** Skirts on the chunks' open borders (levels of detail). */
		Skirts?: boolean;
	}
	/** EditList.TakeDelta of the main world. */
	| { Type: "delta"; Delta: ArrayBuffer; }
	| {
		Type: "mesh";
		Job: number;
		Key: string;
		Coord: [ number, number, number ];
		/** Its level of detail (none: 0). */
		Level?: number;
		/**
		 * For the physics alone: the dynamic edits it feels
		 * (SdfDynamicEdits.Packed), applied after the world's; no occlusion.
		 */
		Physics?: Float32Array;
	};

/** Mesh worker -> main thread. */
export interface FromMeshWorker {
	Type: "meshed";
	Job: number;
	Key: string;
	Coord: [ number, number, number ];
	Level: number;
	/** The main world's version the mesh was made at. */
	Version: number;
	Mesh: SdfMeshData;
	/** Made for the physics (with its dynamic edits). */
	Physics: boolean;
}

/** A reply and the buffers it hands over. */
export interface MeshWorkerReply {
	Message: FromMeshWorker;
	Transfer: ArrayBuffer[];
}

/**
 * What a mesh worker does (the worker file only wires it to its port): a
 * replica of the world - the same baked base, the main world's deltas
 * replayed in order, folds included - and chunks meshed from it on request.
 * Messages on a port arrive in order, so a job always sees every edit sent
 * before it.
 */
export class MeshWorkerHost {
	private _chunks: SdfMeshChunks | null = null;

	private _edits: EditList | null = null;

	private _version = 0;

	public Handle( message: ToMeshWorker ): MeshWorkerReply | null {
		switch ( message.Type ) {
			case "init": {
				const field = message.Base
					? SdfWorld.FromBase(
						message.Base,
						{ MaxEdits: Infinity },
						message.Edits,
					).Field
					: new SdfField( message.Edits
						? EditList.Deserialize( message.Edits )
						: new EditList() );

				this._edits = field.Edits;
				this._version = message.Version;
				this._chunks?.Dispose();
				this._chunks = new SdfMeshChunks( field, {
					CellSize: message.CellSize,
					ChunkCells: message.ChunkCells,
					Ao: message.Ao,
					Skirts: message.Skirts ?? false,
					Radius: 0,
				} );
				return null;
			}
			case "delta":
				this._version = this.Ready()[0].ApplyDelta( message.Delta );
				return null;
			case "mesh": {
				const physics = message.Physics;
				let extra: SdfEdit[] = [];

				if ( physics ) {
					const dynamic = new SdfDynamicEdits();

					dynamic.Load( physics );
					extra = dynamic.AsEdits();
				}

				const level = message.Level ?? 0;
				const chunks = this.Ready()[1];
				const chunk = physics
					? chunks.Mesh(
						message.Key,
						message.Coord,
						extra,
						false,
						level,
					)
					: chunks.Mesh(
						message.Key,
						message.Coord,
						[],
						undefined,
						level,
					);
				const mesh = chunk.Mesh;

				return {
					Message: {
						Type: "meshed",
						Job: message.Job,
						Key: message.Key,
						Coord: message.Coord,
						Level: level,
						Version: this._version,
						Mesh: mesh,
						Physics: physics !== undefined,
					},
					Transfer: [
						mesh.Positions.buffer as ArrayBuffer,
						mesh.Normals.buffer as ArrayBuffer,
						mesh.Ao.buffer as ArrayBuffer,
						mesh.MaterialIds.buffer as ArrayBuffer,
						mesh.MaterialIdsB.buffer as ArrayBuffer,
						mesh.MaterialMix.buffer as ArrayBuffer,
						mesh.Indices.buffer as ArrayBuffer,
					],
				};
			}
		}
	}

	private Ready(): [ EditList, SdfMeshChunks ] {
		if ( !this._edits || !this._chunks ) {
			throw new Error( "The mesh worker got work before init" );
		}
		return [ this._edits, this._chunks ];
	}
}
