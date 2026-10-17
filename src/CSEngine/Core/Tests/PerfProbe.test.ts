// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { afterEach, describe, expect, it } from "vitest";
import {
	ExposePerf, PerfSamples, type PerfProbeGlobal,
} from "../Source/Engine/Diagnostics/PerfProbe";

const probe = (): PerfProbeGlobal => (
	globalThis as unknown as { __csePerf?: PerfProbeGlobal; }
).__csePerf!;

afterEach( () => {
	delete ( globalThis as { __csePerf?: unknown; } ).__csePerf;
} );

describe( "PerfSamples: what a thread measured, for the perf harness", () => {
	it(
		"keeps the samples of each channel in order and hands them over once "
			+ "(Take empties it)",
		() => {
			const samples = new PerfSamples( 4 );
			samples.Add( "frame", 1.5 );
			samples.Add( "frame", 2 );
			samples.Add( "draws", 10 );

			expect( samples.Take() )
				.toEqual( { frame: [1.5, 2], draws: [10] } );
			expect( samples.Take() ).toEqual( {} );
		},
	);

	it( "keeps only the newest samples when a channel is full", () => {
		const samples = new PerfSamples( 3 );

		for ( let i = 1; i <= 5; i++ ) {
			samples.Add( "frame", i );
		}
		expect( samples.Take() ).toEqual( { frame: [3, 4, 5] } );
		samples.Add( "frame", 9 );
		expect( samples.Take() ).toEqual( { frame: [9] } );
	} );

	it( "a span measures between Begin and End (milliseconds)", () => {
		let now = 100;
		const samples = new PerfSamples( 8, () => now );
		const span = samples.Begin();
		now = 103.25;
		samples.End( "update", span );

		expect( samples.Take() ).toEqual( { update: [3.25] } );
	} );
} );

describe(
	"ExposePerf: each thread's samples under globalThis.__csePerf",
	() => {
		it( "names the thread, takes its samples and extra facts", () => {
			const samples = new PerfSamples( 8 );
			ExposePerf( "Render", samples, () => ( { drawCalls: 3 } ) );
			samples.Add( "frame", 1 );

			expect( probe().Thread ).toBe( "Render" );
			expect( probe().Take() ).toEqual( { frame: [1] } );
			expect( probe().Info() ).toEqual( { drawCalls: 3 } );
			ExposePerf( "Logic", samples );
			expect( probe().Info() ).toEqual( {} );
		} );
	},
);
