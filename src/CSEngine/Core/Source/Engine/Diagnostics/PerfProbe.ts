// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";

/**
 * What a thread measured, for the perf harness (Perf/Run.mjs): samples per
 * channel ("frame", "render", "physics"...) in fixed rings, so measuring costs
 * a performance.now() and an array write, never an allocation. The harness
 * reads them with `__csePerf.Take()` in each worker (Playwright's
 * worker.evaluate).
 */
export class PerfSamples {
	private readonly _channels = new Map<string, {
		Values: Float64Array;
		Next: number;
		Count: number;
	}>();

	public constructor(
		private readonly _capacity = 16384,
		private readonly _now: () => number = () => performance.now(),
	) {
	}

	public Add( channel: string, value: number ): void {
		let ring = this._channels.get( channel );

		if ( !ring ) {
			ring = {
				Values: new Float64Array( this._capacity ),
				Next: 0,
				Count: 0,
			};
			this._channels.set( channel, ring );
		}
		ring.Values[ring.Next] = value;
		ring.Next = ( ring.Next + 1 ) % this._capacity;
		ring.Count = FMath.Min( ring.Count + 1, this._capacity );
	}

	/** Starts a span: pass what it returns to End. */
	public Begin(): number {
		return this._now();
	}

	/** Ends a span: its length (ms) becomes a sample of the channel. */
	public End( channel: string, begin: number ): void {
		this.Add( channel, this._now() - begin );
	}

	/** Every channel's samples, oldest first; the rings start empty again. */
	public Take(): Record<string, number[]> {
		const taken: Record<string, number[]> = {};

		for ( const [name, ring] of this._channels ) {
			if ( ring.Count === 0 ) {
				continue;
			}
			const first = ( ring.Next
				- ring.Count
				+ this._capacity ) % this._capacity;
			const values: number[] = [];

			for ( let i = 0; i < ring.Count; i++ ) {
				values.push( ring.Values[( first + i ) % this._capacity]! );
			}
			taken[name] = values;
			ring.Count = 0;
		}
		return taken;
	}
}

/** What a thread offers the harness. */
export interface PerfProbeGlobal {
	Thread: string;
	Take(): Record<string, number[]>;
	/** Facts that are not per-frame samples (draw calls, memory...). */
	Info(): Record<string, unknown>;
}

/** Puts a thread's samples where the harness looks: globalThis.__csePerf. */
export function ExposePerf(
	thread: string,
	samples: PerfSamples,
	info: () => Record<string, unknown> = () => ( {} ),
): void {
	const probe: PerfProbeGlobal = {
		Thread: thread,
		Take: () => samples.Take(),
		Info: info,
	};
	( globalThis as unknown as {
		__csePerf: PerfProbeGlobal;
	} ).__csePerf = probe;
}
