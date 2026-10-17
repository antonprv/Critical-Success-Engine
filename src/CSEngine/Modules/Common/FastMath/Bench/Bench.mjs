// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// `pnpm bench`: FastMath against Math in this V8, ns per call (lower is
// better). Each pair runs the same monomorphic loop over the same random input.

import { FMath } from "../Source/Index.ts";

const Count = 1 << 16;
const Rounds = 300;
const xs = new Float64Array( Count );
const ys = new Float64Array( Count );
const unit = new Float64Array( Count );

for ( let i = 0; i < Count; i++ ) {
	xs[i] = ( Math.random() - 0.5 ) * 20;
	ys[i] = ( Math.random() - 0.5 ) * 20;
	unit[i] = Math.random() * 2 - 1;
}

function Time( run ) {
	let sink = 0;

	for ( let r = 0; r < 30; r++ ) {
		sink += run();
	}

	const start = performance.now();

	for ( let r = 0; r < Rounds; r++ ) {
		sink += run();
	}

	return [ ( performance.now() - start ) * 1e6 / ( Rounds * Count ), sink ];
}

function Pair( name, math, fast ) {
	const [ slow ] = Time( math );
	const [ quick ] = Time( fast );

	console.log(
		`${ name.padEnd( 10 ) } Math ${ slow.toFixed( 2 ).padStart( 6 ) } ns   `
			+ `FMath ${ quick.toFixed( 2 ).padStart( 6 ) } ns   `
			+ `x${ ( slow / quick ).toFixed( 2 ) }`,
	);
}

Pair( "sin", () => {
	let s = 0;

	for ( let i = 0; i < Count; i++ ) {
		s += Math.sin( xs[i] );
	}

	return s;
}, () => {
	let s = 0;

	for ( let i = 0; i < Count; i++ ) {
		s += FMath.FastSin( xs[i] );
	}

	return s;
} );

Pair( "cos", () => {
	let s = 0;

	for ( let i = 0; i < Count; i++ ) {
		s += Math.cos( xs[i] );
	}

	return s;
}, () => {
	let s = 0;

	for ( let i = 0; i < Count; i++ ) {
		s += FMath.FastCos( xs[i] );
	}

	return s;
} );

Pair( "atan2", () => {
	let s = 0;

	for ( let i = 0; i < Count; i++ ) {
		s += Math.atan2( ys[i], xs[i] );
	}

	return s;
}, () => {
	let s = 0;

	for ( let i = 0; i < Count; i++ ) {
		s += FMath.FastAtan2( ys[i], xs[i] );
	}

	return s;
} );

Pair( "acos", () => {
	let s = 0;

	for ( let i = 0; i < Count; i++ ) {
		s += Math.acos( unit[i] );
	}

	return s;
}, () => {
	let s = 0;

	for ( let i = 0; i < Count; i++ ) {
		s += FMath.FastAcos( unit[i] );
	}

	return s;
} );

Pair( "hypot3", () => {
	let s = 0;

	for ( let i = 0; i < Count; i++ ) {
		s += Math.hypot( xs[i], ys[i], unit[i] );
	}

	return s;
}, () => {
	let s = 0;

	for ( let i = 0; i < Count; i++ ) {
		s += FMath.Length3( xs[i], ys[i], unit[i] );
	}

	return s;
} );

Pair( "round", () => {
	let s = 0;

	for ( let i = 0; i < Count; i++ ) {
		s += Math.round( xs[i] );
	}

	return s;
}, () => {
	let s = 0;

	for ( let i = 0; i < Count; i++ ) {
		s += FMath.Round( xs[i] );
	}

	return s;
} );

Pair( "max", () => {
	let s = 0;

	for ( let i = 0; i < Count; i++ ) {
		s += Math.max( xs[i], ys[i] );
	}

	return s;
}, () => {
	let s = 0;

	for ( let i = 0; i < Count; i++ ) {
		s += FMath.Max( xs[i], ys[i] );
	}

	return s;
} );
