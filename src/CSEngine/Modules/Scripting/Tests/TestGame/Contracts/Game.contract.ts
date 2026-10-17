// Generated from a .contract file by the engine (Contracts/Compile.ts).
// Do not edit: it is rewritten whenever the .contract file changes.

import { Contract } from "@cse/di";
import { RegisterContract, Wire } from "@cse/scripting";
import { Vec3 } from "@cse/core/Engine/Math/Vec3";

/** Counts on a C# component; TypeScript calls it on the component's entity. */
export interface ICounter {
	Add( amount: number ): number;
	Label(): string;
}

export const ICounter = Contract<ICounter>( "TestGame.ICounter" );

RegisterContract( ICounter, {
	Proxy: ( call_ ) => ( {
		Add: ( amount: number ): number => call_( 0, [ amount ] ) as number,
		Label: (): string => call_( 1, [] ) as string,
	} ),
	Dispatch: ( target_, method_, args_ ) => {
		switch ( method_ ) {
			case 0: return target_.Add( args_[0] as number );
			case 1: return target_.Label();
			default: throw new Error( `ICounter has no method ${ method_ }` );
		}
	},
} );

/** Greets in TypeScript; a C# component calls it. */
export interface IGreeter {
	Greet( name: string, at: Vec3 ): string;
}

export const IGreeter = Contract<IGreeter>( "TestGame.IGreeter" );

RegisterContract( IGreeter, {
	Proxy: ( call_ ) => ( {
		Greet: ( name: string, at: Vec3 ): string => call_( 0, [ name, Wire.Vec3( at ) ] ) as string,
	} ),
	Dispatch: ( target_, method_, args_ ) => {
		switch ( method_ ) {
			case 0: return target_.Greet( args_[0] as string, new Vec3( ...( args_[1] as [ number, number, number ] ) ) );
			default: throw new Error( `IGreeter has no method ${ method_ }` );
		}
	},
} );

/** A service of the C# container (bound by the game's C# installer). */
export interface IClock {
	Ticks(): number;
}

export const IClock = Contract<IClock>( "TestGame.IClock" );

RegisterContract( IClock, {
	Proxy: ( call_ ) => ( {
		Ticks: (): number => call_( 0, [] ) as number,
	} ),
	Dispatch: ( target_, method_, args_ ) => {
		switch ( method_ ) {
			case 0: return target_.Ticks();
			default: throw new Error( `IClock has no method ${ method_ }` );
		}
	},
} );
