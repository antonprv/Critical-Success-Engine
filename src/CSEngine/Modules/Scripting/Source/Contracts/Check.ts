// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	QualifiedName, type ContractFile, type Declaration, type Diagnostic,
	type Position, type TypeRef,
} from "./Syntax.ts";

/** A declaration and the file it is in. */
export interface Symbol {
	File: ContractFile;
	Declaration: Declaration;
}

/** A project's checked files: what each type name in each file means. */
export class ContractModel {
	private readonly _byName = new Map<string, Symbol[]>();

	public constructor( public readonly Files: readonly ContractFile[] ) {
		for ( const file of Files ) {
			for ( const declaration of file.Declarations ) {
				const list = this._byName.get( declaration.Name ) ?? [];
				list.push( { File: file, Declaration: declaration } );
				this._byName.set( declaration.Name, list );
			}
		}
	}

	/**
	 * What a type name in a file refers to: its own namespace's declaration,
	 * else the only one of that name; null when there is none (or several).
	 */
	public Resolve( file: ContractFile, name: string ): Symbol | null {
		const all = this._byName.get( name ) ?? [];
		const near = all.filter( ( s ) => s.File.Namespace === file.Namespace );

		if ( near.length === 1 ) {
			return near[0]!;
		}
		return all.length === 1 ? all[0]! : null;
	}

	/** How many declarations share the name (for the error message). */
	public Count( name: string ): number {
		return this._byName.get( name )?.length ?? 0;
	}
}

/** Checks a project's files together; returns the problems (none: fine). */
export function Check( model: ContractModel ): Diagnostic[] {
	const problems: Diagnostic[] = [];
	const seen = new Map<string, string>();

	for ( const file of model.Files ) {
		const report = ( at: Position, message: string ): void => {
			problems.push( {
				Path: file.Path, Line: at.Line, Column: at.Column,
				Message: message,
			} );
		};
		const unique = (
			items: readonly ( Position & { Name: string; } )[],
			what: string,
		): void => {
			const names = new Set<string>();

			for ( const item of items ) {
				if ( names.has( item.Name ) ) {
					report(
						item,
						`${ what } "${ item.Name }" is declared twice`,
					);
				}
				names.add( item.Name );
			}
		};
		const type = ( at: Position, ref: TypeRef ): void => {
			if ( ref.Kind === "array" ) {
				type( at, ref.Element );
				return;
			}
			if ( ref.Kind !== "named" ) {
				return;
			}
			const found = model.Resolve( file, ref.Name );

			if ( !found ) {
				report(
					at,
					model.Count( ref.Name ) > 1
						? `"${ ref.Name }" is ambiguous: several namespaces `
							+ "declare it"
						: `Unknown type "${ ref.Name }"`,
				);
			}
			else if ( found.Declaration.Kind === "contract" ) {
				report(
					at,
					`"${ ref.Name }" is a contract: contracts are reached `
						+ "through DI, not passed as values",
				);
			}
		};

		for ( const declaration of file.Declarations ) {
			const qualified = QualifiedName( file, declaration.Name );
			const where = `${ file.Path }:${ declaration.Line }`;
			const before = seen.get( qualified );

			if ( before ) {
				report(
					declaration,
					`"${ qualified }" is declared twice (also at ${ before })`,
				);
			}
			seen.set( qualified, where );
			switch ( declaration.Kind ) {
				case "contract":
					unique( declaration.Methods, "Method" );
					for ( const method of declaration.Methods ) {
						unique( method.Params, "Parameter" );
						for ( const param of method.Params ) {
							type( param, param.Type );
						}
						if ( method.Returns ) {
							type( method, method.Returns );
						}
					}
					break;
				case "struct":
					unique( declaration.Fields, "Field" );
					for ( const field of declaration.Fields ) {
						type( field, field.Type );
					}
					break;
				default: {
					unique( declaration.Members, "Member" );
					const values = new Set<number>();

					for ( const member of declaration.Members ) {
						if ( values.has( member.Value ) ) {
							report(
								member,
								`${ member.Name } has the value ${
									member.Value } of another member`,
							);
						}
						values.add( member.Value );
					}
				}
			}
		}
	}
	if ( problems.length === 0 ) {
		problems.push( ...Cycles( model ) );
	}
	return problems;
}

/**
 * A struct can't hold itself, even through others, by fields that always have
 * a value (a nullable field or an array breaks the cycle).
 */
function Cycles( model: ContractModel ): Diagnostic[] {
	const problems: Diagnostic[] = [];
	const done = new Set<Declaration>();
	const visit = ( symbol: Symbol, path: Symbol[] ): void => {
		if ( path.some( ( s ) => s.Declaration === symbol.Declaration ) ) {
			const start = path[0]!;
			problems.push( {
				Path: start.File.Path, Line: start.Declaration.Line,
				Column: start.Declaration.Column,
				Message:
					`${ [...path, symbol].map( ( s ) => s.Declaration.Name )
						.join( " -> " ) }: a struct can't contain itself (make `
					+ "a field nullable)",
			} );
			return;
		}
		if ( done.has( symbol.Declaration )
			|| symbol.Declaration.Kind !== "struct" ) {
			return;
		}
		for ( const field of symbol.Declaration.Fields ) {
			if ( field.Type.Kind === "named" && !field.Type.Nullable ) {
				visit(
					model.Resolve( symbol.File, field.Type.Name )!,
					[...path, symbol],
				);
			}
		}
		done.add( symbol.Declaration );
	};

	for ( const file of model.Files ) {
		for ( const declaration of file.Declarations ) {
			if ( problems.length === 0 ) {
				visit( { File: file, Declaration: declaration }, [] );
			}
		}
	}
	return problems;
}
