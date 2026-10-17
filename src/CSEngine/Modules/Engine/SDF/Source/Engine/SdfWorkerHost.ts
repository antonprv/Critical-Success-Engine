// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { SdfBakedLayer } from "../Bake/SdfBakedLayer";
import { EditList } from "../Edits/EditList";
import { GroundPlane } from "../Field/BaseLayers";
import { SdfField } from "../Field/SdfField";
import type { MeshChunksUpdate, SdfChunk } from "../Mesh/MeshChunks";
import { CreateAabb } from "../Spatial/Aabb";
import {
	SdfMeshWorkers,
	type MeshWorkerPort,
} from "../Workers/SdfMeshWorkers";
import { SdfWorld } from "../World/SdfWorld";
import type {
	FromSdfWorker,
	PhysicsToSdf,
	SdfQuery,
	SdfQueryResult,
	SdfSceneDescriptor,
	SdfToPhysics,
	SdfToRender,
	ToSdfWorker,
} from "./SdfProtocol";

/** Where the SDF worker's messages go. */
export interface SdfHostPorts {
	ToGameLogic( message: FromSdfWorker ): void;
	ToRender( message: SdfToRender, transfer: Transferable[] ): void;
	ToPhysics( message: SdfToPhysics, transfer: Transferable[] ): void;
}

export interface SdfHostOptions {
	/** Makes a mesh worker (CreateMeshWorker in the browser). */
	Spawn: () => MeshWorkerPort;
	/** Reads a baked base file. */
	Fetch: ( url: string ) => Promise<ArrayBuffer>;
	/** Mesh workers in the pool; default: SdfMeshWorkers' own. */
	Workers?: number;
}

interface Loaded {
	Epoch: number;
	World: SdfWorld;
	Pool: SdfMeshWorkers;
	/** Whether GameLogic was told the area is meshed. */
	Meshed: boolean;
}

/**
 * What the SDF worker does (its file only wires the ports): the world of the
 * loaded scene - the baked base and a replica of the game's recent edits,
 * folds included - a pool of mesh workers around the focus, and answers to
 * GameLogic's questions. Every game frame's tick applies the edits, moves
 * the focus and passes the meshes that came back to the render worker and,
 * as triangles, to the physics worker. It keeps the latest meshes, so a
 * physics world recreated by a scene load gets them all again.
 */
export class SdfWorkerHost {
	private _loaded: Loaded | null = null;

	/** The scene being loaded (its base still being fetched or baked). */
	private _epoch = 0;

	/** Ticks that came while the scene loaded: applied once it has. */
	private _waiting: Array<Extract<ToSdfWorker, { Type: "tick"; }>> = [];

	/** The latest mesh of each chunk (what the physics gets again). */
	private readonly _meshes = new Map<string, SdfChunk>();

	public constructor(
		private readonly _ports: SdfHostPorts,
		private readonly _options: SdfHostOptions,
	) {
	}

	/** The world of the loaded scene, if any. */
	public get World(): SdfWorld | null {
		return this._loaded?.World ?? null;
	}

	public async HandleGameLogic( message: ToSdfWorker ): Promise<void> {
		switch ( message.Type ) {
			case "load":
				await this.Load( message.Epoch, message.Scene );
				break;
			case "tick":
				if ( this._loaded?.Epoch === this._epoch ) {
					this.Tick( message );
				} else {
					this._waiting.push( message );
				}
				break;
			case "query":
				this._ports.ToGameLogic( {
					Type: "result",
					Id: message.Id,
					Result: this.Answer( message.Query ),
				} );
				break;
		}
	}

	public HandlePhysics( message: PhysicsToSdf ): void {
		if ( message.Type === "reset" && this._loaded ) {
			const built = [ ...this._meshes.values() ];
			const physics = built.map( PhysicsChunk );

			this._ports.ToPhysics( {
				Type: "chunks",
				Epoch: this._loaded.Epoch,
				Built: physics,
				Removed: [],
			}, physics.flatMap( ( chunk ) => [
				chunk.Positions.buffer,
				chunk.Indices.buffer,
			] ) );
		}
	}

	private async Load(
		epoch: number,
		scene: SdfSceneDescriptor | null,
	): Promise<void> {
		this._epoch = epoch;
		this._waiting = [];
		this._loaded?.Pool.Dispose();
		this._loaded = null;
		this._meshes.clear();
		this._ports.ToRender( { Type: "begin", Epoch: epoch }, [] );
		this._ports.ToPhysics( {
			Type: "begin",
			Epoch: epoch,
			Layer: scene?.Layer ?? 1,
			Mask: scene?.Mask ?? -1,
		}, [] );
		if ( !scene ) {
			this._ports.ToGameLogic(
				{ Type: "loaded", Epoch: epoch, Error: null },
			);
			return;
		}

		let base: SdfBakedLayer;

		try {
			base = await this.Base( scene );
		} catch ( error ) {
			this._ports.ToGameLogic( {
				Type: "loaded",
				Epoch: epoch,
				Error: ( error as Error ).message,
			} );
			return;
		}
		if ( epoch !== this._epoch ) {
			return; // another scene came meanwhile
		}

		// a replica: the game's own list folds, the folds come in its deltas
		const world = new SdfWorld( base, { MaxEdits: Infinity } );

		this._loaded = {
			Epoch: epoch,
			World: world,
			Pool: new SdfMeshWorkers( world, {
				CellSize: scene.CellSize ?? 0.25,
				ChunkCells: scene.ChunkCells ?? 16,
				Radius: scene.Radius ?? 2,
				...this._options.Workers !== undefined
					? { Workers: this._options.Workers }
					: {},
			}, this._options.Spawn ),
			Meshed: false,
		};
		this._loaded.Pool.CenterOn( ...scene.Start ?? [ 0, 0, 0 ] );
		this._ports.ToGameLogic(
			{ Type: "loaded", Epoch: epoch, Error: null },
		);
		for ( const tick of this._waiting.splice( 0 ) ) {
			this.Tick( tick );
		}
	}

	private async Base( scene: SdfSceneDescriptor ): Promise<SdfBakedLayer> {
		if ( "Url" in scene.Base ) {
			return SdfBakedLayer.Deserialize(
				await this._options.Fetch( scene.Base.Url ),
			);
		}

		const bake = scene.Base.Bake;
		const edits = new EditList();

		for ( const edit of bake.Edits ) {
			edits.Add( edit );
		}
		return SdfBakedLayer.Bake(
			new SdfField(
				edits,
				bake.Ground === undefined || bake.Ground === null
					? null
					: new GroundPlane( bake.Ground ),
			),
			{ Bounds: CreateAabb( ...bake.Bounds ), Spacing: bake.Spacing },
		);
	}

	private Tick( message: Extract<ToSdfWorker, { Type: "tick"; }> ): void {
		const loaded = this._loaded!;
		const { World: world, Pool: pool, Epoch: epoch } = loaded;

		world.Edits.ApplyDelta( message.Delta );
		pool.CenterOn( ...message.Focus );

		const update = pool.Update();

		this.Publish( epoch, update );
		if ( !loaded.Meshed && update.Remaining === 0 ) {
			loaded.Meshed = true;
			this._ports.ToGameLogic( { Type: "meshed", Epoch: epoch } );
		}
	}

	/** Sends the meshes that came back to the render and physics workers. */
	private Publish( epoch: number, update: MeshChunksUpdate ): void {
		if ( update.Built.length === 0 && update.Removed.length === 0 ) {
			return;
		}
		for ( const key of update.Removed ) {
			this._meshes.delete( key );
		}
		for ( const chunk of update.Built ) {
			this._meshes.set( chunk.Key, chunk );
		}

		const render = update.Built.map( CopyChunk );
		const physics = update.Built.map( PhysicsChunk );

		this._ports.ToRender( {
			Type: "chunks",
			Epoch: epoch,
			Built: render,
			Removed: update.Removed,
		}, render.flatMap( ( chunk ) => [
			chunk.Mesh.Positions.buffer,
			chunk.Mesh.Normals.buffer,
			chunk.Mesh.Ao.buffer,
			chunk.Mesh.MaterialIds.buffer,
			chunk.Mesh.Indices.buffer,
		] ) );
		this._ports.ToPhysics( {
			Type: "chunks",
			Epoch: epoch,
			Built: physics,
			Removed: update.Removed,
		}, physics.flatMap( ( chunk ) => [
			chunk.Positions.buffer,
			chunk.Indices.buffer,
		] ) );
	}

	private Answer( query: SdfQuery ): SdfQueryResult {
		const field = this._loaded?.World.Field;

		if ( !field ) {
			return null;
		}
		if ( query.Kind === "raycast" ) {
			return field.Raycast( query.Origin, query.Dir, query.TMax );
		}

		const [ x, y, z ] = query.Point;

		return {
			Distance: field.Distance( x, y, z ),
			MaterialId: field.LastMaterial,
		};
	}
}

/** A chunk with its own copies of the buffers (to hand over). */
function CopyChunk( chunk: SdfChunk ): SdfChunk {
	const mesh = chunk.Mesh;

	return {
		...chunk,
		Mesh: {
			Positions: mesh.Positions.slice(),
			Normals: mesh.Normals.slice(),
			Ao: mesh.Ao.slice(),
			MaterialIds: mesh.MaterialIds.slice(),
			Indices: mesh.Indices.slice(),
		},
	};
}

function PhysicsChunk( chunk: SdfChunk ): {
	Key: string;
	Positions: Float32Array;
	Indices: Uint16Array;
} {
	return {
		Key: chunk.Key,
		Positions: chunk.Mesh.Positions.slice(),
		Indices: chunk.Mesh.Indices.slice(),
	};
}
