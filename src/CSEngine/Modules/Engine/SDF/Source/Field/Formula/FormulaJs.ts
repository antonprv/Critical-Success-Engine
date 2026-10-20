// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type {
	FormulaExpr,
	FormulaProgram,
	FormulaStmt,
} from "./FormulaLanguage";

/** How the frame places a formula's fractal (FormulaFrame in JS and GLSL). */
export interface FractalFrameOptions {
	/** Iterations at most. Default 12. */
	Iterations?: number;
	/** Where an orbit counts as escaped (|z|). Default 4. */
	Bailout?: number;
	/** Sphere inversion's radius (fractal units); 0: none. Default 0. */
	Invert?: number;
	/** World units per fractal unit. Default 1. */
	Scale?: number;
	Center?: readonly [ number, number, number ];
	/** The surface this far outside the set (world units). Default 0.02. */
	Thickness?: number;
	/** Shrinks the estimate (a bound only near the set). Default 0.5. */
	DistanceScale?: number;
	/** The two materials the orbit trap fades between. Default 1 and 3. */
	Materials?: readonly [ number, number ];
}

/** The frame's settings with every default filled in. */
export interface FractalFrame {
	Iterations: number;
	Bailout: number;
	Invert: number;
	Scale: number;
	Center: readonly [ number, number, number ];
	Thickness: number;
	DistanceScale: number;
	Materials: readonly [ number, number ];
}

export function FrameOf( options: FractalFrameOptions = {} ): FractalFrame {
	return {
		Iterations: options.Iterations ?? 12,
		Bailout: options.Bailout ?? 4,
		Invert: options.Invert ?? 0,
		Scale: options.Scale ?? 1,
		Center: options.Center ?? [ 0, 0, 0 ],
		Thickness: options.Thickness ?? 0.02,
		DistanceScale: options.DistanceScale ?? 0.5,
		Materials: options.Materials ?? [ 1, 3 ],
	};
}

/**
 * The field a formula compiles to on the CPU: the distance at a world point
 * for a detail (SdfBaseLayer.Distance), the orbit trap's fade in out[0].
 */
export type FormulaField = (
	x: number,
	y: number,
	z: number,
	detail: number,
	out: Float64Array,
) => number;

/** A float's code, or a vec3's three. */
type Value = string | [ string, string, string ];

/** Whether code is a name or a literal (cheap to repeat). */
const Simple = /^(?:[A-Za-z_$][\w$]*|-?\d+(?:\.\d*)?(?:e[+-]?\d+)?)$/;

/**
 * Compiles a checked formula with its parameters' values into a JavaScript
 * field: every vec3 is three numbers (no objects, no allocation per sample),
 * parameters and the frame are constants in the code.
 */
export function CompileFormulaJs(
	program: FormulaProgram,
	params: ReadonlyMap<string, readonly number[]>,
	frame: FractalFrame,
): FormulaField {
	return new Function(
		"X",
		"Y",
		"Z",
		"detail",
		"out",
		FormulaJsSource( program, params, frame ),
	) as FormulaField;
}

/** The body of CompileFormulaJs's function (for tests and debugging). */
export function FormulaJsSource(
	program: FormulaProgram,
	params: ReadonlyMap<string, readonly number[]>,
	frame: FractalFrame,
): string {
	const emit = new JsEmitter( params );
	const Body = ( statements: FormulaStmt[] ): string => {
		const lines: string[] = [];

		emit.Statements( statements, lines );
		return lines.join( "\n" );
	};
	const init = Body( program.Init );
	const iterate = Body( program.Iterate );
	const distance = program.Distance
		? `distance: {\n${ Body( program.Distance ) }\n}`
		: "de = 0.5 * Math.log( Math.max( v_r, 1e-30 ) ) * v_r / v_dr;";
	const [ cx, cy, cz ] = frame.Center.map( Literal );
	const scale = Literal( frame.Scale );
	const radius = frame.Invert;

	return `
let px = ( X - ${ cx } ) / ${ scale };
let py = ( Y - ${ cy } ) / ${ scale };
let pz = ( Z - ${ cz } ) / ${ scale };
let toWorld = ${ scale };
let clear = -Infinity;
${ radius > 0 ? `{
	const r2 = px * px + py * py + pz * pz;
	const s = ${ Literal( radius * radius ) } / Math.max( r2, 1e-30 );

	clear = ( ${ Literal( radius * radius / frame.Bailout ) }
		- Math.sqrt( r2 ) ) * ${ scale };
	px *= s; py *= s; pz *= s;
	toWorld /= s;
}` : "" }
const qdetail = detail / toWorld;
const v_p$x = px, v_p$y = py, v_p$z = pz;
let v_z$x = px, v_z$y = py, v_z$z = pz;
let v_c$x = px, v_c$y = py, v_c$z = pz;
let v_dr = 1;
let v_i = 0;
let v_r = Math.sqrt( px * px + py * py + pz * pz );
{
${ init }
}
v_r = Math.sqrt( v_z$x * v_z$x + v_z$y * v_z$y + v_z$z * v_z$z );
let trap = v_r;
for ( let n = 0; n < ${ frame.Iterations }
	&& v_r <= ${ Literal( frame.Bailout ) }; n++ ) {
	if ( qdetail * v_dr > 1 ) { break; }
	v_i = n;
	{
${ iterate }
	}
	v_r = Math.sqrt( v_z$x * v_z$x + v_z$y * v_z$y + v_z$z * v_z$z );
	if ( v_r < trap ) { trap = v_r; }
}
out[0] = Math.min( 1, trap / ${ Literal( frame.Bailout / 2 ) } );
let de = 0;
${ distance }
// at the inversion's center the orbit starts at infinity: no estimate there,
// the bound answers
if ( !( de > -1e30 && de < 1e30 ) ) { de = 0; }
return Math.max( de * toWorld * ${ Literal( frame.DistanceScale ) }, clear )
	- ${ Literal( frame.Thickness ) };
`;
}

/** A number as JavaScript reads it back exactly. */
function Literal( value: number ): string {
	return Object.is( value, -0 ) ? "0" : String( value );
}

class JsEmitter {
	private _temps = 0;

	/** Lines of the block being written. */
	private _out: string[] = [];

	public constructor(
		private readonly _params: ReadonlyMap<string, readonly number[]>,
	) {
	}

	public Statements( statements: FormulaStmt[], out: string[] ): void {
		const outer = this._out;

		this._out = out;
		for ( const statement of statements ) {
			this.Statement( statement );
		}
		this._out = outer;
	}

	private Statement( statement: FormulaStmt ): void {
		switch ( statement.Kind ) {
			case "Declare": {
				if ( statement.Type === "float" ) {
					const value = statement.Init
						? this.Expr( statement.Init ) as string
						: "0";

					this._out.push( `let v_${ statement.Name } = ${ value };` );
					return;
				}

				const value = statement.Init
					? this.Held( this.Expr( statement.Init ) as string[] )
					: [ "0", "0", "0" ];

				this._out.push( `let ${ [ 0, 1, 2 ].map(
					( k ) => `${
						VarName( statement.Name, k )
					} = ${ value[k] }`,
				).join( ", " ) };` );
				return;
			}
			case "Assign":
				this.Assign( statement );
				return;
			case "If": {
				const condition = this.Expr( statement.Condition ) as string;
				const then: string[] = [];

				this.Statements( statement.Then, then );
				this._out.push( `if ( ${ condition } ) {`, ...then, "}" );
				if ( statement.Else ) {
					const otherwise: string[] = [];

					this.Statements( statement.Else, otherwise );
					this._out.push( "else {", ...otherwise, "}" );
				}
				return;
			}
			case "Return":
				this._out.push(
					`de = ${ this.Expr( statement.Value ) as string };`,
					"break distance;",
				);
		}
	}

	private Assign(
		statement: Extract<FormulaStmt, { Kind: "Assign"; }>,
	): void {
		const value = this.Expr( statement.Value );
		const op = statement.Op === "=" ? "" : statement.Op[0]!;

		if ( typeof value === "string" ) {
			// a float into a float or a component, or spread over a vec3
			const targets = statement.Component !== null
				? [ VarName( statement.Name, statement.Component ) ]
				: statement.Target === "vec3"
					? [ 0, 1, 2 ].map( ( k ) => VarName( statement.Name, k ) )
					: [ `v_${ statement.Name }` ];
			const held = targets.length > 1 ? this.Hold( value ) : value;

			for ( const target of targets ) {
				this._out.push( op
					? `${ target } = ${ target } ${ op } ${ held };`
					: `${ target } = ${ held };` );
			}
			return;
		}

		// all three computed before any is written (z = z.yxz)
		const parts = value.map( ( part ) => this.Hold( part, true ) );

		for ( let k = 0; k < 3; k++ ) {
			const target = VarName( statement.Name, k );

			this._out.push( op
				? `${ target } = ${ target } ${ op } ${ parts[k] };`
				: `${ target } = ${ parts[k] };` );
		}
	}

	private Expr( expr: FormulaExpr ): Value {
		switch ( expr.Kind ) {
			case "Number":
				return Literal( expr.Value );
			case "Name":
				return this.Name( expr.Name, expr.Type! );
			case "Member": {
				const object = this.Expr( expr.Object ) as string[];

				return object[expr.Component]!;
			}
			case "Unary": {
				const operand = this.Expr( expr.Operand );

				if ( expr.Op === "!" ) {
					return `( !${ operand as string } )`;
				}
				return typeof operand === "string"
					? `( -${ operand } )`
					: this.Held( operand.map( ( part ) => `( -${ part } )` ) );
			}
			case "Binary":
				return this.Binary( expr );
			case "Call":
				return this.Call( expr );
		}
	}

	private Binary( expr: Extract<FormulaExpr, { Kind: "Binary"; }> ): Value {
		const left = this.Expr( expr.Left );
		const right = this.Expr( expr.Right );
		const op = expr.Op === "=="
			? "==="
			: expr.Op === "!="
				? "!=="
				: expr.Op;

		if ( typeof left === "string" && typeof right === "string" ) {
			return `( ${ left } ${ op } ${ right } )`;
		}

		const a = this.Spread( left );
		const b = this.Spread( right );

		return this.Held( [ 0, 1, 2 ].map(
			( k ) => `( ${ a[k] } ${ op } ${ b[k] } )`,
		) );
	}

	private Call( expr: Extract<FormulaExpr, { Kind: "Call"; }> ): Value {
		const args = expr.Args.map( ( arg ) => this.Expr( arg ) );
		const vec = args.some( ( arg ) => typeof arg !== "string" );
		// a function per component, any float argument spread
		const Each = ( fn: ( ...parts: string[] ) => string ): Value => {
			if ( !vec ) {
				return fn( ...args as string[] );
			}

			const spread = args.map( ( arg ) => this.Spread( arg ) );

			return this.Held( [ 0, 1, 2 ].map(
				( k ) => fn( ...spread.map( ( arg ) => arg[k]! ) ),
			) );
		};
		const Math1 = ( name: string ): Value => Each(
			( a ) => `Math.${ name }( ${ a } )`,
		);

		switch ( expr.Name ) {
			case "abs":
			case "sign":
			case "floor":
			case "sqrt":
			case "sin":
			case "cos":
			case "tan":
			case "asin":
			case "acos":
			case "exp":
			case "log":
			case "min":
			case "max":
				return expr.Name === "min" || expr.Name === "max"
					? Each(
						( a, b ) => `Math.${ expr.Name }( ${ a }, ${ b } )`,
					)
					: Math1( expr.Name );
			case "fract":
				return Each( ( a ) => {
					const held = this.Hold( a );

					return `( ${ held } - Math.floor( ${ held } ) )`;
				} );
			case "mod":
				return Each( ( a, b ) => {
					const x = this.Hold( a );
					const y = this.Hold( b );

					return `( ${ x } - ${ y } * Math.floor( ${ x } / ${ y } ) `
						+ ")";
				} );
			case "pow":
				// |x|^y: GLSL leaves a negative base undefined, so both take
				// its size
				return Each(
					( a, b ) => `Math.pow( Math.abs( ${ a } ), ${ b } )`,
				);
			case "atan":
				return `Math.atan2( ${ args[0] as string }, ${
					args[1] as string
				} )`;
			case "clamp":
				return Each(
					( a, lo, hi ) => (
						`Math.min( Math.max( ${ a }, ${ lo } ), ${ hi } )`
					),
				);
			case "mix":
				return Each( ( a, b, t ) => {
					const x = this.Hold( a );

					return `( ${ x } + ( ${ b } - ${ x } ) * ${ t } )`;
				} );
			case "length": {
				const [ x, y, z ] = args[0] as string[];

				return `Math.sqrt( ${ x } * ${ x } + ${ y } * ${ y } + ${ z } `
					+ `* ${ z } )`;
			}
			case "dot": {
				const a = args[0] as string[];
				const b = args[1] as string[];

				return `( ${ a[0] } * ${ b[0] } + ${ a[1] } * ${ b[1] } `
					+ `+ ${ a[2] } * ${ b[2] } )`;
			}
			case "cross": {
				const a = args[0] as string[];
				const b = args[1] as string[];

				return this.Held( [
					`( ${ a[1] } * ${ b[2] } - ${ a[2] } * ${ b[1] } )`,
					`( ${ a[2] } * ${ b[0] } - ${ a[0] } * ${ b[2] } )`,
					`( ${ a[0] } * ${ b[1] } - ${ a[1] } * ${ b[0] } )`,
				] );
			}
			case "normalize": {
				const [ x, y, z ] = args[0] as string[];
				const length = this.Hold(
					`Math.sqrt( ${ x } * ${ x } + ${ y } * ${ y } + ${ z } `
						+ `* ${ z } )`,
				);

				return this.Held(
					[ x!, y!, z! ].map(
						( part ) => `( ${ part } / ${ length } )`,
					),
				);
			}
			default: {
				// vec3( f ) or vec3( x, y, z )
				const parts = args as string[];

				return parts.length === 1
					? this.Spread( parts[0]! )
					: this.Held( parts );
			}
		}
	}

	/** A name's code: a parameter's value, or the variable. */
	private Name( name: string, type: string ): Value {
		const param = this._params.get( name );

		if ( param ) {
			return type === "vec3"
				? [
					Literal( param[0]! ),
					Literal( param[1]! ),
					Literal( param[2]! ),
				]
				: Literal( param[0]! );
		}
		return type === "vec3"
			? [ VarName( name, 0 ), VarName( name, 1 ), VarName( name, 2 ) ]
			: `v_${ name }`;
	}

	/** A float spread to three (held: computed once), a vec3 as it is. */
	private Spread( value: Value ): [ string, string, string ] {
		if ( typeof value !== "string" ) {
			return value;
		}

		const held = this.Hold( value );

		return [ held, held, held ];
	}

	private Held( parts: string[] ): [ string, string, string ] {
		return parts.map( ( part ) => this.Hold( part ) ) as [
			string,
			string,
			string,
		];
	}

	/**
	 * Code as a name: a constant for it unless it is one already (`fresh`:
	 * always a new one - before writing what it reads).
	 */
	private Hold( code: string, fresh = false ): string {
		if ( !fresh && Simple.test( code ) ) {
			return code;
		}

		const name = `_t${ this._temps++ }`;

		this._out.push( `const ${ name } = ${ code };` );
		return name;
	}
}

/** The JavaScript name of a vec3 variable's component. */
function VarName( name: string, component: number ): string {
	return `v_${ name }$${ "xyz"[component] }`;
}
