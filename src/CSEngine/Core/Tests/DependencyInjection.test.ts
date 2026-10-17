// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import {
	Contract, Inject, Installer, type ContainerBuilder,
} from "@cse/di";
import { Harness } from "./Harness";
import { Component } from "../Source/Engine/Core/Component";
import type { EngineContext } from "../Source/Engine/Core/EngineContext";
import {
	Comp,
	Ent,
	type SceneManifest,
} from "../Source/Engine/Core/EntityManifest";
import {
	IAudioSubsystem, IDataAssets, IDataStream, IInputSubsystem,
	IPhysicsSubsystem,
	IRenderSubsystem, IScenes, ISettingsSubsystem, IStorage, ITime,
	IUiSubsystem, IWorld,
} from "../Source/Engine/DI/Contracts";
import { SceneRegistry } from "../Source/Engine/Scenes/SceneRegistry";
import { Logger } from "../Source/Logging/Logger";

interface IScore {
	Points: number;
}
const IScore = Contract<IScore>( "IScore" );

interface IRoom {
	readonly Name: string;
	Dispose(): void;
}
const IRoom = Contract<IRoom>( "IRoom" );

const Disposed: string[] = [];

class GameInstaller extends Installer<EngineContext> {
	public InstallBindings( builder: ContainerBuilder ): void {
		builder.Bind( IScore ).FromFactory( () => ( { Points: 0 } ) )
			.AsSingle();
	}
}

const RoomInstaller = ( name: string ): Installer<EngineContext> => (
	new class extends Installer<EngineContext> {
		public InstallBindings( builder: ContainerBuilder ): void {
			builder.Bind( IRoom )
				.FromFactory(
					() => ( {
						Name: name,
						Dispose: () => Disposed.push( name ),
					} ),
				)
				.AsSingle();
		}
	}()
);

/** A component that reaches everything through contracts. */
class Scorer extends Component {
	@Inject( IInputSubsystem ) public Input!: IInputSubsystem;

	@Inject( IUiSubsystem ) public Ui!: IUiSubsystem;

	@Inject( IScore ) public Score!: IScore;

	@Inject( IRoom ) public Room!: IRoom;

	public SawAtAwake = "";

	public override Awake(): void {
		this.SawAtAwake = `${ this.Room.Name } ${ this.Score.Points }`;
		this.Score.Points++;
	}
}

class NeedsNothingBound extends Component {
	@Inject( Contract<unknown>( "IUnbound" ) ) public Missing!: unknown;

	public Woke = false;

	public override Awake(): void {
		this.Woke = true;
	}
}

const Scene = (
	id: string,
	room: string,
	extra: SceneManifest["entities"] = [],
): SceneManifest => ( {
	id,
	name: id,
	description: "",
	installer: RoomInstaller( room ),
	entities: [Ent( "Scorer", [Comp( Scorer )] ), ...extra],
} );

async function Boot( registry: SceneRegistry ): Promise<Harness> {
	const harness = new Harness(
		registry,
		undefined,
		undefined,
		undefined,
		undefined,
		null,
		[new GameInstaller()],
	);
	await harness.BootToScene();
	return harness;
}

describe( "DI in the game: @Inject fields are filled before Awake", () => {
	it(
		"from the engine's subsystems, the game's installer and the scene's "
			+ "installer",
		async () => {
			const harness = await Boot(
				new SceneRegistry().Register( Scene( "a", "Hall" ) ),
			);
			const context = harness.runtime.Context;
			const scorer = context.World.FindByName( "Scorer" )!
				.GetComponent( Scorer )!;
			expect( scorer.SawAtAwake ).toBe( "Hall 0" );
			expect( scorer.Input ).toBe( context.Input );
			expect( scorer.Ui ).toBe( context.Ui );
			expect( scorer.Score ).toBe( context.Container!.Resolve( IScore ) );
		},
	);

	it(
		"the engine's installer binds every subsystem to its contract",
		async () => {
			const harness = await Boot(
				new SceneRegistry().Register( Scene( "a", "Hall" ) ),
			);
			const context = harness.runtime.Context;
			const container = context.Container!;
			expect( container.Resolve( IPhysicsSubsystem ) )
				.toBe( context.Physics );
			expect( container.Resolve( IRenderSubsystem ) )
				.toBe( context.Render );
			expect( container.Resolve( IAudioSubsystem ) )
				.toBe( context.Audio );
			expect( container.Resolve( ISettingsSubsystem ) )
				.toBe( context.Settings );
			expect( container.Resolve( IStorage ) ).toBe( context.Storage );
			expect( container.Resolve( IDataAssets ) ).toBe( context.Data );
			expect( container.Resolve( IScenes ) ).toBe( context.Scenes );
			expect( container.Resolve( IWorld ) ).toBe( context.World );
			expect( container.Resolve( ITime ) ).toBe( context.Time );
			expect( container.Resolve( IDataStream ) ).toBe( context.Stream );
		},
	);

	it(
		"the game's bindings outlive scenes; a scene's go (and are disposed) "
			+ "with it",
		async () => {
			Disposed.length = 0;
			const harness = await Boot(
				new SceneRegistry().Register( Scene( "a", "Hall" ) )
					.Register( Scene( "b", "Cellar" ) ),
			);
			const context = harness.runtime.Context;
			void context.Scenes.Load( "b" );
			await harness.Pump();
			const scorer = context.World.FindByName( "Scorer" )!
				.GetComponent( Scorer )!;
			// the game's score went on counting; the room is the new scene's
			expect( scorer.SawAtAwake ).toBe( "Cellar 1" );
			expect( Disposed ).toEqual( ["Hall"] );
		},
	);

	it(
		"a scene without an installer injects from the game's container",
		async () => {
			const harness = await Boot( new SceneRegistry().Register( {
				id: "plain", name: "plain", description: "", entities: [],
			} ) );
			expect(
				harness.runtime.Context.Container!.Resolve( IScore ).Points,
			)
				.toBe( 0 );
			expect( harness.runtime.Context.Container!.Has( IRoom ) )
				.toBe( false );
		},
	);

	it(
		"a field nothing is bound to is reported, and the component still runs",
		async () => {
			const exceptions = vi.spyOn( Logger, "LogException" )
				.mockImplementation( () => {
				} );
			const harness = await Boot( new SceneRegistry().Register(
				Scene(
					"a",
					"Hall",
					[Ent( "Lonely", [Comp( NeedsNothingBound )] )],
				),
			) );
			const lonely = harness.runtime.Context.World.FindByName( "Lonely" )!
				.GetComponent( NeedsNothingBound )!;
			expect( lonely.Woke ).toBe( true );
			expect( exceptions ).toHaveBeenCalledWith(
				expect.objectContaining(
					{
						message:
						"NeedsNothingBound.Missing needs IUnbound, and nothing "
							+ "is bound to it",
					},
				),
				"[DI] NeedsNothingBound on \"Lonely\":",
			);
		},
	);
} );
