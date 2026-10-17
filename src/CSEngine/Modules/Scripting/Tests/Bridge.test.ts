// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Vec3 } from "@cse/core/Engine/Math/Vec3";
import { Quat } from "@cse/core/Engine/Math/Quat";
import { Decode, Encode } from "@cse/datastream";
import { Contract, ContainerBuilder } from "@cse/di";
import { describe, expect, it } from "vitest";
import {
	FindContract, FromCSharp, IScriptBridge, Implements, ImplementsContract,
	NoEntity, ScriptBridge, Wire,
} from "../Source/Index.ts";
import { IArena, IEmpty, type Hit } from "./Contracts/Arena.contract.ts";
import { Team, type Place } from "./Contracts/Shared/Geometry.contract.ts";

/** The test contract implemented in TypeScript. */
class Arena implements IArena {
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

	public Find( name: string | null, team: Team ): Place | null {
		return name === null
			? null
			: {
				At: new Vec3( 1, 2, 3 ),
				Facing: new Quat( 0, 1, 0, 0 ),
				Name: `${ name } of ${ team }`,
			};
	}

	public Count( values: number[][], flag: boolean ): number[] {
		return values.map(
			( row ) => ( flag
				? row.length
				: row.reduce( ( a, b ) => a + b, 0 ) ),
		);
	}

	public Fail( message: string ): void {
		throw new Error( message );
	}
}

/** Two bridges back to back: what one calls, the other serves (as C# would). */
function Pair() {
	const served = new ScriptBridge( () => new Uint8Array() );
	const arena = new Arena();
	const asked: [string, number][] = [];
	served.Resolver = ( contract, entity ) => {
		asked.push( [contract.Name, entity] );
		return contract === IArena ? arena : null;
	};
	const caller = new ScriptBridge( ( request ) => served.Serve( request ) );

	return { caller, arena, asked };
}

describe(
	"the bridge: contracts called across, through the generated code",
	() => {
		it(
			"every kind of value crosses both ways; the entity goes with the "
				+ "call",
			() => {
				const { caller, arena, asked } = Pair();
				const remote = caller.CSharp( IArena, 7 );
				remote.Add( 5 );
				remote.Add( 2 );
				expect( [remote.Total(), arena.Points] ).toEqual( [7, 7] );
				expect( asked )
					.toEqual(
						[
							["Sample.IArena", 7],
							["Sample.IArena", 7],
							["Sample.IArena", 7],
						],
					);

				const hit: Hit = {
					Damage: 1.5,
					Where: {
						At: new Vec3( 4, 5, 6 ),
						Facing: new Quat(),
						Name: null,
					},
					Tags: ["fire", "ice"], Scores: [1, null, 3], By: Team.Blue,
					Data: new Uint8Array( [1, 2, 3] ),
					Next: {
						Damage: 2,
						Where: {
							At: new Vec3(),
							Facing: new Quat(),
							Name: "n",
						},
						Tags: [],
						Scores: [],
						By: null,
						Data: new Uint8Array(),
						Next: null,
					},
				};
				const back = remote.Echo( hit );
				expect( back ).toEqual( hit );
				expect( back.Where.At ).toBeInstanceOf( Vec3 );
				expect( back.Where.Facing ).toBeInstanceOf( Quat );

				expect( remote.Find( "Gate", Team.Red ) )
					.toEqual(
						{
							At: new Vec3( 1, 2, 3 ),
							Facing: new Quat( 0, 1, 0, 0 ),
							Name: "Gate of 0",
						},
					);
				expect( remote.Find( null, Team.Red ) ).toBeNull();
				expect( remote.Count( [[1, 2], []], true ) ).toEqual( [2, 0] );
				expect( remote.Count( [[1, 2], []], false ) ).toEqual( [3, 0] );
				expect( caller.CSharp( IArena ).Total() ).toBe( 7 );
				expect( asked.at( -1 ) ).toEqual( ["Sample.IArena", NoEntity] );
			},
		);

		it(
			"errors come back as exceptions: the implementation's, nothing "
			+ "implementing it, an unknown contract or method",
			() => {
				const { caller } = Pair();
				expect( () => caller.CSharp( IArena ).Fail( "boom" ) )
					.toThrow( "C# Sample.IArena: boom" );
				expect( () => caller.CSharp( IEmpty, 3 ) ).not.toThrow();
				const Unregistered = Contract<{ Go(): void; }>(
					"Game.INothing",
				);
				expect( () => caller.CSharp( Unregistered ) )
					.toThrow(
						"Game.INothing is not a contract both languages know: "
							+ "declare "
					+ "it in a .contract file (and import its generated "
					+ ".contract.ts)",
					);

				const served = new ScriptBridge( () => new Uint8Array() );
				served.Resolver = ( contract ) => ( contract === IArena
					? new Arena()
					: null );
				const answer = ( name: string, method: number ): unknown => (
					Decode(
						served.Serve( Encode( [name, NoEntity, method, []] ) ),
					)
				);
				expect( answer( "Sample.IArena", 1 ) ).toEqual( [true, 0] );
				expect( answer( "Sample.IArena", 99 ) )
					.toEqual( [false, "IArena has no method 99"] );
				expect( answer( "Game.INothing", 0 ) )
					.toEqual(
						[
							false,
							"Game.INothing is not a contract both languages "
								+ "know: "
						+ "declare it in a .contract file (and import its "
						+ "generated .contract.ts)",
						],
					);
				const through = new ScriptBridge(
					( request ) => served.Serve( request ),
				);
				served.Resolver = () => null;
				expect( () => through.CSharp( IArena, 9 ).Total() )
					.toThrow(
						"C# Sample.IArena: nothing in TypeScript implements "
					+ "Sample.IArena on entity 9 (a component with "
					+ "@Implements, or a binding in an installer)",
					);
				expect( () => through.CSharp( IArena ).Total() )
					.toThrow(
						"C# Sample.IArena: nothing in TypeScript implements "
					+ "Sample.IArena (a component with @Implements, or a "
					+ "binding in an installer)",
					);
				// a bridge the engine hasn't given a resolver answers that
				// nothing implements it
				const bare = new ScriptBridge( () => new Uint8Array() );
				expect(
					Decode(
						bare.Serve(
							Encode( ["Sample.IArena", NoEntity, 1, []] ),
						),
					),
				)
					.toEqual(
						[
							false,
							"nothing in TypeScript implements Sample.IArena (a "
								+ "component with @Implements, or a binding in "
								+ "an installer)",
						],
					);
				expect( FindContract( "Sample.IArena" ) ).toBe( IArena );
				expect( FindContract( "Nope" ) ).toBeNull();
			},
		);

		it(
			"calls nest both ways (TypeScript -> C# -> TypeScript -> ...): "
				+ "each depth keeps its own request and answer",
			() => {
				let depth = 0;
				const a: ScriptBridge = new ScriptBridge(
					( request ) => b.Serve( request ),
				);
				const b: ScriptBridge = new ScriptBridge(
					( request ) => a.Serve( request ),
				);
				const deeper = ( self: ScriptBridge ) => () => ( {
					Total: () => ( ++depth < 5
						? 1 + self.CSharp( IArena, depth )
							.Total()
						: 100 ),
				} );
				a.Resolver = deeper( a );
				b.Resolver = deeper( b );
				expect( a.CSharp( IArena ).Total() ).toBe( 104 );
				depth = 0;
				// the reused buffers again
				expect( b.CSharp( IArena ).Total() ).toBe( 104 );
			},
		);

		it( "Wire helpers: null stays null, vectors become arrays", () => {
			expect( Wire.Maybe( null, () => 1 ) ).toBeNull();
			expect( Wire.Maybe( undefined, () => 1 ) ).toBeNull();
			expect( Wire.Maybe( 2, ( v ) => v * 2 ) ).toBe( 4 );
			expect( Wire.Vec3( new Vec3( 1, 2, 3 ) ) ).toEqual( [1, 2, 3] );
			expect( Wire.Quat( new Quat( 1, 2, 3, 4 ) ) )
				.toEqual( [1, 2, 3, 4] );
		} );
	},
);

describe( "the bridge and DI", () => {
	it(
		"@FromCSharp fills a field with the C# implementation on the object's "
			+ "entity; FromCSharp() binds the game's",
		() => {
			const { caller, asked } = Pair();

			class Keeper {
				public Entity = { Id: 12 };

				@FromCSharp( IArena ) public Arena!: IArena;
			}

			class Service {
				@FromCSharp( IArena ) public Arena!: IArena;
			}
			const builder = new ContainerBuilder();
			builder.BindInstance( IScriptBridge, caller );
			builder.Bind( IArena ).FromCSharp();
			const container = builder.Build();
			container.Inject( new Keeper() ).Arena.Add( 1 );
			container.Inject( new Service() ).Arena.Add( 1 );
			container.Resolve( IArena ).Add( 1 );
			expect( asked )
				.toEqual(
					[
						["Sample.IArena", 12],
						["Sample.IArena", NoEntity],
						["Sample.IArena", NoEntity],
					],
				);
		},
	);

	it(
		"@FromCSharp without the C# scripts fills the field anyway; each call "
			+ "says why it can't be made",
		async () => {
			class Keeper {
				@FromCSharp( IArena ) public Arena!: IArena;
			}
			const builder = new ContainerBuilder();
			builder.Bind( IScriptBridge ).FromFactory( () => {
				throw new Error( "no C# here" );
			} );
			const keeper = builder.Build().Inject( new Keeper() );

			expect( () => keeper.Arena.Total() )
				.toThrow( "Sample.IArena.Total: no C# here" );
			// not a promise, not iterable
			expect( await Promise.resolve( keeper.Arena ) )
				.toBe( keeper.Arena );
			expect(
				( keeper.Arena as unknown as Record<
					symbol,
					unknown
				> )[Symbol.iterator],
			).toBeUndefined();
		},
	);

	it(
		"@Implements marks a class (and its subclasses) as an implementation "
			+ "of contracts",
		() => {
			@Implements( IArena )
			class Implementing extends Arena {
			}

			class Sub extends Implementing {
			}

			@Implements( IEmpty )
			class Twice extends Sub {
			}
			expect( ImplementsContract( new Sub(), IArena ) ).toBe( true );
			// asked again (every call from C# asks): the kept answer
			expect( ImplementsContract( new Sub(), IArena ) ).toBe( true );
			expect( ImplementsContract( new Twice(), IArena ) ).toBe( true );
			expect( ImplementsContract( new Twice(), IEmpty ) ).toBe( true );
			expect( ImplementsContract( new Arena(), IArena ) ).toBe( false );
			expect(
				ImplementsContract( Object.create( null ) as object, IArena ),
			)
				.toBe( false );
		},
	);
} );
