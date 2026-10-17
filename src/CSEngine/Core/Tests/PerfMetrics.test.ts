// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	Combine, Compare, LowFps, Mean, Median, Percentile, Summarize,
} from "../Perf/Metrics.mjs";

describe( "perf metrics (the harness's arithmetic)", () => {
	it(
		"percentiles by nearest rank; mean and median; nothing measured is 0",
		() => {
			const values = [5, 1, 4, 2, 3];
			expect(
				[
					Percentile( values, 0.5 ),
					Percentile( values, 0.99 ),
					Percentile( values, 0 ),
				],
			).toEqual( [3, 5, 1] );
			expect( [Mean( values ), Median( values )] ).toEqual( [3, 3] );
			expect( [Percentile( [], 0.5 ), Mean( [] ), LowFps( [], 0.01 )] )
				.toEqual( [0, 0, 0] );
		},
	);

	it(
		"the 1 % low is the frame rate of the slowest 1 % of frames (at least "
			+ "one frame)",
		() => {
			const intervals = [...Array( 99 ).fill( 1 ), 10];
			expect( LowFps( intervals, 0.01 ) ).toBe( 100 );
			expect( LowFps( [2, 4], 0.001 ) ).toBe( 250 );
		},
	);

	it(
		"summarizes a window: rate, lows, frame-time percentiles, the threads' "
			+ "times",
		() => {
			const summary = Summarize(
				{
					frame: [2, 2, 2, 4],
					render: [1, 1.5],
					draws: [10, 20],
					triangles: [100, 101],
				},
				{ logic: [0.5], csharp: [0.1], step: [0.2] },
				{ physics: [0.3], bodies: [7] },
			);
			expect( summary ).toEqual( {
				frames: 4, fps: 400, drawFps: 400, low1: 250, low01: 250,
				frameP50: 2,
				frameP95: 4, frameP99: 4,
				renderP50: 1, renderP95: 1.5, draws: 15, triangles: 101,
				logicP50: 0.5, logicP95: 0.5, csharpP50: 0.1, stepP50: 0.2,
				physicsP50: 0.3, physicsP95: 0.3, bodies: 7,
			} );
			expect( Summarize( {}, {}, {} ).fps ).toBe( 0 );
			// with fresh frames (a new game state), fps is theirs; drawFps the
			// loop's
			const fresh = Summarize(
				{ frame: [1, 1, 1, 1], fresh: [4] },
				{},
				{},
			);
			expect( [fresh.fps, fresh.drawFps, fresh.frames] )
				.toEqual( [250, 1000, 1] );
		},
	);

	it(
		"combines windows by median, keeps the spread; compares with the "
			+ "baseline (5 % threshold)",
		() => {
			const combined = Combine(
				[
					{ fps: 100, draws: 3 },
					{ fps: 120, draws: 3 },
					{ fps: 110, draws: 5 },
				],
			);
			expect( combined )
				.toEqual( { fps: 110, draws: 3, fpsMin: 100, fpsMax: 120 } );
			expect( Compare( { fps: 90 }, { fps: 100 } ) )
				.toEqual( { change: -10, regression: true } );
			expect( Compare( { fps: 97 }, { fps: 100 } ) )
				.toEqual( { change: -3, regression: false } );
			expect( Compare( { fps: 97 }, undefined ) )
				.toEqual( { change: null, regression: false } );
		},
	);
} );
