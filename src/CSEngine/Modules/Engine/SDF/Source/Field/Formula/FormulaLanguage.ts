// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * The language fractal formulas are written in (S6-26, the formula
 * editor): a small GLSL-like text, compiled to JavaScript for the CPU
 * (meshing, physics, rays) and to GLSL for the GPU, so both see the same
 * surface. A formula is
 *
 *   param <type> <name> = <constant> [in [min, max]];   (any number)
 *   init { ... }       once, before the first iteration (optional)
 *   iterate { ... }    every iteration
 *   distance { ... }   the estimate from where the orbit ended (optional;
 *                      by default 0.5 * log(r) * r / dr)
 *
 * over the orbit's state: `z` (vec3, starts at the point), `dr` (float,
 * starts at 1), `c` (vec3, starts at the point: set it to a constant for a
 * Julia set), read-only `p` (the point), `r` (|z| as the iteration began)
 * and `i` (the iteration). Types: float and vec3 (bool in conditions);
 * statements: declarations, =, +=, -=, *=, /=, if / else, and in `distance`
 * return. The frame around it - placing and scaling the fractal, sphere
 * inversion, the bailout, iterations cut by detail, the orbit trap - is the
 * same for every formula (FormulaFrame).
 */

/** A place in the source, 1-based. */
export interface FormulaPos {
	Line: number;
	Column: number;
}

/** What is wrong with a formula, and where. */
export class FormulaError extends Error {
	public constructor(
		message: string,
		public readonly Pos: FormulaPos,
	) {
		super( `${ Pos.Line }:${ Pos.Column }: ${ message }` );
		this.name = "FormulaError";
	}
}

export type FormulaType = "float" | "vec3" | "bool";

export type FormulaExpr =
	| { Kind: "Number"; Value: number; Pos: FormulaPos; Type?: FormulaType; }
	| { Kind: "Name"; Name: string; Pos: FormulaPos; Type?: FormulaType; }
	| {
		Kind: "Call";
		Name: string;
		Args: FormulaExpr[];
		Pos: FormulaPos;
		Type?: FormulaType;
	}
	| {
		Kind: "Unary";
		Op: "-" | "!";
		Operand: FormulaExpr;
		Pos: FormulaPos;
		Type?: FormulaType;
	}
	| {
		Kind: "Binary";
		Op: string;
		Left: FormulaExpr;
		Right: FormulaExpr;
		Pos: FormulaPos;
		Type?: FormulaType;
	}
	| {
		Kind: "Member";
		Object: FormulaExpr;
		Component: 0 | 1 | 2;
		Pos: FormulaPos;
		Type?: FormulaType;
	};

export type FormulaStmt =
	| {
		Kind: "Declare";
		Type: "float" | "vec3";
		Name: string;
		Init: FormulaExpr | null;
		Pos: FormulaPos;
	}
	| {
		Kind: "Assign";
		Name: string;
		Component: 0 | 1 | 2 | null;
		Op: "=" | "+=" | "-=" | "*=" | "/=";
		Value: FormulaExpr;
		Pos: FormulaPos;
		/** The variable's type (set by the checker). */
		Target?: "float" | "vec3";
	}
	| {
		Kind: "If";
		Condition: FormulaExpr;
		Then: FormulaStmt[];
		Else: FormulaStmt[] | null;
		Pos: FormulaPos;
	}
	| { Kind: "Return"; Value: FormulaExpr; Pos: FormulaPos; };

export interface FormulaParam {
	Name: string;
	Type: "float" | "vec3";
	/** One number, or three. */
	Default: number[];
	Min: number | null;
	Max: number | null;
	Pos: FormulaPos;
}

/** A parsed and checked formula. */
export interface FormulaProgram {
	Params: FormulaParam[];
	Init: FormulaStmt[];
	Iterate: FormulaStmt[];
	Distance: FormulaStmt[] | null;
}

/** The orbit's state as the frame keeps it: name, type, writable. */
export const FormulaState: ReadonlyArray<
	readonly [ string, "float" | "vec3", boolean ]
> = [
	[ "z", "vec3", true ],
	[ "dr", "float", true ],
	[ "c", "vec3", true ],
	[ "p", "vec3", false ],
	[ "r", "float", false ],
	[ "i", "float", false ],
];

/** Functions taking a float or a vec3 and working per component. */
const Componentwise1 = new Set( [
	"abs", "sign", "floor", "fract", "sqrt", "sin", "cos", "tan", "asin",
	"acos", "exp", "log",
] );

/** Two-argument ones per component (a float second argument spreads). */
const Componentwise2 = new Set( [ "min", "max", "mod", "pow" ] );

/** Every function a formula may call. */
export const FormulaFunctions: readonly string[] = [
	...Componentwise1,
	...Componentwise2,
	"atan", "clamp", "mix", "length", "dot", "cross", "normalize", "vec3",
];

const Keywords = new Set( [
	"param", "init", "iterate", "distance", "if", "else", "return", "float",
	"vec3", "in",
] );

interface Token {
	Kind: "number" | "name" | "symbol" | "end";
	Text: string;
	Value: number;
	Pos: FormulaPos;
}

const Symbols = [
	"+=", "-=", "*=", "/=", "==", "!=", "<=", ">=", "&&", "||",
	"+", "-", "*", "/", "=", "<", ">", "!", "(", ")", "{", "}", "[", "]",
	",", ";", ".",
];

/** Splits a formula into tokens; line and block comments are skipped. */
function Lex( source: string ): Token[] {
	const tokens: Token[] = [];
	let at = 0;
	let line = 1;
	let column = 1;
	const Advance = ( count: number ): void => {
		for ( let k = 0; k < count; k++ ) {
			if ( source[at] === "\n" ) {
				line++;
				column = 1;
			} else {
				column++;
			}
			at++;
		}
	};

	while ( at < source.length ) {
		const ch = source[at]!;
		const pos = { Line: line, Column: column };

		if ( /\s/.test( ch ) ) {
			Advance( 1 );
			continue;
		}
		if ( source.startsWith( "//", at ) ) {
			while ( at < source.length && source[at] !== "\n" ) {
				Advance( 1 );
			}
			continue;
		}
		if ( source.startsWith( "/*", at ) ) {
			const end = source.indexOf( "*/", at + 2 );

			if ( end < 0 ) {
				throw new FormulaError( "unclosed comment", pos );
			}
			Advance( end + 2 - at );
			continue;
		}

		const number = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(
			source.slice( at ),
		);

		if ( number ) {
			tokens.push( {
				Kind: "number",
				Text: number[0],
				Value: Number( number[0] ),
				Pos: pos,
			} );
			Advance( number[0].length );
			continue;
		}

		const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec( source.slice( at ) );

		if ( name ) {
			tokens.push( { Kind: "name", Text: name[0], Value: 0, Pos: pos } );
			Advance( name[0].length );
			continue;
		}

		const symbol = Symbols.find( ( s ) => source.startsWith( s, at ) );

		if ( !symbol ) {
			throw new FormulaError( `unexpected '${ ch }'`, pos );
		}
		tokens.push( { Kind: "symbol", Text: symbol, Value: 0, Pos: pos } );
		Advance( symbol.length );
	}
	tokens.push( {
		Kind: "end",
		Text: "end of formula",
		Value: 0,
		Pos: { Line: line, Column: column },
	} );
	return tokens;
}

/** Recursive descent over the tokens. */
class Parser {
	private _at = 0;

	public constructor( private readonly _tokens: Token[] ) {
	}

	public Program(): FormulaProgram {
		const program: FormulaProgram = {
			Params: [],
			Init: [],
			Iterate: [],
			Distance: null,
		};
		const seen = new Set<string>();

		while ( this.Peek().Kind !== "end" ) {
			const token = this.Next();

			if ( token.Text === "param" ) {
				program.Params.push( this.Param() );
				continue;
			}
			if ( token.Text !== "init" && token.Text !== "iterate"
				&& token.Text !== "distance" ) {
				throw new FormulaError(
					"expected 'param', 'init', 'iterate' or 'distance', not "
						+ `'${ token.Text }'`,
					token.Pos,
				);
			}
			if ( seen.has( token.Text ) ) {
				throw new FormulaError(
					`'${ token.Text }' twice`,
					token.Pos,
				);
			}
			seen.add( token.Text );

			const block = this.Block();

			if ( token.Text === "init" ) {
				program.Init = block;
			} else if ( token.Text === "iterate" ) {
				program.Iterate = block;
			} else {
				program.Distance = block;
			}
		}
		if ( !seen.has( "iterate" ) ) {
			throw new FormulaError(
				"no 'iterate' block",
				this.Peek().Pos,
			);
		}
		return program;
	}

	private Param(): FormulaParam {
		const type = this.Type();
		const name = this.Name();

		this.Expect( "=" );

		const value = this.Expression();
		const Default = ConstantOf( value );

		if ( Default.length !== ( type === "vec3" ? 3 : 1 ) ) {
			throw new FormulaError(
				`'${ name.Text }' is a ${ type }`,
				value.Pos,
			);
		}

		let min: number | null = null;
		let max: number | null = null;

		if ( this.Accept( "in" ) ) {
			this.Expect( "[" );
			min = this.Number();
			this.Expect( "," );
			max = this.Number();
			this.Expect( "]" );
		}
		this.Expect( ";" );
		return {
			Name: name.Text,
			Type: type,
			Default,
			Min: min,
			Max: max,
			Pos: name.Pos,
		};
	}

	private Block(): FormulaStmt[] {
		const statements: FormulaStmt[] = [];

		this.Expect( "{" );
		while ( !this.Accept( "}" ) ) {
			statements.push( this.Statement() );
		}
		return statements;
	}

	private Statement(): FormulaStmt {
		const token = this.Peek();

		if ( token.Text === "float" || token.Text === "vec3" ) {
			const type = this.Type();
			const name = this.Name();
			const init = this.Accept( "=" ) ? this.Expression() : null;

			this.Expect( ";" );
			return {
				Kind: "Declare",
				Type: type,
				Name: name.Text,
				Init: init,
				Pos: name.Pos,
			};
		}
		if ( this.Accept( "if" ) ) {
			this.Expect( "(" );

			const condition = this.Expression();

			this.Expect( ")" );

			const then = this.Block();
			let otherwise: FormulaStmt[] | null = null;

			if ( this.Accept( "else" ) ) {
				otherwise = this.Peek().Text === "if"
					? [ this.Statement() ]
					: this.Block();
			}
			return {
				Kind: "If",
				Condition: condition,
				Then: then,
				Else: otherwise,
				Pos: token.Pos,
			};
		}
		if ( this.Accept( "return" ) ) {
			const value = this.Expression();

			this.Expect( ";" );
			return { Kind: "Return", Value: value, Pos: token.Pos };
		}

		const name = this.Name();
		let component: 0 | 1 | 2 | null = null;

		if ( this.Accept( "." ) ) {
			component = this.Component();
		}

		const op = this.Next();

		if ( ![ "=", "+=", "-=", "*=", "/=" ].includes( op.Text ) ) {
			throw new FormulaError(
				`expected an assignment, not '${ op.Text }'`,
				op.Pos,
			);
		}

		const value = this.Expression();

		this.Expect( ";" );
		return {
			Kind: "Assign",
			Name: name.Text,
			Component: component,
			Op: op.Text as "=",
			Value: value,
			Pos: name.Pos,
		};
	}

	private Expression(): FormulaExpr {
		return this.BinaryLevel( 0 );
	}

	/** Binary operators by precedence, lowest first. */
	private static readonly Levels = [
		[ "||" ],
		[ "&&" ],
		[ "==", "!=", "<", ">", "<=", ">=" ],
		[ "+", "-" ],
		[ "*", "/" ],
	];

	private BinaryLevel( level: number ): FormulaExpr {
		if ( level === Parser.Levels.length ) {
			return this.Unary();
		}

		let left = this.BinaryLevel( level + 1 );

		for ( ;; ) {
			const token = this.Peek();

			if ( token.Kind !== "symbol"
				|| !Parser.Levels[level]!.includes( token.Text ) ) {
				return left;
			}
			this.Next();
			// comparisons don't chain
			const right = this.BinaryLevel( level + 1 );

			left = {
				Kind: "Binary",
				Op: token.Text,
				Left: left,
				Right: right,
				Pos: token.Pos,
			};
			if ( level === 2 ) {
				return left;
			}
		}
	}

	private Unary(): FormulaExpr {
		const token = this.Peek();

		if ( token.Text === "-" || token.Text === "!" ) {
			this.Next();
			return {
				Kind: "Unary",
				Op: token.Text,
				Operand: this.Unary(),
				Pos: token.Pos,
			};
		}

		let expr = this.Primary();

		while ( this.Accept( "." ) ) {
			expr = {
				Kind: "Member",
				Object: expr,
				Component: this.Component(),
				Pos: expr.Pos,
			};
		}
		return expr;
	}

	private Primary(): FormulaExpr {
		const token = this.Next();

		if ( token.Kind === "number" ) {
			return { Kind: "Number", Value: token.Value, Pos: token.Pos };
		}
		if ( token.Text === "(" ) {
			const inner = this.Expression();

			this.Expect( ")" );
			return inner;
		}
		if ( token.Kind === "name"
			&& ( !Keywords.has( token.Text ) || token.Text === "vec3" ) ) {
			if ( this.Accept( "(" ) ) {
				const args: FormulaExpr[] = [];

				if ( !this.Accept( ")" ) ) {
					do {
						args.push( this.Expression() );
					} while ( this.Accept( "," ) );
					this.Expect( ")" );
				}
				return {
					Kind: "Call",
					Name: token.Text,
					Args: args,
					Pos: token.Pos,
				};
			}
			return { Kind: "Name", Name: token.Text, Pos: token.Pos };
		}
		throw new FormulaError(
			`expected a value, not '${ token.Text }'`,
			token.Pos,
		);
	}

	private Component(): 0 | 1 | 2 {
		const token = this.Next();
		const index = [ "x", "y", "z" ].indexOf( token.Text );

		if ( index < 0 ) {
			throw new FormulaError(
				`expected x, y or z, not '${ token.Text }'`,
				token.Pos,
			);
		}
		return index as 0 | 1 | 2;
	}

	private Type(): "float" | "vec3" {
		const token = this.Next();

		if ( token.Text !== "float" && token.Text !== "vec3" ) {
			throw new FormulaError(
				`expected float or vec3, not '${ token.Text }'`,
				token.Pos,
			);
		}
		return token.Text;
	}

	private Name(): Token {
		const token = this.Next();

		if ( token.Kind !== "name" || Keywords.has( token.Text ) ) {
			throw new FormulaError(
				`expected a name, not '${ token.Text }'`,
				token.Pos,
			);
		}
		return token;
	}

	private Number(): number {
		const negative = this.Accept( "-" );
		const token = this.Next();

		if ( token.Kind !== "number" ) {
			throw new FormulaError(
				`expected a number, not '${ token.Text }'`,
				token.Pos,
			);
		}
		return negative ? -token.Value : token.Value;
	}

	private Peek(): Token {
		return this._tokens[this._at]!;
	}

	private Next(): Token {
		const token = this._tokens[this._at]!;

		if ( token.Kind !== "end" ) {
			this._at++;
		}
		return token;
	}

	private Accept( text: string ): boolean {
		const token = this.Peek();

		if ( token.Kind !== "number" && token.Text === text ) {
			this._at++;
			return true;
		}
		return false;
	}

	private Expect( text: string ): void {
		const token = this.Next();

		if ( token.Kind === "number" || token.Text !== text ) {
			throw new FormulaError(
				`expected '${ text }', not '${ token.Text }'`,
				token.Pos,
			);
		}
	}
}

/** A parameter's default: a number, -number or vec3 of numbers. */
function ConstantOf( expr: FormulaExpr ): number[] {
	if ( expr.Kind === "Number" ) {
		return [ expr.Value ];
	}
	if ( expr.Kind === "Unary" && expr.Op === "-" ) {
		const inner = ConstantOf( expr.Operand );

		if ( inner.length === 1 ) {
			return [ -inner[0]! ];
		}
	}
	if ( expr.Kind === "Call" && expr.Name === "vec3" ) {
		const parts = expr.Args.map( ConstantOf );

		if ( parts.every( ( part ) => part.length === 1 ) ) {
			const values = parts.map( ( part ) => part[0]! );

			if ( values.length === 3 ) {
				return values;
			}
			if ( values.length === 1 ) {
				return [ values[0]!, values[0]!, values[0]! ];
			}
		}
	}
	throw new FormulaError( "a parameter's value is a constant", expr.Pos );
}

/** What a name stands for while checking. */
interface Symbol {
	Type: "float" | "vec3";
	Writable: boolean;
}

/** Types every expression and checks every name, assignment and return. */
class Checker {
	private readonly _scopes: Array<Map<string, Symbol>> = [];

	public constructor( private readonly _program: FormulaProgram ) {
	}

	public Check(): void {
		const globals = new Map<string, Symbol>();

		for ( const [ name, type, writable ] of FormulaState ) {
			globals.set( name, { Type: type, Writable: writable } );
		}
		for ( const param of this._program.Params ) {
			if ( globals.has( param.Name ) ) {
				throw new FormulaError(
					`'${ param.Name }' is taken`,
					param.Pos,
				);
			}
			globals.set( param.Name, { Type: param.Type, Writable: false } );
		}
		this._scopes.push( globals );
		this.Block( this._program.Init, false );
		this.Block( this._program.Iterate, false );
		if ( this._program.Distance ) {
			const distance = this._program.Distance;

			this.Block( distance, true );
			if ( !EndsInReturn( distance ) ) {
				throw new FormulaError(
					"'distance' must end in a return on every path",
					distance.at( -1 )?.Pos ?? { Line: 1, Column: 1 },
				);
			}
		}
	}

	private Block( statements: FormulaStmt[], distance: boolean ): void {
		this._scopes.push( new Map() );
		for ( const statement of statements ) {
			this.Statement( statement, distance );
		}
		this._scopes.pop();
	}

	private Statement( statement: FormulaStmt, distance: boolean ): void {
		switch ( statement.Kind ) {
			case "Declare": {
				const scope = this._scopes.at( -1 )!;

				if ( this.Lookup( statement.Name ) ) {
					throw new FormulaError(
						`'${ statement.Name }' is taken`,
						statement.Pos,
					);
				}
				if ( statement.Init ) {
					this.Expect( statement.Init, statement.Type );
				}
				scope.set( statement.Name, {
					Type: statement.Type,
					Writable: true,
				} );
				return;
			}
			case "Assign": {
				const symbol = this.Lookup( statement.Name );

				if ( !symbol ) {
					throw new FormulaError(
						`no '${ statement.Name }'`,
						statement.Pos,
					);
				}
				if ( !symbol.Writable ) {
					throw new FormulaError(
						`'${ statement.Name }' can't be changed`,
						statement.Pos,
					);
				}

				let target: FormulaType = symbol.Type;

				statement.Target = symbol.Type;

				if ( statement.Component !== null ) {
					if ( target !== "vec3" ) {
						throw new FormulaError(
							`'${ statement.Name }' has no components`,
							statement.Pos,
						);
					}
					target = "float";
				}

				const value = this.Type( statement.Value );

				// a float spreads over a vec3 in *= and /=
				if ( value !== target && !( target === "vec3"
					&& value === "float"
					&& ( statement.Op === "*=" || statement.Op === "/=" ) ) ) {
					throw new FormulaError(
						`a ${ value } can't go into a ${ target }`,
						statement.Value.Pos,
					);
				}
				return;
			}
			case "If":
				this.Expect( statement.Condition, "bool" );
				this.Block( statement.Then, distance );
				if ( statement.Else ) {
					this.Block( statement.Else, distance );
				}
				return;
			case "Return":
				if ( !distance ) {
					throw new FormulaError(
						"return only in 'distance'",
						statement.Pos,
					);
				}
				this.Expect( statement.Value, "float" );
				return;
		}
	}

	private Expect( expr: FormulaExpr, type: FormulaType ): void {
		const actual = this.Type( expr );

		if ( actual !== type ) {
			throw new FormulaError(
				`expected a ${ type }, not a ${ actual }`,
				expr.Pos,
			);
		}
	}

	private Type( expr: FormulaExpr ): FormulaType {
		expr.Type = this.Infer( expr );
		return expr.Type;
	}

	private Infer( expr: FormulaExpr ): FormulaType {
		switch ( expr.Kind ) {
			case "Number":
				return "float";
			case "Name": {
				const symbol = this.Lookup( expr.Name );

				if ( !symbol ) {
					throw new FormulaError( `no '${ expr.Name }'`, expr.Pos );
				}
				return symbol.Type;
			}
			case "Member":
				if ( this.Type( expr.Object ) !== "vec3" ) {
					throw new FormulaError(
						"only a vec3 has x, y, z",
						expr.Pos,
					);
				}
				return "float";
			case "Unary": {
				const operand = this.Type( expr.Operand );

				if ( expr.Op === "!"
					? operand !== "bool"
					: operand === "bool" ) {
					throw new FormulaError(
						`'${ expr.Op }' doesn't take a ${ operand }`,
						expr.Pos,
					);
				}
				return operand;
			}
			case "Binary":
				return this.InferBinary( expr );
			case "Call":
				return this.InferCall( expr );
		}
	}

	private InferBinary(
		expr: Extract<FormulaExpr, { Kind: "Binary"; }>,
	): FormulaType {
		const left = this.Type( expr.Left );
		const right = this.Type( expr.Right );

		if ( expr.Op === "&&" || expr.Op === "||" ) {
			if ( left !== "bool" || right !== "bool" ) {
				throw new FormulaError(
					`'${ expr.Op }' joins conditions`,
					expr.Pos,
				);
			}
			return "bool";
		}
		if ( left === "bool" || right === "bool" ) {
			throw new FormulaError(
				`'${ expr.Op }' doesn't take a bool`,
				expr.Pos,
			);
		}
		if ( [ "==", "!=", "<", ">", "<=", ">=" ].includes( expr.Op ) ) {
			if ( left !== "float" || right !== "float" ) {
				throw new FormulaError( "only floats compare", expr.Pos );
			}
			return "bool";
		}
		// + - * / per component; a float spreads over a vec3
		return left === "vec3" || right === "vec3" ? "vec3" : "float";
	}

	private InferCall(
		expr: Extract<FormulaExpr, { Kind: "Call"; }>,
	): FormulaType {
		const args = expr.Args.map( ( arg ) => this.Type( arg ) );
		const Wrong = (): FormulaError => new FormulaError(
			`${ expr.Name }( ${ args.join( ", " ) } ) doesn't exist`,
			expr.Pos,
		);

		if ( args.includes( "bool" ) ) {
			throw Wrong();
		}

		const name = expr.Name;
		const [ a, b, c ] = args;

		if ( Componentwise1.has( name ) ) {
			if ( args.length !== 1 ) {
				throw Wrong();
			}
			return a!;
		}
		if ( Componentwise2.has( name ) ) {
			if ( args.length !== 2 || ( a === "float" && b === "vec3" ) ) {
				throw Wrong();
			}
			return a!;
		}
		switch ( name ) {
			case "atan":
				if ( args.length !== 2 || a !== "float" || b !== "float" ) {
					throw Wrong();
				}
				return "float";
			case "clamp":
				if ( args.length !== 3 || b !== c
					|| ( a === "float" && b === "vec3" ) ) {
					throw Wrong();
				}
				return a!;
			case "mix":
				if ( args.length !== 3 || a !== b || c !== "float" ) {
					throw Wrong();
				}
				return a!;
			case "length":
				if ( args.length !== 1 || a !== "vec3" ) {
					throw Wrong();
				}
				return "float";
			case "dot":
				if ( args.length !== 2 || a !== "vec3" || b !== "vec3" ) {
					throw Wrong();
				}
				return "float";
			case "cross":
				if ( args.length !== 2 || a !== "vec3" || b !== "vec3" ) {
					throw Wrong();
				}
				return "vec3";
			case "normalize":
				if ( args.length !== 1 || a !== "vec3" ) {
					throw Wrong();
				}
				return "vec3";
			case "vec3":
				if ( !( args.length === 1 || args.length === 3 )
					|| args.some( ( arg ) => arg !== "float" ) ) {
					throw Wrong();
				}
				return "vec3";
			default:
				throw new FormulaError( `no function '${ name }'`, expr.Pos );
		}
	}

	private Lookup( name: string ): Symbol | undefined {
		for ( let i = this._scopes.length - 1; i >= 0; i-- ) {
			const symbol = this._scopes[i]!.get( name );

			if ( symbol ) {
				return symbol;
			}
		}
		return undefined;
	}
}

/** Whether every path through these statements returns. */
function EndsInReturn( statements: FormulaStmt[] ): boolean {
	const last = statements.at( -1 );

	if ( !last ) {
		return false;
	}
	if ( last.Kind === "Return" ) {
		return true;
	}
	return last.Kind === "If" && last.Else !== null
		&& EndsInReturn( last.Then ) && EndsInReturn( last.Else );
}

/** Parses and checks a formula; throws a FormulaError with its place. */
export function ParseFormula( source: string ): FormulaProgram {
	const program = new Parser( Lex( source ) ).Program();

	new Checker( program ).Check();
	return program;
}
