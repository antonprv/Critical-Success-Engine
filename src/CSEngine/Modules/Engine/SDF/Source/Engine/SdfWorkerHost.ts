// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { SdfBakedLayer } from "../Bake/SdfBakedLayer";
import { DenseSdfGrid, TexelBytes } from "../Bricks/DenseGrid";
import { SdfDynamicEdits } from "../Edits/SdfDynamicEdits";
import { EditList } from "../Edits/EditList";
import { GroundPlane } from "../Field/BaseLayers";
import { SdfField } from "../Field/SdfField";
import type { ChunkJob, MeshChunksUpdate, SdfChunk } from "../Mesh/MeshChunks";
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
	SdfPhysicsChunk,
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
	/**
	 * The area, the pool and the physics' chunks are seen to at most once in
	 * this many ms (default 4); the ticks between only bring their edits.
	 * GameLogic ticks every frame, uncapped thousands a second: work on
	 * every one would queue ticks faster than they are taken.
	 */
	PoolMs?: number;
}

interface Loaded {
	Epoch: number;
	World: SdfWorld;
	Pool: SdfMeshWorkers;
	/** Whether GameLogic was told the area is meshed. */
	Meshed: boolean;
	/** The world sampled for the renderer (null: the scene wants none). */
	Volume: DenseSdfGrid | null;
	/** The dynamic edits the physics feels (packed), as last told. */
	Dynamic: Float32Array;
	/** They changed since their chunks were last meshed for the physics. */
	DynamicDirty: boolean;
	/** Chunks the physics has with dynamic edits in them now. */
	Touched: Set<string>;
	/** When the physics' chunks were last asked for (ms). */
	DynamicAt: number;
	/** The mesh tier's cell size. */
	CellSize: number;
	/**
	 * The "chunks" messages the physics hasn't taken yet, oldest first (it
	 * takes them in order): whether each was of the moving edits.
	 */
	Unacked: boolean[];
	/** When the pool was last seen to (ms). */
	PoolAt: number;
	/** The physics takes the chunks of the levels below this. */
	PhysicsLevels: number;
}

/**
 * The physics' chunks under dynamic edits are meshed again at most this many
 * times a second (and only once the last ones are back).
 */
const DynamicPhysicsHz = 20;

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
		if ( message.Type === "taken" ) {
			if ( this._loaded?.Epoch === message.Epoch ) {
				this._loaded.Unacked.shift();
			}
			return;
		}
		if ( this._loaded ) {
			this.SendPhysics(
				this._loaded.Epoch,
				[ ...this._meshes.values() ].map( PhysicsChunk ),
				[],
			);
		}
	}

	private async Load(
		epoch: number,
		scene: SdfSceneDescriptor | null,
	): Promise<void> {
		this._epoch = epoch;
		this._waiting = [];
		this._loaded?.Pool.Dispose();
		this._loaded?.Volume?.Dispose();
		this._loaded = null;
		this._meshes.clear();
		this._ports.ToRender( {
			Type: "begin",
			Epoch: epoch,
			Settings: scene
				? {
					Shadows: scene.Shadows ?? true,
					...scene.Grass ? { Grass: scene.Grass } : {},
				}
				: null,
		}, [] );
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
				Levels: scene.Levels ?? 1,
				...this._options.Workers !== undefined
					? { Workers: this._options.Workers }
					: {},
			}, this._options.Spawn ),
			Meshed: false,
			Volume: null,
			Dynamic: new Float32Array( 0 ),
			DynamicDirty: false,
			Touched: new Set(),
			DynamicAt: -Infinity,
			CellSize: scene.CellSize ?? 0.25,
			Unacked: [],
			PoolAt: -Infinity,
			PhysicsLevels: scene.PhysicsLevels ?? 2,
		};
		this._loaded.Pool.CenterOn( ...scene.Start ?? [ 0, 0, 0 ] );
		this._loaded.Volume = this.SampleVolume( world, scene );
		this._ports.ToGameLogic(
			{ Type: "loaded", Epoch: epoch, Error: null },
		);
		for ( const tick of this._waiting.splice( 0 ) ) {
			this.Tick( tick );
		}
	}

	/**
	 * The base sampled over its box for the renderer (the dynamic edits'
	 * proxies and the meshes' occlusion read it), and sent.
	 */
	private SampleVolume(
		world: SdfWorld,
		scene: SdfSceneDescriptor,
	): DenseSdfGrid | null {
		const texels = scene.VolumeTexels ?? 128;

		if ( texels <= 0 ) {
			return null;
		}

		const volume = new DenseSdfGrid(
			world.Field,
			world.Base.Bounds,
			texels,
		);

		this.SendVolume( this._epoch, volume );
		return volume;
	}

	/**
	 * The volume to the renderer: all of it, or (`written`) only the slices
	 * the last Refresh wrote.
	 */
	private SendVolume(
		epoch: number,
		volume: DenseSdfGrid,
		written = false,
	): void {
		const slice = volume.Resolution[0] * volume.Resolution[1] * TexelBytes;
		const [ z0, z1 ] = written
			? volume.Written
			: [ 0, volume.Resolution[2] - 1 ];
		const data = volume.Data.slice( z0 * slice, ( z1 + 1 ) * slice );

		this._ports.ToRender( {
			Type: "volume",
			Epoch: epoch,
			Volume: {
				Data: data,
				Resolution: volume.Resolution,
				Min: volume.Min,
				Spacing: volume.Spacing,
				Range: volume.Range,
				...z0 > 0 || z1 < volume.Resolution[2] - 1 ? { First: z0 } : {},
			},
		}, [ data.buffer ] );
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
		if ( message.Dynamic ) {
			loaded.Dynamic = message.Dynamic;
			loaded.DynamicDirty = true;
		}

		const now = performance.now();

		if ( now - loaded.PoolAt < ( this._options.PoolMs ?? 4 ) ) {
			return; // the next one takes this one's edits along
		}
		loaded.PoolAt = now;
		pool.CenterOn( ...message.Focus );
		if ( loaded.Volume && loaded.Volume.Refresh() > 0 ) {
			this.SendVolume( epoch, loaded.Volume, true );
		}

		const update = pool.Update();

		this.Publish( epoch, update );
		this.MeshDynamic( loaded );
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
		const touched = this._loaded!.Touched;
		// a chunk the physics has with dynamic edits keeps that mesh: it is
		// meshed again with them instead
		const near = update.Built.filter(
			( chunk ) => chunk.Level! < this._loaded!.PhysicsLevels,
		);
		const physics = near
			.filter( ( chunk ) => !touched.has( chunk.Key ) )
			.map( PhysicsChunk );

		if ( physics.length < near.length ) {
			this._loaded!.DynamicDirty = true;
		}

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
			chunk.Mesh.MaterialIdsB.buffer,
			chunk.Mesh.MaterialMix.buffer,
			chunk.Mesh.Indices.buffer,
		] ) );
		this.SendPhysics( epoch, physics, update.Removed );
	}

	/**
	 * The dynamic edits the physics feels (plan: a moving hole the balls fall
	 * into): the chunks they reach are meshed for the physics alone, with
	 * them, as the last such meshes are back (at most DynamicPhysicsHz); a
	 * chunk they left gets its own mesh back. Nothing of it is drawn or
	 * written into the world.
	 */
	private MeshDynamic( loaded: Loaded ): void {
		const pool = loaded.Pool;
		const back = pool.TakePhysics()
			.filter( ( chunk ) => loaded.Touched.has( chunk.Key ) )
			.map( PhysicsChunk );

		if ( back.length > 0 ) {
			this.SendPhysics( loaded.Epoch, back, [], true );
		}

		const now = performance.now();

		// the physics must have taken what it was sent: never a queue of
		// chunks it can't build as fast as they come
		if ( !loaded.DynamicDirty || !pool.PhysicsIdle
		|| loaded.Unacked.includes( true )
			|| now - loaded.DynamicAt < 1000 / DynamicPhysicsHz ) {
			return;
		}
		loaded.DynamicDirty = false;
		loaded.DynamicAt = now;

		const dynamic = new SdfDynamicEdits();
		const jobs = new Map<string, ChunkJob>();
		// a texel or two more: the mesh's cells sample past their chunk
		const margin = 2 * loaded.CellSize;

		dynamic.Load( loaded.Dynamic );
		for ( const edit of dynamic.Edits ) {
			const reach = SdfDynamicEdits.Reach( edit, margin );

			for ( const job of reach ? pool.ChunksIn( reach ) : [] ) {
				if ( job.Level < loaded.PhysicsLevels ) {
					jobs.set( job.Key, job );
				}
			}
		}

		// chunks left behind get their own meshes back
		const restored: SdfPhysicsChunk[] = [];
		const removed: string[] = [];

		for ( const key of loaded.Touched ) {
			if ( jobs.has( key ) ) {
				continue;
			}

			const own = this._meshes.get( key );

			if ( own ) {
				restored.push( PhysicsChunk( own ) );
			} else {
				removed.push( key );
			}
		}
		if ( restored.length > 0 || removed.length > 0 ) {
			this.SendPhysics( loaded.Epoch, restored, removed, true );
		}
		loaded.Touched = new Set( jobs.keys() );
		pool.MeshPhysics( [ ...jobs.values() ], loaded.Dynamic );
	}

	private SendPhysics(
		epoch: number,
		built: SdfPhysicsChunk[],
		removed: string[],
		moving = false,
	): void {
		this._loaded?.Unacked.push( moving );
		this._ports.ToPhysics( {
			Type: "chunks",
			Epoch: epoch,
			Built: built,
			Removed: removed,
		}, built.flatMap( ( chunk ) => [
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
			MaterialIdsB: mesh.MaterialIdsB.slice(),
			MaterialMix: mesh.MaterialMix.slice(),
			Indices: mesh.Indices.slice(),
		},
	};
}

function PhysicsChunk( chunk: SdfChunk ): {
	Key: string;
	Positions: Float32Array;
	Indices: Uint16Array;
} {
	// the skirts hang in the solid: nothing to collide with
	return {
		Key: chunk.Key,
		Positions: chunk.Mesh.Positions.slice(),
		Indices: chunk.Mesh.Indices.slice( 0, chunk.Mesh.SkirtFrom ),
	};
}
