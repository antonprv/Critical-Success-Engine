// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { ContractModel } from "./Check.ts";
import {
	QualifiedName, type ContractFile, type Declaration, type Field,
	type TypeRef,
} from "./Syntax.ts";

// The TypeScript side of a .contract file: interfaces, enums, a Contract for
// DI per contract, and how values cross to C# (as MessagePack arrays).

/** Where the generated code finds the engine. */
export const TypeScriptImports = {
	Di: "@cse/di",
	Scripting: "@cse/scripting",
	Vec3: "@cse/core/Engine/Math/Vec3",
	Quat: "@cse/core/Engine/Math/Quat",
};

/** "Contracts/Score.contract" -> "Contracts/Score.contract.ts". */
export const TypeScriptPath = ( path: string ): string => `${ path }.ts`;

const Header = [
	"// Generated from a .contract file by the engine (Contracts/Compile.ts).",
	"// Do not edit: it is rewritten whenever the .contract file changes.",
	"",
];

function Doc( text: string, indent: string ): string[] {
	if ( text === "" ) {
		return [];
	}
	const lines = text.split( "\n" );

	return lines.length === 1
		? [`${ indent }/** ${ lines[0] } */`]
		: [
			`${ indent }/**`,
			...lines.map( ( line ) => `${ indent } * ${ line }`.trimEnd() ),
			`${ indent } */`,
		];
}

/** The module path from one generated file to another. */
function Relative( from: string, to: string ): string {
	const a = from.split( "/" ).slice( 0, -1 );
	const b = to.split( "/" );
	let common = 0;

	while ( common < a.length && common < b.length - 1
		&& a[common] === b[common] ) {
		common++;
	}
	const up = a.slice( common ).map( () => ".." );
	const path = [...up, ...b.slice( common )].join( "/" );

	// with its extension: "./Geometry.contract" would be the .contract file
	return `${ up.length === 0 ? `./${ path }` : path }.ts`;
}

class Writer {
	public readonly Lines: string[] = [];

	/** Names used from other files: module -> names (and type-only ones). */
	private readonly _imports = new Map<string, Map<string, boolean>>();

	public constructor(
		private readonly _model: ContractModel,
		private readonly _file: ContractFile,
	) {
	}

	public Import( module: string, name: string, typeOnly = false ): void {
		const names = this._imports.get( module ) ?? new Map<string, boolean>();
		names.set( name, ( names.get( name ) ?? true ) && typeOnly );
		this._imports.set( module, names );
	}

	public ImportLines(): string[] {
		return [...this._imports].map( ( [module, names] ) => {
			const list = [...names].map(
				( [name, typeOnly] ) => ( typeOnly ? `type ${ name }` : name ),
			).sort( ( x, y ) => x.replace( "type ", "" ).localeCompare(
				y.replace( "type ", "" ),
			) );

			return `import { ${ list.join( ", " ) } } from "${ module }";`;
		} );
	}

	/** A named type: imported when another file declares it. */
	public Named( name: string, typeOnly: boolean ): Declaration {
		const found = this._model.Resolve( this._file, name )!;

		if ( found.File !== this._file ) {
			const module = Relative(
				this._file.Path,
				found.File.Path,
			);
			this.Import( module, name, typeOnly );
		}
		return found.Declaration;
	}

	/**
	 * A struct's ...Wire (imported when another file declares it); false for an
	 * enum.
	 */
	private Wire( name: string ): boolean {
		const found = this._model.Resolve( this._file, name )!;

		if ( found.Declaration.Kind !== "struct" ) {
			return false;
		}
		if ( found.File !== this._file ) {
			this.Import(
				Relative( this._file.Path, found.File.Path ),
				`${ name }Wire`,
			);
		}
		return true;
	}

	public Type( type: TypeRef ): string {
		let text: string;

		switch ( type.Kind ) {
			case "array": {
				const element = this.Type( type.Element );
				text = type.Element.Nullable
					? `( ${ element } )[]`
					: `${ element }[]`;
				break;
			}
			case "named":
				this.Named( type.Name, true );
				text = type.Name;
				break;
			default:
				text = {
					bool: "boolean", int: "number", float: "number",
					double: "number", string: "string", bytes: "Uint8Array",
					vec3: "Vec3", quat: "Quat",
				}[type.Name];
				if ( type.Name === "vec3" || type.Name === "quat" ) {
					this.Import(
						type.Name === "vec3"
							? TypeScriptImports.Vec3
							: TypeScriptImports.Quat,
						text,
						true,
					);
				}
		}
		return type.Nullable ? `${ text } | null` : text;
	}

	/** An expression giving the wire form of `value` (null: as it is). */
	public ToWire( type: TypeRef, value: string, depth = 0 ): string | null {
		if ( !type.Nullable ) {
			return this.ToWirePlain( type, value, depth );
		}
		const item = `v${ depth }_`;
		const plain = this.ToWirePlain( type, item, depth + 1 );

		return plain === null ? null : this.Maybe( value, item, plain );
	}

	/** An expression reading `wire` (an unknown) as the type. */
	public FromWire( type: TypeRef, wire: string, depth = 0 ): string {
		const item = `v${ depth }_`;
		const plain = this.FromWirePlain(
			type,
			type.Nullable ? item : wire,
			depth + 1,
		);

		if ( plain === null ) {
			return `${ wire } as ${ this.Type( type ) }`;
		}
		return type.Nullable ? this.Maybe( wire, item, plain ) : plain;
	}

	/** `convert` applied to a value unless it is null (evaluated once). */
	private Maybe( value: string, item: string, convert: string ): string {
		this.Import( TypeScriptImports.Scripting, "Wire" );
		return `Wire.Maybe( ${ value }, ( ${ item } ) => ${ convert } )`;
	}

	private ToWirePlain( type: TypeRef, value: string, depth: number ): string
		| null {
		switch ( type.Kind ) {
			case "array": {
				const item = `x${ depth }_`;
				const element = this.ToWire( type.Element, item, depth + 1 );

				return element === null
					? null
					: `${ value }.map( ( ${ item } ) => ${ element } )`;
			}
			case "named":
				return this.Wire( type.Name )
					? `${ type.Name }Wire.To( ${ value } )`
					: null;
			default:
				if ( type.Name === "vec3" || type.Name === "quat" ) {
					this.Import( TypeScriptImports.Scripting, "Wire" );
					const helper = type.Name === "vec3" ? "Vec3" : "Quat";

					return `Wire.${ helper }( ${ value } )`;
				}
				return null;
		}
	}

	/** null: the wire value is the value (a cast does). */
	private FromWirePlain( type: TypeRef, wire: string, depth: number ): string
		| null {
		switch ( type.Kind ) {
			case "array": {
				const item = `x${ depth }_`;

				if ( this.FromWirePlain(
					type.Element,
					item,
					depth + 1,
				) === null ) {
					return null;
				}
				return `( ${ wire } as unknown[] ).map( ( ${ item } ) => ${
					this.FromWire( type.Element, item, depth + 1 ) } )`;
			}
			case "named":
				return this.Wire( type.Name )
					? `${ type.Name }Wire.From( ${ wire } )`
					: null;
			default:
				if ( type.Name === "vec3" || type.Name === "quat" ) {
					const name = type.Name === "vec3" ? "Vec3" : "Quat";
					this.Import(
						name === "Vec3"
							? TypeScriptImports.Vec3
							: TypeScriptImports.Quat,
						name,
					);
					const tuple = name === "Vec3"
						? "number, number, number"
						: "number, number, number, number";

					return `new ${ name }( ...( ${ wire } as [ ${ tuple } ] ) `
						+ ")";
				}
				return null;
		}
	}
}

/** "( a, b )", or "()" for none. */
function Params( items: string[] ): string {
	return items.length === 0 ? "()" : `( ${ items.join( ", " ) } )`;
}

function Struct( writer: Writer, name: string, fields: Field[] ): string[] {
	const to = fields.map(
		( field ) => writer.ToWire( field.Type, `value.${ field.Name }` )
			?? `value.${ field.Name }`,
	);
	const from = fields.map(
		( field, i ) => (
			`\t\t\t${ field.Name }: ${
				writer.FromWire( field.Type, `wire[${ i }]` ) },`
		),
	);

	return [
		`/** How a ${ name } crosses to C#: its fields in order. */`,
		`export const ${ name }Wire = {`,
		`\tTo: ( value: ${ name } ): unknown[] => [ ${ to.join( ", " ) } ],`,
		`\tFrom: ( value: unknown ): ${ name } => {`,
		"\t\tconst wire = value as unknown[];",
		"\t\treturn {",
		...from,
		"\t\t};",
		"\t},",
		"};",
	];
}

/** The TypeScript of one checked file. */
export function GenerateTypeScript(
	model: ContractModel,
	file: ContractFile,
): string {
	const writer = new Writer( model, file );
	const body: string[] = [];

	for ( const declaration of file.Declarations ) {
		body.push( "", ...Doc( declaration.Doc, "" ) );
		switch ( declaration.Kind ) {
			case "enum":
				body.push(
					`export const enum ${ declaration.Name } {`,
					...declaration.Members.flatMap( ( member ) => [
						...Doc( member.Doc, "\t" ),
						`\t${ member.Name } = ${ member.Value },`,
					] ),
					"}",
				);
				break;
			case "struct":
				body.push(
					`export interface ${ declaration.Name } {`,
					...declaration.Fields.flatMap( ( field ) => [
						...Doc( field.Doc, "\t" ),
						`\t${ field.Name }: ${ writer.Type( field.Type ) };`,
					] ),
					"}",
					"",
					...Struct( writer, declaration.Name, declaration.Fields ),
				);
				break;
			default: {
				const name = declaration.Name;
				const methods = declaration.Methods;
				const signature = (
					method: typeof methods[number],
				): string => `${ Params( method.Params.map(
					( p ) => `${ p.Name }: ${ writer.Type( p.Type ) }`,
				) ) }: ${
					method.Returns ? writer.Type( method.Returns ) : "void" }`;

				writer.Import( TypeScriptImports.Di, "Contract" );
				writer.Import(
					TypeScriptImports.Scripting,
					"RegisterContract",
				);
				body.push(
					`export interface ${ name } {`,
					...methods.flatMap( ( method ) => [
						...Doc( method.Doc, "\t" ),
						`\t${ method.Name }${ signature( method ) };`,
					] ),
					"}",
					"",
					`export const ${ name } = Contract<${ name }>( "${
						QualifiedName( file, name ) }" );`,
					"",
					`RegisterContract( ${ name }, {`,
					"\tProxy: ( call_ ) => ( {",
					...methods.map( ( method, index ) => {
						const args = method.Params.map(
							( p ) => writer.ToWire( p.Type, p.Name ) ?? p.Name,
						);
						const list = args.length > 0
							? ` ${ args.join( ", " ) } `
							: "";
						const call = `call_( ${ index }, [${ list }] )`;

						const head =
							`\t\t${ method.Name }: ${ signature( method ) } =>`;

						if ( !method.Returns ) {
							return `${ head } {\n\t\t\t${ call };\n\t\t},`;
						}
						const read = writer.FromWire( method.Returns, call );

						return `${ head } ${ read },`;
					} ),
					"\t} ),",
					"\tDispatch: ( target_, method_, args_ ) => {",
					"\t\tswitch ( method_ ) {",
					...methods.map( ( method, index ) => {
						const args = method.Params.map(
							( p, i ) => writer.FromWire(
								p.Type,
								`args_[${ i }]`,
							),
						);
						const call =
							`target_.${ method.Name }${ Params( args ) }`;

						const result = method.Returns
							? writer.ToWire( method.Returns, call ) ?? call
							: "";

						return method.Returns
							? `\t\t\tcase ${ index }: return ${ result };`
							: `\t\t\tcase ${ index }: ${ call }; return null;`;
					} ),
					`\t\t\tdefault: throw new Error( \`${ name } has no method `
						+ "${ method_ }` );",
					"\t\t}",
					"\t},",
					"} );",
				);
			}
		}
	}
	return [...Header, ...writer.ImportLines(), ...body, ""].join( "\n" );
}
