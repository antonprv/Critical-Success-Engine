// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// The contract language: what TypeScript and C# agree on, written once. A
// .contract file declares contracts (interfaces either language implements
// and either language calls), the structs and enums they pass:
//
//     namespace Game;
//
//     /// What the round knows.
//     contract IRound {
//         CoinsLeft(): int;
//         Hit( hit: Hit ): bool;
//     }
//
//     struct Hit { Damage: float; At: vec3; Tags: string[]; By: string?; }
//     enum Team { Red, Blue = 5 }
//
// Compile.ts turns a project's files into TypeScript and C#.

/** The built-in types and what they are in both languages. */
export const Primitives = [
	"bool", "int", "float", "double", "string", "bytes", "vec3", "quat",
] as const;

export type Primitive = typeof Primitives[number];

export type TypeRef =
	| { Kind: "primitive"; Name: Primitive; Nullable: boolean; }
	| { Kind: "named"; Name: string; Nullable: boolean; }
	| { Kind: "array"; Element: TypeRef; Nullable: boolean; };

/** Where something is in its file (1-based). */
export interface Position {
	Line: number;
	Column: number;
}

export interface Field extends Position {
	Name: string;
	Type: TypeRef;
	Doc: string;
}

export interface Method extends Position {
	Name: string;
	Params: Field[];
	/** null: void. */
	Returns: TypeRef | null;
	Doc: string;
}

export interface EnumMember extends Position {
	Name: string;
	Value: number;
	Doc: string;
}

export type Declaration =
	| { Kind: "contract"; Name: string; Methods: Method[]; Doc: string; }
		& Position
	| { Kind: "struct"; Name: string; Fields: Field[]; Doc: string; }
		& Position
	| { Kind: "enum"; Name: string; Members: EnumMember[]; Doc: string; }
		& Position;

export interface ContractFile {
	/** The file's path (relative to the project, with forward slashes). */
	Path: string;
	/** "" for none. */
	Namespace: string;
	Declarations: Declaration[];
}

/** A problem in a file, with where it is. */
export interface Diagnostic extends Position {
	Path: string;
	Message: string;
}

/** "Game.IRound": what both languages call a declaration at run time. */
export function QualifiedName( file: ContractFile, name: string ): string {
	return file.Namespace === "" ? name : `${ file.Namespace }.${ name }`;
}
