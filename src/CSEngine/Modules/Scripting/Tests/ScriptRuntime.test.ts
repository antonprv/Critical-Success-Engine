// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { DataStream, Decode, Encode, MessagePackReader } from "@cse/datastream";
import { IArena } from "./Contracts/Arena.contract.ts";
import {
	Command, CommandWriter, Hook, LoadGzippedWasm, LoadScriptsWasm, ReadResults,
	ScriptRuntime,
	ScriptsWasmUrl, TransformStride,
	type ScriptBackend, type ScriptHostWorld,
} from "../Source/Index.ts";

const NoResults = Encode(
	{
		Transforms: new Uint8Array(),
		Stream: [],
		Toasts: [],
		Hud: {},
		Logs: [],
		Destroy: [],
		Errors: [],
	},
);

/** A backend that records the commands and answers with nothing. */
function Recorder(): ScriptBackend & { Batches: unknown[][]; } {
	const batches: unknown[][] = [];

	return {
		Names: ["A"],
		Batches: batches,
		Run: ( commands ) => {
			batches.push(
				new MessagePackReader( commands ).Read() as unknown[],
			);
			return NoResults;
		},
	};
}

const World = ( poses: boolean ): ScriptHostWorld => ( {
	ReadTransform: ( _entity, out, offset ) => {
		out.fill( 0.5, offset, offset + 7 );
		return poses;
	},
	WriteTransform: vi.fn(),
	DestroyEntity: vi.fn(),
	Toast: vi.fn(),
	SetHud: vi.fn(),
	Log: vi.fn(),
	ComponentFailed: vi.fn(),
} );

const Phase = { Elapsed: 2.5, FrameCount: 3, PhysicsStepCount: 4 };

describe( "ScriptRuntime", () => {
	it( "costs nothing without C# components or messages for C#", () => {
		const backend = Recorder();
		const scripts = new ScriptRuntime(
			backend,
			new DataStream(),
			World( true ),
		);
		scripts.RunHook( Hook.Update, 0.1, Phase );
		expect( backend.Batches ).toHaveLength( 0 );
		expect( scripts.Names ).toEqual( ["A"] );
	} );

	it(
		"sends one batch per phase: queued commands, time, input (input phase "
			+ "only), transforms, the hook",
		() => {
			const backend = Recorder();
			const scripts = new ScriptRuntime(
				backend,
				new DataStream(),
				World( true ),
			);
			// more entities than the pose buffer starts with
			const ids = Array.from(
				{ length: 20 },
				( _, entity ) => scripts.Create(
					entity,
					`E${ entity }`,
					"A",
					null,
				),
			);
			scripts.RunHook(
				Hook.Update,
				0.1,
				{
					...Phase,
					Input: {
						Down: [],
						JustPressed: [],
						Values: {},
						Move: [0, 0],
					},
				},
			);
			const kinds = backend.Batches[0]!.map(
				( command ) => ( command as number[] )[0],
			);
			expect( kinds.filter( ( kind ) => kind === Command.Create ) )
				.toHaveLength( 20 );
			// no input outside the input phase
			expect( kinds.slice( -3 ) )
				.toEqual( [Command.Time, Command.Transforms, Command.Hook] );
			const transforms = backend.Batches[0]!.at( -2 ) as [
				number,
				Uint8Array,
			];
			expect( transforms[1].byteLength ).toBe( 20 * TransformStride * 8 );

			scripts.RunHook(
				Hook.InputUpdate,
				0.1,
				{
					...Phase,
					Input: {
						Down: ["A"],
						JustPressed: [],
						Values: {},
						Move: [1, 0],
					},
				},
			);
			expect(
				backend.Batches[1]!.map(
					( command ) => ( command as number[] )[0],
				),
			).toContain( Command.Input );

			// the input as a function: asked only when there is something to
			// send it to
			const take = vi.fn( () => ( {
				Down: [], JustPressed: [], Values: {},
				Move: [0, 0] as [number, number],
			} ) );
			scripts.RunHook( Hook.InputUpdate, 0.1, { ...Phase, Input: take } );
			expect( take ).toHaveBeenCalledTimes( 1 );
			expect(
				backend.Batches[2]!.map(
					( command ) => ( command as number[] )[0],
				),
			).toContain( Command.Input );

			// two components on one entity: the entity stays tracked until both
			// are gone
			const second = scripts.Create( 0, "E0", "A", null );
			scripts.Destroy( ids[0]!, 0 );
			expect( scripts.Count ).toBe( 20 );
			scripts.Destroy( second, 0 );
			expect( scripts.Count ).toBe( 19 );
		},
	);

	it( "names a failing component by its class and entity", () => {
		const world = World( true );
		const errors = Encode(
			{
				Transforms: new Uint8Array(),
				Stream: [],
				Toasts: [],
				Hud: {},
				Logs: [],
				Destroy: [],
				Errors: [[1, "boom"], [99, "?"]],
			},
		);
		const scripts = new ScriptRuntime(
			{ Names: [], Run: () => errors },
			new DataStream(),
			world,
		);
		scripts.Create( 5, "Door", "Hinge", null );
		scripts.RunHook( Hook.Update, 0.1, Phase );
		expect( world.ComponentFailed )
			.toHaveBeenCalledWith( "Hinge on \"Door\"", "boom" );
		expect( world.ComponentFailed ).toHaveBeenCalledWith( "#99", "?" );
	} );

	it(
		"the bridge: a call into C# sends the queued commands first, but not "
			+ "while C# runs; a backend without Call can't take calls",
		() => {
			const backend = Recorder();
			let serve: ( ( request: Uint8Array ) => Uint8Array ) | null = null;
			let nested = -1;
			const bridged: ScriptBackend = {
				...backend,
				Run: ( commands ) => {
					const results = backend.Run( commands );

					// in the second phase, C# calls TypeScript (which calls C#
					// back)
					if ( backend.Batches.length === 2 ) {
						expect(
							Decode(
								serve!(
									Encode( ["Sample.IArena", -1, 1, []] ),
								),
							),
						).toEqual( [true, 0] );
					}
					return results;
				},
				Call: () => Encode( [true, backend.Batches.length] ),
				Serve: ( handler ) => {
					serve = handler;
				},
			};
			const scripts = new ScriptRuntime(
				bridged,
				new DataStream(),
				World( true ),
			);
			scripts.Bridge.Resolver = () => ( {
				Total: () => {
				// queued while C# runs: it waits for the next phase
					scripts.Create( 3, "Late", "A", null );
					nested = scripts.Bridge.CSharp( IArena ).Total();
					return 0;
				},
			} );
			scripts.Create( 1, "Abacus", "A", null );
			// the queued Create is sent before the call
			expect( scripts.Bridge.CSharp( IArena ).Total() ).toBe( 1 );
			expect( scripts.Bridge.CSharp( IArena ).Total() ).toBe( 1 );
			scripts.RunHook( Hook.Update, 0.1, Phase );
			expect( [nested, backend.Batches.length] ).toEqual( [2, 2] );
			scripts.RunHook( Hook.Update, 0.1, Phase );
			expect( backend.Batches ).toHaveLength( 3 );

			const lone = new ScriptRuntime(
				{ Names: [], Run: () => NoResults },
				new DataStream(),
				World( true ),
			);
			expect( () => lone.Bridge.CSharp( IArena ).Total() )
				.toThrow( "This C# runtime can't take calls (no bridge)" );
		},
	);

	it( "entities without a transform (gone) are left out", () => {
		const backend = Recorder();
		const scripts = new ScriptRuntime(
			backend,
			new DataStream(),
			World( false ),
		);
		scripts.Create( 1, "Gone", "A", null );
		scripts.RunHook( Hook.Update, 0.1, Phase );
		expect(
			backend.Batches[0]!.map(
				( command ) => ( command as number[] )[0],
			),
		).not.toContain( Command.Transforms );
	} );

	it(
		"the command writer and the results reader agree with the C# side's "
			+ "format",
		() => {
			const writer = new CommandWriter().Destroy( 3 )
				.Hook( Hook.PhysicsUpdate, 0.5 );
			expect( Buffer.from( writer.Take() ).toString( "hex" ) )
				.toBe( "92920503" + "930203cb3fe0000000000000" );
			expect( writer.Count ).toBe( 0 );
			const results = ReadResults( NoResults );
			expect( results.Transforms ).toHaveLength( 0 );
		},
	);
} );

describe( "LoadScriptsWasm", () => {
	// what the runtime registered for C# to import ("cse-bridge")
	type Imports = {
		Call( request: Uint8Array ): Uint8Array;
		CallSlot( depth: number, length: number ): number;
		TakeOverflow(): Uint8Array;
	};
	const imports = new Map<string, Imports>();
	// the WebAssembly heap: one-byte slots at 0 (incoming) and 1 (outgoing)
	const heap = new Uint8Array( 8 );
	const Exports = (
		start: () => string,
		run: () => Uint8Array,
		call: ( request: Uint8Array ) => Uint8Array = ( r ) => r,
	) => ( {
		create: async () => ( {
			getConfig: () => ( { mainAssemblyName: "MyGame" } ),
			localHeapViewU8: () => heap,
			setModuleImports: (
				name: string,
				given: Imports,
			) => {
				imports.set( name, given );
			},
			getAssemblyExports: async () => ( {
				CSEngine: {
					Browser: {
						ScriptExports: {
							Start: start, Run: run, Call: call,
							SlotsAddress: () => 0, SlotSize: () => 1,
							SlotDepths: () => 1,
							// C# answers a one-byte request with it doubled
							CallSlot: () => {
								heap[0] = heap[0]! * 2;
								return 1;
							},
							TakeOverflow: () => new Uint8Array(),
						},
					},
				},
			} ),
		} ),
	} );

	it(
		"boots dotnet.js with the gzip loader, starts the host on the game's "
			+ "assembly, and lists its components",
		async () => {
			const run = vi.fn( () => NoResults );
			const start = vi.fn( () => "" );
			let loader: ( (
				type: string,
				name: string,
				uri: string,
			) => unknown )
				| null = null;
			const load = vi.fn( async () => ( {
				dotnet: {
					withResourceLoader: ( given: typeof loader ) => {
						loader = given;
						return Exports( start, run );
					},
				},
			} ) );
			const backend = await LoadScriptsWasm( undefined, load );
			expect( load ).toHaveBeenCalledWith( ScriptsWasmUrl );
			expect( start ).toHaveBeenCalledWith( "MyGame" );
			expect( backend.Names ).toEqual( [] );
			backend.Run( new Uint8Array( 1 ) );
			expect( run ).toHaveBeenCalled();
			// .wasm files go through the gzip loader, the rest load as they are
			expect( loader!( "js", "dotnet.js", "/f/dotnet.js" ) )
				.toBeUndefined();
			const fetched = vi.spyOn( globalThis, "fetch" )
				.mockImplementation(
					async () => new Response( null, { status: 404 } ),
				);
			const response = await loader!(
				"wasm",
				"a.wasm",
				"http://h/a.wasm",
			);
			expect( ( response as Response ).status ).toBe( 404 );
			expect( fetched ).toHaveBeenCalledWith( "http://h/a.wasm.gz" );
			fetched.mockRestore();
			await expect(
				LoadScriptsWasm(
					"data:text/javascript,export const dotnet = null",
				),
			).rejects.toThrow();
		},
	);

	it( "in Node (a file: URL) the runtime reads its own files", async () => {
		const start = vi.fn( () => "A,B" );
		const dotnet = {
			...Exports( start, () => NoResults ),
			withResourceLoader: vi.fn(),
		};
		const backend = await LoadScriptsWasm(
			"file:///b/dotnet.js",
			async () => ( { dotnet } ),
		);
		expect( dotnet.withResourceLoader ).not.toHaveBeenCalled();
		expect( backend.Names ).toEqual( ["A", "B"] );
	} );

	it(
		"connects the bridge: TypeScript's calls go to ScriptExports.Call, "
			+ "C#'s imports reach the handler given to Serve",
		async () => {
			const call = vi.fn(
				( request: Uint8Array ) => Uint8Array.of( request.length ),
			);
			const backend = await LoadScriptsWasm(
				"file:///b/dotnet.js",
				async () => ( {
					dotnet: Exports( () => "", () => NoResults, call ),
				} ),
			);
			expect( backend.Call!( Uint8Array.of( 1, 2 ) ) )
				.toEqual( Uint8Array.of( 2 ) );
			const bridge = imports.get( "cse-bridge" )!;
			expect( () => bridge.Call( Uint8Array.of() ) )
				.toThrow( "C# called TypeScript before the bridge was ready" );
			backend.Serve!(
				( request ) => Uint8Array.of( request.length * 10 ),
			);
			expect( bridge.Call( Uint8Array.of( 1, 2, 3 ) ) )
				.toEqual( Uint8Array.of( 30 ) );
			// through the shared slots: a request that fits one goes by the
			// heap; C#'s calls are read from (and answered in) its outgoing
			// slot
			expect( [...backend.Call!( Uint8Array.of( 21 ) )] ).toEqual( [42] );
			heap[1] = 7;
			expect( bridge.CallSlot( 0, 1 ) ).toBe( 1 );
			expect( heap[1] ).toBe( 10 );
			expect( bridge.TakeOverflow ).toBeTypeOf( "function" );
			expect( () => bridge.TakeOverflow() ).not.toThrow();
		},
	);
} );

describe( "LoadGzippedWasm", () => {
	const Gzip = async ( bytes: Uint8Array<ArrayBuffer> ) => new Uint8Array(
		await new Response(
			new Blob( [bytes] ).stream()
				.pipeThrough( new CompressionStream( "gzip" ) ),
		).arrayBuffer(),
	);

	it(
		"inflates the .gz, takes one the server already inflated, and falls "
			+ "back to the .wasm",
		async () => {
			const wasm = Uint8Array.of( 0, 0x61, 0x73, 0x6d, 1, 0, 0, 0 );
			const gz = await Gzip( wasm );
			const get = vi.fn(
				async ( url: string ) => new Response(
					url.includes( "inflated" ) ? wasm : gz,
				),
			) as unknown as typeof fetch;
			const inflated = await LoadGzippedWasm( "/f/a.wasm", get );
			expect( get ).toHaveBeenCalledWith( "/f/a.wasm.gz" );
			expect( new Uint8Array( await inflated.arrayBuffer() ) )
				.toEqual( wasm );
			expect( inflated.headers.get( "Content-Type" ) )
				.toBe( "application/wasm" );
			const already = await LoadGzippedWasm( "/f/inflated.wasm", get );
			expect( new Uint8Array( await already.arrayBuffer() ) )
				.toEqual( wasm );
			// no .gz (a Debug build): the .wasm itself
			const plain = vi.fn(
				async ( url: string ) => ( url.endsWith( ".gz" )
					? new Response( null, { status: 404 } )
					: new Response( wasm ) ),
			) as unknown as typeof fetch;
			expect(
				new Uint8Array(
					await ( await LoadGzippedWasm(
						"/f/b.wasm",
						plain,
					) ).arrayBuffer(),
				),
			).toEqual( wasm );
			expect( plain ).toHaveBeenLastCalledWith( "/f/b.wasm" );
			// something else for the .gz (a dev server's index.html): the .wasm
			const html = vi.fn( async ( url: string ) => new Response(
				url.endsWith( ".gz" ) ? "<!doctype html>" : wasm,
			) ) as unknown as typeof fetch;
			const fallback = await LoadGzippedWasm( "/f/t.wasm", html );
			expect( new Uint8Array( await fallback.arrayBuffer() ) )
				.toEqual( wasm );
		},
	);
} );
