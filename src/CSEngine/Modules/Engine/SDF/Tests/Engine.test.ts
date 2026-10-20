// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import {
	DYNAMIC_EDIT_FLOATS,
	EditList,
	SdfBakedLayer,
	SdfClient,
	SdfSparseLayer,
	SdfDynamicFlags,
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
import type { SdfVolumeData } from "../Source/Render/SdfVolumeTexture";
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
	VolumeTexels: 16,
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
	pool: { Workers?: number; PoolMs?: number; } = { Workers: 2 },
	ack = true,
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
		ToPhysics: ( message ) => {
			physics.push( message );
			// the physics takes the chunks in (what paces moving edits')
			if ( ack && message.Type === "chunks" ) {
				queueMicrotask( () => host.HandlePhysics(
					{ Type: "taken", Epoch: message.Epoch },
				) );
			}
		},
	}, { Spawn: () => new FakeWorker(), Fetch: fetch, PoolMs: 0, ...pool } );
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

function Same( a: Float32Array, b: Float32Array | undefined ): boolean {
	return b !== undefined
		&& a.length === b.length
		&& a.every( ( v, i ) => v === b[i] );
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

	it( "sticks a splat as an edit of the world", () => {
		const client = new SdfClient( () => undefined );

		client.Load( Scene );

		const splat = client.Splat(
			{ Position: [ 0, 1, 0 ], Radius: 0.3, MaterialId: 2 },
		);

		expect( splat.Shape ).toBe( SdfShape.Ellipsoid );
		expect( client.Edits.Count ).toBe( 1 );
		expect( client.Edits.Get( splat.Id )!.MaterialId ).toBe( 2 );
	} );

	it( "keeps the dynamic edits apart, for the renderer only", () => {
		const posted: ToSdfWorker[] = [];
		const client = new SdfClient( ( message ) => posted.push( message ) );

		client.Load( Scene );
		expect( client.TakeDynamic() ).toBeNull();

		const hole = client.AddDynamic( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.SmoothSubtract,
			Params: [ 1, 0, 0, 0 ],
		} );

		expect( client.UpdateDynamic( hole.Id, { Position: [ 1, 2, 3 ] } ) )
			.toBe( true );
		client.Tick( [ 0, 0, 0 ] );

		const tick = posted.at( -1 ) as Extract<ToSdfWorker, { Type: "tick"; }>;

		// nothing of it goes to the SDF worker
		expect( new Uint32Array( tick.Delta, 0, 1 )[0] ).toBe( 0 );
		expect( client.Edits.Count ).toBe( 0 );

		const packed = client.TakeDynamic()!;

		expect( packed ).toHaveLength( DYNAMIC_EDIT_FLOATS );
		expect( [ ...packed.slice( 0, 3 ) ] ).toEqual( [ 1, 2, 3 ] );
		// only when it changed again
		expect( client.TakeDynamic() ).toBeNull();
		expect( client.RemoveDynamic( hole.Id ) ).toBe( true );
		expect( client.TakeDynamic() ).toHaveLength( 0 );
		client.AddDynamic( { Shape: SdfShape.Box } );
		// a new scene drops them
		client.Load( null );
		expect( client.Dynamic.Count ).toBe( 0 );
		expect( client.TakeDynamic() ).toHaveLength( 0 );
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
			expect( wired.render[0] ).toEqual(
				{ Type: "begin", Epoch: 1, Settings: { Shadows: true } },
			);
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

	it(
		"samples the base into a volume for the renderer, again after edits",
		async () => {
			const wired = Wire();

			wired.client.Load( Scene );
			await Settle();

			const volumes = (): Array<Extract<
				SdfToRender,
				{ Type: "volume"; }
			>> => wired.render.filter( ( message ) => (
				message.Type === "volume"
			) ) as Array<Extract<SdfToRender, { Type: "volume"; }>>;
			const first = volumes()[0]!;

			const [ nx, ny, nz ] = first.Volume.Resolution;

			// the base's box (8 m across, its bricks' cells) at 16 texels
			// along its longest side
			expect( first.Epoch ).toBe( 1 );
			expect( Math.max( nx, ny, nz ) ).toBe( 16 );
			expect( first.Volume.Spacing ).toBeCloseTo( 0.5, 1 );
			expect( first.Volume.Data ).toHaveLength( nx * ny * nz * 4 );
			expect( first.Volume.First ).toBeUndefined();

			// an edit changes it: sent again; a dynamic edit never does
			wired.client.AddDynamic( { Shape: SdfShape.Sphere } );
			wired.client.Tick( [ 0, 0, 0 ] );
			await Settle();
			expect( volumes() ).toHaveLength( 1 );
			wired.client.Add( {
				Shape: SdfShape.Sphere,
				Op: SdfOp.Subtract,
				Position: [ 0, 0, 0 ],
				Params: [ 1.5, 0, 0, 0 ],
			} );
			wired.client.Tick( [ 0, 0, 0 ] );
			await Settle();
			expect( volumes() ).toHaveLength( 2 );

			// only the slices the edit changed (here all of them: it reaches
			// past the box), from the first of them
			const second = volumes()[1]!.Volume;
			const slice = nx * ny * 4;
			const from = ( second.First ?? 0 ) * slice;

			expect( second.Data.length % slice ).toBe( 0 );
			expect( second.Data ).not.toEqual(
				first.Volume.Data.slice( from, from + second.Data.length ),
			);
		},
	);

	it( "tells the renderer the scene's grass", async () => {
		const wired = Wire();
		const grass = {
			Bounds: [ -1, -1, 1, 1 ] as [ number, number, number, number ],
		};

		wired.client.Load( { ...Scene, Grass: grass } );
		await Settle();
		expect( wired.render[0] ).toEqual(
			{
				Type: "begin",
				Epoch: 1,
				Settings: { Shadows: true, Grass: grass },
			},
		);
	} );

	it(
		"remeshes nothing for an intersection the physics feels (it reaches "
			+ "everywhere)",
		async () => {
			const wired = Wire();

			wired.client.Load( Scene );
			await Settle();
			await Mesh( wired );
			wired.physics.length = 0;
			wired.client.AddDynamic( {
				Shape: SdfShape.Sphere,
				Op: SdfOp.Intersect,
				Params: [ 50, 0, 0, 0 ],
				Flags: SdfDynamicFlags.Physics,
			} );
			wired.client.Tick( [ 1, 1, 1 ] );
			await Settle();
			expect( Keys( wired.physics ) ).toEqual( new Set() );
		},
	);

	it( "samples no volume and no shadows when the scene says so", async () => {
		const wired = Wire();

		wired.client.Load( { ...Scene, VolumeTexels: 0, Shadows: false } );
		await Settle();
		expect( wired.render ).toEqual(
			[ { Type: "begin", Epoch: 1, Settings: { Shadows: false } } ],
		);
	} );

	it(
		"loads an analytic base without bounds, its volume where asked",
		async () => {
			const wired = Wire();
			const analytic: SdfSceneDescriptor = {
				...Scene,
				Base: { Analytic: { Kind: "Ground", Height: 0 } },
				Start: [ 40, 0, 0 ],
			};

			wired.client.Load( analytic );
			await Settle();
			expect( wired.host.World!.Base ).toBeInstanceOf( SdfSparseLayer );
			expect( ( wired.host.World!.Base as SdfSparseLayer ).Spacing )
				.toBe( 0.1 );

			// the volume: 64 m round the start
			const Volume = (): SdfVolumeData => {
				const volumes = wired.render.filter(
					( m ) => m.Type === "volume",
				);

				return ( volumes[volumes.length - 1] as Extract<
					SdfToRender,
					{ Type: "volume"; }
				> ).Volume;
			};

			expect( Volume().Min ).toEqual( [ 8, -32, -32 ] );

			// asked for a box and a spacing: those
			wired.client.Load( {
				...analytic,
				Base: { Analytic: { Kind: "Ground" }, Spacing: 0.2 },
				VolumeBounds: [ -2, -2, -2, 2, 2, 2 ],
			} );
			await Settle();
			expect( ( wired.host.World!.Base as SdfSparseLayer ).Spacing )
				.toBe( 0.2 );
			expect( Volume().Min ).toEqual( [ -2, -2, -2 ] );

			// no start: round the origin
			const origin: SdfSceneDescriptor = { ...analytic };

			delete origin.Start;
			wired.client.Load( origin );
			await Settle();
			expect( Volume().Min ).toEqual( [ -32, -32, -32 ] );
		},
	);

	it(
		"starts on the surface when asked, and finds places to stand",
		async () => {
			const wired = Wire();

			// the scene's ground at 0: from a meter up, the floor under it
			wired.client.Load(
				{ ...Scene, Start: [ 2.5, 1, -2.5 ], StartOnSurface: true },
			);
			await Settle();
			expect( wired.client.Loaded ).toBe( true );
			expect( wired.client.Start![1] ).toBeCloseTo( 0, 2 );

			const place = await wired.client.FindStandingPlace(
				[ -2.5, 1.5, 2.5 ],
				{ Radius: 1 },
			);

			expect( place!.Position[1] ).toBeCloseTo( 0, 2 );
			expect( place!.Normal[1] ).toBeGreaterThan( 0.99 );

			// options given; none found: no start of its own
			wired.client.Load( {
				...Scene,
				Start: [ 0, 1, 0 ],
				StartOnSurface: { Radius: 0.5, Height: 50 },
			} );
			await Settle();
			expect( wired.client.Start ).toBeNull();
			wired.client.Load( Scene );
			await Settle();
			expect( wired.client.Start ).toBeNull();
			// no start given: from the origin
			wired.client.Load( { ...Scene, StartOnSurface: true } );
			await Settle();
			expect( wired.client.Start![1] ).toBeCloseTo( 0, 2 );
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

	it(
		"meshes the chunks a physics-felt dynamic edit reaches for the physics "
			+ "alone",
		async () => {
			const wired = Wire();

			wired.client.Load( Scene );
			await Settle();
			await Mesh( wired );

			const own = new Map<string, Float32Array>();

			for ( const message of wired.physics ) {
				if ( message.Type === "chunks" ) {
					message.Built.forEach(
						( chunk ) => own.set( chunk.Key, chunk.Positions ),
					);
				}
			}
			wired.physics.length = 0;
			wired.render.length = 0;

			// one the renderer alone draws: nothing for the physics
			wired.client.AddDynamic(
				{ Shape: SdfShape.Sphere, Position: [ 3, 1, 3 ] },
			);
			wired.client.Tick( [ 1, 1, 1 ] );
			await Settle();
			expect( ( wired.posted.at( -1 ) as { Dynamic: unknown; } ).Dynamic )
				.toBeNull();
			expect( wired.physics ).toEqual( [] );

			// a hole through the ball the physics feels: its chunks meshed with
			// it, sent to the physics, never to the renderer
			const hole = wired.client.AddDynamic( {
				Shape: SdfShape.Sphere,
				Op: SdfOp.Subtract,
				Position: [ 0, 1, 0 ],
				Params: [ 0.7, 0, 0, 0 ],
				Flags: SdfDynamicFlags.Physics,
			} );

			wired.client.Tick( [ 1, 1, 1 ] );
			await Settle();
			wired.client.Tick( [ 1, 1, 1 ] );
			await Settle();

			const holed = Keys( wired.physics );

			expect( holed.size ).toBeGreaterThan( 0 );
			expect( Keys( wired.render ) ).toEqual( new Set() );
			// the ones it cuts are new (those it only nears may come out the
			// same)
			const changed = wired.physics.flatMap(
				( message ) => message.Type === "chunks"
					? message.Built.filter(
						( chunk ) => !Same(
							chunk.Positions,
							own.get( chunk.Key ),
						),
					)
					: [],
			);

			expect( changed.length ).toBeGreaterThan( 0 );

			// a real edit in a holed chunk: meshed for the renderer, while the
			// physics keeps its holed mesh (meshed again with the hole)
			wired.physics.length = 0;
			wired.client.Add( {
				Shape: SdfShape.Sphere,
				Position: [ 0.2, 1.8, 0 ],
				Params: [ 0.3, 0, 0, 0 ],
			} );
			for ( let i = 0; i < 4; i++ ) {
				wired.client.Tick( [ 1, 1, 1 ] );
				await Settle();
			}
			// (the physics' meshes are made again at most DynamicPhysicsHz)
			for ( let i = 0; i < 3; i++ ) {
				await new Promise( ( resolve ) => setTimeout( resolve, 60 ) );
				wired.client.Tick( [ 1, 1, 1 ] );
				await Settle();
			}

			const drawn = new Map<string, Float32Array>();

			for ( const message of wired.render ) {
				if ( message.Type === "chunks" ) {
					message.Built.forEach(
						( chunk ) => drawn.set(
							chunk.Key,
							chunk.Mesh.Positions,
						),
					);
				}
			}
			expect( drawn.size ).toBeGreaterThan( 0 );

			const again = wired.physics.flatMap(
				( message ) => message.Type === "chunks"
					? message.Built.filter(
						( chunk ) => holed.has( chunk.Key )
							&& drawn.has( chunk.Key ),
					)
					: [],
			);

			// the holed ones differ from what is drawn
			expect(
				again.some(
					( chunk ) => !Same(
						chunk.Positions,
						drawn.get( chunk.Key ),
					),
				),
			)
				.toBe( true );

			// gone: the chunks get their own meshes back
			wired.physics.length = 0;
			wired.client.RemoveDynamic( hole.Id );
			await new Promise( ( resolve ) => setTimeout( resolve, 60 ) );
			wired.client.Tick( [ 1, 1, 1 ] );
			await Settle();
			const back = Keys( wired.physics );

			expect( [ ...holed ].every( ( key ) => back.has( key ) ) )
				.toBe( true );
			// and when it stays gone, nothing more is sent
			wired.client.Tick( [ 1, 1, 1 ] );
			expect( ( wired.posted.at( -1 ) as { Dynamic: unknown; } ).Dynamic )
				.toBeNull();
		},
	);

	it(
		"moves the physics' chunks with the edit, as fast as the physics takes "
			+ "them",
		async () => {
			const wired = Wire( undefined, undefined, false );

			wired.client.Load( Scene );
			await Settle();
			await Mesh( wired );

			const blob = wired.client.AddDynamic( {
				Shape: SdfShape.Sphere,
				Position: [ 1, 1, 1 ],
				Params: [ 0.4, 0, 0, 0 ],
				Flags: SdfDynamicFlags.Physics,
			} );

			// the physics hasn't taken what it was sent: nothing new for it
			wired.physics.length = 0;
			wired.client.Tick( [ 1, 1, 1 ] );
			await Settle();
			expect( wired.physics ).toEqual( [] );

			// it took them (a stale scene's word changes nothing)
			const sent = wired.posted.length;

			wired.host.HandlePhysics( { Type: "taken", Epoch: 99 } );
			for ( let i = 0; i < 200; i++ ) {
				wired.host.HandlePhysics( { Type: "taken", Epoch: 1 } );
			}
			wired.client.UpdateDynamic( blob.Id, { Position: [ 1.2, 1, 1 ] } );
			wired.client.Tick( [ 1, 1, 1 ] );
			await Settle();
			wired.client.Tick( [ 1, 1, 1 ] );
			await Settle();
			expect( wired.posted.length ).toBeGreaterThan( sent );
			expect( Keys( wired.physics ).size ).toBeGreaterThan( 0 );

			// moved far: the chunks it left get their own meshes back, those
			// it reaches now are meshed with it (none meshed yet: removed)
			wired.physics.length = 0;
			for ( let i = 0; i < 200; i++ ) {
				wired.host.HandlePhysics( { Type: "taken", Epoch: 1 } );
			}
			wired.client.UpdateDynamic( blob.Id, { Position: [ 30, 1, 30 ] } );
			await new Promise( ( resolve ) => setTimeout( resolve, 60 ) );
			wired.client.Tick( [ 1, 1, 1 ] );
			await Settle();

			const left = wired.physics.find(
				( message ) => message.Type === "chunks",
			);

			expect( left ).toBeDefined();

			// and back: the far chunks (never meshed for the renderer) removed
			wired.physics.length = 0;
			for ( let i = 0; i < 200; i++ ) {
				wired.host.HandlePhysics( { Type: "taken", Epoch: 1 } );
			}
			wired.client.UpdateDynamic( blob.Id, { Position: [ 1, 1, 1 ] } );
			// (the far meshes come back first, and must be taken)
			for ( let round = 0; round < 3; round++ ) {
				await new Promise( ( resolve ) => setTimeout( resolve, 60 ) );
				wired.client.Tick( [ 1, 1, 1 ] );
				await Settle();
				for ( let i = 0; i < 200; i++ ) {
					wired.host.HandlePhysics( { Type: "taken", Epoch: 1 } );
				}
			}
			expect( wired.physics.some( ( message ) => message.Type === "chunks"
			&& message.Removed.some( ( key ) => /^1[45],/.test( key ) ) ) )
				.toBe( true );
		},
	);

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

	it( "gives the physics only the near levels, without skirts", async () => {
		const wired = Wire();

		wired.client.Load(
			{ ...Scene, Levels: 2, PhysicsLevels: 1, Radius: 1 },
		);
		await Settle();
		await Mesh( wired );

		const drawn = Keys( wired.render );
		const felt = Keys( wired.physics );

		// the renderer has the far, coarse chunks too
		expect( [ ...drawn ].some( ( key ) => key.startsWith( "1:" ) ) )
			.toBe( true );
		expect( [ ...felt ].every( ( key ) => !key.startsWith( "1:" ) ) )
			.toBe( true );
		expect( felt.size ).toBeGreaterThan( 0 );

		// the same chunk: skirts on screen, none in the physics
		const key = [ ...felt ].find( ( k ) => wired.render.some(
			( m ) => m.Type === "chunks" && m.Built.some(
				( c ) => c.Key === k && c.Mesh.Indices.length > 0,
			),
		) )!;
		const Of = <T>(
			messages: Array<{ Type: string; Built?: T[]; }>,
			pick: ( chunk: T ) => boolean,
		): T => messages
			.flatMap( ( m ) => m.Built ?? [] ).find( pick )!;
		const shown = Of(
			wired.render as Array<
				{
					Type: string;
					Built?: Array<
						{ Key: string; Mesh: { Indices: Uint16Array; }; }
					>;
				}
			>,
			( c ) => c.Key === key,
		);
		const solid = Of(
			wired.physics as Array<
				{
					Type: string;
					Built?: Array<{ Key: string; Indices: Uint16Array; }>;
				}
			>,
			( c ) => c.Key === key,
		);

		expect( solid.Indices.length ).toBeGreaterThan( 0 );
		expect( solid.Indices.length )
			.toBeLessThan( shown.Mesh.Indices.length );

		// a moving edit out over the coarse chunks: nothing for the physics
		wired.physics.length = 0;
		wired.client.AddDynamic( {
			Shape: SdfShape.Sphere,
			Op: SdfOp.Subtract,
			Position: [ 7, 0, 7 ],
			Params: [ 0.5, 0, 0, 0 ],
			Flags: SdfDynamicFlags.Physics,
		} );
		wired.client.Tick( [ 1, 1, 1 ] );
		await Settle();
		expect( Keys( wired.physics ) ).toEqual( new Set() );
	} );

	it( "sees to the pool at most every PoolMs, edits always", async () => {
		const wired = Wire(
			undefined,
			{ Workers: 2, PoolMs: undefined } as { Workers: number; },
		);

		wired.client.Load( Scene );
		await Settle();
		// the first tick meshes; the next ones within the default 4 ms (the
		// clock stands still) only bring their edits
		const clock = vi.spyOn( performance, "now" ).mockReturnValue( 1000 );

		wired.client.Tick( [ 1, 1, 1 ] );
		await Settle();

		const after = wired.render.length;

		wired.client.Add( { Shape: SdfShape.Sphere, Position: [ 1, 1, 1 ] } );
		for ( let i = 0; i < 5; i++ ) {
			wired.client.Tick( [ 1, 1, 1 ] );
			await Settle();
		}
		expect( wired.render.length ).toBe( after );
		expect( wired.client.Meshed ).toBe( false );
		clock.mockRestore();
		// the edit is in the world all the same
		expect( ( await wired.client.Distance( [ 1, 1, 1 ] ) )!.Distance )
			.toBeLessThan( 0 );
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
		expect( wired.render ).toEqual(
			[ { Type: "begin", Epoch: 1, Settings: null } ],
		);
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
			expect( ( slow.host.World!.Base as SdfBakedLayer ).Size )
				.toEqual( [ 10, 8, 10 ] );
			expect( slow.client.Epoch ).toBe( 2 );
		},
	);
} );
