// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { ContractModel } from "./Check.ts";
import {
	QualifiedName, type ContractFile, type Declaration, type Method,
	type TypeRef,
} from "./Syntax.ts";

// The C# side of a .contract file: interfaces, enums, structs (as classes
// that read and write their wire form), and per contract a proxy (C# calling
// whatever implements it in TypeScript) and a dispatcher (TypeScript calling
// what implements it in C#), registered when the game's assembly loads.

/** "Contracts/Score.contract" -> "Contracts/Score.contract.cs". */
export const CSharpPath = ( path: string ): string => `${ path }.cs`;

const ValueTypes = new Set(
	["bool", "int", "float", "double", "vec3", "quat"],
);

function Doc( text: string, indent: string ): string[] {
	if ( text === "" ) {
		return [];
	}
	const escape = ( line: string ): string => line.replaceAll( "&", "&amp;" )
		.replaceAll( "<", "&lt;" )
		.replaceAll( ">", "&gt;" );
	const lines = text.split( "\n" ).map( escape );

	return lines.length === 1
		? [`${ indent }/// <summary>${ lines[0] }</summary>`]
		: [
			`${ indent }/// <summary>`,
			...lines.map( ( line ) => `${ indent }/// ${ line }`.trimEnd() ),
			`${ indent }/// </summary>`,
		];
}

/**
 * A C# identifier from a path: "Contracts/Score.contract" -> "Contracts_Score".
 */
function PathName( path: string ): string {
	return path.replace( /\.contract$/, "" ).replace( /[^A-Za-z0-9_]/g, "_" );
}

class Writer {
	public constructor(
		private readonly _model: ContractModel,
		private readonly _file: ContractFile,
	) {
	}

	/** Namespaces of other files whose types this file uses. */
	public readonly Usings = new Set<string>();

	private Declaration( name: string ): Declaration {
		const found = this._model.Resolve( this._file, name )!;

		if ( found.File.Namespace !== this._file.Namespace
			&& found.File.Namespace !== "" ) {
			this.Usings.add( found.File.Namespace );
		}
		return found.Declaration;
	}

	private IsValue( type: TypeRef ): boolean {
		if ( type.Kind === "primitive" ) {
			return ValueTypes.has( type.Name );
		}
		return type.Kind === "named"
			&& this.Declaration( type.Name ).Kind === "enum";
	}

	public Type( type: TypeRef ): string {
		let text: string;

		switch ( type.Kind ) {
			case "array":
				text = `${ this.Type( type.Element ) }[]`;
				break;
			case "named":
				text = type.Name;
				break;
			default:
				text = {
					bool: "bool", int: "int", float: "float", double: "double",
					string: "string", bytes: "byte[]", vec3: "Vector3",
					quat: "Quaternion",
				}[type.Name];
		}
		return type.Nullable ? `${ text }?` : text;
	}

	/**
	 * What a struct's property starts as (so it is never null when it can't
	 * be).
	 */
	public Initial( type: TypeRef ): string {
		if ( type.Nullable ) {
			return "";
		}
		switch ( type.Kind ) {
			case "array":
				return ` = Array.Empty<${ this.Type( type.Element ) }>();`;
			case "named":
				return this.Declaration( type.Name ).Kind === "struct"
					? " = new();"
					: "";
			default:
				return {
					bool: "", int: "", float: "", double: "", vec3: "",
					string: " = \"\";", bytes: " = Array.Empty<byte>();",
					quat: " = Quaternion.Identity;",
				}[type.Name];
		}
	}

	/** Statements writing `value` with `writer`. */
	public Write(
		type: TypeRef,
		value: string,
		writer: string,
		depth = 0,
	): string[] {
		if ( type.Nullable ) {
			const inner = this.IsValue( type ) ? `${ value }.Value` : value;

			return [
				`if ( ${ value } is null )`,
				"{",
				`\t${ writer }.WriteNil();`,
				"}",
				"else",
				"{",
				...this.Write(
					{ ...type, Nullable: false } as TypeRef,
					inner,
					writer,
					depth,
				)
					.map( ( line ) => `\t${ line }` ),
				"}",
			];
		}
		switch ( type.Kind ) {
			case "array": {
				const item = `x${ depth }_`;

				return [
					`${ writer }.WriteArrayHeader( ${ value }.Length );`,
					`foreach ( ${ this.Type( type.Element ) } ${ item } `
						+ `in ${ value } )`,
					"{",
					...this.Write( type.Element, item, writer, depth + 1 )
						.map( ( line ) => `\t${ line }` ),
					"}",
				];
			}
			case "named":
				return [
					this.Declaration( type.Name ).Kind === "struct"
						? `${ type.Name }.WriteWire( ${ writer }, ${ value } );`
						: `${ writer }.WriteInteger( (int)${ value } );`,
				];
			default:
				return [
					{
						bool: `${ writer }.WriteBoolean( ${ value } );`,
						int: `${ writer }.WriteInteger( ${ value } );`,
						float: `${ writer }.WriteDouble( ${ value } );`,
						double: `${ writer }.WriteDouble( ${ value } );`,
						string: `${ writer }.WriteString( ${ value } );`,
						bytes: `${ writer }.WriteBinary( ${ value } );`,
						vec3: `Wire.WriteVector3( ${ writer }, ${ value } );`,
						quat:
							`Wire.WriteQuaternion( ${ writer }, ${ value } );`,
					}[type.Name],
				];
		}
	}

	/**
	 * An expression reading the type from `reader` (a ref MessagePackReader).
	 */
	public Read( type: TypeRef, reader: string, depth = 0 ): string {
		const plain = this.ReadPlain( type, reader, depth );

		return type.Nullable
			? `( ${ reader }.TryReadNil() ? default( ${ this.Type( type ) } ) `
				+ `: ${ plain } )`
			: plain;
	}

	private ReadPlain( type: TypeRef, reader: string, depth: number ): string {
		switch ( type.Kind ) {
			case "array": {
				const inner = `r${ depth }_`;

				const element = this.Read( type.Element, inner, depth + 1 );

				return `Wire.ReadArray( ref ${ reader }, static ( ref `
					+ `MessagePackReader ${ inner } ) => ${ element } )`;
			}
			case "named":
				return this.Declaration( type.Name ).Kind === "struct"
					? `${ type.Name }.ReadWire( ref ${ reader } )`
					: `(${ type.Name })${ reader }.ReadInteger()`;
			default:
				return {
					bool: `${ reader }.ReadBoolean()`,
					int: `checked( (int)${ reader }.ReadInteger() )`,
					float: `(float)${ reader }.ReadDouble()`,
					double: `${ reader }.ReadDouble()`,
					string: `${ reader }.ReadString()`,
					bytes: `Wire.ReadBytes( ref ${ reader } )`,
					vec3: `Wire.ReadVector3( ref ${ reader } )`,
					quat: `Wire.ReadQuaternion( ref ${ reader } )`,
				}[type.Name];
		}
	}
}

function Signature( writer: Writer, method: Method ): string {
	const params = method.Params.map(
		( p ) => `${ writer.Type( p.Type ) } ${ p.Name }`,
	);

	const returns = method.Returns ? writer.Type( method.Returns ) : "void";

	return `${ returns } ${ method.Name }( ${ params.join( ", " ) } )`
		.replace( "(  )", "()" );
}

function Contract(
	writer: Writer,
	declaration: Extract<Declaration, { Kind: "contract"; }>,
): {
	Interface: string[];
	Bridge: string[];
} {
	const name = declaration.Name;
	const proxy = `${ name }Proxy`;
	const methods = declaration.Methods;

	return {
		Interface: [
			`public interface ${ name }`,
			"{",
			...methods.flatMap( ( method, i ) => [
				...( i > 0 ? [""] : [] ),
				...Doc( method.Doc, "\t" ),
				`\t${ Signature( writer, method ) };`,
			] ),
			"}",
		],
		Bridge: [
			`/// <summary>Calls the TypeScript side of <see cref="${ name }"/> `
				+ "(whatever implements it there).</summary>",
			`file sealed class ${ proxy } : ${ name }`,
			"{",
			"\tprivate readonly RemoteTarget _target;",
			"",
			`\tpublic ${ proxy }( RemoteTarget target )`,
			"\t{",
			"\t\t_target = target;",
			"\t}",
			...methods.flatMap( ( method, index ) => [
				"",
				`\tpublic ${ Signature( writer, method ) }`,
				"\t{",
				method.Params.length > 0
					? "\t\tMessagePackWriter args_ = _target.Begin( "
						+ `${ index }, ${ method.Params.length } );`
					: `\t\t_target.Begin( ${ index }, 0 );`,
				...method.Params.flatMap(
					( p ) => writer.Write( p.Type, p.Name, "args_" ),
				).map( ( l ) => `\t\t${ l }` ),
				...( method.Returns
					? [
						"\t\tMessagePackReader result_ = new( _target.Call() "
							+ ");",
						`\t\treturn ${
							writer.Read( method.Returns, "result_" ) };`,
					]
					: ["\t\t_target.Call();"] ),
				"\t}",
			] ),
			"}",
			"",
			`/// <summary>Runs TypeScript's calls of <see cref="${ name }"/> `
				+ "on what implements it in C#.</summary>",
			`file static class ${ name }Dispatch`,
			"{",
			`\tpublic static void Run( ${ name } target_, int method_, ref `
				+ "MessagePackReader args_, MessagePackWriter result_ )",
			"\t{",
			"\t\tswitch ( method_ )",
			"\t\t{",
			...methods.flatMap( ( method, index ) => {
				const args = method.Params.map(
					( p ) => writer.Read( p.Type, "args_" ),
				);
				const call =
					`target_.${ method.Name }( ${ args.join( ", " ) } )`
						.replace( "(  )", "()" );

				return [
					`\t\tcase ${ index }:`,
					"\t\t{",
					...( method.Returns
						? [
							`\t\t\t${ writer.Type( method.Returns ) } value_ `
								+ `= ${ call };`,
							...writer.Write(
								method.Returns,
								"value_",
								"result_",
							).map( ( l ) => `\t\t\t${ l }` ),
						]
						: [`\t\t\t${ call };`, "\t\t\tresult_.WriteNil();"] ),
					"\t\t\tbreak;",
					"\t\t}",
				];
			} ),
			"\t\tdefault:",
			`\t\t\tthrow new BridgeException( $"${ name } has no method `
				+ "{method_}\" );",
			"\t\t}",
			"\t}",
			"}",
		],
	};
}

/** The C# of one checked file. */
export function GenerateCSharp(
	model: ContractModel,
	file: ContractFile,
): string {
	const writer = new Writer( model, file );
	const types: string[][] = [];
	const bridges: string[][] = [];
	const registrations: string[] = [];

	for ( const declaration of file.Declarations ) {
		const doc = Doc( declaration.Doc, "" );

		switch ( declaration.Kind ) {
			case "enum":
				types.push( [
					...doc,
					`public enum ${ declaration.Name }`,
					"{",
					...declaration.Members.flatMap( ( member ) => [
						...Doc( member.Doc, "\t" ),
						`\t${ member.Name } = ${ member.Value },`,
					] ),
					"}",
				] );
				break;
			case "struct": {
				const name = declaration.Name;
				const fields = declaration.Fields;
				types.push( [
					...doc,
					`public sealed partial class ${ name }`,
					"{",
					...fields.flatMap( ( field ) => [
						...Doc( field.Doc, "\t" ),
						`\tpublic ${ writer.Type( field.Type ) } `
							+ `${ field.Name } { get; set; }`
							+ writer.Initial( field.Type ),
						"",
					] ),
					"\t/// <summary>Writes it as it crosses to TypeScript: its "
						+ "fields in order.</summary>",
					"\tpublic static void WriteWire( MessagePackWriter "
						+ `writer, ${ name } value )`,
					"\t{",
					`\t\twriter.WriteArrayHeader( ${ fields.length } );`,
					...fields.flatMap(
						( field ) => writer.Write(
							field.Type,
							`value.${ field.Name }`,
							"writer",
						),
					)
						.map( ( line ) => `\t\t${ line }` ),
					"\t}",
					"",
					`\tpublic static ${ name } ReadWire( ref MessagePackReader `
						+ "reader )",
					"\t{",
					"\t\treader.ReadArrayHeader();",
					`\t\t${ name } value = new();`,
					...fields.map(
						( field ) => (
							`\t\tvalue.${ field.Name } = ${
								writer.Read( field.Type, "reader" ) };`
						),
					),
					"\t\treturn value;",
					"\t}",
					"}",
				] );
				break;
			}
			default: {
				const { Interface, Bridge } = Contract( writer, declaration );
				types.push( [...doc, ...Interface] );
				bridges.push( Bridge );
				registrations.push(
					`\t\tContracts.Register<${ declaration.Name }>( `
						+ `"${ QualifiedName( file, declaration.Name ) }", `
						+ `target => new ${ declaration.Name }Proxy( target `
						+ `), ${ declaration.Name }Dispatch.Run );`,
				);
			}
		}
	}
	if ( registrations.length > 0 ) {
		bridges.push( [
			"/// <summary>Makes the contracts of this file known to the bridge "
				+ "when the assembly loads.</summary>",
			`internal static class ${ PathName( file.Path ) }_Contracts`,
			"{",
			"\t[ModuleInitializer]",
			"\tinternal static void Register()",
			"\t{",
			...registrations,
			"\t}",
			"}",
		] );
	}
	const body = [...types, ...bridges].flatMap(
		( block, i ) => [...( i > 0 ? [""] : [] ), ...block],
	);
	const namespaced = file.Namespace === ""
		? body
		: [
			`namespace ${ file.Namespace }`,
			"{",
			...body.map( ( line ) => ( line === "" ? "" : `\t${ line }` ) ),
			"}",
		];

	return [
		"// <auto-generated>",
		"// Generated from a .contract file by the engine "
			+ "(Contracts/Compile.ts). Do not edit: it is rewritten whenever "
			+ "the",
		"// .contract file changes.",
		"// </auto-generated>",
		"",
		"#nullable enable",
		"#pragma warning disable CA2255 // a module initializer registers the "
			+ "contracts",
		"",
		"using CSEngine.Bridge;",
		"using CSEngine.Messaging;",
		"using System;",
		"using System.Numerics;",
		"using System.Runtime.CompilerServices;",
		...[...writer.Usings].sort().map( ( name ) => `using ${ name };` ),
		"",
		...namespaced,
		"",
	].join( "\n" );
}
