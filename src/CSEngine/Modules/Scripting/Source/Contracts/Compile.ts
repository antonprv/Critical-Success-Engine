// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Check, ContractModel } from "./Check.ts";
import { CSharpPath, GenerateCSharp } from "./CSharp.ts";
import { Parse } from "./Parser.ts";
import type { ContractFile, Diagnostic } from "./Syntax.ts";
import { GenerateTypeScript, TypeScriptPath } from "./TypeScript.ts";

export interface SourceFile {
	/** Relative to the project, with forward slashes. */
	Path: string;
	Text: string;
}

export interface CompileOptions {
	/** Write the C# side too (a project with C# scripts). */
	CSharp: boolean;
}

export interface CompileResult {
	/** The problems; when there are any, nothing is generated. */
	Diagnostics: Diagnostic[];
	/** Generated files, next to their .contract file. */
	Outputs: SourceFile[];
}

/** "Contracts/Score.contract:4:9: Unknown type "Hits"". */
export function FormatDiagnostic( diagnostic: Diagnostic ): string {
	return `${ diagnostic.Path }:${ diagnostic.Line }:${ diagnostic.Column }: ${
		diagnostic.Message }`;
}

/**
 * Compiles a project's .contract files together (a file may use another's
 * structs and enums) into TypeScript and, when asked, C#.
 */
export function CompileContracts(
	sources: readonly SourceFile[],
	options: CompileOptions,
): CompileResult {
	const files: ContractFile[] = [];
	const diagnostics: Diagnostic[] = [];

	for ( const source of sources ) {
		const parsed = Parse( source.Path, source.Text );

		if ( "Message" in parsed ) {
			diagnostics.push( parsed );
		}
		else {
			files.push( parsed );
		}
	}
	if ( diagnostics.length > 0 ) {
		return { Diagnostics: diagnostics, Outputs: [] };
	}
	const model = new ContractModel( files );
	const problems = Check( model );

	if ( problems.length > 0 ) {
		return { Diagnostics: problems, Outputs: [] };
	}
	return {
		Diagnostics: [],
		Outputs: files.flatMap( ( file ) => [
			{
				Path: TypeScriptPath( file.Path ),
				Text: GenerateTypeScript( model, file ),
			},
			...( options.CSharp
				? [
					{
						Path: CSharpPath( file.Path ),
						Text: GenerateCSharp( model, file ),
					},
				]
				: [] ),
		] ),
	};
}
