// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { MessagePackReader, MessagePackWriter } from "@cse/datastream";
import {
	Contract, CSharpBindings, InjectWith, type Container,
} from "@cse/di";

// TypeScript and C# calling each other through contracts (declared once, in
// .contract files; the generated code registers each one here). A call is a
// MessagePack array [contract, entity, method, args] answered with [true,
// value] or [false, error]; both runtimes share one thread, so it is a plain
// synchronous call in either direction.

/** How a contract's calls cross (written by the contract compiler). */
export interface ContractBridge<T> {
	/** An object implementing the contract by calling the other side. */
	Proxy( call: ( method: number, args: unknown[] ) => unknown ): T;
	/**
	 * Runs a call from the other side on an implementation; the wire result.
	 */
	Dispatch( target: T, method: number, args: unknown[] ): unknown;
}

interface Registered {
	Contract: Contract<unknown>;
	Bridge: ContractBridge<unknown>;
}

const Contracts = new Map<string, Registered>();

/** Makes a contract callable across (the generated .contract.ts calls it). */
export function RegisterContract<T>(
	contract: Contract<T>,
	bridge: ContractBridge<T>,
): void {
	Contracts.set( contract.Name, {
		Contract: contract as Contract<unknown>,
		Bridge: bridge as ContractBridge<unknown>,
	} );
}

/** A registered contract by its name ("Game.IRound"). */
export function FindContract( name: string ): Contract<unknown> | null {
	return Contracts.get( name )?.Contract ?? null;
}

function Registration( name: string ): Registered {
	const found = Contracts.get( name );

	if ( !found ) {
		throw new Error(
			`${ name } is not a contract both languages know: declare it in a `
				+ ".contract file (and import its generated .contract.ts)",
		);
	}
	return found;
}

/**
 * What implements a contract on the TypeScript side when C# asks: on an entity
 * (a component of it; -1 for none), else the game's container.
 */
export type ContractResolver = (
	contract: Contract<unknown>,
	entity: number,
) => object | null;

/** No entity: the game's container on the other side. */
export const NoEntity = -1;

export class ScriptBridge {
	/** Set by the engine: what answers C#'s calls. */
	public Resolver: ContractResolver = () => null;

	public constructor(
		private readonly _callCSharp: ( request: Uint8Array ) => Uint8Array,
	) {
	}

	/**
	 * The C# implementation of a contract, as an object to call: a C#
	 * component of the entity implementing it, else what the game's C#
	 * container binds to it. It is looked up on every call.
	 */
	public CSharp<T>( contract: Contract<T>, entity: number = NoEntity ): T {
		const { Bridge } = Registration( contract.Name );

		return Bridge.Proxy( ( method, args ) => {
			// a writer per depth: C# may call back into TypeScript, which may
			// call C# again, before this request has gone
			const writer = this.Writer( this._requests, this._calling );
			writer.WriteArrayHeader( 4 );
			writer.WriteString( contract.Name );
			writer.WriteNumber( entity );
			writer.WriteNumber( method );
			writer.Write( args );
			this._calling++;
			let response: Uint8Array;

			try {
				response = this._callCSharp( writer.Bytes );
			} finally {
				this._calling--;
			}
			// [ok, value]; whatever follows it is not ours (a reused buffer)
			const reader = new MessagePackReader( response );
			reader.ReadArrayHeader();
			const ok = reader.Read() as boolean;
			const value = reader.Read();

			if ( !ok ) {
				throw new Error(
					`C# ${ contract.Name }: ${ String( value ) }`,
				);
			}
			return value;
		} ) as T;
	}

	/** Writers kept for requests and answers, one per depth of nesting. */
	private readonly _requests: MessagePackWriter[] = [];

	private readonly _answers: MessagePackWriter[] = [];

	private _calling = 0;

	private _serving = 0;

	private Writer(
		pool: MessagePackWriter[],
		depth: number,
	): MessagePackWriter {
		const writer = pool[depth] ??= new MessagePackWriter();
		writer.Reset();
		return writer;
	}

	/** Runs a call from C# (a MessagePack request) and answers it. */
	public Serve( request: Uint8Array ): Uint8Array {
		this._serving++;
		try {
			return this.Answer( true, this.Run( request ) );
		} catch ( error ) {
			return this.Answer( false, ( error as Error ).message );
		} finally {
			this._serving--;
		}
	}

	/** [ok, value] in this depth's writer (the caller copies it at once). */
	private Answer( ok: boolean, value: unknown ): Uint8Array {
		const writer = this.Writer( this._answers, this._serving - 1 );
		writer.WriteArrayHeader( 2 );
		writer.WriteBoolean( ok );
		writer.Write( value );
		return writer.Bytes;
	}

	private Run( request: Uint8Array ): unknown {
		const [name, entity, method, args] = new MessagePackReader(
			request,
		).Read() as [string, number, number, unknown[]];
		const { Contract: contract, Bridge } = Registration( name );
		const target = this.Resolver( contract, entity );

		if ( !target ) {
			const on = entity === NoEntity ? "" : ` on entity ${ entity }`;

			throw new Error(
				`nothing in TypeScript implements ${ name }${ on } (a `
					+ "component with @Implements, or a binding in an "
					+ "installer)",
			);
		}
		return Bridge.Dispatch( target, method, args );
	}
}

/** Helpers of the generated code (how values cross). */
export const Wire = {
	/** `convert` applied unless the value is null (or undefined). */
	Maybe<T, R>( value: T | null | undefined, convert: ( value: T ) => R ): R
		| null {
		return value === null || value === undefined ? null : convert( value );
	},
	/** A vec3 as it crosses: [x, y, z]. */
	Vec3( value: { X: number; Y: number; Z: number; } ): number[] {
		return [value.X, value.Y, value.Z];
	},
	/** A quat as it crosses: [x, y, z, w]. */
	Quat( value: { X: number; Y: number; Z: number; W: number; } ): number[] {
		return [value.X, value.Y, value.Z, value.W];
	},
};

/** The bridge of the game's C# scripts, for DI. */
export const IScriptBridge = Contract<ScriptBridge>( "IScriptBridge" );

// Bindings to C# (`builder.Bind( IScore ).FromCSharp()`) go through the bridge.
CSharpBindings.Resolve = ( container, contract ) => container.Resolve(
	IScriptBridge,
).CSharp( contract );

/** The entity an object is on (a component's), or none. */
function EntityOf( target: object ): number {
	return ( target as { Entity?: { Id: number; }; } ).Entity?.Id ?? NoEntity;
}

/**
 * Fills a field with the C# implementation of a contract: a C# component of
 * the same entity implementing it, else what the game's C# container binds.
 *
 *     @FromCSharp( IStreaks ) private readonly _streaks!: IStreaks;
 *
 * Without the C# scripts (none, or they failed to load) the field is still
 * filled - the component runs - and each call says why it can't be made.
 */
export function FromCSharp<T>( contract: Contract<T> ) {
	return InjectWith(
		contract,
		( container: Container, target: object ): T => {
			let bridge: ScriptBridge;

			try {
				bridge = container.Resolve( IScriptBridge );
			} catch ( error ) {
				return Unavailable( contract, error as Error );
			}
			return bridge.CSharp( contract, EntityOf( target ) );
		},
	);
}

/** A contract whose every method throws: the other side isn't there. */
function Unavailable<T>( contract: Contract<T>, cause: Error ): T {
	return new Proxy( {}, {
		// symbols and "then" (an await) find nothing
		get: ( _target, key ) => (
			typeof key === "symbol" || key === "then"
				? undefined
				: () => {
					throw new Error(
						`${ contract.Name }.${ key }: ${ cause.message }`,
					);
				}
		),
	} ) as T;
}

const Implemented = new WeakMap<object, Contract<unknown>[]>();

/**
 * Marks a TypeScript class (a component) as the implementation of contracts
 * C# can reach on its entity (`[FromTypeScript]` there). The compiler checks
 * that the class implements them.
 *
 *     @Implements( IRound )
 *     export class GameRules extends Component implements IRound { ... }
 */
export function Implements<T>( ...contracts: Contract<T>[] ) {
	return ( type: abstract new ( ...args: never[] ) => T ): void => {
		Implemented.set( type, [
			...( Implemented.get( type ) ?? [] ),
			...contracts as Contract<unknown>[],
		] );
	};
}

/** Whether an object's class (or a base class) is marked to implement it. */
export function ImplementsContract(
	target: object,
	contract: Contract<unknown>,
): boolean {
	// asked on every call from C#: the answer is kept per class
	const type = target.constructor as object | undefined;
	const known = type ? Answers.get( type )
		?? new Map<Contract<unknown>, boolean>() : null;
	const cached = known?.get( contract );

	if ( cached !== undefined ) {
		return cached;
	}
	const answer = Walk( target, contract );

	if ( type && known ) {
		known.set( contract, answer );
		Answers.set( type, known );
	}
	return answer;
}

const Answers = new WeakMap<object, Map<Contract<unknown>, boolean>>();

function Walk( target: object, contract: Contract<unknown> ): boolean {
	for ( let type = target.constructor as object | null; type
		&& type !== Function.prototype; type = Object.getPrototypeOf(
			type,
		) as object | null ) {
		if ( Implemented.get( type )?.includes( contract ) ) {
			return true;
		}
	}
	return false;
}
