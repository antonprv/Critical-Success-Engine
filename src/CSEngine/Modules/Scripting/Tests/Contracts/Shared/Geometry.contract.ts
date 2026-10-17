// Generated from a .contract file by the engine (Contracts/Compile.ts).
// Do not edit: it is rewritten whenever the .contract file changes.

import { Vec3 } from "@cse/core/Engine/Math/Vec3";
import { Quat } from "@cse/core/Engine/Math/Quat";
import { Wire } from "@cse/scripting";

/** A side of the game. */
export const enum Team {
	Red = 0,
	/** The other side. */
	Blue = 5,
}

/** Where something is. */
export interface Place {
	At: Vec3;
	Facing: Quat;
	Name: string | null;
}

/** How a Place crosses to C#: its fields in order. */
export const PlaceWire = {
	To: ( value: Place ): unknown[] => [ Wire.Vec3( value.At ), Wire.Quat( value.Facing ), value.Name ],
	From: ( value: unknown ): Place => {
		const wire = value as unknown[];
		return {
			At: new Vec3( ...( wire[0] as [ number, number, number ] ) ),
			Facing: new Quat( ...( wire[1] as [ number, number, number, number ] ) ),
			Name: wire[2] as string | null,
		};
	},
};
