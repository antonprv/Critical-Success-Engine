// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedConfig, ViteDevServer } from "vite";
import { Encode, MessagePackReader } from "@cse/datastream";
import {
	Command, Hook, Lifecycle, LogLevel, OverlapEvent, TransformStride,
	type ScriptBackend,
} from "@cse/scripting";
import { CreateRegistry, Harness } from "./Harness";
import {
	Comp,
	Ent,
	type SceneManifest,
} from "../Source/Engine/Core/EntityManifest";
import { SceneRegistry } from "../Source/Engine/Scenes/SceneRegistry";
import { CSharp, CSharpComponent } from "../Source/Engine/Components/CSharp";
import { Component } from "../Source/Engine/Core/Component";
import { InputService } from "../Source/Engine/Services/InputService";
import { Logger } from "../Source/Logging/Logger";
import {
	InputEvtType,
	RenderMsg,
	UiMsg,
} from "../Source/Workers/Common/CommonEnums";
import { HarnessInput } from "./InputFixture";
import { ScriptsWasmUrl } from "../Source/Workers/Common/ScriptsWasmUrl";
import { CSharpProjectIn } from "../BuildTools/ProjectPlugin";
import {
	BuildScripts, ScriptsBundleDirectory, ScriptsWasmPlugin,
	ScriptsWasmUrlPrefix, type RunCommand,
} from "../BuildTools/ScriptsWasmPlugin";

type Batch = unknown[][];

interface Answer {
	Transforms?: number[];
	Stream?: Uint8Array[];
	Toasts?: string[];
	Hud?: Record<string, string>;
	Logs?: [LogLevel, string][];
	Destroy?: number[];
	Errors?: [number, string][];
}

/**
 * The .NET side played by the test: records each batch, answers with what the
 * test queued.
 */
class FakeHost implements ScriptBackend {
	public readonly Names = ["Mover", "Game.Mover"];

	public readonly Batches: Batch[] = [];

	public Next: Answer = {};

	public Run( commands: Uint8Array ): Uint8Array {
		this.Batches.push( new MessagePackReader( commands ).Read() as Batch );
		const answer = this.Next;
		this.Next = {};
		return Encode( {
			Transforms: new Uint8Array(
				new Float64Array( answer.Transforms ?? [] ).buffer,
			),
			Stream: answer.Stream ?? [],
			Toasts: answer.Toasts ?? [],
			Hud: answer.Hud ?? {},
			Logs: answer.Logs ?? [],
			Destroy: answer.Destroy ?? [],
			Errors: answer.Errors ?? [],
		} );
	}

	/** The commands of every batch, flattened, as [kind, ...]. */
	public get Commands(): Batch {
		return this.Batches.flat();
	}

	public Kinds( batch = this.Batches.length - 1 ): number[] {
		return this.Batches[batch]!.map( ( command ) => command[0] as number );
	}
}

class Probe extends Component {
}

const Scene: SceneManifest = {
	id: "csharp",
	name: "C#",
	description: "",
	entities: [
		Ent(
			"Cart",
			[CSharp( "Mover", { Speed: 2 } ), Comp( Probe )],
			{ position: [1, 2, 3] },
		),
		Ent( "Wall", [Comp( Probe )] ),
	],
};

async function Boot( load: ( () => Promise<ScriptBackend> ) | null ): Promise<
	Harness
> {
	const harness = new Harness(
		new SceneRegistry().Register( Scene ),
		undefined,
		undefined,
		undefined,
		undefined,
		load,
	);
	await harness.BootToScene();
	return harness;
}

const Frame = ( harness: Harness, id = 1 ) => harness.render.Receive(
	{ type: RenderMsg.FrameRequest, frameId: id },
);

afterEach( () => {
	vi.restoreAllMocks();
} );

describe( "C# components in the game logic runtime", () => {
	it(
		"the perf probe times each frame, each physics step and each call into "
			+ "C#",
		async () => {
			const host = new FakeHost();
			const harness = await Boot( async () => host );
			harness.runtime.Perf.Take();
			Frame( harness );
			harness.Step( [] );
			const taken = harness.runtime.Perf.Take();

			expect( taken["logic"] ).toHaveLength( 1 );
			expect( taken["step"] ).toHaveLength( 1 );
			// input, update, UI in the frame; the physics hook in the step
			expect( taken["csharp"] ).toHaveLength( 4 );
		},
	);

	it(
		"a C# component is created with its fields and transform, woken, "
			+ "started, then run in each phase after TypeScript",
		async () => {
			const host = new FakeHost();
			const info = vi.spyOn( Logger, "LogInfo" );
			const harness = await Boot( async () => host );
			expect( info )
				.toHaveBeenCalledWith(
					"[GameLogicRuntime] C# components: Mover",
				);
			Frame( harness );

			const commands = host.Commands;
			const create = commands.find( ( c ) => c[0] === Command.Create )!;
			expect( create.slice( 2 ) )
				.toEqual(
					[
						harness.runtime.Context.World.FindByName( "Cart" )!.Id,
						"Cart",
						"Mover",
						{ Speed: 2 },
					],
				);
			const transforms = commands.find(
				( c ) => c[0] === Command.Transforms,
			)![1] as Uint8Array;
			expect(
				[
					...new Float64Array( transforms.slice().buffer ).slice(
						1,
						4,
					),
				],
			).toEqual( [1, 2, 3] );
			expect(
				commands.filter( ( c ) => c[0] === Command.Lifecycle )
					.map( ( c ) => c[2] ),
			).toEqual( [Lifecycle.Awake, Lifecycle.Start] );
			// one batch per phase of the frame: input (with the input), update,
			// UI
			const hooks = host.Batches.slice( -3 )
				.map( ( batch ) => batch.at( -1 )![1] );
			expect( hooks )
				.toEqual( [Hook.InputUpdate, Hook.Update, Hook.UIUpdate] );
			expect( host.Kinds( host.Batches.length - 3 ) )
				.toContain( Command.Input );
			expect( host.Kinds() ).not.toContain( Command.Input );

			harness.Step( [] );
			expect( host.Batches.at( -1 )!.at( -1 )![1] )
				.toBe( Hook.PhysicsUpdate );
		},
	);

	it(
		"applies what C# gives back: moves, HUD, toasts, logs, failures, "
			+ "destroyed entities",
		async () => {
			const host = new FakeHost();
			const harness = await Boot( async () => host );
			const cart = harness.runtime.Context.World.FindByName( "Cart" )!;
			const errors = vi.spyOn( Logger, "LogError" );
			const warnings = vi.spyOn( Logger, "LogWarning" );
			const infos = vi.spyOn( Logger, "LogInfo" );
			const id = cart.GetComponent( CSharpComponent )!.ScriptId;
			host.Next = {
				Transforms: [
					cart.Id,
					5,
					6,
					7,
					0,
					1,
					0,
					0,
					999,
					0,
					0,
					0,
					0,
					0,
					0,
					1,
				],
				Toasts: ["hello"],
				Hud: { score: "3" },
				Logs: [
					[LogLevel.Info, "i"],
					[LogLevel.Warning, "w"],
					[LogLevel.Error, "e"],
				],
				Errors: [[id, "boom"]],
				Destroy: [cart.Id, 12345],
			};
			Frame( harness );

			expect( cart.Transform.Position.ToTuple() ).toEqual( [5, 6, 7] );
			expect( cart.Transform.Rotation.Y ).toBe( 1 );
			expect(
				harness.UiMessages( UiMsg.Toast ).map( ( t ) => t["message"] ),
			)
				.toContain( "hello" );
			expect( infos ).toHaveBeenCalledWith( "[C#] i" );
			expect( warnings ).toHaveBeenCalledWith( "[C#] w" );
			expect( errors ).toHaveBeenCalledWith( "[C#] e" );
			expect( errors )
				.toHaveBeenCalledWith( "[C#] Mover on \"Cart\": boom" );
			expect( cart.IsDestroyed ).toBe( true );
			// its C# component was told
			Frame( harness, 2 );
			expect(
				host.Commands.some(
					( c ) => c[0] === Command.Destroy && c[1] === id,
				),
			).toBe( true );
			expect( harness.runtime.Context.Scripts!.Count ).toBe( 0 );
			// gone from the world: its transform is no longer sent
			const batch = new MessagePackReader( new Uint8Array() );
			expect( batch.Done ).toBe( true );
		},
	);

	it( "forwards collisions, triggers, enable and disable", async () => {
		const host = new FakeHost();
		const harness = await Boot( async () => host );
		const world = harness.runtime.Context.World;
		const cart = world.FindByName( "Cart" )!;
		const wall = world.FindByName( "Wall" )!;
		const component = cart.GetComponent( CSharpComponent )!;
		component.OnTriggerEnter( wall );
		component.OnTriggerExit( wall );
		component.OnCollisionEnter( wall );
		component.OnCollisionExit( wall );
		cart.Active = false;
		cart.Active = true;
		Frame( harness );
		const events = host.Commands.filter( ( c ) => c[0] === Command.Event )
			.map( ( c ) => [c[2], c[3], c[4]] );
		expect( events ).toEqual( [
			[OverlapEvent.TriggerEnter, wall.Id, "Wall"],
			[OverlapEvent.TriggerExit, wall.Id, "Wall"],
			[OverlapEvent.CollisionEnter, wall.Id, "Wall"],
			[OverlapEvent.CollisionExit, wall.Id, "Wall"],
		] );
		expect(
			host.Commands.filter( ( c ) => c[0] === Command.Enabled )
				.map( ( c ) => c[2] ),
		).toEqual( [false, true] );
		expect( component.Class ).toBe( "Mover" );
	} );

	it(
		"TypeScript and C# share the DataStream: messages for C# go with the "
			+ "next phase, C#'s arrive here",
		async () => {
			const host = new FakeHost();
			const harness = await Boot( async () => host );
			const stream = harness.runtime.Context.Stream;
			const got: unknown[] = [];
			stream.Subscribe( "Pong", ( value ) => got.push( value ) );
			// C# subscribes to Ping and sends a Pong: [[0, "Ping"], [2, "Pong",
			// { N: 2 }]]
			host.Next = {
				Stream: [Encode( [[0, "Ping"], [2, "Pong", { N: 2 }]] )],
			};
			Frame( harness );
			expect( got ).toEqual( [{ N: 2 }] );
			stream.Publish( "Ping", { N: 1 } );
			Frame( harness, 2 );
			const sent = host.Batches.flat()
				.filter( ( c ) => c[0] === Command.Stream )
				.map(
					( c ) => new MessagePackReader( c[1] as Uint8Array ).Read(),
				);
			expect( sent ).toContainEqual( [[2, "Ping", { N: 1 }]] );
		},
	);

	it(
		"a DataStream subscriber that throws is logged, the others still get "
			+ "the message",
		async () => {
			const harness = await Boot( null );
			const exceptions = vi.spyOn( Logger, "LogException" )
				.mockImplementation( () => {
				} );
			const after = vi.fn();
			harness.runtime.Context.Stream.Subscribe( "T", () => {
				throw new Error( "subscriber" );
			} );
			harness.runtime.Context.Stream.Subscribe( "T", after );
			harness.runtime.Context.Stream.Publish( "T", 1 );
			expect( after ).toHaveBeenCalled();
			expect( exceptions )
				.toHaveBeenCalledWith(
					expect.any( Error ),
					"[DataStream] a subscriber failed:",
				);
		},
	);

	it(
		"C# scripts that fail to load: the scene still runs, the C# components "
			+ "say why",
		async () => {
			const exceptions = vi.spyOn( Logger, "LogException" );
			const errors = vi.spyOn( Logger, "LogError" );
			const harness = await Boot( async () => {
				throw new Error( "no dotnet.js" );
			} );
			expect( harness.runtime.Context.Scenes.CurrentSceneId )
				.toBe( "csharp" );
			expect( harness.runtime.Context.Scripts ).toBeNull();
			expect( exceptions )
				.toHaveBeenCalledWith(
					expect.any( Error ),
					"[GameLogicRuntime] the C# scripts failed to load:",
				);
			expect(
				harness.UiMessages( UiMsg.Toast )
					.some(
						( t ) => String( t["message"] )
							.includes( "C# scripts failed to load" ),
					),
			).toBe( true );
			expect(
				errors.mock.calls.some(
					( [message] ) => message.includes(
						"\"Mover\" on \"Cart\" is a C# component",
					),
				),
			).toBe( true );
			// its hooks do nothing without a runtime
			const cart = harness.runtime.Context.World.FindByName( "Cart" )!;
			cart.GetComponent( CSharpComponent )!.OnTriggerEnter( cart );
			Frame( harness );
		},
	);

	it(
		"a project without C# scripts loads no .NET runtime and lists no "
			+ "components",
		async () => {
			const info = vi.spyOn( Logger, "LogInfo" );
			const harness = await Boot( null );
			expect( harness.runtime.Context.Scripts ).toBeNull();
			expect(
				info.mock.calls.some(
					( [message] ) => message.includes( "C# components" ),
				),
			).toBe( false );

			const empty = await Boot(
				async () => ( { Names: [], Run: () => new Uint8Array() } ),
			);
			expect( empty.runtime.Context.Scripts!.Names ).toEqual( [] );
		},
	);

	it( "C# writes to an entity that is already gone are dropped", async () => {
		const host = new FakeHost();
		const harness = await Boot( async () => host );
		const wall = harness.runtime.Context.World.FindByName( "Wall" )!;
		wall.Destroy();
		Frame( harness );
		host.Next = { Transforms: [wall.Id, 1, 1, 1, 0, 0, 0, 1] };
		Frame( harness, 2 );
		expect( wall.Transform.Position.X ).toBe( 0 );
		expect( TransformStride ).toBe( 8 );
	} );
} );

describe(
	"the Blank template: a TypeScript component listening to a C# one",
	() => {
		it(
			"LandingToast shows each \"Ball.Landed\" BallWatcher publishes, "
				+ "until "
			+ "it is destroyed",
			async () => {
				const host = new FakeHost();
				const harness = new Harness(
					CreateRegistry(),
					undefined,
					undefined,
					undefined,
					undefined,
					async () => host,
				);
				await harness.BootToScene();
				Frame( harness );
				expect(
					host.Commands.some(
						( c ) => c[0] === Command.Create
							&& c[4] === "BallWatcher",
					),
				).toBe( true );
				const stream = harness.runtime.Context.Stream;
				stream.Publish( "Ball.Landed", { Count: 2, Height: 3.25 } );
				expect(
					harness.UiMessages( UiMsg.Toast )
						.map( ( t ) => t["message"] ),
				)
					.toContain( "Landing 2, from 3.3 m" );
				harness.runtime.Context.World.DestroyAll();
				expect( stream.SubscriberCount( "Ball.Landed" ) ).toBe( 0 );
			},
		);
	},
);

describe( "InputService.Snapshot (what C# sees)", () => {
	it(
		"lists the pressed and just pressed actions, the values above 0 and "
			+ "the move vector",
		() => {
			const input = new InputService();
			input.System.Install( HarnessInput() );
			input.CapturePlayerInput = true;
			input.Handle( { kind: InputEvtType.KeyDown, code: "Space" } );
			input.Handle( { kind: InputEvtType.KeyDown, code: "KeyD" } );
			const snapshot = input.Snapshot();
			expect( snapshot.Down.sort() ).toEqual( ["Jump", "MoveRight"] );
			expect( snapshot.JustPressed.sort() )
				.toEqual( ["Jump", "MoveRight"] );
			expect( snapshot.Values ).toEqual( { Jump: 1, MoveRight: 1 } );
			expect( snapshot.Move ).toEqual( [1, 0] );
		},
	);
} );

describe( "ScriptsWasmUrl", () => {
	it(
		"is the dev server's root path in dev and outside a built site, else "
			+ "next to the assets folder",
		() => {
			expect( ScriptsWasmUrl( undefined, false ) )
				.toBe( "/scripts-wasm/_framework/dotnet.js" );
			expect( ScriptsWasmUrl( "https://h/run/assets/w.js", true ) )
				.toBe( "/scripts-wasm/_framework/dotnet.js" );
			expect( ScriptsWasmUrl( "https://h/run/assets/w.js", false ) )
				.toBe( "https://h/run/scripts-wasm/_framework/dotnet.js" );
		},
	);
} );

describe( "a project's C# scripts at build time", () => {
	const Folder = ( files: string[] ) => {
		const directory = mkdtempSync( join( tmpdir(), "cse-scripts-" ) );

		for ( const file of files ) {
			writeFileSync( join( directory, file ), "" );
		}
		return directory;
	};

	it(
		"the project's .csproj is the one at its root; two are an error",
		() => {
			expect( CSharpProjectIn( Folder( ["Game.cseproject"] ) ) )
				.toBeNull();
			expect(
				CSharpProjectIn( Folder( ["Game.csproj", "Game.cseproject"] ) ),
			).toBe( "Game.csproj" );
			expect(
				() => CSharpProjectIn( Folder( ["A.csproj", "B.csproj"] ) ),
			)
				.toThrow( /more than one \.csproj/ );
		},
	);

	it(
		"builds Debug for dev and publishes Release for a build; reports what "
			+ "failed",
		() => {
			const run = vi.fn<RunCommand>(
				() => ( {
					status: 0,
					stdout: "",
					stderr: "",

				} ),
			);
			expect( BuildScripts( "/p", "G.csproj", "Debug", run ) ).toBeNull();
			expect( run )
				.toHaveBeenLastCalledWith(
					"dotnet",
					["build", "G.csproj", "-c", "Debug", "-nologo", "-v:q"],
					{ cwd: "/p", encoding: "utf8" },
				);
			BuildScripts( "/p", "G.csproj", "Release", run );
			expect( run.mock.lastCall![1][0] ).toBe( "publish" );

			const failing: RunCommand = () => ( {
				status: 1,
				stdout: "a.cs(1,1): error CS1002: ; expected\nother",
				stderr: "",

			} );
			expect( BuildScripts( "/p", "G.csproj", "Debug", failing ) )
				.toBe( "a.cs(1,1): error CS1002: ; expected" );
			const silent: RunCommand = () => ( {
				status: 1,
				stdout: "",
				stderr: "",

			} );
			expect( BuildScripts( "/p", "G.csproj", "Debug", silent ) )
				.toBe( "dotnet build failed" );
			const missing: RunCommand = () => ( {
				status: null,
				stdout: "",
				stderr: "",
				error: new Error( "ENOENT" ),
			} );
			expect( BuildScripts( "/p", "G.csproj", "Debug", missing ) )
				.toMatch( /dotnet could not run \(ENOENT\)/ );
			expect( ScriptsBundleDirectory( "/p", "Release" ) )
				.toBe(
					"/p/Binaries/Scripts/Release/net10.0/browser-wasm"
						+ "/AppBundle/_framework",
				);
		},
	);

	it(
		"the plugin builds and serves the scripts in dev, rebuilding on a .cs "
			+ "change, and copies them into a build",
		() => {
			const directory = Folder( ["Game.csproj"] );
			const run = vi.fn<RunCommand>(
				() => ( {
					status: 0,
					stdout: "",
					stderr: "",

				} ),
			);
			const logger = { info: vi.fn(), error: vi.fn() };
			const plugin = ScriptsWasmPlugin(
				{ Directory: directory, CSharp: "Game.csproj", Run: run },
			);
			const configResolved = plugin.configResolved as (
				c: ResolvedConfig,
			) => void;
			configResolved(
				{
					command: "serve",
					logger,
					root: directory,
					build: { outDir: "dist" },
				} as unknown as ResolvedConfig,
			);

			const use = vi.fn();
			const listeners: ( ( file: string ) => void )[] = [];
			const send = vi.fn();
			( plugin.configureServer as ( s: ViteDevServer ) => void )( {
				middlewares: { use },
				watcher: {
					add: vi.fn(),
					on: ( _: string, listener: ( file: string ) => void ) => (
						listeners.push( listener )
					),
				},
				ws: { send },
			} as unknown as ViteDevServer );
			expect( run.mock.calls[0]![1][0] ).toBe( "build" );
			expect( use ).toHaveBeenCalledTimes( 1 );
			listeners[0]!( join( directory, "Source/Game.cs" ) );
			expect( send ).toHaveBeenCalledWith( { type: "full-reload" } );
			// not C#: nothing
			listeners[0]!( join( directory, "Source/Game.ts" ) );
			listeners[0]!( "/elsewhere/Other.cs" ); // not the project's
			expect( send ).toHaveBeenCalledTimes( 1 );

			run.mockReturnValueOnce(
				{ status: 1, stdout: "error X", stderr: "" },
			);
			listeners[0]!( join( directory, "Source/Game.cs" ) );
			expect( logger.error.mock.lastCall![0] )
				.toContain( "did not build" );
			expect( send ).toHaveBeenCalledTimes( 1 );

			configResolved(
				{
					command: "build",
					logger,
					root: directory,
					build: { outDir: "dist" },
				} as unknown as ResolvedConfig,
			);
			( plugin.writeBundle as () => void )();
			expect( run.mock.lastCall![1][0] ).toBe( "publish" );
			// no bundle where the build should have left it: said
			expect( logger.error.mock.lastCall![0] )
				.toContain( "left nothing" );
			// a bundle, and an absolute outDir (the desktop app's builds):
			// copied there
			const bundle = ScriptsBundleDirectory( directory, "Release" );
			mkdirSync( bundle, { recursive: true } );
			writeFileSync( join( bundle, "dotnet.js" ), "// runtime" );
			const out = mkdtempSync( join( tmpdir(), "cse-site-" ) );
			configResolved(
				{
					command: "build",
					logger,
					root: directory,
					build: { outDir: out },
				} as unknown as ResolvedConfig,
			);
			( plugin.writeBundle as () => void )();
			expect(
				readFileSync(
					join( out, "scripts-wasm/_framework/dotnet.js" ),
					"utf8",
				),
			).toBe( "// runtime" );
			expect( logger.info.mock.lastCall![0] )
				.toBe( `scripts-wasm: copied into ${ out }/scripts-wasm` );
			run.mockReturnValueOnce(
				{ status: 1, stdout: "error Y", stderr: "" },
			);
			( plugin.writeBundle as () => void )();
			expect( ScriptsWasmUrlPrefix ).toBe( "/scripts-wasm/_framework/" );
		},
	);

	it( "without a .csproj the plugin does nothing", () => {
		const run = vi.fn<RunCommand>();
		const plugin = ScriptsWasmPlugin(
			{ Directory: "/p", CSharp: null, Run: run },
		);
		( plugin.configResolved as ( c: ResolvedConfig ) => void )(
			{ command: "build" } as unknown as ResolvedConfig,
		);
		( plugin.configureServer as ( s: ViteDevServer ) => void )(
			{} as ViteDevServer,
		);
		( plugin.writeBundle as () => void )();
		expect( run ).not.toHaveBeenCalled();
	} );
} );
