// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import {
	Container, ContainerBuilder, Contract, CSharpBindings, Inject, InjectionsOf,
	InjectWith, Installer,
} from "../Source/Index.ts";

// Contracts: an interface and, under the same name, its runtime key.
interface ILog {
	Lines: string[];
	Write( line: string ): void;
}
const ILog = Contract<ILog>( "ILog" );

interface IClock {
	Now(): number;
}
const IClock = Contract<IClock>( "IClock" );

interface IScore {
	Points: number;
	Add( points: number ): void;
}
const IScore = Contract<IScore>( "IScore" );

class MemoryLog implements ILog {
	public Lines: string[] = [];

	public Write( line: string ): void {
		this.Lines.push( line );
	}
}

/** A service with dependencies of its own, injected into its fields. */
class Score implements IScore {
	@Inject( ILog ) private readonly _log!: ILog;

	public Points = 0;

	public Add( points: number ): void {
		this.Points += points;
		this._log.Write( `+${ points }` );
	}
}

/**
 * What a game component looks like: fields with @Inject, no references to
 * implementations.
 */
class Pickup {
	@Inject( IScore ) public Score!: IScore;

	@Inject( ILog ) public Log!: ILog;
}

class GoldPickup extends Pickup {
	@Inject( IClock ) public Clock!: IClock;
}

describe( "contracts", () => {
	it( "are unique keys with small ids, named for messages", () => {
		const a = Contract<ILog>( "Same" );
		const b = Contract<ILog>( "Same" );
		expect( a ).not.toBe( b );
		expect( a.Id ).not.toBe( b.Id );
		expect( String( ILog ) ).toBe( "ILog" );
		expect( ILog.Name ).toBe( "ILog" );
	} );
} );

describe( "binding and resolving (Zenjex style)", () => {
	it(
		"To(Class).AsSingle(): one instance, made on first resolve, its fields "
			+ "injected",
		() => {
			const builder = new ContainerBuilder();
			builder.Bind( ILog ).To( MemoryLog )
				.AsSingle();
			builder.Bind( IScore ).To( Score )
				.AsSingle();
			const container = builder.Build();

			const score = container.Resolve( IScore );
			expect( container.Resolve( IScore ) ).toBe( score );
			score.Add( 5 );
			expect( container.Resolve( ILog ).Lines ).toEqual( ["+5"] );
		},
	);

	it(
		"AsTransient(): a new one every time; FromInstance and BindInstance; "
			+ "FromFactory",
		() => {
			const log = new MemoryLog();
			let time = 0;
			const builder = new ContainerBuilder();
			builder.Bind( IScore ).To( Score )
				.AsTransient();
			builder.BindInstance( ILog, log );
			builder.Bind( IClock )
				.FromFactory( () => ( { Now: () => ++time } ) )
				.AsTransient();
			const container = builder.Build();

			expect( container.Resolve( IScore ) ).not
				.toBe( container.Resolve( IScore ) );
			expect( container.Resolve( ILog ) ).toBe( log );
			expect( container.TryResolve( ILog ) ).toBe( log );
			expect( container.Resolve( IClock ) ).not
				.toBe( container.Resolve( IClock ) );
			const other = new ContainerBuilder();
			other.Bind( ILog ).FromInstance( log )
				.AsSingle();
			expect( other.Build().Resolve( ILog ) ).toBe( log );
		},
	);

	it(
		"FromFactory gets the container; AsSingle on a factory makes it once",
		() => {
			const factory = vi.fn( ( c: Container ) => {
				const score = new Score();
				c.Inject( score );
				return score;
			} );
			const builder = new ContainerBuilder();
			builder.Bind( ILog ).To( MemoryLog )
				.AsSingle();
			builder.Bind( IScore ).FromFactory( factory )
				.AsSingle();
			const container = builder.Build();
			container.Resolve( IScore ).Add( 1 );
			container.Resolve( IScore ).Add( 2 );
			expect( factory ).toHaveBeenCalledTimes( 1 );
			expect( container.Resolve( ILog ).Lines ).toEqual( ["+1", "+2"] );
		},
	);

	it( "NonLazy(): made (and initialized) when the container is built", () => {
		const made = vi.fn();
		class Eager implements IClock {
			public constructor() {
				made();
			}

			public Initialized = false;

			public Initialize(): void {
				this.Initialized = true;
			}

			public Now(): number {
				return 0;
			}
		}
		const builder = new ContainerBuilder();
		builder.Bind( IClock ).To( Eager )
			.NonLazy();
		const container = builder.Build();
		expect( made ).toHaveBeenCalledTimes( 1 );
		expect( ( container.Resolve( IClock ) as Eager ).Initialized )
			.toBe( true );
		expect( made ).toHaveBeenCalledTimes( 1 );
	} );

	it(
		"a binding without a lifetime is a lazy singleton; binding twice is an "
			+ "error",
		() => {
			const builder = new ContainerBuilder();
			builder.Bind( ILog ).To( MemoryLog );
			expect( () => builder.Bind( ILog ).To( MemoryLog ) )
				.toThrow( "ILog is bound twice" );
			const container = builder.Build();
			expect( container.Resolve( ILog ) )
				.toBe( container.Resolve( ILog ) );
		},
	);

	it( "a binding without a source is an error when building", () => {
		const builder = new ContainerBuilder();
		builder.Bind( ILog ).AsSingle();
		expect( () => builder.Build() )
			.toThrow(
				"ILog is bound to nothing (To, FromInstance or FromFactory)",
			);
	} );

	it(
		"resolving what is not bound names the contract; TryResolve and Has "
			+ "don't throw",
		() => {
			const container = new ContainerBuilder().Build();
			expect( () => container.Resolve( ILog ) )
				.toThrow( "Nothing is bound to ILog" );
			expect( container.TryResolve( ILog ) ).toBeNull();
			expect( container.Has( ILog ) ).toBe( false );
		},
	);
} );

describe( "@Inject fields", () => {
	it(
		"are filled from the container, base class fields included; the list "
			+ "is made once per class",
		() => {
			const builder = new ContainerBuilder();
			builder.Bind( ILog ).To( MemoryLog )
				.AsSingle();
			builder.Bind( IScore ).To( Score )
				.AsSingle();
			builder.Bind( IClock ).FromInstance( { Now: () => 42 } );
			const container = builder.Build();

			const pickup = container.Inject( new GoldPickup() );
			expect( pickup.Score ).toBe( container.Resolve( IScore ) );
			expect( pickup.Log ).toBe( container.Resolve( ILog ) );
			expect( pickup.Clock.Now() ).toBe( 42 );
			expect( InjectionsOf( GoldPickup ) )
				.toBe( InjectionsOf( GoldPickup ) );
			expect(
				InjectionsOf( GoldPickup )
					.map( ( i ) => [i.Field, i.Contract.Name] ),
			)
				.toEqual(
					[["Score", "IScore"], ["Log", "ILog"], ["Clock", "IClock"]],
				);
			expect( InjectionsOf( Pickup ) ).toHaveLength( 2 );
			expect( InjectionsOf( MemoryLog ) ).toEqual( [] );
		},
	);

	it( "a missing binding names the class and the field", () => {
		const container = new ContainerBuilder().Build();
		expect( () => container.Inject( new Pickup() ) )
			.toThrow( "Pickup.Score needs IScore, and nothing is bound to it" );
	} );
} );

describe( "installers: one entry point, composed of many", () => {
	class LogInstaller extends Installer {
		public InstallBindings( builder: ContainerBuilder ): void {
			builder.Bind( ILog ).To( MemoryLog )
				.AsSingle();
		}
	}

	class ScoreInstaller extends Installer<{ Start: number; }> {
		public InstallBindings(
			builder: ContainerBuilder,
			context: { Start: number; },
		): void {
			builder.Bind( IScore ).FromFactory( ( c ) => {
				const score = c.Inject( new Score() );
				score.Points = context.Start;
				return score;
			} )
				.AsSingle();
		}
	}

	class GameInstaller extends Installer<{ Start: number; }> {
		public InstallBindings(
			builder: ContainerBuilder,
			context: { Start: number; },
		): void {
			builder.Install( new LogInstaller(), context );
			builder.Install( new ScoreInstaller(), context );
		}
	}

	it(
		"an installer class installs once per builder, however many installers "
			+ "install it",
		() => {
			const builder = new ContainerBuilder();
			builder.Install( new LogInstaller() ).Install( new LogInstaller() );
			expect( builder.Build().Has( ILog ) ).toBe( true );
		},
	);

	it(
		"the game's installer installs the others; the context reaches all of "
			+ "them",
		() => {
			const builder = new ContainerBuilder();
			builder.Install( new GameInstaller(), { Start: 10 } );
			const container = builder.Build();
			container.Resolve( IScore ).Add( 5 );
			expect( container.Resolve( IScore ).Points ).toBe( 15 );
			expect( container.Resolve( ILog ).Lines ).toEqual( ["+5"] );
		},
	);
} );

describe( "child containers (a scene's)", () => {
	it(
		"see their parent's bindings, add and override their own, and are "
			+ "disposed with what they made",
		() => {
			const root = new ContainerBuilder();
			root.Bind( ILog ).To( MemoryLog )
				.AsSingle();
			const parent = root.Build();

			const disposed = vi.fn();
			const scene = parent.CreateChild( ( builder ) => {
				builder.Bind( IScore ).To( Score )
					.AsSingle();
				builder.Bind( IClock )
					.FromInstance(
						{ Now: () => 1, Dispose: disposed } as IClock,
					);
			} );
			expect( scene.Resolve( ILog ) ).toBe( parent.Resolve( ILog ) );
			scene.Resolve( IScore ).Add( 3 );
			expect( parent.Resolve( ILog ).Lines ).toEqual( ["+3"] );
			expect( parent.Has( IScore ) ).toBe( false );
			expect( scene.Has( ILog ) ).toBe( true );

			const shadow = scene.CreateChild(
				( builder ) => builder.Bind( ILog ).To( MemoryLog )
					.AsSingle(),
			);
			expect( shadow.Resolve( ILog ) ).not.toBe( parent.Resolve( ILog ) );

			scene.Dispose();
			// an instance given from outside belongs to whoever gave it
			expect( disposed ).not.toHaveBeenCalled();
			expect( () => scene.Resolve( IScore ) ).toThrow( "disposed" );
		},
	);

	it(
		"disposing calls Dispose on the singletons the container made, once",
		() => {
			const disposed = vi.fn();
			class Service implements IClock {
				public Now(): number {
					return 0;
				}

				public Dispose(): void {
					disposed();
				}
			}
			const builder = new ContainerBuilder();
			builder.Bind( IClock ).To( Service )
				.AsSingle();
			builder.Bind( ILog ).To( MemoryLog )
				.AsSingle();
			const container = builder.Build();
			container.Resolve( IClock );
			container.Resolve( ILog );
			container.Dispose();
			container.Dispose();
			expect( disposed ).toHaveBeenCalledTimes( 1 );
		},
	);
} );

describe(
	"extension points: fields resolved their own way, bindings to C#",
	() => {
		it( "InjectWith fills a field with what its resolver returns", () => {
			const IName = Contract<string>( "IName" );

			class Greeter {
				@InjectWith(
					IName,
					( _container, target ) => (
						`for ${ target.constructor.name }`
					),
				)
				public Name = "";
			}
			const container = new ContainerBuilder().Build();
			expect( container.Inject( new Greeter() ).Name )
				.toBe( "for Greeter" );
		} );

		it(
			"FromCSharp asks the C# bindings (once scripting set them) and "
				+ "never "
			+ "disposes the proxy",
			() => {
				interface IScore { Total(): number; Dispose(): void; }
				const IScore = Contract<IScore>( "Game.IScore" );
				const dispose = vi.fn();
				const builder = new ContainerBuilder();
				builder.Bind( IScore ).FromCSharp();
				const container = builder.Build();
				expect( () => container.Resolve( IScore ) )
					.toThrow(
						"Game.IScore is bound FromCSharp, and the engine's C# "
					+ "scripting is not loaded",
					);
				CSharpBindings.Resolve = ( _container, contract ) => ( {
					Total: () => contract.Name.length,
					Dispose: dispose,
				} );
				try {
					const other = new ContainerBuilder();
					other.Bind( IScore ).FromCSharp();
					const built = other.Build();
					expect( built.Resolve( IScore ).Total() ).toBe( 11 );
					built.Dispose();
					expect( dispose ).not.toHaveBeenCalled();
				} finally {
					CSharpBindings.Resolve = null;
				}
			},
		);
	},
);
