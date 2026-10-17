// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { DataStream } from "@cse/datastream";
import {
	ICounter, IClock, IGreeter,
} from "./TestGame/Contracts/Game.contract.ts";
import {
	Hook, LoadScriptsWasm, LogLevel, OverlapEvent, ScriptRuntime,
	type ScriptBackend, type ScriptHostWorld,
} from "../Source/Index.ts";

// TestGame (C# components) built with the engine's game SDK:
// `dotnet build Tests/TestGame` (CI does it first).
const Bundle = fileURLToPath( new URL(
	"./TestGame/Binaries/Scripts/Debug/net10.0/browser-wasm/AppBundle"
		+ "/_framework/dotnet.js",
	import.meta.url,
) );

/**
 * A world of entities as plain poses, recording what the runtime does to it.
 */
class TestWorld implements ScriptHostWorld {
	public readonly Poses = new Map<number, number[]>();

	public readonly Toasts: string[] = [];

	public readonly Hud = new Map<string, string>();

	public readonly Logs: [LogLevel, string][] = [];

	public readonly Failures: [string, string][] = [];

	public readonly Destroyed: number[] = [];

	public ReadTransform(
		entity: number,
		out: Float64Array,
		offset: number,
	): boolean {
		const pose = this.Poses.get( entity );

		if ( !pose ) {
			return false;
		}
		out.set( pose, offset );
		return true;
	}

	public WriteTransform(
		entity: number,
		pose: Float64Array,
		offset: number,
	): void {
		this.Poses.set( entity, [...pose.subarray( offset, offset + 7 )] );
	}

	public DestroyEntity( entity: number ): void {
		this.Destroyed.push( entity );
	}

	public Toast( text: string ): void {
		this.Toasts.push( text );
	}

	public SetHud( key: string, text: string ): void {
		this.Hud.set( key, text );
	}

	public Log( level: LogLevel, text: string ): void {
		this.Logs.push( [level, text] );
	}

	public ComponentFailed( component: string, message: string ): void {
		this.Failures.push( [component, message] );
	}
}

const Phase = { Elapsed: 1, FrameCount: 1, PhysicsStepCount: 1 };

describe.skipIf( !existsSync( Bundle ) )(
	"C# components on the real .NET runtime",
	() => {
		let backend: ScriptBackend;

		beforeAll( async () => {
			backend = await LoadScriptsWasm( pathToFileURL( Bundle ).href );
		}, 60_000 );

		it( "finds the game's components", () => {
			expect( backend.Names )
				.toEqual(
					expect.arrayContaining(
						["Mover", "Echo", "TestGame.Mover"],
					),
				);
		} );

		it(
			"creates a component with its fields and its entity's transform, "
				+ "runs "
			+ "it, sends the moves back",
			() => {
				const world = new TestWorld();
				world.Poses.set( 7, [2, 0, 0, 0, 0, 0, 1] );
				const scripts = new ScriptRuntime(
					backend,
					new DataStream(),
					world,
				);
				const mover = scripts.Create(
					7,
					"Cart",
					"Mover",
					{ Speed: 4, Greeting: "hi" },
				);
				scripts.Awake( mover );
				scripts.Start( mover );
				scripts.RunHook( Hook.Update, 0.5, Phase );

				// Awake saw the transform
				expect( world.Logs )
					.toContainEqual( [LogLevel.Info, "hi from Cart at 2"] );
				expect( world.Poses.get( 7 )![0] ).toBeCloseTo( 4 );
				scripts.RunHook( Hook.UIUpdate, 0.5, Phase );
				expect( world.Hud.get( "x" ) ).toBe( "4.00" );

				scripts.RunHook( Hook.InputUpdate, 0.1, {
					...Phase,
					Input: {
						Down: ["Jump"],
						JustPressed: ["Jump"],
						Values: { Turn: Math.PI },
						Move: [0, 0],
					},
				} );
				// rotated half a turn around Y
				expect( world.Poses.get( 7 )![4] ).toBeCloseTo( 1 );

				scripts.Event( mover, OverlapEvent.TriggerEnter, 9, "Gate" );
				scripts.SetEnabled( mover, false );
				// disabled: doesn't move
				scripts.RunHook( Hook.Update, 0.5, Phase );
				expect( world.Toasts ).toEqual( ["Cart entered Gate"] );
				expect( world.Poses.get( 7 )![0] ).toBeCloseTo( 4 );
			},
		);

		it(
			"talks with TypeScript through the DataStream, as plain data both "
				+ "ways",
			() => {
				const world = new TestWorld();
				world.Poses.set( 1, [0, 0, 0, 0, 0, 0, 1] );
				const stream = new DataStream();
				const scripts = new ScriptRuntime( backend, stream, world );
				const echo = scripts.Create( 1, "Bell", "Echo", null );
				scripts.Start( echo );
				const pongs: unknown[] = [];
				stream.Subscribe( "Pong", ( pong ) => pongs.push( pong ) );
				// C# subscribed to Ping; TypeScript to Pong
				scripts.RunHook( Hook.Update, 0.016, Phase );

				stream.Publish( "Ping", { N: 41 } );
				scripts.RunHook( Hook.Update, 0.016, Phase );
				expect( pongs ).toEqual( [{ N: 42, From: "Bell" }] );
			},
		);

		it(
			"reports a failing component and an unknown class; destroys what "
				+ "C# "
			+ "asks for",
			() => {
				const world = new TestWorld();
				world.Poses.set( 3, [0, 0, 0, 0, 0, 0, 1] );
				const scripts = new ScriptRuntime(
					backend,
					new DataStream(),
					world,
				);
				const faulty = scripts.Create( 3, "Bad", "Faulty", null );
				const ghost = scripts.Create(
					3,
					"Bad",
					"NoSuchComponent",
					null,
				);
				// an entity without a transform yet
				const fragile = scripts.Create( 4, "Vase", "Fragile", null );
				scripts.RunHook( Hook.PhysicsUpdate, 0.02, Phase );
				expect( world.Failures )
					.toContainEqual(
						[
							"Faulty on \"Bad\"",
							"InvalidOperationException: broken on purpose",
						],
					);
				expect(
					world.Failures.some(
						( [name, message] ) => (
							name === "NoSuchComponent on \"Bad\""
					&& message.includes( "NoSuchComponent" )
						),
					),
				).toBe( true );

				scripts.Event( fragile, OverlapEvent.CollisionEnter, 3, "Bad" );
				scripts.RunHook( Hook.PhysicsUpdate, 0.02, Phase );
				expect( world.Destroyed ).toEqual( [4] );
				scripts.Destroy( fragile, 4 );
				scripts.Destroy( faulty, 3 );
				scripts.Destroy( ghost, 3 );
				scripts.RunHook( Hook.PhysicsUpdate, 0.02, Phase );
				expect( world.Logs )
					.toContainEqual( [LogLevel.Warning, "Vase broke"] );
				expect( scripts.Count ).toBe( 0 );
			},
		);

		it(
			"calls across through contracts both ways: TypeScript a C# "
				+ "component and service, C# a TypeScript implementation",
			() => {
				const world = new TestWorld();
				world.Poses.set( 5, [1, 2, 3, 0, 0, 0, 1] );
				const scripts = new ScriptRuntime(
					backend,
					new DataStream(),
					world,
				);
				const greeted: [string, number[]][] = [];
				const greeter: IGreeter = {
					Greet: ( name, at ) => {
						greeted.push( [name, [at.X, at.Y, at.Z]] );
						return `hello ${ name }`;
					},
				};
				scripts.Bridge.Resolver = ( contract ) => (
					contract === IGreeter ? greeter : null
				);
				const counter = scripts.Create( 5, "Abacus", "Counter", null );
				scripts.Awake( counter );

				// made this frame, still queued: the call sends the queue first
				const remote = scripts.Bridge.CSharp( ICounter, 5 );
				expect( remote.Add( 2 ) ).toBe( 2 );
				expect( remote.Add( 3 ) ).toBe( 5 );
				// [Inject]ed from the C# installer's binding
				expect( remote.Label() ).toBe( "Abacus: 5 at tick 1" );
				expect( scripts.Bridge.CSharp( IClock ).Ticks() ).toBe( 2 );

				// [FromTypeScript]: C# calls the TypeScript greeter
				scripts.RunHook( Hook.Update, 0.016, Phase );
				expect( greeted ).toEqual( [["Abacus", [1, 2, 3]]] );
				expect( world.Toasts ).toEqual( ["hello Abacus"] );

				expect( () => scripts.Bridge.CSharp( ICounter, 99 ).Add( 1 ) )
					.toThrow( "C# TestGame.ICounter: nothing in C# implements "
						+ "TestGame.ICounter on entity 99" );
				scripts.Bridge.Resolver = () => null;
				scripts.RunHook( Hook.Update, 0.016, Phase );
				expect( world.Failures.at( -1 ) ).toEqual( [
					"Counter on \"Abacus\"",
					"BridgeException: TypeScript TestGame.IGreeter: nothing in "
						+ "TypeScript implements TestGame.IGreeter on entity 5 "
						+ "(a component with @Implements, or a binding in an "
						+ "installer)",
				] );
			},
		);
	},
);
