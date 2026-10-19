// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeWorker } from "./FakeWorker";
import {
	CreateAabb,
	EditList,
	GroundPlane,
	CreateMeshWorker,
	MeshWorkerHost,
	SdfBakedLayer,
	SdfDynamicEdits,
	SdfDynamicFlags,
	SdfEditFlags,
	SdfField,
	SdfMeshChunks,
	SdfMeshWorkers,
	SdfOp,
	SdfShape,
	SdfWorld,
	type MeshChunksUpdate,
	type SdfMeshData,
	type ToMeshWorker,
} from "../Source/Index";

function NewWorld( maxEdits = 32 ): SdfWorld {
	const editor = new EditList();

	editor.Add(
		{
			Shape: SdfShape.Sphere,
			Position: [ 0, 1, 0 ],
			Params: [ 1.2, 0, 0, 0 ],
		},
	);

	const base = SdfBakedLayer.Bake(
		new SdfField( editor, new GroundPlane( 0 ) ),
		{ Bounds: CreateAabb( -4, -2, -4, 4, 4, 4 ), Spacing: 0.1 },
	);

	return new SdfWorld( base, { MaxEdits: maxEdits } );
}

const Options = { CellSize: 0.25, ChunkCells: 8, Radius: 1, Budget: 1000 };

/** Runs Update until nothing is pending; the last mesh of each chunk. */
async function Drain(
	source: { Update(): MeshChunksUpdate; Pending: number; },
) {
	const meshes = new Map<string, SdfMeshData>();

	for ( let round = 0; round < 100; round++ ) {
		const update = source.Update();

		for ( const chunk of update.Built ) {
			meshes.set( chunk.Key, chunk.Mesh );
		}
		for ( const key of update.Removed ) {
			meshes.delete( key );
		}
		if ( source.Pending === 0 && update.Built.length === 0 ) {
			break;
		}
		await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
	}
	return meshes;
}

function Same(
	a: Map<string, SdfMeshData>,
	b: Map<string, SdfMeshData>,
): void {
	expect( [ ...a.keys() ].sort() ).toEqual( [ ...b.keys() ].sort() );
	for ( const [ key, mesh ] of a ) {
		expect( mesh.Positions ).toEqual( b.get( key )!.Positions );
		expect( mesh.Indices ).toEqual( b.get( key )!.Indices );
	}
}

afterEach( () => {
	vi.unstubAllGlobals();
} );

describe( "SdfMeshWorkers", () => {
	it( "meshes in workers what the main thread would", async () => {
		const world = NewWorld();
		const workers: FakeWorker[] = [];
		const pool = new SdfMeshWorkers(
			world,
			{ ...Options, Workers: 3 },
			() => {
				const worker = new FakeWorker();

				workers.push( worker );
				return worker;
			},
		);

		expect( pool.Workers ).toBe( 3 );

		const parallel = await Drain( pool );
		const local = await Drain( new SdfMeshChunks( world.Field, Options ) );

		expect( parallel.size ).toBe( 27 );
		Same( parallel, local );
		pool.Dispose();
		expect( workers.every( ( worker ) => worker.Terminated ) ).toBe( true );
	} );

	it( "sends edits and folds to every worker", async () => {
		const world = NewWorld( 1 );

		world.Add(
			{
				Shape: SdfShape.Sphere,
				Op: SdfOp.Subtract,
				Position: [ 1, 0, 0 ],
				Params: [ 0.5, 0, 0, 0 ],
			},
		);

		const pool = new SdfMeshWorkers(
			world,
			{ ...Options, Workers: 2 },
			() => new FakeWorker(),
		);

		await Drain( pool );
		// two more: the first two get folded into the base, here and there
		world.Add(
			{
				Shape: SdfShape.Sphere,
				Op: SdfOp.Subtract,
				Position: [ -1, 0, 0 ],
				Params: [ 0.5, 0, 0, 0 ],
			},
		);
		world.Add( {
			Shape: SdfShape.Box,
			Position: [ 0, 2.5, 0 ],
			Params: [ 0.4, 0.4, 0.4, 0 ],
			Flags: SdfEditFlags.Keep,
		} );
		expect( world.Edits.Count ).toBe( 1 );

		const parallel = await Drain( pool );
		const local = await Drain( new SdfMeshChunks( world.Field, Options ) );

		Same( parallel, local );
		pool.Dispose();

		// a new pool starts from the world as it is now, folds included
		const fresh = new SdfMeshWorkers(
			world,
			{ ...Options, Workers: 1 },
			() => new FakeWorker(),
		);

		Same( await Drain( fresh ), local );
		fresh.Dispose();
	} );

	it(
		"meshes a chunk again when an edit changed it while it was meshed",
		() => {
			const world = NewWorld();
			const worker = new FakeWorker( true );
			const pool = new SdfMeshWorkers(
				world,
				{ ...Options, Radius: 0, Workers: 1, InFlight: 4 },
				() => worker,
			);

			pool.Update();
			expect( worker.Held ).toHaveLength( 1 );

			// an edit there before the mesh came back: queued, not sent yet
			world.Add(
				{
					Shape: SdfShape.Sphere,
					Position: [ 1, 0.5, 1 ],
					Params: [ 0.3, 0, 0, 0 ],
				},
			);
			pool.Update();
			expect( worker.Held ).toHaveLength( 1 );
			expect( pool.Pending ).toBe( 2 );
			worker.Flush( 0 );

			const first = pool.Update();

			// the old mesh is shown meanwhile, and the chunk is sent again
			expect( first.Built ).toHaveLength( 1 );
			expect( first.Built[0]!.Version )
				.toBeLessThan( world.Edits.Version );
			expect( worker.Held ).toHaveLength( 1 );
			worker.Flush( 0 );

			const second = pool.Update();

			expect( second.Built[0]!.Version ).toBe( world.Edits.Version );
			expect( second.Remaining ).toBe( 0 );
			pool.Dispose();
		},
	);

	it( "fills its workers and no more; levels travel with the chunks", () => {
		const world = NewWorld();
		const worker = new FakeWorker( true );
		const pool = new SdfMeshWorkers(
			world,
			{ ...Options, Radius: 1, Levels: 2, Workers: 1, InFlight: 2 },
			() => worker,
		);

		pool.Update();
		expect( worker.Held ).toHaveLength( 2 );
		// all busy: nothing more is handed out
		pool.Update();
		expect( worker.Held ).toHaveLength( 2 );
		worker.Flush( 0 );
		worker.Flush( 0 );

		const back = pool.Update().Built;

		expect( back ).toHaveLength( 2 );
		for ( const chunk of back ) {
			expect( chunk.Level ).toBe( chunk.Key.includes( ":" ) ? 1 : 0 );
		}
		pool.Dispose();
	} );

	it( "drops the meshes of chunks that left the area", () => {
		const world = NewWorld();
		const worker = new FakeWorker( true );
		const pool = new SdfMeshWorkers(
			world,
			{ ...Options, Radius: 0, Workers: 1 },
			() => worker,
		);

		pool.Update();
		pool.CenterOn( 50, 0, 0 );

		const moved = pool.Update();

		expect( moved.Removed ).toEqual( [ "0,0,0" ] );
		// the old chunk's mesh, then the new one's
		worker.Flush( 0 );
		worker.Flush( 0 );
		expect( pool.Update().Built.map( ( chunk ) => chunk.Key ) )
			.toEqual( [ "25,0,0" ] );
		pool.Dispose();
	} );

	it( "makes real workers from the package's worker file", () => {
		const made: Array<[ URL, WorkerOptions ]> = [];

		vi.stubGlobal( "Worker", class {
			public constructor( url: URL, options: WorkerOptions ) {
				made.push( [ url, options ] );
			}
		} );
		CreateMeshWorker();
		expect( made[0]![0].pathname ).toMatch( /Workers\/MeshWorker\.ts$/ );
		expect( made[0]![1] ).toEqual( { type: "module" } );
	} );

	it( "uses all cores but one by default", () => {
		vi.stubGlobal( "navigator", { hardwareConcurrency: 6 } );
		expect(
			new SdfMeshWorkers(
				NewWorld(),
				Options,
				() => new FakeWorker(),
			).Workers,
		).toBe( 5 );
		vi.stubGlobal( "navigator", undefined );
		expect(
			new SdfMeshWorkers(
				NewWorld(),
				Options,
				() => new FakeWorker(),
			).Workers,
		).toBe( 1 );
	} );
} );

describe( "MeshWorkerHost", () => {
	it( "refuses work before init and meshes a world without a base", () => {
		const host = new MeshWorkerHost();

		expect(
			() => host.Handle(
				{ Type: "mesh", Job: 1, Key: "0,0,0", Coord: [ 0, 0, 0 ] },
			),
		)
			.toThrow( "before init" );
		host.Handle(
			{
				Type: "init",
				Base: null,
				Edits: null,
				Version: 0,
				CellSize: 0.25,
				ChunkCells: 8,
				Ao: false,
			},
		);

		const source = new EditList();

		source.Add(
			{
				Shape: SdfShape.Sphere,
				Position: [ 1, 1, 1 ],
				Params: [ 0.8, 0, 0, 0 ],
			},
		);
		host.Handle( { Type: "delta", Delta: source.TakeDelta() } );

		const reply = host.Handle(
			{ Type: "mesh", Job: 7, Key: "0,0,0", Coord: [ 0, 0, 0 ] },
		)!;

		expect( reply.Message.Job ).toBe( 7 );
		expect( reply.Message.Version ).toBe( 1 );
		expect( reply.Message.Mesh.Indices.length ).toBeGreaterThan( 0 );
		expect( reply.Message.Physics ).toBe( false );
		expect( reply.Transfer ).toHaveLength( 7 );

		// for the physics: with the dynamic edits it feels (a hole through
		// the ball), no occlusion
		const dynamic = new SdfDynamicEdits();

		dynamic.Add( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.Subtract,
			Position: [ 1, 1, 1.6 ],
			Params: [ 0.5, 0, 0, 0 ],
			Flags: SdfDynamicFlags.Physics,
		} );

		const physics = host.Handle( {
			Type: "mesh",
			Job: 8,
			Key: "0,0,0",
			Coord: [ 0, 0, 0 ],
			Physics: dynamic.Packed(),
		} )!;

		expect( physics.Message.Physics ).toBe( true );
		expect( physics.Message.Mesh.Indices ).not
			.toEqual( reply.Message.Mesh.Indices );
		expect( [ ...physics.Message.Mesh.Ao ].every( ( ao ) => ao === 1 ) )
			.toBe( true );
		// edits given whole at init, and their version
		host.Handle( {
			Type: "init",
			Base: null,
			Edits: source.Serialize(),
			Version: 5,
			CellSize: 0.25,
			ChunkCells: 8,
			Ao: false,
		} );

		const again = host.Handle(
			{ Type: "mesh", Job: 9, Key: "0,0,0", Coord: [ 0, 0, 0 ] },
		)!;

		expect( again.Message.Version ).toBe( 5 );
		expect( again.Message.Mesh.Indices )
			.toEqual( reply.Message.Mesh.Indices );
		// a second init replaces the first
		host.Handle(
			{
				Type: "init",
				Base: null,
				Edits: null,
				Version: 0,
				CellSize: 0.25,
				ChunkCells: 8,
				Ao: false,
			},
		);
		expect(
			host.Handle(
				{ Type: "mesh", Job: 8, Key: "0,0,0", Coord: [ 0, 0, 0 ] },
			)!
				.Message.Mesh.Indices.length,
		).toBe( 0 );
	} );

	it( "is wired to the worker's port", async () => {
		const posted: unknown[] = [];
		const port: {
			onmessage: ( ( event: { data: ToMeshWorker; } ) => void ) | null;
			postMessage: ( message: unknown ) => void;
		} = {
			onmessage: null,
			postMessage: ( message ) => posted.push( message ),
		};

		vi.stubGlobal( "self", port );
		await import( "../Source/Workers/MeshWorker" );
		port.onmessage!(
			{
				data: {
					Type: "init",
					Base: null,
					Edits: null,
					Version: 0,
					CellSize: 0.5,
					ChunkCells: 4,
					Ao: false,
				},
			},
		);
		expect( posted ).toEqual( [] );
		port.onmessage!(
			{
				data: {
					Type: "mesh",
					Job: 1,
					Key: "0,0,0",
					Coord: [ 0, 0, 0 ],
				},
			},
		);
		expect( posted ).toHaveLength( 1 );
	} );
} );
