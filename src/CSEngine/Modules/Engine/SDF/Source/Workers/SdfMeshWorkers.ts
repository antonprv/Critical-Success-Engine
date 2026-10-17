// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import {
	SdfMeshChunks,
	type MeshChunksOptions,
	type MeshChunksUpdate,
	type SdfChunk,
	type SdfChunkSource,
} from "../Mesh/MeshChunks";
import type { SdfWorld } from "../World/SdfWorld";
import type { FromMeshWorker, ToMeshWorker } from "./MeshWorkerHost";

/** What the pool needs of a worker (a Worker, or a stand-in in tests). */
export interface MeshWorkerPort {
	postMessage( message: ToMeshWorker, transfer?: Transferable[] ): void;
	onmessage: ( ( event: { data: FromMeshWorker; } ) => void ) | null;
	terminate(): void;
}

export interface MeshWorkersOptions extends MeshChunksOptions {
	/** Workers in the pool. Default: the cores but one, at least 1. */
	Workers?: number;
	/** Chunks a worker is given at once. Default 2. */
	InFlight?: number;
}

interface WorkerSlot {
	Port: MeshWorkerPort;
	Busy: number;
}

/**
 * The mesh tier meshed in parallel (plan.md 9.6, 22.3): the same area and
 * priorities as SdfMeshChunks, but every chunk is meshed by one of several
 * workers, each holding a replica of the world. Each Update sends the
 * world's new edits to all of them, hands queued chunks to the least busy
 * ones, and returns the meshes that came back since. A chunk an edit
 * changes while it is being meshed is meshed again once that mesh is back.
 *
 * The pool owns the world's delta stream (EditList.TakeDelta).
 */
export class SdfMeshWorkers implements SdfChunkSource {
	private readonly _chunks: SdfMeshChunks;

	private readonly _workers: WorkerSlot[] = [];

	private readonly _inFlight: number;

	private _nextJob = 1;

	/** Per chunk being meshed: its job. */
	private readonly _latest = new Map<string, number>();

	private _ready: SdfChunk[] = [];

	public constructor(
		private readonly _world: SdfWorld,
		options: MeshWorkersOptions,
		spawn: () => MeshWorkerPort,
	) {
		this._chunks = new SdfMeshChunks( _world.Field, options );
		this._inFlight = options.InFlight ?? 2;

		const count = options.Workers ?? FMath.Max(
			1,
			( globalThis.navigator?.hardwareConcurrency ?? 2 ) - 1,
		);
		// the workers start from the world as it is now; the deltas
		// collected so far are in it already
		_world.Edits.TakeDelta();

		const base = _world.Base.Serialize();
		const edits = _world.Edits.Serialize();

		for ( let i = 0; i < count; i++ ) {
			const slot: WorkerSlot = { Port: spawn(), Busy: 0 };
			const own = base.slice( 0 );
			const recent = edits.slice( 0 );

			slot.Port.onmessage = ( event ) => this.Receive( slot, event.data );
			slot.Port.postMessage( {
				Type: "init",
				Base: own,
				Edits: recent,
				Version: _world.Edits.Version,
				CellSize: this._chunks.CellSize,
				ChunkCells: this._chunks.ChunkCells,
				Ao: options.Ao ?? true,
			}, [ own, recent ] );
			this._workers.push( slot );
		}
	}

	/** Workers in the pool. */
	public get Workers(): number {
		return this._workers.length;
	}

	/** Chunks queued or being meshed. */
	public get Pending(): number {
		return this._chunks.Pending + this._latest.size;
	}

	public CenterOn( x: number, y: number, z: number ): void {
		this._chunks.CenterOn( x, y, z );
	}

	public Update(): MeshChunksUpdate {
		const delta = this._world.Edits.TakeDelta();

		if ( new Uint32Array( delta, 0, 1 )[0]! > 0 ) {
			for ( const slot of this._workers ) {
				const own = delta.slice( 0 );

				slot.Port.postMessage( { Type: "delta", Delta: own }, [ own ] );
			}
		}
		this._chunks.Collect();

		const removed = this._chunks.TakeRemoved();

		for ( const key of removed ) {
			this._latest.delete( key );
		}

		const free = this._workers.reduce(
			( sum, slot ) => sum + this._inFlight - slot.Busy,
			0,
		);

		// a chunk still being meshed waits for that mesh before the next one:
		// an edit moving every frame would otherwise keep the workers busy
		// with meshes that are dropped before they arrive
		const jobs = this._chunks.Next(
			free,
			( key ) => this._latest.has( key ),
		);

		for ( const job of jobs ) {
			const slot = this._workers.reduce(
				( best, next ) => ( next.Busy < best.Busy ? next : best ),
			);
			const id = this._nextJob++;

			this._latest.set( job.Key, id );
			slot.Busy++;
			slot.Port.postMessage( {
				Type: "mesh",
				Job: id,
				Key: job.Key,
				Coord: [ job.Coord[0], job.Coord[1], job.Coord[2] ],
			} );
		}

		const built = this._ready;

		this._ready = [];
		return {
			Built: built,
			Removed: removed,
			Remaining: this.Pending,
		};
	}

	public Dispose(): void {
		for ( const slot of this._workers ) {
			slot.Port.onmessage = null;
			slot.Port.terminate();
		}
		this._workers.length = 0;
		this._chunks.Dispose();
	}

	private Receive( slot: WorkerSlot, message: FromMeshWorker ): void {
		slot.Busy--;
		// an older job's mesh (the chunk was asked for again) or a chunk that
		// left the area meanwhile: dropped
		if ( this._latest.get( message.Key ) !== message.Job ) {
			return;
		}
		this._latest.delete( message.Key );
		this._ready.push( {
			Key: message.Key,
			Coord: message.Coord,
			Mesh: message.Mesh,
			Version: message.Version,
		} );
	}
}
