// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	Primitives, type ContractFile, type Declaration, type Diagnostic,
	type EnumMember, type Field, type Method, type Position, type Primitive,
	type TypeRef,
} from "./Syntax.ts";

interface Token extends Position {
	Kind: "name" | "number" | "symbol" | "end";
	Text: string;
	/** The /// lines right before it. */
	Doc: string;
}

/** Words neither language lets a name be (and the language's own). */
const Reserved = new Set( [
	"abstract", "as", "async", "await", "base", "bool", "boolean", "break",
	"byte", "case", "catch", "char", "checked", "class", "const", "continue",
	"decimal", "default", "delegate", "delete", "do", "double", "else", "enum",
	"event", "explicit", "export", "extends", "extern", "false", "finally",
	"fixed", "float", "for", "foreach", "function", "goto", "if", "implicit",
	"implements", "import", "in", "instanceof", "int", "interface", "internal",
	"is", "let", "lock", "long", "namespace", "new", "null", "object",
	"operator", "out", "override", "package", "params", "private", "protected",
	"public", "readonly", "ref", "return", "sbyte", "sealed", "short", "sizeof",
	"stackalloc", "static", "string", "struct", "super", "switch", "this",
	"throw", "true", "try", "typeof", "uint", "ulong", "unchecked", "unsafe",
	"ushort", "using", "var", "virtual", "void", "volatile", "while", "with",
	"yield", "contract", "bytes", "vec3", "quat", "constructor", "prototype",
] );

class ParseError extends Error {
	public constructor( message: string, public readonly At: Position ) {
		super( message );
	}
}

function Tokenize( text: string ): Token[] {
	const tokens: Token[] = [];
	let line = 1;
	let column = 1;
	let doc: string[] = [];
	let i = 0;
	const advance = ( count: number ): void => {
		for ( let k = 0; k < count; k++ ) {
			if ( text[i] === "\n" ) {
				line++;
				column = 1;
			}
			else {
				column++;
			}
			i++;
		}
	};

	while ( i < text.length ) {
		const c = text[i]!;

		if ( /\s/.test( c ) ) {
			advance( 1 );
			continue;
		}
		if ( text.startsWith( "///", i ) ) {
			const end = text.indexOf( "\n", i );
			const stop = end < 0 ? text.length : end;
			doc.push( text.slice( i + 3, stop ).trim() );
			advance( stop - i );
			continue;
		}
		if ( text.startsWith( "//", i ) ) {
			const end = text.indexOf( "\n", i );
			advance( ( end < 0 ? text.length : end ) - i );
			continue;
		}
		if ( text.startsWith( "/*", i ) ) {
			const end = text.indexOf( "*/", i + 2 );

			if ( end < 0 ) {
				throw new ParseError(
					"A comment that never ends (*/ is missing)",
					{ Line: line, Column: column },
				);
			}
			advance( end + 2 - i );
			continue;
		}
		const at = { Line: line, Column: column };
		const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec( text.slice( i ) );
		const number = /^-?[0-9]+/.exec( text.slice( i ) );
		const match = word ?? number;
		const kind = word ? "name" : number ? "number" : "symbol";
		const value = match?.[0] ?? c;

		if ( kind === "symbol" && !"{}():;,?[]=.".includes( c ) ) {
			throw new ParseError( `Unexpected "${ c }"`, at );
		}
		tokens.push(
			{ Kind: kind, Text: value, Doc: doc.join( "\n" ), ...at },
		);
		doc = [];
		advance( value.length );
	}
	tokens.push(
		{ Kind: "end", Text: "", Doc: "", Line: line, Column: column },
	);
	return tokens;
}

class Parser {
	private _at = 0;

	public constructor( private readonly _tokens: Token[] ) {
	}

	private get Next(): Token {
		return this._tokens[this._at]!;
	}

	public File( path: string ): ContractFile {
		let namespace = "";

		if ( this.Next.Text === "namespace" && this.Next.Kind === "name" ) {
			this.Take();
			const parts = [this.Name( "a namespace" )];

			while ( this.Accept( "." ) ) {
				parts.push( this.Name( "a namespace" ) );
			}
			this.Expect( ";" );
			namespace = parts.join( "." );
		}
		const declarations: Declaration[] = [];

		while ( this.Next.Kind !== "end" ) {
			declarations.push( this.Declaration() );
		}
		return { Path: path, Namespace: namespace, Declarations: declarations };
	}

	private Declaration(): Declaration {
		const start = this.Next;
		const keyword = this.Take();

		switch ( keyword.Kind === "name" ? keyword.Text : "" ) {
			case "contract": return this.Contract( start );
			case "struct": return this.Struct( start );
			case "enum": return this.Enum( start );
			default:
				throw new ParseError(
					`Expected contract, struct or enum, found ${
						Describe( keyword ) }`,
					keyword,
				);
		}
	}

	private Contract( start: Token ): Declaration {
		const name = this.Name( "a contract name" );
		const methods: Method[] = [];

		this.Expect( "{" );
		while ( !this.Accept( "}" ) ) {
			const token = this.Next;
			const method = this.Name( "a method name" );
			const params: Field[] = [];

			this.Expect( "(" );
			while ( !this.Accept( ")" ) ) {
				params.push( this.Field( "a parameter name" ) );
				if ( this.Next.Text !== ")" ) {
					this.Expect( "," );
				}
			}
			if ( this.Next.Kind === "name"
				&& ( Primitives as readonly string[] )
					.includes( this.Next.Text ) ) {
				throw new ParseError(
					`Expected ":" before the return type, found ${
						Describe( this.Next ) }`,
					this.Next,
				);
			}
			const returns = this.Accept( ":" ) ? this.Type() : null;
			this.Accept( ";" );
			methods.push( {
				Name: method, Params: params,
				Returns: returns?.Kind === "named" && returns.Name === "void"
					? null
					: returns,
				Doc: token.Doc, Line: token.Line, Column: token.Column,
			} );
		}
		return {
			Kind: "contract", Name: name, Methods: methods, Doc: start.Doc,
			Line: start.Line, Column: start.Column,
		};
	}

	private Struct( start: Token ): Declaration {
		const name = this.Name( "a struct name" );
		const fields: Field[] = [];

		this.Expect( "{" );
		while ( !this.Accept( "}" ) ) {
			fields.push( this.Field( "a field name" ) );
			if ( !this.Accept( ";" ) ) {
				this.Accept( "," );
			}
		}
		return {
			Kind: "struct", Name: name, Fields: fields, Doc: start.Doc,
			Line: start.Line, Column: start.Column,
		};
	}

	private Enum( start: Token ): Declaration {
		const name = this.Name( "an enum name" );
		const members: EnumMember[] = [];
		let value = 0;

		this.Expect( "{" );
		while ( !this.Accept( "}" ) ) {
			const token = this.Next;
			const member = this.Name( "an enum member" );

			if ( this.Accept( "=" ) ) {
				const number = this.Take();

				if ( number.Kind !== "number" ) {
					throw new ParseError(
						"Expected a whole number, "
							+ `found ${ Describe( number ) }`,
						number,
					);
				}
				value = Number( number.Text );
			}
			members.push( {
				Name: member, Value: value, Doc: token.Doc,
				Line: token.Line, Column: token.Column,
			} );
			value++;
			if ( !this.Accept( "," ) ) {
				this.Accept( ";" );
			}
		}
		return {
			Kind: "enum", Name: name, Members: members, Doc: start.Doc,
			Line: start.Line, Column: start.Column,
		};
	}

	private Field( what: string ): Field {
		const token = this.Next;
		const name = this.Name( what );

		this.Expect( ":" );
		return {
			Name: name, Type: this.Type(), Doc: token.Doc,
			Line: token.Line, Column: token.Column,
		};
	}

	/** int, Hit, string?, int[], Hit?[]? */
	private Type(): TypeRef {
		const token = this.Take();

		if ( token.Kind !== "name" ) {
			throw new ParseError(
				`Expected a type, found ${ Describe( token ) }`,
				token,
			);
		}
		let type: TypeRef = ( Primitives as readonly string[] ).includes(
			token.Text,
		)
			? {
				Kind: "primitive",
				Name: token.Text as Primitive,
				Nullable: false,
			}
			: { Kind: "named", Name: token.Text, Nullable: false };

		type.Nullable = this.Accept( "?" );
		while ( this.Accept( "[" ) ) {
			this.Expect( "]" );
			type = {
				Kind: "array",
				Element: type,
				Nullable: this.Accept( "?" ),
			};
		}
		return type;
	}

	private Name( what: string ): string {
		const token = this.Take();

		if ( token.Kind !== "name" ) {
			throw new ParseError(
				`Expected ${ what }, found ${ Describe( token ) }`,
				token,
			);
		}
		if ( token.Text.endsWith( "_" ) ) {
			throw new ParseError(
				`"${ token.Text }": names ending with "_" are kept for the `
					+ "generated code",
				token,
			);
		}
		if ( what === "a parameter name" && !/^[a-z]/.test( token.Text ) ) {
			throw new ParseError(
				`Parameter "${ token.Text }" must start with a small letter `
					+ "(points, not Points)",
				token,
			);
		}
		if ( Reserved.has( token.Text ) ) {
			throw new ParseError(
				`"${ token.Text }" is a reserved word, it can't be ${ what }`,
				token,
			);
		}
		return token.Text;
	}

	private Expect( symbol: string ): void {
		const token = this.Take();

		if ( token.Text !== symbol || token.Kind !== "symbol" ) {
			throw new ParseError(
				`Expected "${ symbol }", found ${ Describe( token ) }`,
				token,
			);
		}
	}

	private Accept( symbol: string ): boolean {
		if ( this.Next.Kind === "symbol" && this.Next.Text === symbol ) {
			this._at++;
			return true;
		}
		return false;
	}

	private Take(): Token {
		const token = this.Next;

		if ( token.Kind !== "end" ) {
			this._at++;
		}
		return token;
	}
}

function Describe( token: Token ): string {
	return token.Kind === "end" ? "the end of the file" : `"${ token.Text }"`;
}

/** Reads a .contract file; a syntax error is a diagnostic (and no file). */
export function Parse(
	path: string,
	text: string,
): ContractFile | Diagnostic {
	try {
		return new Parser( Tokenize( text ) ).File( path );
	} catch ( error ) {
		const { At, message } = error as ParseError;

		return { Path: path, Message: message, ...At };
	}
}
