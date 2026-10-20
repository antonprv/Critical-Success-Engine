// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import {
	CreateBaseLayer,
	FORMULA_MAX_ITERATIONS,
	FORMULA_PARAM_FLOATS,
	FormulaBase,
	FormulaError,
	FormulaFrameValues,
	FormulaGlsl,
	FormulaJsSource,
	FormulaParamSlots,
	FormulaPresets,
	FrameOf,
	InvertedMandelbrotFormula,
	JuliaBulb2Formula,
	MandelbulbBase,
	MandelbulbFormula,
	ParseFormula,
} from "../Source/Index";

/** A formula whose orbit never moves: its distance block, read at p. */
function Distance(
	expression: string,
	p: [ number, number, number ] = [ 0.3, -0.7, 1.2 ],
	before = "",
): number {
	const base = new FormulaBase( {
		Source:
			`${ before }\niterate { }\ndistance { return ${ expression }; }`,
		Frame: { Iterations: 0, Thickness: 0, DistanceScale: 1 },
	} );

	return base.Distance( ...p );
}

/** The error a formula is rejected with. */
function ErrorOf( source: string ): FormulaError {
	try {
		ParseFormula( source );
	} catch ( error ) {
		return error as FormulaError;
	}
	throw new Error( "accepted" );
}

const [ X, Y, Z ] = [ 0.3, -0.7, 1.2 ];
const R = Math.hypot( X, Y, Z );

describe( "FormulaLanguage", () => {
	it( "reads every function and operator as the CPU computes it", () => {
		const Mod = ( a: number, b: number ): number => a - b * Math.floor(
			a / b,
		);
		const cases: Array<[ string, number ]> = [
			[ "r", R ],
			[ "p.x + p.y * 2 - p.z / 4", X + Y * 2 - Z / 4 ],
			[ "-p.y", 0.7 ],
			[
				"abs(p.y) + sign(p.y) + floor(p.z) + fract(p.z)",
				0.7 - 1 + 1 + 0.2,
			],
			[
				"sqrt(p.z) + sin(p.x) + cos(p.x) + tan(p.x)",
				Math.sqrt( Z ) + Math.sin( X ) + Math.cos( X ) + Math.tan( X ),
			],
			[
				"asin(p.x) + acos(p.x) + exp(p.x) + log(p.z)",
				Math.asin( X ) + Math.acos( X ) + Math.exp( X ) + Math.log( Z ),
			],
			[
				"min(p.x, p.y) + max(p.x, p.y) + mod(p.y, 0.4) + pow(p.y, 2.5)",
				Y + X + Mod( Y, 0.4 ) + Math.pow( 0.7, 2.5 ),
			],
			[
				"atan(p.y, p.x) + clamp(p.z, 0, 1) + mix(p.x, p.z, 0.25)",
				Math.atan2( Y, X ) + 1 + X + ( Z - X ) * 0.25,
			],
			[ "length(p) + dot(p, vec3(1, 2, 3))", R + X + 2 * Y + 3 * Z ],
			[ "cross(p, vec3(0, 0, 1)).x + cross(p, vec3(0, 0, 1)).y", Y - X ],
			[ "normalize(p).z", Z / R ],
			[
				"dot(abs(p), vec3(1)) + dot(floor(p), vec3(1)) + fract(p).z",
				0.3 + 0.7 + 1.2 + 0 - 1 + 1 + 0.2,
			],
			[
				"dot(min(p, 0), vec3(1)) + dot(max(p, vec3(0.5)), vec3(1))",
				-0.7 + 0.5 + 0.5 + 1.2,
			],
			[
				"mod(p, 0.5).y + pow(p, 2).y + pow(p, vec3(1, 2, 3)).z",
				Mod( Y, 0.5 ) + 0.49 + Math.pow( Z, 3 ),
			],
			[
				"clamp(p, -0.5, 0.5).y + mix(p, vec3(1), 0.5).x",
				-0.5 + ( X + 1 ) / 2,
			],
			[
				"( p * 2 ).x + ( 2 * p ).y + ( p / 2 ).z + ( p - 1 ).x + ( 1 + "
					+ "p ).y",
				2 * X + 2 * Y + Z / 2 + X - 1 + 1 + Y,
			],
			[
				"( p * p ).z + ( -p ).x + sin(p).x + sqrt(abs(p)).y",
				Z * Z - X + Math.sin( X ) + Math.sqrt( 0.7 ),
			],
			[ "vec3(p.z).x + vec3(1, 2, 3).y", Z + 2 ],
		];

		for ( const [ expression, expected ] of cases ) {
			expect( Distance( expression ), expression )
				.toBeCloseTo( expected, 12 );
		}
	} );

	it( "runs statements: locals, assignments, branches", () => {
		// z written whole from its own parts: each read before any is written
		expect(
			Distance(
				"z.x * 100 + z.y * 10 + z.z",
				[ 1, 2, 3 ],
				"init { z = vec3(z.y, z.z, z.x); }",
			),
		)
			.toBe( 231 );
		// branches and every comparison
		const Branch = ( condition: string ): number => new FormulaBase( {
			Source: `iterate { }
distance {
	if (${ condition }) { return 1; }
	else if (p.x > 100) { return 2; } else { return 0; }
}`,
			Frame: { Iterations: 0, Thickness: 0, DistanceScale: 1 },
		} ).Distance( 1, 2, 3 );

		expect( Branch( "p.x < p.y && p.y <= 2 && p.z >= 3 && p.z > 2" ) )
			.toBe( 1 );
		expect( Branch( "p.x == 1 || p.x != 1" ) ).toBe( 1 );
		expect( Branch( "!(p.x == 1)" ) ).toBe( 0 );

		// locals of every kind, declared with and without a value
		const locals = new FormulaBase( {
			Source: `init {
	float t = 1;
	float u;
	vec3 w = vec3(1, 2, 3);
	vec3 v;
	t += 2; t -= 0.5; t *= 4; t /= 2;
	w *= 2; w += vec3(1); w -= vec3(1); w /= 2; w.y += t; w.z -= u + v.x;
	z = w;
}
iterate { }`,
			Frame: { Iterations: 0, Thickness: 0, DistanceScale: 1 },
		} );

		// z = (1, 2 + 5, 3): the default estimate from |z|
		const r = Math.hypot( 1, 7, 3 );

		expect( locals.Distance( 0, 0, 0 ) )
			.toBeCloseTo( 0.5 * Math.log( r ) * r, 12 );
		// a float spread over a vec3
		expect( Distance( "z.y", [ 1, 2, 3 ], "init { z *= 2; z /= 4; }" ) )
			.toBe( 1 );
	} );

	it( "points at what is wrong", () => {
		const cases: Array<[ string, RegExp, number ]> = [
			[ "iterate { z = z # 1; }", /unexpected '#'/, 1 ],
			[ "/* open", /unclosed comment/, 1 ],
			[ "param float a = 1;", /no 'iterate'/, 1 ],
			[ "iterate { }\niterate { }", /'iterate' twice/, 2 ],
			[ "init { }\ninit { } iterate { }", /'init' twice/, 2 ],
			[
				"distance { return 1; } distance { return 1; } iterate { }",
				/'distance' twice/,
				1,
			],
			[ "foo { }", /expected 'param'/, 1 ],
			[ "param vec3 a = 1;", /'a' is a vec3/, 1 ],
			[ "param float a = p;", /constant/, 1 ],
			[ "param float a = vec3(1, 2);", /constant/, 1 ],
			[ "param float a = -vec3(1);", /constant/, 1 ],
			[ "param float a = 1 in [x, 2];", /expected a number/, 1 ],
			[ "param int a = 1;", /expected float or vec3/, 1 ],
			[ "param float if = 1;", /expected a name/, 1 ],
			[ "param float z = 1; iterate { }", /'z' is taken/, 1 ],
			[ "iterate { z + 1; }", /expected an assignment/, 1 ],
			[ "iterate { z.w = 1; }", /expected x, y or z/, 1 ],
			[ "iterate { z = ; }", /expected a value/, 1 ],
			[ "iterate { z = (z; }", /expected '\)'/, 1 ],
			[ "iterate { return 1; }", /return only in 'distance'/, 1 ],
			[
				"iterate { } distance { float a = 1; }",
				/must end in a return/,
				1,
			],
			[ "iterate { } distance { }", /must end in a return/, 1 ],
			[
				"iterate { } distance { if (r > 1) { return 1; } }",
				/must end in a return/,
				1,
			],
			[ "iterate { q = 1; }", /no 'q'/, 1 ],
			[ "iterate { r = 1; }", /can't be changed/, 1 ],
			[ "iterate { dr.x = 1; }", /no components/, 1 ],
			[ "iterate { dr = z; }", /a vec3 can't go into a float/, 1 ],
			[ "iterate { z += 1; }", /a float can't go into a vec3/, 1 ],
			[ "iterate { float a = z; }", /expected a float, not a vec3/, 1 ],
			[ "iterate { float a = 1; float a = 2; }", /'a' is taken/, 1 ],
			[ "iterate { dr = q; }", /no 'q'/, 1 ],
			[ "iterate { dr = r.x; }", /only a vec3 has x, y, z/, 1 ],
			[ "iterate { dr = -(r < 1); }", /'-' doesn't take a bool/, 1 ],
			[ "iterate { if (!r) { } }", /'!' doesn't take a float/, 1 ],
			[ "iterate { if (r && r) { } }", /joins conditions/, 1 ],
			[ "iterate { dr = (r < 1) + 1; }", /doesn't take a bool/, 1 ],
			[ "iterate { if (z < 1) { } }", /only floats compare/, 1 ],
			[ "iterate { if (r) { } }", /expected a bool/, 1 ],
			[ "iterate { dr = foo(r); }", /no function 'foo'/, 1 ],
			[ "iterate { dr = sin(r, r); }", /doesn't exist/, 1 ],
			[ "iterate { dr = sin(r < 1); }", /doesn't exist/, 1 ],
			[ "iterate { z = min(1, z); }", /doesn't exist/, 1 ],
			[ "iterate { dr = atan(z, r); }", /doesn't exist/, 1 ],
			[ "iterate { dr = clamp(r, z, 1); }", /doesn't exist/, 1 ],
			[ "iterate { z = clamp(r, z, z); }", /doesn't exist/, 1 ],
			[ "iterate { dr = mix(r, r, z); }", /doesn't exist/, 1 ],
			[ "iterate { dr = length(r); }", /doesn't exist/, 1 ],
			[ "iterate { dr = dot(z, r); }", /doesn't exist/, 1 ],
			[ "iterate { z = cross(z, r); }", /doesn't exist/, 1 ],
			[ "iterate { z = normalize(r); }", /doesn't exist/, 1 ],
			[ "iterate { z = vec3(r, r); }", /doesn't exist/, 1 ],
			[ "iterate { z = vec3(z); }", /doesn't exist/, 1 ],
			[ "iterate { z = vec3(); }", /doesn't exist/, 1 ],
			[ "iterate {", /expected a name, not 'end of formula'/, 1 ],
			[
				"param vec3 a = vec3(vec3(1), 1, 1); iterate { }",
				/constant/,
				1,
			],
		];

		for ( const [ source, message, line ] of cases ) {
			const error = ErrorOf( source );

			expect( error, source ).toBeInstanceOf( FormulaError );
			expect( error.message, source ).toMatch( message );
			expect( error.Pos.Line, source ).toBe( line );
		}
		// the place is in the message too, after line breaks and comments
		const error = ErrorOf(
			"// a comment\n/* more */\niterate {\n  z = q;\n}",
		);

		expect( error.Pos ).toEqual( { Line: 4, Column: 7 } );
		expect( error.message ).toMatch( /^4:7: / );
	} );

	it( "reads parameters with defaults and ranges", () => {
		const program = ParseFormula(
			"param float a = -2 in [-3, 3.5];\nparam vec3 b = vec3(1, 2, 3);\n"
				+ "param vec3 c2 = vec3(4);\niterate { }",
		);

		expect(
			program.Params.map(
				( p ) => [ p.Name, p.Type, p.Default, p.Min, p.Max ],
			),
		)
			.toEqual( [
				[ "a", "float", [ -2 ], -3, 3.5 ],
				[ "b", "vec3", [ 1, 2, 3 ], null, null ],
				[ "c2", "vec3", [ 4, 4, 4 ], null, null ],
			] );
		expect( program.Distance ).toBeNull();
		expect( FormulaParamSlots( program ) ).toEqual(
			new Map( [ [ "a", 0 ], [ "b", 1 ], [ "c2", 4 ] ] ),
		);

		// given values over the defaults; wrong names and sizes refused
		const base = new FormulaBase( {
			Source:
				"param float a = 1;\nparam vec3 b = vec3(0);\niterate { "
					+ "}\ndistance { return a + b.y; }",
			Params: { a: 5, b: [ 0, 7, 0 ] },
			Frame: { Iterations: 0, Thickness: 0, DistanceScale: 1 },
		} );

		expect( base.Distance( 0, 0, 0 ) ).toBe( 12 );
		expect( () => new FormulaBase( {
			Source: "iterate { }",
			Params: { a: 1 },
		} ) ).toThrow( /no parameter 'a'/ );
		expect( () => new FormulaBase( {
			Source: "param vec3 b = vec3(0); iterate { }",
			Params: { b: 1 },
		} ) ).toThrow( /takes 3/ );
		expect( () => FormulaParamSlots( ParseFormula(
			Array.from(
				{ length: 11 },
				( _, i ) => `param vec3 v${ i } = vec3(0);`,
			).join( "\n" )
				+ "\niterate { }",
		) ) ).toThrow( RangeError );
	} );
} );

describe( "FormulaBase", () => {
	it( "is the Mandelbulb as the hand-written one computes it", () => {
		const Shell = ( radius: number ): Array<[ number, number, number ]> => (
			Array.from( { length: 120 }, ( _, i ) => {
				const a = i * 2.39996;
				const b = Math.acos( 1 - 2 * ( i + 0.5 ) / 120 );

				return [
					radius * Math.sin( b ) * Math.cos( a ),
					radius * Math.cos( b ),
					radius * Math.sin( b ) * Math.sin( a ),
				];
			} )
		);
		const frame = { Iterations: 10, Bailout: 4 };
		const pairs: Array<[ FormulaBase, MandelbulbBase ]> = [
			[
				new FormulaBase( { Source: MandelbulbFormula, Frame: frame } ),
				new MandelbulbBase( { ...frame, Power: 8 } ),
			],
			[
				new FormulaBase( {
					Source: MandelbulbFormula,
					Params: { power: 3, julia: 1, juliaC: [ 0.2, 0.4, -0.1 ] },
					Frame: frame,
				} ),
				new MandelbulbBase(
					{ ...frame, Power: 3, Julia: [ 0.2, 0.4, -0.1 ] },
				),
			],
			[
				new FormulaBase( InvertedMandelbrotFormula( 20 ) ),
				new MandelbulbBase( {
					Power: 2,
					Iterations: 12,
					Bailout: 4,
					Julia: [ 0.166791, 0.651987, 0.07568 ],
					Invert: 1,
					Scale: 20,
				} ),
			],
		];

		for ( const [ formula, reference ] of pairs ) {
			for ( const p of [ ...Shell( 1.1 ), ...Shell( 25 ) ] ) {
				for ( const detail of [ 0, 0.25 ] ) {
					const want = reference.Distance( ...p, detail );

					expect( formula.Distance( ...p, detail ) )
						.toBeCloseTo( want, 9 );
					expect( formula.MaterialMix )
						.toBeCloseTo( reference.MaterialMix, 9 );
				}
			}
			expect( formula.MaterialId ).toBe( 1 );
			expect( formula.MaterialB ).toBe( 3 );
		}
	} );

	it( "describes itself to the GPU", () => {
		const base = new FormulaBase( {
			Source: JuliaBulb2Formula,
			Params: { juliaC: [ 1, 2, 3 ] },
			Frame: {
				Invert: 2,
				Bailout: 8,
				Center: [ 1, 2, 3 ],
				Scale: 5,
				Iterations: 200,
			},
		} );

		expect( [ ...base.ParamValues().slice( 0, 4 ) ] )
			.toEqual( [ 1, 2, 3, 0 ] );
		expect( base.ParamValues() ).toHaveLength( FORMULA_PARAM_FLOATS );
		[
			1,
			2,
			3,
			5,
			4,
			0.5,
			8,
			FORMULA_MAX_ITERATIONS,
			0.02,
			0.5,
			1,
			3,
		].forEach(
			( value, i ) => expect( base.FrameValues()[i] )
				.toBeCloseTo( value, 6 ),
		);
		expect( FormulaFrameValues( FrameOf() )[4] ).toBe( 0 );

		const glsl = base.Glsl;

		expect( base.Glsl ).toBe( glsl );
		expect( glsl ).toContain( "uniform float sdfFormulaParams[32];" );
		expect( glsl ).toContain(
			"vec3 f_juliaC = vec3( sdfFormulaParams[0], sdfFormulaParams[1], "
				+ "sdfFormulaParams[2] );",
		);
		expect( glsl )
			.toContain( "float cseSdfFormula( vec3 P, float detail )" );
		// the default estimate, float literals GLSL accepts
		expect( glsl )
			.toContain( "0.5 * log( max( f_r, 1e-30 ) ) * f_r / f_dr" );
		expect( glsl ).toContain( "( 2.0 * f_z.z )" );

		// its own distance, branches, every statement and the pow rules
		const own = FormulaGlsl( ParseFormula( `param float k = 2;
iterate {
	float a;
	vec3 b;
	vec3 w = pow(z, k) + pow(z, vec3(2)) + vec3(pow(r, 2));
	a += -r;
	if (!(a < 0) && a > 1 || a == 0) { b.x = 1; } else { b.y = 2; }
	z = w * 0.5 + b;
}
distance { if (r > 1) { return r; } return 1.5; }` ) );

		expect( own ).toContain( "float f_k = sdfFormulaParams[0];" );
		expect( own ).toContain( "pow( abs( f_z ), vec3( f_k ) )" );
		expect( own ).toContain( "pow( abs( f_z ), vec3( 2.0 ) )" );
		expect( own ).toContain( "pow( abs( f_r ), 2.0 )" );
		expect( own ).toContain( "float f_a = 0.0;" );
		expect( own ).toContain( "vec3 f_b = vec3( 0.0 );" );
		expect( own ).toContain( "f_b.x = 1.0;" );
		expect( own ).toContain( "} else {" );
		expect( own ).toContain( "( !( f_a < 0.0 ) )" );
		expect( own ).toContain( "return 1.5;" );
		expect( own ).toContain( "float cseFormulaDistance( vec3 f_z" );
	} );

	it( "comes from a descriptor, and so does every preset", () => {
		for ( const preset of FormulaPresets ) {
			const base = CreateBaseLayer(
				{ Kind: "Formula", Options: preset.Options },
			);

			expect( base ).toBeInstanceOf( FormulaBase );
			expect( Number.isFinite( base.Distance( 3, 1, 2 ) ), preset.Name )
				.toBe( true );
		}
		expect( FormulaPresets[0]!.Name ).toBe( "Inverted Mandelbrot" );
		// a source to read: constants as JavaScript reads them back
		expect( FormulaJsSource(
			ParseFormula( "iterate { }" ),
			new Map(),
			FrameOf( { Center: [ -0, 1.5, 2 ] } ),
		) ).toContain( "( X - 0 ) / 1" );
	} );
} );
