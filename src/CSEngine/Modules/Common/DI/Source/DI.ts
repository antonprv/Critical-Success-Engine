// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// Dependency injection for the engine and its games, after Zenjex (the
// author's DI layer for Unity): contracts bound in installers, one container
// per game (a child per scene), and fields marked @Inject filled before a
// component's Awake. No reflection: a contract is a small integer, a binding
// is an array slot, an injection is a list made once per class.

/**
 * The runtime key of an interface. Declare the interface and its contract
 * under one name:
 *
 *     export interface IScore { Add( points: number ): void; }
 *     export const IScore = Contract<IScore>( "IScore" );
 */
export interface Contract<T> {
	readonly Name: string;
	readonly Id: number;
	/** Phantom: keeps Contract<A> and Contract<B> apart for the compiler. */
	readonly _type?: T;
}

let NextContractId = 0;

/** A new contract (every call makes a different one, whatever the name). */
export function Contract<T>( name: string ): Contract<T> {
	return {
		Name: name,
		Id: NextContractId++,
		toString: () => name,
	} as Contract<T>;
}

type Class<T> = new () => T;

/** Any class (what an object's constructor is). */
type AnyClass = abstract new ( ...args: never[] ) => unknown;

/** A field of a class that @Inject fills. */
export interface Injection {
	readonly Field: string;
	readonly Contract: Contract<unknown>;
	/**
	 * Resolves the field its own way (@FromCSharp does); absent: from the
	 * container.
	 */
	readonly Resolve?: ( container: Container, target: object ) => unknown;
}

// @Inject fields declared by each class itself, by prototype
const Declared = new WeakMap<object, Injection[]>();
// every class's whole list (its bases' first), made once
const Flattened = new Map<AnyClass, Injection[]>();

/**
 * Marks a field to be filled from the container (before Awake, for a
 * component): `@Inject( IScore ) private readonly _score!: IScore;`. Runs once
 * per class, when the class is defined.
 */
export function Inject<T>( contract: Contract<T> ) {
	return InjectWith( contract, null );
}

/**
 * A field decorator filling the field its own way (`resolve` gets the
 * container and the object): what decorators such as @FromCSharp are made of.
 */
export function InjectWith<T>(
	contract: Contract<T>,
	resolve: ( ( container: Container, target: object ) => T ) | null,
) {
	return ( prototype: object, field: string | symbol ): void => {
		let own = Declared.get( prototype );

		if ( !own ) {
			own = [];
			Declared.set( prototype, own );
		}
		own.push( {
			Field: String( field ),
			Contract: contract as Contract<unknown>,
			...( resolve ? { Resolve: resolve } : {} ),
		} );
	};
}

/**
 * How a binding reaches an implementation in C# (`FromCSharp()`): set by the
 * engine's scripting (@cse/scripting) when it loads.
 */
export const CSharpBindings: {
	Resolve:
		| ( ( container: Container, contract: Contract<unknown> ) => unknown )
		| null;
} = { Resolve: null };

/**
 * The fields @Inject fills on an instance of this class, its base classes'
 * first.
 */
export function InjectionsOf( type: AnyClass ): Injection[] {
	let list = Flattened.get( type );

	if ( !list ) {
		const chain: Injection[][] = [];

		for ( let prototype = type.prototype as object | null; prototype
			&& prototype
				!== Object.prototype; prototype = Object.getPrototypeOf(
				prototype,
			) as object | null ) {
			chain.unshift( Declared.get( prototype ) ?? [] );
		}
		list = chain.flat();
		Flattened.set( type, list );
	}
	return list;
}

const enum Lifetime {
	Single,
	Transient,
}

interface Binding {
	Contract: Contract<unknown>;
	Lifetime: Lifetime;
	Eager: boolean;
	Make: ( ( container: Container ) => unknown ) | null;
	/** Given from outside: the container does not dispose it. */
	Owned: boolean;
	Instance?: unknown;
	Made: boolean;
}

/** `builder.Bind( IScore )` - where it comes from, then how long it lives. */
export class BindingBuilder<T> {
	public constructor( private readonly _binding: Binding ) {
	}

	/**
	 * An instance of the class (made with no arguments; its @Inject fields
	 * filled).
	 */
	public To( type: Class<T> ): this {
		this._binding.Make = ( container ) => container.Inject(
			new type() as object,
		);
		return this;
	}

	/**
	 * This very object (always a singleton; the container doesn't dispose it).
	 */
	public FromInstance( instance: T ): this {
		this._binding.Make = () => instance;
		this._binding.Owned = false;
		return this;
	}

	/**
	 * Whatever the factory returns (it gets the container, to resolve what it
	 * needs).
	 */
	public FromFactory( factory: ( container: Container ) => T ): this {
		this._binding.Make = factory;
		return this;
	}

	/**
	 * Whatever implements the contract in the game's C# scripts (a proxy that
	 * calls it; see Contracts in @cse/scripting). The container doesn't
	 * dispose it.
	 */
	public FromCSharp(): this {
		const contract = this._binding.Contract;
		this._binding.Make = ( container ) => {
			if ( !CSharpBindings.Resolve ) {
				throw new Error(
					`${ contract.Name } is bound FromCSharp, and the engine's `
						+ "C# scripting is not loaded",
				);
			}
			return CSharpBindings.Resolve( container, contract );
		};
		this._binding.Owned = false;
		return this;
	}

	/**
	 * One instance for the container, made when first resolved (the default).
	 */
	public AsSingle(): this {
		this._binding.Lifetime = Lifetime.Single;
		return this;
	}

	/** A new instance on every resolve. */
	public AsTransient(): this {
		this._binding.Lifetime = Lifetime.Transient;
		return this;
	}

	/**
	 * One instance, made (and its Initialize() called) when the container is
	 * built.
	 */
	public NonLazy(): this {
		this._binding.Lifetime = Lifetime.Single;
		this._binding.Eager = true;
		return this;
	}
}

/**
 * A group of bindings: a game's entry point installs the others (composition).
 */
export abstract class Installer<TContext = unknown> {
	public abstract InstallBindings(
		builder: ContainerBuilder,
		context: TContext
	): void;
}

/** Collects bindings, then builds the container. */
export class ContainerBuilder {
	private readonly _bindings: Binding[] = [];

	private readonly _installed = new Set<unknown>();

	public Bind<T>( contract: Contract<T> ): BindingBuilder<T> {
		if ( this._bindings.some( ( b ) => b.Contract === contract ) ) {
			throw new Error( `${ contract.Name } is bound twice` );
		}
		const binding: Binding = {
			Contract: contract as Contract<unknown>,
			Lifetime: Lifetime.Single,
			Eager: false,
			Make: null,
			Owned: true,
			Made: false,
		};
		this._bindings.push( binding );
		return new BindingBuilder<T>( binding );
	}

	/** Shorthand for `Bind( contract ).FromInstance( instance )`. */
	public BindInstance<T>(
		contract: Contract<T>,
		instance: T,
	): BindingBuilder<T> {
		return this.Bind( contract ).FromInstance( instance );
	}

	/**
	 * Runs another installer's bindings into this builder - once per installer
	 * class: installers that share one (several games' installers installing
	 * the UI's) compose without binding it twice.
	 */
	public Install<TContext>(
		installer: Installer<TContext>,
		context: TContext
	): this;
	public Install( installer: Installer<undefined> ): this;
	public Install<TContext>(
		installer: Installer<TContext>,
		context?: TContext,
	): this {
		if ( !this._installed.has( installer.constructor ) ) {
			this._installed.add( installer.constructor );
			installer.InstallBindings( this, context as TContext );
		}
		return this;
	}

	/** The container (a child of `parent`, which it falls back to). */
	public Build( parent: Container | null = null ): Container {
		for ( const binding of this._bindings ) {
			if ( !binding.Make ) {
				throw new Error(
					`${ binding.Contract.Name } is bound to nothing (To, `
						+ "FromInstance or FromFactory)",
				);
			}
		}
		const container = new Container( this._bindings, parent );
		container.MakeEager();
		return container;
	}
}

interface Disposable {
	Dispose(): void;
}

interface Initializable {
	Initialize(): void;
}

/** Resolves contracts: an array slot by contract id here, then the parent's. */
export class Container {
	private readonly _slots: ( Binding | undefined )[] = [];

	private readonly _bindings: Binding[];

	private _disposed = false;

	public constructor(
		bindings: Binding[],
		private readonly _parent: Container | null,
	) {
		this._bindings = bindings;
		for ( const binding of bindings ) {
			this._slots[binding.Contract.Id] = binding;
		}
	}

	public Has( contract: Contract<unknown> ): boolean {
		return this.Find( contract ) !== null;
	}

	public Resolve<T>( contract: Contract<T> ): T {
		const found = this.Find( contract );

		if ( !found ) {
			throw new Error( `Nothing is bound to ${ contract.Name }` );
		}
		return found.container.Instance( found.binding ) as T;
	}

	public TryResolve<T>( contract: Contract<T> ): T | null {
		return this.Has( contract ) ? this.Resolve( contract ) : null;
	}

	/** Fills the object's @Inject fields; returns it. */
	public Inject<T extends object>( target: T ): T {
		const fields = target as Record<string, unknown>;

		for ( const { Field, Contract: contract, Resolve } of InjectionsOf(
			target.constructor as AnyClass,
		) ) {
			if ( Resolve ) {
				fields[Field] = Resolve( this, target );
				continue;
			}
			const found = this.Find( contract );

			if ( !found ) {
				throw new Error(
					`${ target.constructor.name }.${ Field } `
						+ `needs ${ contract.Name }, and nothing is bound to `
						+ "it",
				);
			}
			fields[Field] = found.container.Instance( found.binding );
		}
		return target;
	}

	/**
	 * A container for a narrower scope (a scene): its own bindings, falling
	 * back to this one's.
	 */
	public CreateChild(
		install: ( builder: ContainerBuilder ) => void,
	): Container {
		const builder = new ContainerBuilder();
		install( builder );
		return builder.Build( this );
	}

	/**
	 * Disposes the singletons it made (not instances given to it); resolving
	 * afterwards is an error.
	 */
	public Dispose(): void {
		if ( this._disposed ) {
			return;
		}
		this._disposed = true;
		for ( const binding of this._bindings ) {
			if ( binding.Made && binding.Owned ) {
				( binding.Instance as Partial<Disposable> ).Dispose?.();
			}
		}
	}

	/** Makes the NonLazy singletons and calls their Initialize(). */
	public MakeEager(): void {
		for ( const binding of this._bindings ) {
			if ( binding.Eager ) {
				( this.Instance( binding ) as Partial<
					Initializable
				> ).Initialize?.();
			}
		}
	}

	private Find( contract: Contract<unknown> ): {
		container: Container;
		binding: Binding;
	} | null {
		const binding = this._slots[contract.Id];

		if ( binding ) {
			return { container: this, binding };
		}
		return this._parent ? this._parent.Find( contract ) : null;
	}

	private Instance( binding: Binding ): unknown {
		if ( this._disposed ) {
			throw new Error(
				`The container of ${ binding.Contract.Name } is disposed`,
			);
		}
		if ( binding.Lifetime === Lifetime.Transient ) {
			return binding.Make!( this );
		}
		if ( !binding.Made ) {
			binding.Instance = binding.Make!( this );
			binding.Made = true;
		}
		return binding.Instance;
	}
}
