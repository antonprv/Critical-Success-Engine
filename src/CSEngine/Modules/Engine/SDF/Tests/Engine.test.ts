// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import {
	EditList,
	SdfBakedLayer,
	SdfClient,
	SdfEditFlags,
	SdfField,
	SdfOp,
	SdfShape,
	SdfWorkerHost,
	CreateAabb,
	GroundPlane,
	type FromSdfWorker,
	type SdfBakeSource,
	type SdfSceneDescriptor,
	type SdfToPhysics,
	type SdfToRender,
	type ToSdfWorker,
} from "../Source/Index";
import { FakeWorker } from "./FakeWorker";

const Bake: SdfBakeSource = {
	Edits: [
		{
			Shape: SdfShape.Sphere,
			Position: [ 0, 1, 0 ],
			Params: [ 1, 0, 0, 0 ],
		},
	],
	Ground: 0,
	Bounds: [ -4, -2, -4, 4, 4, 4 ],
	Spacing: 0.1,
};

const Scene: SdfSceneDescriptor = {
	Base: { Bake },
	MaxEdits: 2,
	CellSize: 0.25,
	ChunkCells: 8,
	Radius: 1,
	Layer: 4,
	Mask: 6,
};

/** Lets the async work (fetches, queued replies) run. */
async function Settle(): Promise<void> {
	for ( let i = 0; i < 5; i++ ) {
		await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
	}
}

/** GameLogic's client wired to an SDF worker's host, as the ports do. */
function Wire(
	fetch = vi.fn( async ( _url: string ) => new ArrayBuffer( 0 ) ),
	pool: { Workers?: number; } = { Workers: 2 },
) {
	const render: SdfToRender[] = [];
	const physics: SdfToPhysics[] = [];
	const gameLogic: FromSdfWorker[] = [];
	let client: SdfClient | null = null;
	const host = new SdfWorkerHost( {
		ToGameLogic: ( message ) => {
			gameLogic.push( message );
			queueMicrotask(
				() => client!.Handle( structuredClone( message ) ),
			);
		},
		ToRender: ( message ) => render.push( message ),
		ToPhysics: ( message ) => physics.push( message ),
	}, { Spawn: () => new FakeWorker(), Fetch: fetch, ...pool } );
	const posted: ToSdfWorker[] = [];

	client = new SdfClient( ( message ) => {
		posted.push( message );
		void host.HandleGameLogic( structuredClone( message ) );
	} );
	return { host, client, render, physics, gameLogic, posted, fetch };
}

/** Ticks until the render worker has had chunks for the whole area. */
async function Mesh( wired: ReturnType<typeof Wire> ): Promise<void> {
	for ( let i = 0; i < 50; i++ ) {
		wired.client.Tick( [ 1, 1, 1 ] );
		await Settle();
	}
}

function Keys( messages: Array<SdfToRender | SdfToPhysics> ): Set<string> {
	const keys = new Set<string>();

	for ( const message of messages ) {
		if ( message.Type === "chunks" ) {
			message.Built.forEach( ( chunk ) => keys.add( chunk.Key ) );
		}
	}
	return keys;
}

describe( "SdfClient", () => {
	it( "keeps only the recent edits and hands out ids at once", () => {
		const posted: ToSdfWorker[] = [];
		const client = new SdfClient( ( message ) => posted.push( message ) );

		client.Load( Scene );

		const kept = client.Add(
			{ Shape: SdfShape.Sphere, Flags: SdfEditFlags.Keep },
		);

		for ( let i = 0; i < 5; i++ ) {
			client.Add(
				{
					Shape: SdfShape.Sphere,
					Op: SdfOp.Subtract,
					Position: [ i, 0, 0 ],
				},
			);
		}
		expect( client.Edits.Count ).toBe( 2 );
		expect( client.Edits.Get( kept.Id ) ).toBe( kept );
		expect( client.Update( kept.Id, { Scale: 2 } ) ).toBe( true );
		expect( client.Remove( kept.Id ) ).toBe( true );

		client.Tick( [ 1, 2, 3 ] );

		const tick = posted.at( -1 ) as Extract<ToSdfWorker, { Type: "tick"; }>;

		expect( tick.Focus ).toEqual( [ 1, 2, 3 ] );
		// adds, folds, the update and the removal, last change per edit
		expect( new Uint32Array( tick.Delta, 0, 1 )[0] ).toBe( 6 );
	} );

	it( "answers its questions when a new scene comes", async () => {
		const posted: ToSdfWorker[] = [];
		const client = new SdfClient( ( message ) => posted.push( message ) );

		client.Load( null );
		expect( client.MaxEdits ).toBe( 32 );

		const pending = client.Raycast( [ 0, 0, 0 ], [ 1, 0, 0 ], 10 );

		client.Load( Scene );
		expect( await pending ).toBeNull();
		expect( client.Epoch ).toBe( 2 );
		// a late answer to the forgotten question: ignored
		client.Handle( { Type: "result", Id: 1, Result: null } );
		// "loaded" of an older scene: ignored
		client.Handle( { Type: "loaded", Epoch: 1, Error: null } );
		expect( client.Loaded ).toBe( false );
		client.Handle( { Type: "loaded", Epoch: 2, Error: "broken" } );
		expect( client.Loaded ).toBe( false );
		expect( client.LoadError ).toBe( "broken" );
	} );

	it( "tells when the first area is meshed", async () => {
		const client = new SdfClient( () => undefined );

		client.Load( null );
		expect( client.Meshed ).toBe( true );
		await client.WhenMeshed();

		client.Load( Scene );

		const meshed = vi.fn();

		void client.WhenMeshed().then( meshed );
		// an older scene's area: ignored
		client.Handle( { Type: "meshed", Epoch: 1 } );
		await Settle();
		expect( meshed ).not.toHaveBeenCalled();
		client.Handle( { Type: "meshed", Epoch: 2 } );
		await Settle();
		expect( meshed ).toHaveBeenCalledOnce();

		// a scene that fails to load won't be meshed: don't wait for it
		client.Load( Scene );

		const failed = client.WhenMeshed();

		client.Handle( { Type: "loaded", Epoch: 3, Error: "broken" } );
		await failed;
		expect( client.Meshed ).toBe( true );
	} );
} );

describe( "SdfWorkerHost", () => {
	it(
		"loads a scene and sends its chunks to the render and physics workers",
		async () => {
			const wired = Wire();

			wired.client.Load( Scene );
			await Settle();
			expect( wired.client.Loaded ).toBe( true );
			expect( wired.render[0] ).toEqual( { Type: "begin", Epoch: 1 } );
			expect( wired.physics[0] )
				.toEqual( { Type: "begin", Epoch: 1, Layer: 4, Mask: 6 } );

			await Mesh( wired );

			const keys = Keys( wired.render );

			// the ground crosses the area: some chunks have triangles
			expect( keys.size ).toBe( 27 );
			expect( Keys( wired.physics ) ).toEqual( keys );

			const chunk = wired.render.flatMap( ( message ) => (
				message.Type === "chunks" ? message.Built : []
			) ).find( ( built ) => built.Mesh.Indices.length > 0 )!;

			expect( chunk.Mesh.Normals.length )
				.toBe( chunk.Mesh.Positions.length );
			// the area is meshed: GameLogic is told once
			expect( wired.gameLogic.filter( ( message ) => (
				message.Type === "meshed"
			) ) ).toEqual( [ { Type: "meshed", Epoch: 1 } ] );
			expect( wired.client.Meshed ).toBe( true );
		},
	);

	it( "starts meshing at the scene's start point", async () => {
		const wired = Wire();

		wired.client.Load( { ...Scene, Start: [ 2, 1, -2 ] } );
		await Settle();
		for ( let i = 0; i < 50 && !wired.client.Meshed; i++ ) {
			wired.client.Tick( [ 2, 1, -2 ] );
			await Settle();
		}
		expect( wired.client.Meshed ).toBe( true );
		expect( Keys( wired.render ).size ).toBeGreaterThan( 0 );
	} );

	it(
		"folds the game's old edits into its base and answers questions",
		async () => {
			const wired = Wire();

			wired.client.Load( Scene );
			await Settle();
			for ( let i = 0; i < 4; i++ ) {
				wired.client.Add( {
					Shape: SdfShape.Sphere,
					Op: SdfOp.Subtract,
					Position: [ -2 + i, 0, 2 ],
					Params: [ 0.4, 0, 0, 0 ],
				} );
			}
			wired.client.Tick( [ 0, 0, 0 ] );
			await Settle();

			const world = wired.host.World!;

			expect( world.Edits.Count ).toBe( 2 );
			expect( world.Edits.Edits ).toEqual( wired.client.Edits.Edits );

			// the first hole is in the base now, and still a hole
			const hit = await wired.client.Raycast(
				[ -2, 5, 2 ],
				[ 0, -1, 0 ],
				20,
			);

			expect( hit!.Position[1] ).toBeLessThan( -0.3 );

			const inside = await wired.client.Distance( [ 0, 1, 0 ] );

			// deep inside the ball (a cell without a brick: a bound, but
			// inside)
			expect( inside!.Distance ).toBeLessThan( 0 );
			expect( inside!.MaterialId ).toBe( 0 );
		},
	);

	it( "has defaults and drops the chunks the focus leaves", async () => {
		vi.stubGlobal( "navigator", { hardwareConcurrency: 2 } );

		const wired = Wire( undefined, {} );

		wired.client.Load( { Base: Scene.Base } );
		await Settle();
		wired.client.Tick( [ 0, 0, 0 ] );
		await Settle();
		wired.client.Tick( [ 100, 0, 0 ] );
		await Settle();

		const removed = wired.render.flatMap( ( message ) => (
			message.Type === "chunks" ? message.Removed : []
		) );

		// default radius 2: a 5^3 area
		expect( removed ).toHaveLength( 125 );
		vi.unstubAllGlobals();
	} );

	it( "sends a recreated physics world every chunk again", async () => {
		const wired = Wire();

		wired.host.HandlePhysics( { Type: "reset" } );
		expect( wired.physics ).toEqual( [] );
		wired.client.Load( Scene );
		await Settle();
		await Mesh( wired );

		const before = Keys( wired.physics );

		wired.physics.length = 0;
		wired.host.HandlePhysics( { Type: "reset" } );
		expect( Keys( wired.physics ) ).toEqual( before );
		expect( wired.physics[0]!.Type === "chunks" && wired.physics[0]!.Epoch )
			.toBe( 1 );
	} );

	it( "has no world without an SDF scene", async () => {
		const wired = Wire();

		wired.client.Load( null );
		await Settle();
		expect( wired.client.Loaded ).toBe( true );
		expect( wired.physics[0] )
			.toEqual( { Type: "begin", Epoch: 1, Layer: 1, Mask: -1 } );
		expect( await wired.client.Distance( [ 0, 0, 0 ] ) ).toBeNull();
		wired.client.Tick( [ 0, 0, 0 ] );
		await Settle();
		expect( wired.render ).toHaveLength( 1 );
	} );

	it(
		"loads a baked file, keeping the ticks that come meanwhile",
		async () => {
			const editor = new EditList();

			editor.Add( { Shape: SdfShape.Sphere, Params: [ 1, 0, 0, 0 ] } );

			const file = SdfBakedLayer.Bake(
				new SdfField( editor, new GroundPlane( -0.5 ) ),
				{ Bounds: CreateAabb( -2, -2, -2, 2, 2, 2 ), Spacing: 0.1 },
			).Serialize();
			let release: ( () => void ) | null = null;
			const wired = Wire(
				vi.fn(
					( _url: string ) => new Promise<ArrayBuffer>(
						( resolve ) => {
							release = () => resolve( file );
						},
					),
				),
			);

			wired.client.Load( { ...Scene, Base: { Url: "level.sdf" } } );
			wired.client.Add( { Shape: SdfShape.Box, Position: [ 0, 2, 0 ] } );
			wired.client.Tick( [ 0, 0, 0 ] );
			await Settle();
			expect( wired.fetch ).toHaveBeenCalledWith( "level.sdf" );
			expect( wired.host.World ).toBeNull();
			release!();
			await Settle();
			expect( wired.host.World!.Edits.Count ).toBe( 1 );
			expect( wired.client.Loaded ).toBe( true );
		},
	);

	it(
		"reports a base it can't read, and drops a load another one replaced",
		async () => {
			const failing = Wire( vi.fn( async () => {
				throw new Error( "HTTP 404" );
			} ) );

			failing.client.Load( { ...Scene, Base: { Url: "missing.sdf" } } );
			await Settle();
			expect( failing.client.LoadError ).toBe( "HTTP 404" );
			expect( failing.host.World ).toBeNull();

			const editor = new EditList();

			editor.Add( { Shape: SdfShape.Sphere } );

			const file = SdfBakedLayer.Bake(
				new SdfField( editor ),
				{ Bounds: CreateAabb( -1, -1, -1, 1, 1, 1 ), Spacing: 0.1 },
			).Serialize();
			let release: ( () => void ) | null = null;
			const slow = Wire(
				vi.fn(
					( _url: string ) => new Promise<ArrayBuffer>(
						( resolve ) => {
							release = () => resolve( file );
						},
					),
				),
			);

			slow.client.Load( { ...Scene, Base: { Url: "slow.sdf" } } );
			slow.client.Load(
				{
					...Scene,
					Base: {
						Bake: {
							...Bake,
							Ground: null,
						},
					},
				},
			);
			await Settle();
			release!();
			await Settle();
			// the second scene's world (ground), not the first one's late file
			expect( slow.host.World!.Base.Size ).toEqual( [ 10, 8, 10 ] );
			expect( slow.client.Epoch ).toBe( 2 );
		},
	);
} );
