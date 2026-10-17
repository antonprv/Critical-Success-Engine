// Generated from a .contract file by the engine (Contracts/Compile.ts).
// Do not edit: it is rewritten whenever the .contract file changes.

import { Contract } from "@cse/di";
import { RegisterContract } from "@cse/scripting";

/** The round, kept by GameRules (TypeScript). StreakTracker reaches it with [FromTypeScript]. */
export interface IRound {
	/** Coins still to find. */
	CoinsLeft(): number;
	/** Seconds before time runs out. */
	SecondsLeft(): number;
}

export const IRound = Contract<IRound>( "TemplateProject.IRound" );

RegisterContract( IRound, {
	Proxy: ( call_ ) => ( {
		CoinsLeft: (): number => call_( 0, [] ) as number,
		SecondsLeft: (): number => call_( 1, [] ) as number,
	} ),
	Dispatch: ( target_, method_, args_ ) => {
		switch ( method_ ) {
			case 0: return target_.CoinsLeft();
			case 1: return target_.SecondsLeft();
			default: throw new Error( `IRound has no method ${ method_ }` );
		}
	},
} );

/** The streaks, counted by StreakTracker (C#). GameRules reaches them with @FromCSharp. */
export interface IStreaks {
	/** The longest streak of this round. */
	Best(): number;
}

export const IStreaks = Contract<IStreaks>( "TemplateProject.IStreaks" );

RegisterContract( IStreaks, {
	Proxy: ( call_ ) => ( {
		Best: (): number => call_( 0, [] ) as number,
	} ),
	Dispatch: ( target_, method_, args_ ) => {
		switch ( method_ ) {
			case 0: return target_.Best();
			default: throw new Error( `IStreaks has no method ${ method_ }` );
		}
	},
} );
