// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Component } from "@cse/core/Engine/Core/Component";
import { Vec3 } from "@cse/core/Engine/Math/Vec3";
import { FromCSharp, Implements } from "@cse/scripting";
import { IClock, ICounter } from "../Contracts/Perf.contract.ts";

/**
 * The TypeScript half of the interop load: every frame it calls the C#
 * InteropTarget on its entity CallsPerFrame times (and once with a struct); it
 * is the IClock that InteropTarget calls back.
 */
@Implements( IClock )
export class InteropLoad extends Component implements IClock {
	public CallsPerFrame = 500;

	/** The C# InteropTarget on this entity. */
	@FromCSharp( ICounter ) private readonly _counter!: ICounter;

	private _now = 0;

	public Now(): number {
		return this._now;
	}

	public override Update( dt: number ): void {
		this._now += dt;
		for ( let i = 0; i < this.CallsPerFrame; i++ ) {
			this._counter.Add( 1 );
		}
		this._counter.Echo( { Id: 1, At: new Vec3( 1, 2, 3 ), Name: "probe" } );
	}
}
