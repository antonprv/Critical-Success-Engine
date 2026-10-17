// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
	CompileContracts, FormatDiagnostic, type SourceFile,
} from "../Source/Contracts/Index.ts";

const Folder = join( import.meta.dirname, "Contracts" );

/** A folder's .contract files, as a project's (paths relative to it). */
function Sources( folder = Folder ): SourceFile[] {
	return readdirSync( folder, { recursive: true, encoding: "utf8" } )
		.filter( ( path ) => path.endsWith( ".contract" ) )
		.sort()
		.map( ( path ) => ( {
			Path: relative( folder, join( folder, path ) )
				.replaceAll( "\\", "/" ),
			Text: readFileSync( join( folder, path ), "utf8" ),
		} ) );
}

/** The problems of one file's text. */
function Problems( text: string, others: SourceFile[] = [] ): string[] {
	return CompileContracts(
		[{ Path: "Game.contract", Text: text }, ...others],
		{ CSharp: true },
	).Diagnostics.map( FormatDiagnostic );
}

describe( "the contract compiler", () => {
	it(
		"writes the TypeScript and C# of the test contracts as they are "
			+ "committed (typechecked by tsc, compiled by the C# tests)",
		() => {
			const result = CompileContracts( Sources(), { CSharp: true } );

			expect( result.Diagnostics ).toEqual( [] );
			expect( result.Outputs.map( ( o ) => o.Path ) ).toEqual( [
				"Arena.contract.ts", "Arena.contract.cs",
				"Shared/Geometry.contract.ts", "Shared/Geometry.contract.cs",
			] );
			for ( const output of result.Outputs ) {
				expect( output.Text, output.Path )
					.toBe(
						readFileSync( join( Folder, output.Path ), "utf8" ),
					);
			}
		},
	);

	it(
		"writes the test game's contracts as they are committed (the real .NET "
			+ "runs them: Integration.test.ts)",
		() => {
			const game = join( import.meta.dirname, "TestGame" );
			const result = CompileContracts(
				Sources( join( game, "Contracts" ) ),
				{ CSharp: true },
			);

			expect( result.Diagnostics ).toEqual( [] );
			for ( const output of result.Outputs ) {
				expect( output.Text, output.Path )
					.toBe(
						readFileSync(
							join( game, "Contracts", output.Path ),
							"utf8",
						),
					);
			}
		},
	);

	it(
		"writes only TypeScript for a project without C#; a file without a "
			+ "namespace declares global names",
		() => {
			const result = CompileContracts(
				[
					{
						Path: "A.contract",
						Text: "contract IA { Go(); } struct S { X: int; }",
					},
				],
				{ CSharp: false },
			);

			expect( result.Outputs.map( ( o ) => o.Path ) )
				.toEqual( ["A.contract.ts"] );
			expect( result.Outputs[0]!.Text )
				.toContain( "Contract<IA>( \"IA\" )" );
			const csharp = CompileContracts(
				[{ Path: "A.contract", Text: "contract IA { Go(); }" }],
				{ CSharp: true },
			).Outputs[1]!.Text;
			expect( csharp ).not.toContain( "namespace" );
			expect( csharp ).toContain( "internal static class A_Contracts" );
			expect( csharp ).toContain( "_target.Begin( 0, 0 );" );
			// a file of structs and enums only registers nothing
			expect(
				CompileContracts(
					[{ Path: "B.contract", Text: "enum E { A }" }],
					{ CSharp: true },
				).Outputs[1]!.Text,
			)
				.not.toContain( "ModuleInitializer" );
		},
	);

	it( "reports syntax errors with where they are", () => {
		expect( Problems( "contract IA {\n  Go( : int );\n}" ) )
			.toEqual(
				["Game.contract:2:7: Expected a parameter name, found \":\""],
			);
		expect( Problems( "namespace Game\ncontract IA {}" ) )
			.toEqual(
				["Game.contract:2:1: Expected \";\", found \"contract\""],
			);
		expect( Problems( "class A {}" ) )
			.toEqual(
				[
					"Game.contract:1:1: Expected contract, struct or enum, "
						+ "found \"class\"",
				],
			);
		expect( Problems( "struct S { X: int" ) )
			.toEqual(
				[
					"Game.contract:1:18: Expected a field name, found the end "
						+ "of the file",
				],
			);
		expect( Problems( "struct S { X: 5; }" ) )
			.toEqual( ["Game.contract:1:15: Expected a type, found \"5\""] );
		expect( Problems( "enum E { A = B }" ) )
			.toEqual(
				["Game.contract:1:14: Expected a whole number, found \"B\""],
			);
		expect( Problems( "struct S { X: int; } $" ) )
			.toEqual( ["Game.contract:1:22: Unexpected \"$\""] );
		expect( Problems( "/* never ends" ) )
			.toEqual(
				[
					"Game.contract:1:1: A comment that never ends (*/ is "
						+ "missing)",
				],
			);
		expect( Problems( "struct class {}" ) )
			.toEqual(
				[
					"Game.contract:1:8: \"class\" is a reserved word, it can't "
						+ "be a struct name",
				],
			);
		expect( Problems( "struct S_ {}" ) )
			.toEqual(
				[
					"Game.contract:1:8: \"S_\": names ending with \"_\" are "
						+ "kept for the generated code",
				],
			);
		expect( Problems( "contract IA { Go( Points: int ); }" ) )
			.toEqual(
				[
					"Game.contract:1:19: Parameter \"Points\" must start with "
						+ "a small letter (points, not Points)",
				],
			);
		expect( Problems( "contract IA { Go() int; }" ) )
			.toEqual(
				[
					"Game.contract:1:20: Expected \":\" before the return "
						+ "type, found \"int\"",
				],
			);
	} );

	it(
		"imports types of other files by their path from this one; ends of "
			+ "files without a newline",
		() => {
			const result = CompileContracts( [
				{ Path: "Root.contract", Text: "enum E { A }\n// last line" },
				{
					Path: "A/One.contract",
					Text:
						"struct One { Two: Two; E: E; }\n/// a doc at the end",
				},
				{ Path: "B/C/Two.contract", Text: "struct Two { X: int; }" },
				{
					Path: "B/Three.contract",
					Text: "struct Three { One: One; Two: Two; }",
				},
			], { CSharp: true } );
			const ts = ( path: string ): string => result.Outputs.find(
				( o ) => o.Path === `${ path }.ts`,
			)!.Text;

			expect( result.Diagnostics ).toEqual( [] );
			expect( ts( "A/One.contract" ) )
				.toContain( "from \"../B/C/Two.contract.ts\";" );
			expect( ts( "A/One.contract" ) )
				.toContain( "import { type E } from \"../Root.contract.ts\";" );
			expect( ts( "B/Three.contract" ) )
				.toContain( "from \"./C/Two.contract.ts\";" );
			expect( ts( "B/Three.contract" ) )
				.toContain( "from \"../A/One.contract.ts\";" );
			expect(
				result.Outputs.find(
					( o ) => o.Path === "A/One.contract.cs",
				)!.Text,
			).toContain( "public E E { get; set; }\n" );
			expect( Problems( "{" ) )
				.toEqual(
					[
						"Game.contract:1:1: Expected contract, struct or enum, "
						+ "found \"{\"",
					],
				);
		},
	);

	it( "accepts comments, separators and docs where they go", () => {
		const result = CompileContracts( [{
			Path: "Game.contract",
			Text: [
				"// a comment",
				"namespace My.Game;",
				"/* a block",
				"   comment */",
				"/// Docs with <tags> & more.",
				"enum E { A, B = 7; C }",
				"struct S { X: int, Y: E[]?[] }",
				"contract IA { Go( a: int, b: S? ): void; Back(): E }",
			].join( "\n" ),
		}], { CSharp: true } );

		expect( result.Diagnostics ).toEqual( [] );
		const [ts, cs] = result.Outputs.map( ( o ) => o.Text );
		expect( ts ).toContain( "C = 8," );
		expect( ts ).toContain( "Y: ( E[] | null )[];" );
		expect( ts ).toContain( "\"My.Game.IA\"" );
		expect( ts ).toContain( "/** Docs with <tags> & more. */" );
		expect( cs )
			.toContain(
				"/// <summary>Docs with &lt;tags&gt; &amp; more.</summary>",
			);
		expect( cs )
			.toContain(
				"public E[]?[] Y { get; set; } = Array.Empty<E[]?>();",
			);
		expect( cs ).toContain( "namespace My.Game" );
	} );

	it(
		"reports what doesn't check out: duplicates, unknown or ambiguous "
			+ "types, contracts as values, struct cycles",
		() => {
			expect( Problems( "struct S {} struct S {}" ) )
				.toEqual(
					[
						"Game.contract:1:13: \"S\" is declared twice (also at "
						+ "Game.contract:1)",
					],
				);
			expect( Problems( "struct S { X: int; X: int; }" ) )
				.toEqual(
					["Game.contract:1:20: Field \"X\" is declared twice"],
				);
			expect( Problems( "contract IA { Go(); Go(); }" ) )
				.toEqual(
					["Game.contract:1:21: Method \"Go\" is declared twice"],
				);
			expect( Problems( "contract IA { Go( a: int, a: int ); }" ) )
				.toEqual(
					["Game.contract:1:27: Parameter \"a\" is declared twice"],
				);
			expect( Problems( "enum E { A, A }" ) )
				.toEqual(
					["Game.contract:1:13: Member \"A\" is declared twice"],
				);
			expect( Problems( "enum E { A = 1, B = 1 }" ) )
				.toEqual(
					["Game.contract:1:17: B has the value 1 of another member"],
				);
			expect( Problems( "contract IA { Go( a: Nope ): Nope[]; }" ) )
				.toEqual( [
					"Game.contract:1:19: Unknown type \"Nope\"",
					"Game.contract:1:15: Unknown type \"Nope\"",
				] );
			expect( Problems( "contract IA { } contract IB { Go( a: IA ); }" ) )
				.toEqual(
					[
						"Game.contract:1:35: \"IA\" is a contract: contracts "
							+ "are "
						+ "reached through DI, not passed as values",
					],
				);
			expect( Problems( "struct A { B: B; } struct B { A: A; }" ) )
				.toEqual(
					[
						"Game.contract:1:1: A -> B -> A: a struct can't "
							+ "contain "
						+ "itself (make a field nullable)",
					],
				);
			expect(
				Problems( "struct A { Next: A?; Many: A[]; Count: int; }" ),
			)
				.toEqual( [] );
			// the same name in two namespaces: each file sees its own; a third,
			// neither of them, can't tell
			const two = [
				{ Path: "One.contract", Text: "namespace One; struct P {}" },
				{
					Path: "Two.contract",
					Text: "namespace Two; struct P {} struct Q { X: P; }",
				},
			];
			expect( Problems( "struct S { X: P; }", two ) )
				.toEqual(
					[
						"Game.contract:1:12: \"P\" is ambiguous: several "
						+ "namespaces declare it",
					],
				);
			expect( Problems( "struct S { X: int; }", two ) ).toEqual( [] );
		},
	);
} );
