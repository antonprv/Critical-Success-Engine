// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// What the perf harness (Run.mjs) computes from the samples the engine's threads
// keep (Source/Engine/Diagnostics/PerfProbe.ts). Pure functions: tested in
// Tests/PerfMetrics.test.ts.

/** The value below which `fraction` of the samples lie (nearest rank). */
export function Percentile( values, fraction ) {
	if ( values.length === 0 ) {
		return 0;
	}
	const sorted = [...values].sort( ( a, b ) => a - b );
	const rank = Math.ceil( fraction * sorted.length ) - 1;
	return sorted[Math.min( sorted.length - 1, Math.max( 0, rank ) )];
}

export function Mean( values ) {
	return values.length === 0 ? 0 : values.reduce( ( a, b ) => a + b, 0 ) / values.length;
}

export function Median( values ) {
	return Percentile( values, 0.5 );
}

/**
 * The frame rate of the worst `fraction` of frames ("1 % low"): the frames that
 * took longest, averaged, as frames per second.
 */
export function LowFps( intervals, fraction ) {
	if ( intervals.length === 0 ) {
		return 0;
	}
	const worst = [...intervals].sort( ( a, b ) => b - a )
		.slice( 0, Math.max( 1, Math.round( intervals.length * fraction ) ) );
	return 1000 / Mean( worst );
}

/**
 * One measured window. The frame rate is that of frames showing a new game
 * state ("fresh": the draw loop may draw the same state again, faster);
 * drawFps is the draw loop's own.
 */
export function Summarize( render, logic, physics ) {
	const intervals = render.fresh ?? render.frame ?? [];
	const drawn = render.frame ?? [];
	const round = ( value, digits = 2 ) => Number( value.toFixed( digits ) );

	return {
		frames: intervals.length,
		fps: round( intervals.length === 0 ? 0 : 1000 / Mean( intervals ), 1 ),
		drawFps: round( drawn.length === 0 ? 0 : 1000 / Mean( drawn ), 1 ),
		low1: round( LowFps( intervals, 0.01 ), 1 ),
		low01: round( LowFps( intervals, 0.001 ), 1 ),
		frameP50: round( Percentile( intervals, 0.5 ), 3 ),
		frameP95: round( Percentile( intervals, 0.95 ), 3 ),
		frameP99: round( Percentile( intervals, 0.99 ), 3 ),
		renderP50: round( Percentile( render.render ?? [], 0.5 ), 3 ),
		renderP95: round( Percentile( render.render ?? [], 0.95 ), 3 ),
		draws: round( Mean( render.draws ?? [] ), 1 ),
		triangles: Math.round( Mean( render.triangles ?? [] ) ),
		logicP50: round( Percentile( logic.logic ?? [], 0.5 ), 3 ),
		logicP95: round( Percentile( logic.logic ?? [], 0.95 ), 3 ),
		csharpP50: round( Percentile( logic.csharp ?? [], 0.5 ), 3 ),
		stepP50: round( Percentile( logic.step ?? [], 0.5 ), 3 ),
		physicsP50: round( Percentile( physics.physics ?? [], 0.5 ), 3 ),
		physicsP95: round( Percentile( physics.physics ?? [], 0.95 ), 3 ),
		bodies: Math.round( Mean( physics.bodies ?? [] ) ),
	};
}

/**
 * Several windows of one scenario: the median of each metric, and the spread
 * (min..max) of the frame rate.
 */
export function Combine( windows ) {
	const keys = Object.keys( windows[0] ?? {} );
	const result = {};

	for ( const key of keys ) {
		result[key] = Median( windows.map( ( w ) => w[key] ) );
	}
	const rates = windows.map( ( w ) => w.fps );
	result.fpsMin = Math.min( ...rates );
	result.fpsMax = Math.max( ...rates );
	return result;
}

/**
 * Against the baseline: a frame rate more than `threshold` (5 % by default)
 * below it is a regression.
 */
export function Compare( current, baseline, threshold = 0.05 ) {
	if ( !baseline ) {
		return { change: null, regression: false };
	}
	const change = ( current.fps - baseline.fps ) / baseline.fps;
	return { change: Number( ( change * 100 ).toFixed( 1 ) ), regression: change < -threshold };
}
