// Generated from a .contract file by the engine (Contracts/Compile.ts).
// Do not edit: it is rewritten whenever the .contract file changes.

import { type Place, PlaceWire, type Team } from "./Shared/Geometry.contract.ts";
import { RegisterContract, Wire } from "@cse/scripting";
import { Contract } from "@cse/di";

/**
 * A hit.
 * Two lines of documentation.
 */
export interface Hit {
	Damage: number;
	Where: Place;
	Tags: string[];
	Scores: ( number | null )[];
	By: Team | null;
	Data: Uint8Array;
	Next: Hit | null;
}

/** How a Hit crosses to C#: its fields in order. */
export const HitWire = {
	To: ( value: Hit ): unknown[] => [ value.Damage, PlaceWire.To( value.Where ), value.Tags, value.Scores, value.By, value.Data, Wire.Maybe( value.Next, ( v0_ ) => HitWire.To( v0_ ) ) ],
	From: ( value: unknown ): Hit => {
		const wire = value as unknown[];
		return {
			Damage: wire[0] as number,
			Where: PlaceWire.From( wire[1] ),
			Tags: wire[2] as string[],
			Scores: wire[3] as ( number | null )[],
			By: wire[4] as Team | null,
			Data: wire[5] as Uint8Array,
			Next: Wire.Maybe( wire[6], ( v0_ ) => HitWire.From( v0_ ) ),
		};
	},
};

/** The arena: implemented in C# or in TypeScript, called from the other. */
export interface IArena {
	/** Adds points; returns nothing. */
	Add( points: number ): void;
	Total(): number;
	Echo( hit: Hit ): Hit;
	Find( name: string | null, team: Team ): Place | null;
	Count( values: number[][], flag: boolean ): number[];
	Fail( message: string ): void;
}

export const IArena = Contract<IArena>( "Sample.IArena" );

RegisterContract( IArena, {
	Proxy: ( call_ ) => ( {
		Add: ( points: number ): void => {
			call_( 0, [ points ] );
		},
		Total: (): number => call_( 1, [] ) as number,
		Echo: ( hit: Hit ): Hit => HitWire.From( call_( 2, [ HitWire.To( hit ) ] ) ),
		Find: ( name: string | null, team: Team ): Place | null => Wire.Maybe( call_( 3, [ name, team ] ), ( v0_ ) => PlaceWire.From( v0_ ) ),
		Count: ( values: number[][], flag: boolean ): number[] => call_( 4, [ values, flag ] ) as number[],
		Fail: ( message: string ): void => {
			call_( 5, [ message ] );
		},
	} ),
	Dispatch: ( target_, method_, args_ ) => {
		switch ( method_ ) {
			case 0: target_.Add( args_[0] as number ); return null;
			case 1: return target_.Total();
			case 2: return HitWire.To( target_.Echo( HitWire.From( args_[0] ) ) );
			case 3: return Wire.Maybe( target_.Find( args_[0] as string | null, args_[1] as Team ), ( v0_ ) => PlaceWire.To( v0_ ) );
			case 4: return target_.Count( args_[0] as number[][], args_[1] as boolean );
			case 5: target_.Fail( args_[0] as string ); return null;
			default: throw new Error( `IArena has no method ${ method_ }` );
		}
	},
} );

/** Nothing at all. */
export interface IEmpty {
}

export const IEmpty = Contract<IEmpty>( "Sample.IEmpty" );

RegisterContract( IEmpty, {
	Proxy: ( call_ ) => ( {
	} ),
	Dispatch: ( target_, method_, args_ ) => {
		switch ( method_ ) {
			default: throw new Error( `IEmpty has no method ${ method_ }` );
		}
	},
} );
