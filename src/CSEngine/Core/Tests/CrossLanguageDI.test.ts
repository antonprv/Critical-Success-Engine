// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { afterEach, describe, expect, it, vi } from "vitest";
import { Decode, Encode } from "@cse/datastream";
import { Inject, Installer, type ContainerBuilder } from "@cse/di";
import {
	FromCSharp, Implements, NoEntity, type ScriptBackend,
} from "@cse/scripting";
import { Harness } from "./Harness";
import {
	Comp,
	Ent,
	type SceneManifest,
} from "../Source/Engine/Core/EntityManifest";
import { SceneRegistry } from "../Source/Engine/Scenes/SceneRegistry";
import { Component } from "../Source/Engine/Core/Component";
import { Logger } from "../Source/Logging/Logger";
import type { EngineContext } from "../Source/Engine/Core/EngineContext";
import {
	IArena, IEmpty, type Hit,
} from "../../Modules/Scripting/Tests/Contracts/Arena.contract.ts";
import type {
	Place,
	Team,
} from "../../Modules/Scripting/Tests/Contracts/Shared/Geometry.contract.ts";

/**
 * The .NET side played by the test: answers calls, keeps the handler of C#'s.
 */
class FakeHost implements ScriptBackend {
	public readonly Names = [];

	public readonly Calls: unknown[] = [];

	public Answer: unknown = 7;

	public ServeCSharp: ( ( request: Uint8Array ) => Uint8Array ) | null = null;

	public Run(): Uint8Array {
		return Encode(
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
	}

	public Call( request: Uint8Array ): Uint8Array {
		this.Calls.push( Decode( request ) );
		return Encode( [true, this.Answer] );
	}

	public Serve( handler: ( request: Uint8Array ) => Uint8Array ): void {
		this.ServeCSharp = handler;
	}

	/** C# calling a contract method on the TypeScript side. */
	public Ask(
		entity: number,
		method: number,
		args: unknown[] = [],
	): unknown {
		return Decode(
			this.ServeCSharp!(
				Encode( ["Sample.IArena", entity, method, args] ),
			),
		);
	}
}

/** A TypeScript component that uses the C# implementation on its entity. */
class Scoreboard extends Component {
	@FromCSharp( IArena ) public Arena!: IArena;
}

/** A TypeScript component C# reaches on its entity ([FromTypeScript] there). */
@Implements( IArena )
class Pit extends Component implements IArena {
	public Points = 0;

	public Add( points: number ): void {
		this.Points += points;
	}

	public Total(): number {
		return this.Points;
	}

	public Echo( hit: Hit ): Hit {
		return hit;
	}

	public Find( _name: string | null, _team: Team ): Place | null {
		return null;
	}

	public Count(): number[] {
		return [];
	}

	public Fail( message: string ): void {
		throw new Error( message );
	}
}

/** The game's service, implemented in C#, bound for TypeScript's @Inject. */
class ArenaInstaller extends Installer<EngineContext> {
	public InstallBindings( builder: ContainerBuilder ): void {
		builder.Bind( IArena ).FromCSharp();
		builder.BindInstance( IEmpty, {} );
	}
}

class Referee extends Component {
	@Inject( IArena ) public Arena!: IArena;
}

const Scene: SceneManifest = {
	id: "bridge",
	name: "Bridge",
	description: "",
	entities: [
		Ent( "Board", [Comp( Scoreboard ), Comp( Referee )] ),
		Ent( "Pit", [Comp( Pit )] ),
	],
};

async function Boot( host: FakeHost | null ): Promise<Harness> {
	const harness = new Harness(
		new SceneRegistry().Register( Scene ),
		undefined,
		undefined,
		undefined,
		undefined,
		host ? async () => host : null,
		[new ArenaInstaller()],
	);
	await harness.BootToScene();
	return harness;
}

afterEach( () => {
	vi.restoreAllMocks();
} );

describe( "DI across languages", () => {
	it(
		"@FromCSharp reaches the C# implementation on the component's entity; "
			+ "@Inject of a FromCSharp binding, the C# container's",
		async () => {
			const host = new FakeHost();
			const harness = await Boot( host );
			const board = harness.runtime.Context.World.FindByName( "Board" )!;

			expect( board.GetComponent( Scoreboard )!.Arena.Total() ).toBe( 7 );
			expect( board.GetComponent( Referee )!.Arena.Total() ).toBe( 7 );
			expect( host.Calls ).toEqual( [
				["Sample.IArena", board.Id, 1, []],
				["Sample.IArena", NoEntity, 1, []],
			] );
		},
	);

	it(
		"C# reaches a TypeScript component marked @Implements on the entity, "
			+ "else the container's binding",
		async () => {
			const host = new FakeHost();
			const harness = await Boot( host );
			const pit = harness.runtime.Context.World.FindByName( "Pit" )!;

			expect( host.Ask( pit.Id, 0, [5] ) ).toEqual( [true, null] );
			expect( host.Ask( pit.Id, 1 ) ).toEqual( [true, 5] );
			expect( pit.GetComponent( Pit )!.Points ).toBe( 5 );
			// no TypeScript implementation on the board: the container, which
			// binds IArena to C# itself
			expect(
				host.Ask(
					harness.runtime.Context.World.FindByName( "Board" )!.Id,
					1,
				),
			).toEqual( [true, 7] );
			expect( host.Ask( NoEntity, 1 ) ).toEqual( [true, 7] );
			expect( host.Ask( pit.Id, 5, ["no"] ) ).toEqual( [false, "no"] );
			expect(
				Decode(
					host.ServeCSharp!(
						Encode( ["Sample.IEmpty", 12345, 0, []] ),
					),
				),
			).toEqual( [false, "IEmpty has no method 0"] );
		},
	);

	it(
		"without the C# scripts a @FromCSharp field says so when called; an "
			+ "@Inject of a FromCSharp binding is reported (the components "
			+ "run)",
		async () => {
			const failed = vi.spyOn( Logger, "LogException" );
			const harness = await Boot( null );

			expect(
				() => harness.runtime.Context.World.FindByName( "Board" )!
					.GetComponent( Scoreboard )!.Arena.Total(),
			).toThrow(
				"Sample.IArena.Total: The project's C# scripts are not loaded",
			);
			expect(
				failed.mock.calls.some( ( [error] ) => String( error ).includes(
					"The project's C# scripts are not loaded (no .csproj, or "
						+ "it "
					+ "failed "
				+ "to build or load)",
				) ),
			).toBe( true );
		},
	);
} );
