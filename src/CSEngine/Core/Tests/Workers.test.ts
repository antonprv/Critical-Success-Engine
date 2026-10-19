/* eslint-disable @cse/max-len */
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The worker entry modules ("shells"): each one wires `self`'s messages to the
// engine pieces. Tests give them a fake `self`, import them fresh, and talk to
// them exactly the way the main thread and the other workers do.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AudioMsg,
	GameLogicMsg,
	PhysicsMsg,
	PhysState,
	RenderMsg,
	RendOpType,
	SdfMsg,
	SoundAction,
	SoundType,
	UiMsg,
} from "../Source/Workers/Common/CommonEnums";
import { FakePort } from "./Harness";
import { SilenceConsole } from "./helpers";

type Listener = ( event: { data: unknown; } ) => void;

/** A stand-in for a worker's global scope. */
class FakeSelf {
	public readonly location = { hostname: "test.invalid" };

	public onmessage: Listener | null = null;

	public readonly posted: {
		message: unknown;
		transfer?: Transferable[] | undefined;
	}[] = [];

	private readonly _listeners: Record<string, Listener[]> = {};

	public postMessage( message: unknown, transfer?: Transferable[] ): void {
		this.posted.push( { message, transfer } );
	}

	public addEventListener( type: string, listener: Listener ): void {
		( this._listeners[type] ??= [] ).push( listener );
	}

	public Send( data: unknown ): void {
		this.onmessage?.( { data } );
		for ( const listener of this._listeners["message"] ?? [] ) {
			listener( { data } );
		}
	}
}

let fakeSelf: FakeSelf;
beforeEach( () => {
	vi.resetModules();
	fakeSelf = new FakeSelf();
	vi.stubGlobal( "self", fakeSelf );
	vi.useFakeTimers(
		{
			toFake: [
				"setTimeout",
				"clearTimeout",
				"setInterval",
				"clearInterval",
			],
		},
	);
} );
afterEach( () => {
	vi.useRealTimers();
	vi.doUnmock( "../Source/Engine/Runtime/GameLogicRuntime" );
	vi.doUnmock( "../Source/Workers/Audio/AudioBank" );
	vi.doUnmock( "../Source/Workers/Physics/PhysicsWasmLoader" );
	vi.doUnmock( "../Source/Workers/Physics/PhysicsWorld" );
	vi.doUnmock( "../Source/Workers/Render/RenderScene" );
	vi.doUnmock( "../Source/Workers/Render/EntityMeshRegistry" );
	vi.doUnmock( "@cse/sdf" );
	vi.doUnmock( "@cse/sdf/render" );
} );

const flush = async (): Promise<void> => {
	for ( let i = 0; i < 5; i++ ) {
		await Promise.resolve();
	}
};

describe( "UiWorker", () => {
	it(
		"creates the UI controller on init and routes both directions; "
			+ "messages before init are ignored",
		async () => {
			await import( "../Source/Workers/UiWorker" );
			// no controller yet
			expect(
				() => fakeSelf.Send(
					{ type: UiMsg.PointerLock, locked: true },
				),
			).not.toThrow();

			const gameLogic = new FakePort();
			fakeSelf.Send( { type: UiMsg.Init, gameLogicPort: gameLogic } );

			gameLogic.Receive(
				{
					type: UiMsg.Scenes,
					scenes: [{ id: "a", name: "A", description: "" }],
				},
			);
			const patches = fakeSelf.posted.map(
				( p ) => p.message as {
					type: UiMsg;
					patch?: { menu?: { scenes?: unknown[]; }; };
				},
			);
			expect(
				patches.some(
					( m ) => m.type === UiMsg.State
					&& m.patch?.menu?.scenes?.length === 1,
				),
			).toBe( true );

			// booting is over: the menu takes picks now
			gameLogic.Receive( { type: UiMsg.LoadFinished, sceneId: "a" } );
			fakeSelf.Send( { type: UiMsg.SelectScene, sceneId: "a" } );
			expect( gameLogic.sent )
				.toContainEqual( { type: UiMsg.LoadScene, sceneId: "a" } );
		},
	);
} );

describe( "GameLogicWorker", () => {
	function MockRuntime(
		boot: () => Promise<void> = () => Promise.resolve(),
	) {
		const instances: {
			ports: unknown;
			channels: unknown;
			storage: { Backend: string; };
			data: { Ids: string[]; };
			scripts: ( () => Promise<unknown> ) | null;
			handled: unknown[];
		}[] = [];
		vi.doMock( "../Source/Engine/Runtime/GameLogicRuntime", () => ( {
			GameLogicRuntime: class {
				public handled: unknown[] = [];

				public constructor(
					public ports: unknown,
					_scenes: unknown,
					public channels: unknown,
					_input: unknown,
					public storage: unknown,
					public data: unknown,
					public scripts: unknown,
				) {
					instances.push( this as never );
				}

				public Boot = boot;

				public HandleMainMessage( message: unknown ): void {
					this.handled.push( message );
				}
			},
		} ) );
		return instances;
	}

	it(
		"listens with addEventListener, never self.onmessage: dotnet.js (the "
			+ "C# scripts) would take the worker for a plain one and hang",
		async () => {
			MockRuntime();
			await import( "../Source/Workers/GameLogicWorker" );
			expect( fakeSelf.onmessage ).toBeNull();
		},
	);

	it( "hands the SDF worker's port to the runtime when there is one", async () => {
		const instances = MockRuntime();
		await import( "../Source/Workers/GameLogicWorker" );
		const sdfPort = new FakePort();
		fakeSelf.Send( {
			type: GameLogicMsg.Init,
			renderPort: new FakePort(),
			physicsPort: new FakePort(),
			audioPort: new FakePort(),
			uiPort: new FakePort(),
			sdfPort,
		} );
		await vi.waitFor( () => expect( instances ).toHaveLength( 1 ) );
		expect( ( instances[0]!.ports as { sdf: unknown; } ).sdf ).toBe( sdfPort );
	} );

	it( "starts in the scene the page asks for (?scene=); none: the first", async () => {
		const instances = MockRuntime();
		await import( "../Source/Workers/GameLogicWorker" );
		const ports = { renderPort: new FakePort(), physicsPort: new FakePort(), audioPort: new FakePort(), uiPort: new FakePort() };
		fakeSelf.Send( { type: GameLogicMsg.Init, ...ports, startScene: "coins" } );
		await vi.waitFor( () => expect( instances ).toHaveLength( 1 ) );
		expect( ( instances[0] as unknown as { StartScene: string | null; } ).StartScene ).toBe( "coins" );
	} );

	it(
		"starts the engine's modules, then builds the runtime with the four "
			+ "ports; messages sent meanwhile wait, earlier ones are dropped",
		async () => {
			const instances = MockRuntime();
			await import( "../Source/Workers/GameLogicWorker" );
			// before init: dropped
			fakeSelf.Send( { type: GameLogicMsg.Input, event: {} } );

			const ports = {
				renderPort: new FakePort(),
				physicsPort: new FakePort(),
				audioPort: new FakePort(),
				uiPort: new FakePort(),
			};
			fakeSelf.Send( { type: GameLogicMsg.Init, ...ports } );
			// while the modules load: queued
			fakeSelf.Send(
				{ type: GameLogicMsg.Input, event: { kind: 1, code: "KeyA" } },
			);
			await vi.waitFor( () => expect( instances ).toHaveLength( 1 ) );
			expect( instances[0]!.ports )
				.toEqual(
					{
						render: ports.renderPort,
						physics: ports.physicsPort,
						audio: ports.audioPort,
						ui: ports.uiPort,
					},
				);
			// The player's settings storage: IndexedDB in a browser; here (no
			// IndexedDB) memory, and the log says so.
			expect( instances[0]!.storage.Backend ).toBe( "Memory" );
			// The runtime carries this thread's plugin channels (the Engine
			// module's).
			const {
				ModuleManager,
			} = await import( "../Source/Engine/Modules/ModuleManager" );
			expect( instances[0]!.channels )
				.toBe(
					ModuleManager.Get()
						.GetModuleChecked<
						{ Channels: unknown; }
							& import( "../Source/Engine/Modules/ModuleManager" ).ModuleInterface
					>( "Engine" ).Channels,
				);
			expect( instances[0]!.handled )
				.toEqual(
					[
						{
							type: GameLogicMsg.Input,
							event: { kind: 1, code: "KeyA" },
						},
					],
				);

			fakeSelf.Send(
				{ type: GameLogicMsg.Input, event: { kind: 1, code: "KeyW" } },
			);
			expect( instances[0]!.handled ).toHaveLength( 2 );
		},
	);

	it( "logs a failed boot instead of losing it", async () => {
		const log = SilenceConsole();
		MockRuntime( () => Promise.reject( new Error( "no scenes" ) ) );
		await import( "../Source/Workers/GameLogicWorker" );
		fakeSelf.Send(
			{
				type: GameLogicMsg.Init,
				renderPort: new FakePort(),
				physicsPort: new FakePort(),
				audioPort: new FakePort(),
				uiPort: new FakePort(),
			},
		);
		// (with no server here the data assets can't be fetched either: that is
		// logged too, before)
		await vi.waitFor(
			() => expect( log.error.mock.calls.map( ( c ) => String( c[0] ) ) )
				.toEqual(
					expect.arrayContaining(
						[
							expect.stringContaining(
								"[GameLogicWorker] boot failed:",
							),
						],
					),
				),
		);
	} );

	it(
		"the project's game modules (the templates' games) register their "
			+ "scenes with the Engine module",
		async () => {
			const {
				SceneRegistry,
			} = await import( "../Source/Engine/Scenes/SceneRegistry" );
			const register = vi.spyOn( SceneRegistry.prototype, "Register" );
			MockRuntime();
			await import( "../Source/Workers/GameLogicWorker" );
			const {
				ModuleManager,
			} = await import( "../Source/Engine/Modules/ModuleManager" );
			await vi.waitFor(
				() => expect(
					ModuleManager.Get().PrimaryGameModule?.IsGameModule(),
				).toBe( true ),
			);
			// Games Sample is made of the templates' game modules; the first is
			// the primary one. Games Sample is made of the templates' game
			// modules, plus the UI plugin's game-thread half (its page half
			// stays on the page).
			expect( ModuleManager.Get().QueryModules()
				.map( ( m ) => [m.Name, m.IsLoaded] ) ).toEqual( [
				["Engine", true], ["BlankSample", true],
				["FirstPersonSample", true], ["CoinHuntSample", true],
				["ThirdPersonSample", true], ["TopDownSample", true],
				["UIHost", false], ["UIGame", true],
			] );
			expect(
				register.mock.calls.map(
					( c ) => ( c[0] as { id: string; } ).id,
				),
			)
				.toEqual(
					expect.arrayContaining(
						["bouncing-ball", "character-test", "coin-hunt"],
					),
				);
		},
	);

	it(
		"with IndexedDB there, the player's settings live in it and nothing is "
			+ "warned about",
		async () => {
			const log = SilenceConsole();
			const { indexedDB } = await import( "fake-indexeddb" );
			vi.stubGlobal( "indexedDB", indexedDB );
			const instances = MockRuntime();
			await import( "../Source/Workers/GameLogicWorker" );
			fakeSelf.Send(
				{
					type: GameLogicMsg.Init,
					renderPort: new FakePort(),
					physicsPort: new FakePort(),
					audioPort: new FakePort(),
					uiPort: new FakePort(),
				},
			);
			await vi.waitFor( () => expect( instances ).toHaveLength( 1 ) );
			expect(
				( instances[0] as unknown as {
					storage: { Backend: string; };
				} ).storage.Backend,
			).toBe( "IndexedDB" );
			expect(
				log.warn.mock.calls.map( ( c ) => String( c[0] ) )
					.filter( ( m ) => m.includes( "kept in memory" ) ),
			).toEqual( [] );
		},
	);

	it(
		"loads the project's data assets from the page's address before the "
			+ "game starts; one that fails is logged by name",
		async () => {
			const log = SilenceConsole();
			const fetched: string[] = [];
			vi.stubGlobal( "fetch", vi.fn( async ( url: string ) => {
				fetched.push( url );
				return url.endsWith( "CoinHuntRules.csedata" )
					? { ok: false, status: 404, text: async () => "" }
					: {
						ok: true,
						status: 200,
						text: async () => "{ \"Type\": \"X\", \"Values\": {} }",
					};
			} ) );
			const instances = MockRuntime();
			await import( "../Source/Workers/GameLogicWorker" );
			fakeSelf.Send(
				{
					type: GameLogicMsg.Init,
					renderPort: new FakePort(),
					physicsPort: new FakePort(),
					audioPort: new FakePort(),
					uiPort: new FakePort(),
					baseUrl: "https://games.example/starfall/",
				},
			);
			await vi.waitFor( () => expect( instances ).toHaveLength( 1 ) );
			expect( fetched )
				.toContain(
					"https://games.example/starfall/data/FirstPersonView.csedata",
				);
			expect( instances[0]!.data.Ids ).toContain( "CoinHuntRules" );
			expect( log.error.mock.calls.map( ( c ) => String( c[0] ) ) )
				.toEqual(
					expect.arrayContaining(
						[
							expect.stringContaining(
								"[GameLogicWorker] Data asset "
									+ "\"CoinHuntRules\" "
								+ "(https://games.example/starfall/data/CoinHuntRules.csedata): HTTP 404",
							),
						],
					),
				);
		},
	);

	it(
		"logs the modules that failed to start and the plugins that could not "
			+ "be enabled",
		async () => {
			const log = SilenceConsole();
			vi.doMock( "../Source/Project", async ( original ) => {
				const real = await original<
					typeof import( "../Source/Project" )
				>();

				return {
					...real,
					GameProject: {
						...real.GameProject,
						Plugins: [{ Name: "Ghost", Enabled: true }],
						Modules: [
							...real.GameProject.Modules,
							{
								Name: "Broken",
								Type: "Runtime",
								LoadingPhase: "Default",
								Load: () => Promise.reject(
									new Error( "404" ),
								),
							},
						],
					},
				};
			} );
			MockRuntime();
			await import( "../Source/Workers/GameLogicWorker" );
			await vi.waitFor(
				() => expect(
					log.error.mock.calls.map( ( c ) => String( c[0] ) ),
				)
					.toEqual( expect.arrayContaining( [
						expect.stringContaining(
							"[GameLogicWorker] The project enables \"Ghost\", "
								+ "which is not "
					+ "installed",
						),
						expect.stringContaining(
							"[GameLogicWorker] Module \"Broken\" failed to "
								+ "load: Its code "
					+ "could not be loaded: 404",
						),
					] ) ),
			);
			vi.doUnmock( "../Source/Project" );
		},
	);
} );

describe( "GameLogicWorker with C# scripts", () => {
	it( "gives the runtime a loader for the project's C# scripts (the Games Sample has some), at the dev server's path", async () => {
		const load = vi.fn( async () => ( { Names: [], Run: () => new Uint8Array() } ) );
		vi.doMock( "@cse/scripting", async ( original ) => ( {
			...await original<typeof import( "@cse/scripting" )>(),
			LoadScriptsWasm: load,
		} ) );
		const instances: { scripts: ( () => Promise<unknown> ) | null; }[] = [];
		vi.doMock( "../Source/Engine/Runtime/GameLogicRuntime", () => ( {
			GameLogicRuntime: class {
				public scripts: ( () => Promise<unknown> ) | null;

				public constructor( ...args: unknown[] ) {
					this.scripts = args[6] as never;
					instances.push( this );
				}

				public Boot = () => Promise.resolve();

				public HandleMainMessage(): void {
				}
			},
		} ) );
		await import( "../Source/Workers/GameLogicWorker" );
		fakeSelf.Send( {
			type: GameLogicMsg.Init,
			renderPort: new FakePort(),
			physicsPort: new FakePort(),
			audioPort: new FakePort(),
			uiPort: new FakePort(),
		} );
		await vi.waitFor( () => expect( instances ).toHaveLength( 1 ) );
		await instances[0]!.scripts!();
		expect( load ).toHaveBeenCalledWith( "/scripts-wasm/_framework/dotnet.js" );
		vi.doUnmock( "@cse/scripting" );
	} );
	it( "a project without C# scripts gets no loader", async () => {
		vi.doMock( "../Source/Project", async ( original ) => ( {
			...await original<typeof import( "../Source/Project" )>(),
			HasCSharpScripts: false,
		} ) );
		const scripts: unknown[] = [];
		vi.doMock( "../Source/Engine/Runtime/GameLogicRuntime", () => ( {
			GameLogicRuntime: class {
				public constructor( ...args: unknown[] ) {
					scripts.push( args[6] );
				}

				public Boot = () => Promise.resolve();

				public HandleMainMessage(): void {
				}
			},
		} ) );
		await import( "../Source/Workers/GameLogicWorker" );
		fakeSelf.Send( {
			type: GameLogicMsg.Init,
			renderPort: new FakePort(),
			physicsPort: new FakePort(),
			audioPort: new FakePort(),
			uiPort: new FakePort(),
		} );
		await vi.waitFor( () => expect( scripts ).toEqual( [null] ) );
		vi.doUnmock( "../Source/Project" );
	} );
} );

describe( "AudioWorker", () => {
	async function Start( resolve: ( id: string ) => unknown ) {
		vi.doMock(
			"../Source/Workers/Audio/AudioBank",
			() => ( { AudioBank: class {
				public Resolve = vi.fn(
					( id: string ) => Promise.resolve( resolve( id ) ),
				);
			} } ),
		);
		await import( "../Source/Workers/AudioWorker" );
		const gameLogic = new FakePort();
		fakeSelf.Send( { type: AudioMsg.Init, gameLogicPort: gameLogic } );
		return gameLogic;
	}

	it(
		"decoded sounds go to the main thread with their channel buffers "
			+ "transferred",
		async () => {
			const left = new Float32Array( [0.1] ),
				right = new Float32Array( [0.2] );
			const gameLogic = await Start(
				() => ( {
					kind: SoundType.Pcm,
					sampleRate: 48000,
					channels: [left, right],
				} ),
			);
			gameLogic.Receive(
				{
					action: SoundAction.PlaySound,
					soundId: "coin",
					position: [1, 2, 3],
				},
			);
			await flush();

			expect( fakeSelf.posted[0]!.message )
				.toMatchObject(
					{
						action: SoundAction.PlaySound,
						soundId: "coin",
						position: [1, 2, 3],
						sound: { kind: SoundType.Pcm },
					},
				);
			expect( fakeSelf.posted[0]!.transfer )
				.toEqual( [left.buffer, right.buffer] );
		},
	);

	it(
		"encoded sounds transfer their single buffer; unknown sounds and other "
			+ "actions send nothing",
		async () => {
			const data = new ArrayBuffer( 4 );
			const gameLogic = await Start(
				( id ) => ( id === "known"
					? { kind: SoundType.Encoded, data }
					: null ),
			);
			gameLogic.Receive(
				{ action: SoundAction.PlaySound, soundId: "unknown" },
			);
			gameLogic.Receive( { action: 99, soundId: "known" } );
			gameLogic.Receive(
				{ action: SoundAction.PlaySound, soundId: "known" },
			);
			await flush();

			expect( fakeSelf.posted ).toHaveLength( 1 );
			expect( fakeSelf.posted[0]!.transfer ).toEqual( [data] );
		},
	);

	it( "ignores messages it does not know", async () => {
		await Start( () => null );
		expect( () => fakeSelf.Send( { type: "something-else" } ) ).not
			.toThrow();
	} );
} );

describe( "AudioBank", () => {
	async function Bank( options: { offline?: unknown; } = {} ) {
		if ( "offline" in options ) {
			( fakeSelf as unknown as {
				OfflineAudioContext?: unknown;
			} ).OfflineAudioContext = options.offline;
		}
		const {
			AudioBank,
		} = await import( "../Source/Workers/Audio/AudioBank" );
		const bank = new AudioBank();
		( bank as unknown as {
			_soundUrls: Record<string, string>;
		} )._soundUrls["coin"] = "/assets/audio/coin.wav";
		const fetchMock = vi.fn(
			() => Promise.resolve(
				new Response( new Uint8Array( [1, 2, 3, 4] ) ),
			),
		);
		vi.stubGlobal( "fetch", fetchMock );
		return { bank, fetchMock };
	}

	it(
		"a sound with no registered URL is reported and resolves to nothing",
		async () => {
			const log = SilenceConsole();
			const { bank } = await Bank();
			expect( await bank.Resolve( "missing" ) ).toBeNull();
			expect( String( log.warn.mock.calls[0]![0] ) )
				.toContain( "no URL registered for sound \"missing\"" );
		},
	);

	it(
		"without in-worker decoding the raw file is handed over (a copy - the "
			+ "cache keeps its own), fetched only once",
		async () => {
			const { bank, fetchMock } = await Bank();
			const first = await bank.Resolve( "coin" );
			const second = await bank.Resolve( "coin" );
			expect( first ).toMatchObject( { kind: SoundType.Encoded } );
			expect(
				[...new Uint8Array( ( first as { data: ArrayBuffer; } ).data )],
			).toEqual( [1, 2, 3, 4] );
			expect( ( first as { data: ArrayBuffer; } ).data ).not
				.toBe( ( second as { data: ArrayBuffer; } ).data );
			expect( fetchMock ).toHaveBeenCalledTimes( 1 );
		},
	);

	it(
		"decodes in the worker when it can, and serves copies of the decoded "
			+ "channels from then on",
		async () => {
			const decodeAudioData = vi.fn(
				() => Promise.resolve(
					{
						numberOfChannels: 2,
						sampleRate: 44100,
						getChannelData: ( i: number ) => new Float32Array(
							[i, i],
						),
					},
				),
			);
			const offline = vi.fn( function ( this: unknown ) {
				return { decodeAudioData };
			} );
			const { bank, fetchMock } = await Bank( { offline } );

			const first = await bank.Resolve( "coin" ) as {
				kind: SoundType;
				sampleRate: number;
				channels: Float32Array[];
			};
			const second = await bank.Resolve( "coin" ) as {
				channels: Float32Array[];
			};
			expect( first.kind ).toBe( SoundType.Pcm );
			expect( first.sampleRate ).toBe( 44100 );
			expect( first.channels.map( ( c ) => [...c] ) )
				.toEqual( [[0, 0], [1, 1]] );
			// a fresh copy each time (they get transferred away)
			expect( second.channels[1] ).not.toBe( first.channels[1] );
			expect( decodeAudioData ).toHaveBeenCalledTimes( 1 );
			expect( fetchMock ).toHaveBeenCalledTimes( 1 );
		},
	);

	it(
		"falls back to the raw file when in-worker decoding fails",
		async () => {
			const log = SilenceConsole();
			const offline = vi.fn( function ( this: unknown ) {
				return {
					decodeAudioData: () => Promise.reject(
						new Error( "unsupported" ),
					),
				};
			} );
			const { bank } = await Bank( { offline } );
			expect( await bank.Resolve( "coin" ) )
				.toMatchObject( { kind: SoundType.Encoded } );
			expect( String( log.warn.mock.calls[0]![0] ) )
				.toContain( "falling back to main-thread decode" );
		},
	);
} );

describe( "PhysicsWorker", () => {
	class World {
		public static instances: World[] = [];

		public applied: unknown[] = [];

		public created: unknown;

		public stepError: Error | null = null;

		public steps = 0;

		public sdf: unknown[] = [];

		public OnSdfReset: ( () => void ) | null = null;

		public constructor( public bridge: unknown ) {
			World.instances.push( this );
		}

		public CreateWorld( settings: unknown ): void {
			this.created = settings;
			this.OnSdfReset?.();
		}

		public HandleSdf( message: unknown ): void {
			this.sdf.push( message );
		}

		public ApplyCommands(
			commands: unknown,
			reply: ( m: unknown ) => void,
		): void {
			this.applied.push( commands );
			reply( { state: PhysState.SyncAck, token: 1 } );
		}

		public Step(): unknown {
			if ( this.stepError ) {
				throw this.stepError;
			}
			this.steps++;
			return {
				step: this.steps,
				bodyCount: 0,
				bodies: new ArrayBuffer( 8 ),
				characterCount: 0,
				characters: new ArrayBuffer( 8 ),
				overlaps: this.steps === 2 ? new Int32Array( [1, 2, 1] ) : null,
			};
		}
	}

	let clock = 0;
	async function Start( load: () => Promise<unknown> ) {
		World.instances = [];
		clock = 0;
		vi.spyOn( performance, "now" ).mockImplementation( () => clock );
		vi.doMock(
			"../Source/Workers/Physics/PhysicsWasmLoader",
			() => ( { PhysicsWasmLoader: class {
				public Load = load;
			} } ),
		);
		vi.doMock(
			"../Source/Workers/Physics/PhysicsWorld",
			() => ( { PhysicsWorld: World } ),
		);
		await import( "../Source/Workers/PhysicsWorker" );
		const gameLogic = new FakePort();

		return gameLogic;
	}
	const init = ( port: FakePort ): void => fakeSelf.Send(
		{
			type: PhysicsMsg.Init,
			gameLogicPort: port,
			settings: { gravity: [0, -20, 0] },
			fixedTimestepMs: 10,
		},
	);
	const advance = ( ms: number ): void => {
		clock += ms; vi.advanceTimersByTime( ms );
	};
	const steps = ( port: FakePort ) => ( port.sent as {
		state: PhysState;
	}[] ).filter( ( m ) => m.state === PhysState.Step );

	it(
		"queues commands until the runtime has loaded, then creates the world, "
			+ "says Ready, replays the queue and starts stepping",
		async () => {
			let finishLoading!: ( bridge: unknown ) => void;
			const port = await Start(
				() => new Promise( ( resolve ) => ( finishLoading = resolve ) ),
			);
			init( port );
			port.Receive( { commands: ["early"] } );
			expect( World.instances ).toHaveLength( 0 );

			finishLoading( { bridge: true } );
			await flush();
			const world = World.instances[0]!;
			expect( world.created ).toEqual( { gravity: [0, -20, 0] } );
			expect( port.sent[0] ).toEqual( { state: PhysState.Ready } );
			expect( world.applied ).toEqual( [["early"]] );

			port.Receive( { commands: ["later"] } );
			expect( world.applied ).toEqual( [["early"], ["later"]] );

			advance( 10 );
			advance( 10 );
			expect( steps( port ).length ).toBeGreaterThanOrEqual( 2 );
			const withOverlaps = ( port.sent as {
				overlaps?: Int32Array | null;
			}[] ).find( ( m ) => m.overlaps );
			expect( withOverlaps ).toBeDefined();
			// the perf probe: each step's time and body count
			const taken = ( globalThis as unknown as {
				__csePerf: { Thread: string; Take(): Record<string, number[]>; };
			} ).__csePerf;
			expect( taken.Thread ).toBe( "Physics" );
			const samples = taken.Take();
			expect( samples["physics"]!.length ).toBe( steps( port ).length );
			expect( samples["bodies"]!.length ).toBe( steps( port ).length );
		},
	);

	it(
		"catches up at most 5 steps after a stall, then drops the backlog",
		async () => {
			const port = await Start( () => Promise.resolve( {} ) );
			init( port );
			await flush();
			const before = steps( port ).length;

			clock += 1000;                // the tab was frozen for a second
			vi.advanceTimersByTime( 5 );    // one tick
			expect( steps( port ).length - before ).toBe( 5 );

			const after = steps( port ).length;
			// no time passed on the clock: the backlog is gone, nothing to do
			vi.advanceTimersByTime( 5 );
			expect( steps( port ).length ).toBe( after );
		},
	);

	it(
		"set-running pauses and resumes the loop (and is harmless before the "
			+ "world exists)",
		async () => {
			let finishLoading!: ( bridge: unknown ) => void;
			const port = await Start(
				() => new Promise( ( resolve ) => ( finishLoading = resolve ) ),
			);
			init( port );
			// no world yet: ticks do nothing
			fakeSelf.Send( { type: PhysicsMsg.SetRunning, running: true } );
			advance( 50 );
			expect( steps( port ) ).toHaveLength( 0 );

			finishLoading( {} );
			await flush();
			fakeSelf.Send( { type: PhysicsMsg.SetRunning, running: false } );
			advance( 100 );
			expect( steps( port ) ).toHaveLength( 0 );

			fakeSelf.Send( { type: PhysicsMsg.SetRunning, running: true } );
			advance( 30 );
			expect( steps( port ).length ).toBeGreaterThan( 0 );
		},
	);

	it( "a step that throws is logged and stops the simulation", async () => {
		const log = SilenceConsole();
		const port = await Start( () => Promise.resolve( {} ) );
		init( port );
		await flush();
		World.instances[0]!.stepError = new Error( "bad contact" );
		advance( 20 );
		advance( 50 );
		expect( steps( port ) ).toHaveLength( 0 );
		expect( String( log.error.mock.calls[0]![0] ) )
			.toContain( "step failed - stopping the simulation" );
	} );

	it(
		"when the runtime cannot load: Failed (with the reason) is reported "
			+ "once, and later commands are dropped",
		async () => {
			const log = SilenceConsole();
			const port = await Start(
				() => Promise.reject( new Error( "404 dotnet.js" ) ),
			);
			init( port );
			port.Receive( { commands: ["queued"] } );
			await flush();

			expect( port.sent )
				.toEqual(
					[{ state: PhysState.Failed, message: "404 dotnet.js" }],
				);
			expect( log.error ).toHaveBeenCalled();
			port.Receive( { commands: ["after"] } );
			advance( 100 );
			expect( port.sent ).toHaveLength( 1 );
			expect( World.instances ).toHaveLength( 0 );
		},
	);

	it( "a non-Error rejection is reported by its text", async () => {
		SilenceConsole();
		const port = await Start( () => Promise.reject( "no wasm" ) );
		init( port );
		await flush();
		expect( port.sent )
			.toEqual( [{ state: PhysState.Failed, message: "no wasm" }] );
	} );

	it( "complains after 15 s if the runtime is still loading", async () => {
		const log = SilenceConsole();
		const port = await Start( () => new Promise( () => undefined ) );
		init( port );
		vi.advanceTimersByTime( 15_000 );
		expect( String( log.error.mock.calls[0]![0] ) )
			.toContain( "still not loaded after 15 s" );
	} );

	it( "does not complain when the runtime loaded in time", async () => {
		const log = SilenceConsole();
		const port = await Start( () => Promise.resolve( {} ) );
		init( port );
		await flush();
		fakeSelf.Send( { type: PhysicsMsg.SetRunning, running: false } );
		vi.advanceTimersByTime( 15_000 );
		expect(
			log.error.mock.calls.some(
				( c ) => String( c[0] ).includes( "15 s" ),
			),
		).toBe( false );
	} );
	it(
		"takes the SDF worker's chunks (queued until the world is up) and asks "
			+ "for them again when the world is recreated",
		async () => {
			let finishLoading!: ( bridge: unknown ) => void;
			const port = await Start(
				() => new Promise( ( resolve ) => ( finishLoading = resolve ) ),
			);
			const sdf = new FakePort();

			fakeSelf.Send( {
				type: PhysicsMsg.Init,
				gameLogicPort: port,
				sdfPort: sdf,
				settings: { gravity: [0, -20, 0] },
				fixedTimestepMs: 10,
			} );
			sdf.Receive( { Type: "begin", Epoch: 1 } );
			sdf.Receive( { Type: "chunks", Epoch: 1 } );
			// queued: not taken yet
			expect( sdf.sent ).toEqual( [] );
			finishLoading( {} );
			await flush();

			const world = World.instances[0]!;

			// the first world asks too (the SDF worker has nothing yet); the
			// queued chunks are taken in, and the SDF worker told
			expect( sdf.sent ).toEqual( expect.arrayContaining( [
				{ Type: "reset" },
				{ Type: "taken", Epoch: 1 },
			] ) );
			expect( sdf.sent ).toHaveLength( 2 );
			expect( world.sdf ).toEqual( [
				{ Type: "begin", Epoch: 1 },
				{ Type: "chunks", Epoch: 1 },
			] );
			sdf.Receive( { Type: "chunks", Epoch: 1 } );
			expect( world.sdf ).toHaveLength( 3 );
			expect( sdf.sent.at( -1 ) ).toEqual( { Type: "taken", Epoch: 1 } );
			// a new scene's begin needs no answer
			sdf.Receive( { Type: "begin", Epoch: 2 } );
			expect( sdf.sent ).toHaveLength( 3 );
		},
	);

	it(
		"drops the SDF worker's chunks when physics failed to load",
		async () => {
			SilenceConsole();
			const port = await Start( () => Promise.reject( new Error( "no" ) ) );
			const sdf = new FakePort();

			fakeSelf.Send( {
				type: PhysicsMsg.Init,
				gameLogicPort: port,
				sdfPort: sdf,
				settings: { gravity: [0, -20, 0] },
				fixedTimestepMs: 10,
			} );
			sdf.Receive( { Type: "begin", Epoch: 1 } );
			await flush();
			sdf.Receive( { Type: "begin", Epoch: 2 } );
			expect( World.instances ).toHaveLength( 0 );
			// chunks are still "taken": the SDF worker never waits for them
			sdf.Receive( { Type: "chunks", Epoch: 2 } );
			expect( sdf.sent.at( -1 ) ).toEqual( { Type: "taken", Epoch: 2 } );
		},
	);
} );

describe( "RenderWorker", () => {
	async function Start() {
		const scene = {
			Scene: {}, AssetLoader: {},
			Resize: vi.fn(), SetClearColor: vi.fn(), PoseCamera: vi.fn(),
			Perf: { Take: () => ( { frame: [1] } ), Add: vi.fn() },
			GpuInfo: { renderer: "Fake GPU" },
			Uncap: vi.fn(), Wake: vi.fn(), UseFxaa: vi.fn(),
			loop: null as ( () => void ) | null,
			loopResults: [] as boolean[],
			RunRenderLoop( callback: () => boolean ) {
				this.loop = () => {
					this.loopResults.push( callback() );
				};
			},
		};
		const registry = {
			Spawn: vi.fn(),
			Remove: vi.fn(),
			SetVisible: vi.fn(),
			SetColor: vi.fn(),
			Clear: vi.fn(),
			ApplyTransformBatch: vi.fn(),
			OnGltfLoaded: undefined as ( ( id: number ) => void ) | undefined,
		};
		const created: unknown[][] = [];
		vi.doMock(
			"../Source/Workers/Render/RenderScene",
			() => ( { RenderScene: Object.assign( vi.fn( function ( ...args: unknown[] ) {
				created.push( args ); return scene;
			} ), { WebGl: ( antialias: boolean ) => `webgl, antialias ${ antialias }` } ) } ),
		);
		vi.doMock(
			"../Source/Workers/Render/EntityMeshRegistry",
			() => ( { EntityMeshRegistry: vi.fn( function () {
				return registry;
			} ) } ),
		);
		await import( "../Source/Workers/RenderWorker" );
		return { scene, registry, created };
	}

	it(
		"a resize before init is ignored; after init it reaches the scene; the "
			+ "inspector toggle is a no-op",
		async () => {
			const { scene } = await Start();
			fakeSelf.Send(
				{
					type: RenderMsg.Resize,
					width: 1,
					height: 1,
					devicePixelRatio: 1,
				},
			);
			expect( scene.Resize ).not.toHaveBeenCalled();

			fakeSelf.Send(
				{
					type: RenderMsg.Init,
					canvas: {},
					gameLogicPort: new FakePort(),
					devMode: false,
					width: 800,
					height: 600,
					devicePixelRatio: 2,
				},
			);
			fakeSelf.Send(
				{
					type: RenderMsg.Resize,
					width: 640,
					height: 480,
					devicePixelRatio: 1,
				},
			);
			expect( scene.Resize ).toHaveBeenCalledWith( 640, 480, 1 );
			expect(
				() => fakeSelf.Send(
					{ type: RenderMsg.SetInspectorVisible, visible: true },
				),
			).not.toThrow();
			// the perf harness reads the render thread's samples and GPU here
			const probe = ( globalThis as unknown as {
				__csePerf: { Thread: string; Take(): unknown; Info(): unknown; };
			} ).__csePerf;
			expect( [probe.Thread, probe.Take(), probe.Info()] )
				.toEqual( ["Render", { frame: [1] }, { renderer: "Fake GPU" }] );
		},
	);

	it(
		"on init: builds the scene at the canvas size, says ready, and asks "
			+ "GameLogic for frames - at most two at a time",
		async () => {
			const { scene, created } = await Start();
			const port = new FakePort();
			fakeSelf.Send(
				{
					type: RenderMsg.Init,
					canvas: { id: "c" },
					gameLogicPort: port,
					devMode: false,
					width: 800,
					height: 600,
					devicePixelRatio: 2,
				},
			);
			// FXAA by default: the engine is made without multisampling
			expect( created[0] ).toEqual( [{ id: "c" }, 800, 600, 2, "webgl, antialias false"] );
			expect( port.sent[0] ).toEqual( { type: RenderMsg.Ready } );
			expect( scene.Uncap ).not.toHaveBeenCalled();

			scene.loop!();
			scene.loop!();
			// a third display frame while two requests are still out: no new
			// request
			scene.loop!();
			const requests = ( port.sent as {
				type: RenderMsg;
				frameId?: number;
			}[] ).filter( ( m ) => m.type === RenderMsg.FrameRequest );
			expect( requests.map( ( r ) => r.frameId ) ).toEqual( [1, 2] );
		},
	);


	it( "with uncapped (the page's ?uncapped) it draws without the display's limit", async () => {
		const { scene } = await Start();
		fakeSelf.Send( { type: RenderMsg.Init, canvas: {}, gameLogicPort: new FakePort(), devMode: false, width: 1, height: 1, devicePixelRatio: 1, uncapped: true } );
		expect( scene.Uncap ).toHaveBeenCalled();
	} );

	it( "?aa=off: the engine is made without multisampling", async () => {
		const { created, scene } = await Start();
		fakeSelf.Send( { type: RenderMsg.Init, canvas: {}, gameLogicPort: new FakePort(), devMode: false, width: 1, height: 1, devicePixelRatio: 1, antialias: "off" } );
		expect( created[0]![4] ).toBe( "webgl, antialias false" );
		expect( scene.UseFxaa ).not.toHaveBeenCalled();
	} );

	it( "?aa=msaa: multisampling, no FXAA pass", async () => {
		const { created, scene } = await Start();
		fakeSelf.Send( { type: RenderMsg.Init, canvas: {}, gameLogicPort: new FakePort(), devMode: false, width: 1, height: 1, devicePixelRatio: 1, antialias: "msaa" } );
		expect( created[0]![4] ).toBe( "webgl, antialias true" );
		expect( scene.UseFxaa ).not.toHaveBeenCalled();
	} );

	it( "?aa=fxaa: no multisampling, an FXAA pass instead", async () => {
		const { created, scene } = await Start();
		fakeSelf.Send( { type: RenderMsg.Init, canvas: {}, gameLogicPort: new FakePort(), devMode: false, width: 1, height: 1, devicePixelRatio: 1, antialias: "fxaa" } );
		expect( created[0]![4] ).toBe( "webgl, antialias false" );
		expect( scene.UseFxaa ).toHaveBeenCalled();
	} );

	it(
		"applies a received frame on the next display frame (transforms + "
			+ "camera), then asks for another",
		async () => {
			const { scene, registry } = await Start();
			const port = new FakePort();
			fakeSelf.Send(
				{
					type: RenderMsg.Init,
					canvas: {},
					gameLogicPort: port,
					devMode: false,
					width: 1,
					height: 1,
					devicePixelRatio: 1,
				},
			);
			scene.loop!();
			scene.loop!();

			const buffer = new ArrayBuffer( 8 );
			port.Receive(
				{
					operation: RendOpType.Frame,
					frameId: 1,
					buffer,
					entityCount: 1,
					camera: { transform: [0, 0, 0, 0, 0, 0, 1], fov: 1 },
				},
			);
			scene.loop!();
			expect( registry.ApplyTransformBatch )
				.toHaveBeenCalledWith( buffer, 1 );
			expect( scene.PoseCamera ).toHaveBeenCalledTimes( 1 );
			expect(
				( port.sent as { type: RenderMsg; }[] ).filter(
					( m ) => m.type === RenderMsg.FrameRequest,
				),
			).toHaveLength( 3 );

			// no camera in this scene
			port.Receive(
				{
					operation: RendOpType.Frame,
					frameId: 2,
					buffer,
					entityCount: 1,
					camera: null,
				},
			);
			scene.loop!();
			expect( registry.ApplyTransformBatch ).toHaveBeenCalledTimes( 2 );
			expect( scene.PoseCamera ).toHaveBeenCalledTimes( 1 );
			// the loop learns when a frame brings a new game state (fps counts those)
			expect( scene.loopResults ).toEqual( [false, false, true, true] );
		},
	);

	it(
		"forwards scene edits to the mesh registry and the scene, and answers "
			+ "sync markers",
		async () => {
			const { scene, registry } = await Start();
			const port = new FakePort();
			fakeSelf.Send(
				{
					type: RenderMsg.Init,
					canvas: {},
					gameLogicPort: port,
					devMode: false,
					width: 1,
					height: 1,
					devicePixelRatio: 1,
				},
			);

			port.Receive(
				{
					operation: RendOpType.SpawnEntity,
					entityId: 1,
					mesh: { shape: 0 },
					transform: [0, 0, 0, 0, 0, 0, 1],
					color: [1, 0, 0],
				},
			);
			port.Receive(
				{
					operation: RendOpType.SetVisible,
					entityId: 1,
					visible: false,
				},
			);
			port.Receive(
				{
					operation: RendOpType.SetColor,
					entityId: 1,
					color: [0, 1, 0],
				},
			);
			port.Receive( { operation: RendOpType.RemoveEntity, entityId: 1 } );
			port.Receive(
				{
					operation: RendOpType.SetEnvironment,
					clearColor: [0.1, 0.2, 0.3],
				},
			);
			port.Receive( { operation: RendOpType.Sync, token: 9 } );

			expect( registry.Spawn )
				.toHaveBeenCalledWith(
					1,
					{ shape: 0 },
					[0, 0, 0, 0, 0, 0, 1],
					[1, 0, 0],
				);
			expect( registry.SetVisible ).toHaveBeenCalledWith( 1, false );
			expect( registry.SetColor ).toHaveBeenCalledWith( 1, [0, 1, 0] );
			expect( registry.Remove ).toHaveBeenCalledWith( 1 );
			expect( scene.SetClearColor ).toHaveBeenCalledWith( 0.1, 0.2, 0.3 );
			expect( port.sent )
				.toContainEqual( { type: RenderMsg.SyncAck, token: 9 } );
		},
	);

	it(
		"clearing the scene drops a frame that has not been shown yet; a glTF "
			+ "arrival is reported",
		async () => {
			const { scene, registry } = await Start();
			const port = new FakePort();
			fakeSelf.Send(
				{
					type: RenderMsg.Init,
					canvas: {},
					gameLogicPort: port,
					devMode: false,
					width: 1,
					height: 1,
					devicePixelRatio: 1,
				},
			);

			port.Receive(
				{
					operation: RendOpType.Frame,
					frameId: 1,
					buffer: new ArrayBuffer( 8 ),
					entityCount: 1,
					camera: null,
				},
			);
			port.Receive( { operation: RendOpType.ClearScene } );
			scene.loop!();
			expect( registry.Clear ).toHaveBeenCalled();
			expect( registry.ApplyTransformBatch ).not.toHaveBeenCalled();

			registry.OnGltfLoaded!( 42 );
			expect( port.sent )
				.toContainEqual(
					{ type: RenderMsg.AssetLoaded, entityId: 42 },
				);
		},
	);
	it( "draws the SDF worker's chunks and wakes the loop for them", async () => {
		const handled: unknown[] = [];
		const dynamic: Float32Array[] = [];
		const options: unknown[] = [];

		vi.doMock( "@cse/sdf/render", () => ( {
			SdfRenderReceiver: class {
				public constructor( _scene: unknown, given: unknown ) {
					options.push( given );
				}

				public Handle( message: { changed: boolean; } ): boolean {
					handled.push( message );
					return message.changed;
				}

				public SetDynamic( packed: Float32Array ): boolean {
					dynamic.push( packed );
					return true;
				}
			},
		} ) );

		const { scene } = await Start();
		const sdfPort = new FakePort();
		const gameLogicPort = new FakePort();

		fakeSelf.Send( {
			type: RenderMsg.Init,
			canvas: {},
			gameLogicPort,
			sdfPort,
			devMode: false,
			width: 800,
			height: 600,
			devicePixelRatio: 1,
			shadows: false,
		} );
		fakeSelf.Send( {
			type: RenderMsg.Init,
			canvas: {},
			gameLogicPort: new FakePort(),
			sdfPort: new FakePort(),
			devMode: false,
			width: 800,
			height: 600,
			devicePixelRatio: 1,
			sdfOcclusion: false,
		} );
		// as the page says, else on
		expect( options ).toEqual( [
			{ Shadows: false, Occlusion: true },
			{ Shadows: true, Occlusion: false },
		] );
		scene.Wake.mockClear();
		sdfPort.Receive( { changed: false } );
		expect( scene.Wake ).not.toHaveBeenCalled();
		sdfPort.Receive( { changed: true } );
		expect( scene.Wake ).toHaveBeenCalledTimes( 1 );
		expect( handled ).toHaveLength( 2 );

		// a frame's dynamic edits go to the SDF world at once
		const packed = new Float32Array( 16 );
		const frame = {
			operation: RendOpType.Frame,
			frameId: 1,
			buffer: new ArrayBuffer( 0 ),
			entityCount: 0,
			camera: null,
		};

		gameLogicPort.Receive( { ...frame, sdfDynamic: null } );
		expect( dynamic ).toEqual( [] );
		gameLogicPort.Receive( { ...frame, frameId: 2, sdfDynamic: packed } );
		expect( dynamic ).toEqual( [ packed ] );
	} );

	it( "ignores dynamic edits without an SDF worker", async () => {
		const { registry } = await Start();
		const gameLogicPort = new FakePort();

		fakeSelf.Send( {
			type: RenderMsg.Init,
			canvas: {},
			gameLogicPort,
			devMode: false,
			width: 1,
			height: 1,
			devicePixelRatio: 1,
			sdfOcclusion: false,
		} );
		gameLogicPort.Receive( {
			operation: RendOpType.Frame,
			frameId: 1,
			buffer: new ArrayBuffer( 0 ),
			entityCount: 0,
			camera: null,
			sdfDynamic: new Float32Array( 16 ),
		} );
		expect( registry.ApplyTransformBatch ).not.toHaveBeenCalled();
	} );
} );

describe( "PhysicsWasmLoader", () => {
	let directory = "";
	beforeEach( () => {
		vi.useRealTimers();
		directory = mkdtempSync( join( tmpdir(), "dotnet-" ) );
	} );
	afterEach( () => rmSync( directory, { recursive: true, force: true } ) );

	/**
	 * A fake dotnet.js on disk: hands its resource loader to the test and
	 * exposes a bridge object.
	 */
	function FakeDotnet(): string {
		const file = join( directory, "dotnet.mjs" );
		writeFileSync( file, `
			export const dotnet = {
				withResourceLoader(loader) {
					globalThis.__resourceLoader = loader;
					return { create: async () => ({
						getConfig: () => ({ mainAssemblyName: "PhysicsBridge" }),
						getAssemblyExports: async (name) => ({ Physics: { Wasm: { PhysicsBridge: { assembly: name } } } }),
					}) };
				},
			};
		` );
		return file;
	}

	type Loader = ( type: string, name: string, uri: string ) => Promise<
		Response | undefined
	> | undefined;
	const loaderOf = (): Loader => ( globalThis as unknown as {
		__resourceLoader: Loader;
	} ).__resourceLoader;

	it(
		"boots the runtime from the given dotnet.js and returns the "
			+ "PhysicsBridge exports of the main assembly",
		async () => {
			const {
				PhysicsWasmLoader,
			} = await import( "../Source/Workers/Physics/PhysicsWasmLoader" );
			const bridge = await new PhysicsWasmLoader( FakeDotnet() ).Load();
			expect( bridge ).toEqual( { assembly: "PhysicsBridge" } );
		},
	);

	it(
		"defaults to /physics-wasm/_framework/dotnet.js - where the build puts "
			+ "the runtime",
		async () => {
			const {
				PhysicsWasmLoader,
			} = await import( "../Source/Workers/Physics/PhysicsWasmLoader" );
			expect(
				( new PhysicsWasmLoader() as unknown as {
					_dotnetJsUrl: string;
				} )._dotnetJsUrl,
			).toBe( "/physics-wasm/_framework/dotnet.js" );
		},
	);

	it( "without WebAssembly SIMD it loads the fallback build (FastMath instead of SIMD), in dev and in a built site", async () => {
		const { PhysicsWasmLoader, SupportsWasmSimd } = await import( "../Source/Workers/Physics/PhysicsWasmLoader" );
		const url = () => ( new PhysicsWasmLoader() as unknown as { _dotnetJsUrl: string; } )._dotnetJsUrl;
		expect( SupportsWasmSimd() ).toBe( true ); // Node's V8 has it
		expect( SupportsWasmSimd( { validate: () => false } ) ).toBe( false );
		vi.stubGlobal( "WebAssembly", undefined ); // no WebAssembly at all
		expect( SupportsWasmSimd() ).toBe( false );
		vi.stubGlobal( "WebAssembly", { validate: () => false } );
		expect( url() ).toBe( "/physics-wasm-nosimd/_framework/dotnet.js" );
		vi.stubGlobal( "__DEV__", false );
		vi.stubGlobal( "self", { location: { href: "https://host/run/assets/PhysicsWorker-abc.js" } } );
		expect( url() ).toBe( "https://host/run/physics-wasm-nosimd/_framework/dotnet.js" );
	} );

	it( "in a built site, finds the runtime next to the worker's assets folder, so the site can live under any path", async () => {
		const { PhysicsWasmLoader } = await import( "../Source/Workers/Physics/PhysicsWasmLoader" );
		const url = () => ( new PhysicsWasmLoader() as unknown as { _dotnetJsUrl: string; } )._dotnetJsUrl;

		vi.stubGlobal( "__DEV__", false );
		vi.stubGlobal( "self", { location: { href: "https://host/games/run/assets/PhysicsWorker-abc.js" } } );
		expect( url() ).toBe( "https://host/games/run/physics-wasm/_framework/dotnet.js" );
		// not served from an assets folder: the root
		vi.stubGlobal( "self", { location: { href: "https://host/index.html" } } );
		expect( url() ).toBe( "/physics-wasm/_framework/dotnet.js" );
		// no location at all (a test or an odd host)
		vi.stubGlobal( "self", {} );
		expect( url() ).toBe( "/physics-wasm/_framework/dotnet.js" );
		vi.stubGlobal( "self", undefined );
		expect( url() ).toBe( "/physics-wasm/_framework/dotnet.js" );
		// a bundle that never defined __DEV__ counts as a build
		vi.stubGlobal( "__DEV__", undefined );
		vi.stubGlobal( "self", { location: { href: "https://host/assets/w.js" } } );
		expect( url() ).toBe( "https://host/physics-wasm/_framework/dotnet.js" );
	} );

	describe( "resource loader", () => {
		async function Loader(): Promise<Loader> {
			const {
				PhysicsWasmLoader,
			} = await import( "../Source/Workers/Physics/PhysicsWasmLoader" );
			await new PhysicsWasmLoader( FakeDotnet() ).Load();
			return loaderOf();
		}
		const wasm = new Uint8Array(
			[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00],
		);

		it( "leaves everything that is not .wasm to dotnet.js", async () => {
			const loader = await Loader();
			expect(
				loader( "assembly", "x.dll", "/physics-wasm/_framework/x.dll" ),
			).toBeUndefined();
		} );

		it(
			"fetches the .wasm.gz instead, unzips it, and serves it as "
				+ "application/wasm",
			async () => {
				const loader = await Loader();
				const fetchMock = vi.fn(
					() => Promise.resolve( new Response( gzipSync( wasm ) ) ),
				);
				vi.stubGlobal( "fetch", fetchMock );

				const response = ( await loader(
					"dotnetwasm",
					"dotnet.native.wasm",
					"/f/dotnet.native.wasm",
				) )!;
				expect( fetchMock )
					.toHaveBeenCalledWith( "/f/dotnet.native.wasm.gz" );
				expect( response.headers.get( "Content-Type" ) )
					.toBe( "application/wasm" );
				expect( response.headers.get( "Content-Length" ) ).toBe( "8" );
				expect( [...new Uint8Array( await response.arrayBuffer() )] )
					.toEqual( [...wasm] );
			},
		);

		it(
			"accepts bytes the server already decompressed (Content-Encoding: "
				+ "gzip)",
			async () => {
				const loader = await Loader();
				vi.stubGlobal(
					"fetch",
					vi.fn( () => Promise.resolve( new Response( wasm ) ) ),
				);
				const response = ( await loader(
					"dotnetwasm",
					"dotnet.native.wasm",
					"/f/dotnet.native.wasm",
				) )!;
				expect( [...new Uint8Array( await response.arrayBuffer() )] )
					.toEqual( [...wasm] );
			},
		);

		it( "explains a missing .wasm.gz", async () => {
			const loader = await Loader();
			vi.stubGlobal(
				"fetch",
				vi.fn(
					() => Promise.resolve(
						new Response(
							"nope",
							{ status: 404, statusText: "Not Found" },
						),
					),
				),
			);
			await expect(
				loader(
					"dotnetwasm",
					"dotnet.native.wasm",
					"/f/dotnet.native.wasm",
				),
			).rejects
				.toThrow(
					/Missing gzip asset: \/f\/dotnet\.native\.wasm\.gz \(404 Not Found\)/,
				);
		} );
	} );
} );

describe( "SdfWorker", () => {
	async function Start() {
		const hosts: Array<{
			ports: {
				ToGameLogic( m: unknown ): void;
				ToRender( m: unknown, t: unknown[] ): void;
				ToPhysics( m: unknown, t: unknown[] ): void;
			};
			options: { Spawn: unknown; Fetch( url: string ): Promise<ArrayBuffer>; };
			gameLogic: unknown[];
			physics: unknown[];
		}> = [];

		vi.doMock( "@cse/sdf", () => ( {
			CreateMeshWorker: "spawn",
			SdfWorkerHost: class {
				public gameLogic: unknown[] = [];

				public physics: unknown[] = [];

				public constructor( public ports: unknown, public options: unknown ) {
					hosts.push( this as never );
				}

				public HandleGameLogic( message: { fail?: boolean; } ): Promise<void> {
					this.gameLogic.push( message );
					return message.fail ? Promise.reject( new Error( "broken" ) ) : Promise.resolve();
				}

				public HandlePhysics( message: unknown ): void {
					this.physics.push( message );
				}
			},
		} ) );
		await import( "../Source/Workers/SdfWorker" );

		const ports = {
			gameLogicPort: new FakePort(),
			renderPort: new FakePort(),
			physicsPort: new FakePort(),
		};

		fakeSelf.Send( { type: SdfMsg.Init, ...ports, baseUrl: "https://game.test/play/" } );
		return { host: hosts[0]!, ...ports };
	}

	it( "wires its ports to the host and the host's messages to its ports", async () => {
		const { host, gameLogicPort, renderPort, physicsPort } = await Start();

		expect( host.options.Spawn ).toBe( "spawn" );
		gameLogicPort.Receive( { Type: "tick" } );
		physicsPort.Receive( { Type: "reset" } );
		expect( host.gameLogic ).toEqual( [ { Type: "tick" } ] );
		expect( host.physics ).toEqual( [ { Type: "reset" } ] );
		host.ports.ToGameLogic( { Type: "loaded" } );
		host.ports.ToRender( { Type: "begin" }, [] );
		host.ports.ToPhysics( { Type: "begin" }, [] );
		expect( gameLogicPort.sent ).toEqual( [ { Type: "loaded" } ] );
		expect( renderPort.sent ).toEqual( [ { Type: "begin" } ] );
		expect( physicsPort.sent ).toEqual( [ { Type: "begin" } ] );

		// a failure is logged, not thrown at the port
		const { Logger } = await import( "../Source/Logging/Logger" );
		const logged = vi.spyOn( Logger, "LogException" )
			.mockImplementation( () => undefined );

		gameLogicPort.Receive( { fail: true } );
		await flush();
		expect( logged ).toHaveBeenCalledWith( expect.any( Error ), "[SdfWorker]" );
	} );

	it( "fetches baked bases next to the game", async () => {
		const { host } = await Start();
		const fetch = vi.fn( async ( url: URL ) => (
			url.pathname.endsWith( "level.sdf" )
				? { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer( 3 ) }
				: { ok: false, status: 404 }
		) );

		vi.stubGlobal( "fetch", fetch );
		expect( ( await host.options.Fetch( "levels/level.sdf" ) ).byteLength ).toBe( 3 );
		expect( fetch.mock.calls[0]![0].href ).toBe( "https://game.test/play/levels/level.sdf" );
		await expect( host.options.Fetch( "missing.sdf" ) ).rejects.toThrow( "missing.sdf: HTTP 404" );
	} );
} );
