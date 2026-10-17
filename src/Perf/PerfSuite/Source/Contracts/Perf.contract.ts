// Generated from a .contract file by the engine (Contracts/Compile.ts).
// Do not edit: it is rewritten whenever the .contract file changes.

import { Vec3 } from "@cse/core/Engine/Math/Vec3";
import { RegisterContract, Wire } from "@cse/scripting";
import { Contract } from "@cse/di";

/** What travels with a call: a struct, a vector, a string. */
export interface Probe {
	Id: number;
	At: Vec3;
	Name: string;
}

/** How a Probe crosses to C#: its fields in order. */
export const ProbeWire = {
	To: ( value: Probe ): unknown[] => [ value.Id, Wire.Vec3( value.At ), value.Name ],
	From: ( value: unknown ): Probe => {
		const wire = value as unknown[];
		return {
			Id: wire[0] as number,
			At: new Vec3( ...( wire[1] as [ number, number, number ] ) ),
			Name: wire[2] as string,
		};
	},
};

/** Implemented in C# (InteropTarget); TypeScript calls it. */
export interface ICounter {
	Add( amount: number ): number;
	Echo( probe: Probe ): Probe;
}

export const ICounter = Contract<ICounter>( "PerfSuite.ICounter" );

RegisterContract( ICounter, {
	Proxy: ( call_ ) => ( {
		Add: ( amount: number ): number => call_( 0, [ amount ] ) as number,
		Echo: ( probe: Probe ): Probe => ProbeWire.From( call_( 1, [ ProbeWire.To( probe ) ] ) ),
	} ),
	Dispatch: ( target_, method_, args_ ) => {
		switch ( method_ ) {
			case 0: return target_.Add( args_[0] as number );
			case 1: return ProbeWire.To( target_.Echo( ProbeWire.From( args_[0] ) ) );
			default: throw new Error( `ICounter has no method ${ method_ }` );
		}
	},
} );

/** Implemented in TypeScript (InteropLoad); C# calls it. */
export interface IClock {
	Now(): number;
}

export const IClock = Contract<IClock>( "PerfSuite.IClock" );

RegisterContract( IClock, {
	Proxy: ( call_ ) => ( {
		Now: (): number => call_( 0, [] ) as number,
	} ),
	Dispatch: ( target_, method_, args_ ) => {
		switch ( method_ ) {
			case 0: return target_.Now();
			default: throw new Error( `IClock has no method ${ method_ }` );
		}
	},
} );
