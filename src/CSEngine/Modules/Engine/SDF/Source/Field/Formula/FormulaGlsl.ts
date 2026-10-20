// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { FractalFrame } from "./FormulaJs";
import type {
	FormulaExpr,
	FormulaProgram,
	FormulaStmt,
} from "./FormulaLanguage";

/** Floats the parameters may take at most (sdfFormulaParams). */
export const FORMULA_PARAM_FLOATS = 32;

/** Iterations the GPU loop allows at most. */
export const FORMULA_MAX_ITERATIONS = 64;

/**
 * Where each parameter's floats start in sdfFormulaParams, in the order the
 * formula declares them.
 */
export function FormulaParamSlots(
	program: FormulaProgram,
): Map<string, number> {
	const slots = new Map<string, number>();
	let at = 0;

	for ( const param of program.Params ) {
		slots.set( param.Name, at );
		at += param.Type === "vec3" ? 3 : 1;
	}
	if ( at > FORMULA_PARAM_FLOATS ) {
		throw new RangeError(
			`A formula's parameters take ${ at } floats, `
				+ `more than ${ FORMULA_PARAM_FLOATS }`,
		);
	}
	return slots;
}

/** The parameters' values as sdfFormulaParams holds them. */
export function FormulaParamValues(
	program: FormulaProgram,
	params: ReadonlyMap<string, readonly number[]>,
): Float32Array {
	const values = new Float32Array( FORMULA_PARAM_FLOATS );
	const slots = FormulaParamSlots( program );

	for ( const param of program.Params ) {
		values.set( params.get( param.Name )!, slots.get( param.Name )! );
	}
	return values;
}

/**
 * The frame's settings as sdfFormulaFrame holds them (three vec4s): center
 * and scale; inversion's radius^2, R^2 / bailout, bailout, iterations;
 * thickness, distance scale, the materials.
 */
export function FormulaFrameValues( frame: FractalFrame ): Float32Array {
	const r2 = frame.Invert * frame.Invert;

	return Float32Array.of(
		...frame.Center,
		frame.Scale,
		r2,
		r2 / frame.Bailout,
		frame.Bailout,
		Math.min( frame.Iterations, FORMULA_MAX_ITERATIONS ),
		frame.Thickness,
		frame.DistanceScale,
		...frame.Materials,
	);
}

/**
 * A formula in GLSL: `float cseSdfFormula( vec3 P, float detail )`, the
 * same field as CompileFormulaJs (the trap's fade in cseFormulaMix). Its
 * parameters and the frame are uniforms - `sdfFormulaParams[32]` and
 * `sdfFormulaFrame[3]` - so changing a value recompiles nothing.
 */
export function FormulaGlsl( program: FormulaProgram ): string {
	const slots = FormulaParamSlots( program );
	const emit = new GlslEmitter();
	const params = program.Params.map( ( param ) => {
		const at = slots.get( param.Name )!;

		return param.Type === "vec3"
			? `vec3 f_${ param.Name } = vec3( sdfFormulaParams[${ at }], `
				+ `sdfFormulaParams[${ at + 1 }], `
				+ `sdfFormulaParams[${ at + 2 }] );`
			: `float f_${ param.Name } = sdfFormulaParams[${ at }];`;
	} ).join( "\n" );
	const State =
		"vec3 f_z, float f_dr, vec3 f_c, vec3 f_p, float f_r, float f_i";
	const distance = program.Distance
		? `float cseFormulaDistance( ${ State } ) {
${ params }
${ emit.Block( program.Distance ) }
}`
		: `float cseFormulaDistance( ${ State } ) {
	return 0.5 * log( max( f_r, 1e-30 ) ) * f_r / f_dr;
}`;

	return `
uniform float sdfFormulaParams[${ FORMULA_PARAM_FLOATS }];
uniform vec4 sdfFormulaFrame[3];
float cseFormulaMix = 0.0;

${ distance }

float cseSdfFormula( vec3 P, float detail ) {
${ params }
	vec4 place = sdfFormulaFrame[0];
	vec4 shape = sdfFormulaFrame[1];
	vec4 look = sdfFormulaFrame[2];
	vec3 q = ( P - place.xyz ) / place.w;
	float toWorld = place.w;
	float clear = -1e30;

	if ( shape.x > 0.0 ) {
		float r2 = dot( q, q );
		float s = shape.x / max( r2, 1e-30 );

		clear = ( shape.y - sqrt( r2 ) ) * place.w;
		q *= s;
		toWorld /= s;
	}

	float qdetail = detail / toWorld;
	vec3 f_p = q;
	vec3 f_z = q;
	vec3 f_c = q;
	float f_dr = 1.0;
	float f_i = 0.0;
	float f_r = length( q );

	{
${ emit.Block( program.Init ) }
	}
	f_r = length( f_z );

	float trap = f_r;
	int iterations = int( shape.w );

	for ( int n = 0; n < ${ FORMULA_MAX_ITERATIONS }; n++ ) {
		if ( n >= iterations || f_r > shape.z || qdetail * f_dr > 1.0 ) {
			break;
		}
		f_i = float( n );
		{
${ emit.Block( program.Iterate ) }
		}
		f_r = length( f_z );
		trap = min( trap, f_r );
	}
	cseFormulaMix = min( 1.0, trap / ( shape.z * 0.5 ) );

	float de = cseFormulaDistance( f_z, f_dr, f_c, f_p, f_r, f_i );

	// at the inversion's center the orbit starts at infinity: no estimate
	// there, the bound answers
	if ( !( de > -1e30 && de < 1e30 ) ) {
		de = 0.0;
	}

	return max( de * toWorld * look.y, clear ) - look.x;
}
`;
}

/** A float literal GLSL accepts (it has a point or an exponent). */
function Float( value: number ): string {
	const text = String( value );

	return /[.e]/.test( text ) ? text : `${ text }.0`;
}

class GlslEmitter {
	public Block( statements: FormulaStmt[] ): string {
		return statements.map( ( statement ) => this.Statement( statement ) )
			.join( "\n" );
	}

	private Statement( statement: FormulaStmt ): string {
		switch ( statement.Kind ) {
			case "Declare": {
				const zero = statement.Type === "vec3" ? "vec3( 0.0 )" : "0.0";

				return `${ statement.Type } f_${ statement.Name } = ${
					statement.Init ? this.Expr( statement.Init ) : zero
				};`;
			}
			case "Assign": {
				const target = statement.Component === null
					? `f_${ statement.Name }`
					: `f_${ statement.Name }.${ "xyz"[statement.Component] }`;

				const value = this.Expr( statement.Value );

				return `${ target } ${ statement.Op } ${ value };`;
			}
			case "If":
				return `if ( ${ this.Expr( statement.Condition ) } ) {\n${
					this.Block( statement.Then )
				}\n}${ statement.Else
					? ` else {\n${ this.Block( statement.Else ) }\n}`
					: "" }`;
			case "Return":
				return `return ${ this.Expr( statement.Value ) };`;
		}
	}

	private Expr( expr: FormulaExpr ): string {
		switch ( expr.Kind ) {
			case "Number":
				return Float( expr.Value );
			case "Name":
				return `f_${ expr.Name }`;
			case "Member":
				return `${ this.Expr( expr.Object ) }.${
					"xyz"[expr.Component]
				}`;
			case "Unary":
				return `( ${ expr.Op }${ this.Expr( expr.Operand ) } )`;
			case "Binary":
				return `( ${ this.Expr( expr.Left ) } ${ expr.Op } ${
					this.Expr( expr.Right )
				} )`;
			case "Call": {
				const args = expr.Args.map( ( arg ) => this.Expr( arg ) );

				if ( expr.Name === "pow" ) {
					// |x|^y (as the CPU), the exponent spread over a vec3
					const exponent = expr.Type === "vec3"
						&& expr.Args[1]!.Type === "float"
						? `vec3( ${ args[1] } )`
						: args[1];

					return `pow( abs( ${ args[0] } ), ${ exponent } )`;
				}
				return `${ expr.Name }( ${ args.join( ", " ) } )`;
			}
		}
	}
}
