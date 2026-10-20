// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	Access,
	IsKey,
	PluralCategories,
	Severity,
	TableDocument,
	type Diagnostic,
	type PluralCategory,
} from "./Format.ts";
import { Arguments, HasStrayBrace } from "./Values.ts";

/**
 * A project's tables: `UiNames.cstables` is the base language of the table
 * UiNames, `UiNames.en.cstables` its English, `UiNames.pl.cstables` its
 * Polish... The language is in the name, so a new file adds a language without
 * code.
 */

export const TableExtension = ".cstables";

const LanguageCode = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export interface TableName {
	Table: string;
	/** null: the base language. */
	Language: string | null;
}

/**
 * The table and language of a file name ("UiNames.en.cstables"); null when it
 * isn't a table's.
 */
export function ParseTableName( fileName: string ): TableName | null {
	if ( !fileName.toLowerCase().endsWith( TableExtension ) ) {
		return null;
	}
	const stem = fileName.slice( 0, -TableExtension.length );
	const dot = stem.indexOf( "." );

	return dot < 0
		? { Table: stem, Language: null }
		: { Table: stem.slice( 0, dot ), Language: stem.slice( dot + 1 ) };
}

export function TableFileName(
	table: string,
	language: string | null,
): string {
	return language === null
		? `${ table }${ TableExtension }`
		: `${ table }.${ language }${ TableExtension }`;
}

export interface TableSource {
	/** The file's path (relative to the project), for messages. */
	File: string;
	Text: string;
}

export interface LanguageTable {
	File: string;
	Document: TableDocument;
}

export interface TableGroup {
	Name: string;
	Base: LanguageTable;
	/** The translations, by language code. */
	Languages: Map<string, LanguageTable>;
	Access: Access;
}

export interface Tables {
	BaseLanguage: string;
	Groups: TableGroup[];
	Diagnostics: Diagnostic[];
}

const Problem = (
	severity: Severity,
	code: string,
	file: string,
	line: number,
	message: string,
): Diagnostic => ( {
	Severity: severity,
	Code: code,
	Message: message,
	File: file,
	Line: line,
} );

/**
 * Reads the tables, groups each with its languages, checks them all (see
 * Check).
 */
export function ReadTables(
	sources: readonly TableSource[],
	baseLanguage: string,
): Tables {
	const diagnostics: Diagnostic[] = [];
	const groups = new Map<
		string,
		{ Base?: LanguageTable; Languages: Map<string, LanguageTable>; }
	>();

	for ( const source of sources ) {
		const fileName = source.File.slice(
			source.File.replace( /\\/g, "/" ).lastIndexOf( "/" ) + 1,
		);
		const name = ParseTableName( fileName );

		if ( !name ) {
			continue;
		}
		if ( !IsKey( name.Table ) ) {
			diagnostics.push(
				Problem(
					Severity.Error,
					"CST030",
					source.File,
					0,
					`"${ name.Table }" is not a table name: a letter or _, `
						+ "then letters, digits or _",
				),
			);
			continue;
		}
		if ( name.Language !== null && !LanguageCode.test( name.Language ) ) {
			diagnostics.push(
				Problem(
					Severity.Error,
					"CST034",
					source.File,
					0,
					`"${ name.Language }" is not a language code ("en", `
						+ "\"pt-BR\"...)",
				),
			);
			continue;
		}
		const document = TableDocument.Parse( source.Text, source.File );

		diagnostics.push( ...document.Problems );
		const group = groups.get( name.Table )
			?? { Languages: new Map<string, LanguageTable>() };

		groups.set( name.Table, group );
		const table = { File: source.File, Document: document };
		const taken = name.Language === null
			? group.Base
			: group.Languages.get( name.Language );

		if ( taken ) {
			diagnostics.push(
				Problem(
					Severity.Error,
					"CST031",
					source.File,
					0,
					`${ TableFileName( name.Table, name.Language ) } is there `
						+ `twice (also ${ taken.File })`,
				),
			);
			continue;
		}
		if ( name.Language === null ) {
			group.Base = table;
		}
		else {
			group.Languages.set( name.Language, table );
		}
	}
	const result: TableGroup[] = [];

	for ( const [ name, group ] of groups ) {
		if ( !group.Base ) {
			for ( const table of group.Languages.values() ) {
				diagnostics.push(
					Problem(
						Severity.Error,
						"CST032",
						table.File,
						0,
						`There is no ${ TableFileName( name, null ) } (the `
							+ "base language) for this translation",
					),
				);
			}
			continue;
		}
		result.push(
			{
				Name: name,
				Base: group.Base,
				Languages: group.Languages,
				Access: group.Base.Document.Access,
			},
		);
	}
	result.sort( ( a, b ) => ( a.Name < b.Name ? -1 : 1 ) );
	for ( const group of result ) {
		diagnostics.push( ...Check( group ) );
	}
	diagnostics.push( ...Collisions( result ) );
	return {
		BaseLanguage: baseLanguage,
		Groups: result,
		Diagnostics: diagnostics,
	};
}

/** A key's forms in a table: its value, or its plural forms. */
interface KeyForms {
	Line: number;
	Plural: boolean;
	Values: Map<PluralCategory | null, string>;
}

function Forms( table: LanguageTable, diagnostics: Diagnostic[] ): Map<
	string,
	KeyForms
> {
	const forms = new Map<string, KeyForms>();

	for ( const entry of table.Document.Entries ) {
		const key = forms.get( entry.Key )
			?? {
				Line: entry.Line,
				Plural: entry.Plural !== null,
				Values: new Map(),
			};

		forms.set( entry.Key, key );
		if ( key.Values.has( entry.Plural ) ) {
			const form = entry.Plural ? `[${ entry.Plural }]` : "";

			diagnostics.push(
				Problem(
					Severity.Error,
					"CST010",
					table.File,
					entry.Line,
					`${ entry.Key }${ form } is there twice`,
				),
			);
			continue;
		}
		if ( ( entry.Plural !== null ) !== key.Plural ) {
			diagnostics.push(
				Problem(
					Severity.Error,
					"CST014",
					table.File,
					entry.Line,
					`${ entry.Key } is both a plain key and a plural one`,
				),
			);
			continue;
		}
		key.Values.set( entry.Plural, entry.Value );
		if ( entry.Value.trim() === "" ) {
			diagnostics.push(
				Problem(
					Severity.Warning,
					"CST012",
					table.File,
					entry.Line,
					`${ entry.Key } is empty`,
				),
			);
		}
		if ( HasStrayBrace( entry.Value ) ) {
			diagnostics.push(
				Problem(
					Severity.Warning,
					"CST011",
					table.File,
					entry.Line,
					`${ entry.Key } has a brace that opens no argument (write `
						+ "\\{ or \\} for a brace)",
				),
			);
		}
	}
	for ( const [ key, form ] of forms ) {
		if ( form.Plural
			&& !form.Values.has( "other" ) ) {
			diagnostics.push(
				Problem(
					Severity.Error,
					"CST013",
					table.File,
					form.Line,
					`${ key } has plural forms but no ${ key }[other]`,
				),
			);
		}
	}
	return forms;
}

const ArgumentsOf = ( form: KeyForms ): string => (
	[ ...new Set( [ ...form.Values.values() ].flatMap( Arguments ) ) ].sort()
		.join( ", " )
);

/**
 * One table's problems: duplicates, empty values, stray braces, plural keys
 * without `other`; and for each language, keys missing against the base (or not
 * in it), and arguments that differ from the base's.
 */
export function Check( group: TableGroup ): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const base = Forms( group.Base, diagnostics );

	for ( const [ language, table ] of group.Languages ) {
		const forms = Forms( table, diagnostics );

		for ( const [ key, form ] of base ) {
			const translated = forms.get( key );

			if ( !translated ) {
				diagnostics.push(
					Problem(
						Severity.Warning,
						"CST020",
						table.File,
						0,
						`${ key } is not translated into ${ language }`,
					),
				);
				continue;
			}
			if ( translated.Plural !== form.Plural ) {
				diagnostics.push(
					Problem(
						Severity.Warning,
						"CST023",
						table.File,
						translated.Line,
						`${ key } is ${ form.Plural ? "" : "not " }plural in `
							+ "the base language",
					),
				);
				continue;
			}
			if ( ArgumentsOf( translated ) !== ArgumentsOf( form ) ) {
				diagnostics.push(
					Problem(
						Severity.Warning,
						"CST022",
						table.File,
						translated.Line,
						`${ key } takes {${ ArgumentsOf( translated ) }} here `
							+ `but {${ ArgumentsOf( form ) }} in the base `
							+ "language",
					),
				);
			}
		}
		for ( const [ key, form ] of forms ) {
			if ( !base.has( key ) ) {
				diagnostics.push(
					Problem(
						Severity.Warning,
						"CST021",
						table.File,
						form.Line,
						`${ key } is not in the base language: it is never `
							+ "used",
					),
				);
			}
		}
	}
	return diagnostics;
}

/**
 * Keys two tables share: each keeps its own access (`CSTables.UiNames.Key`),
 * neither gets the short one (`CSTables.Key`).
 */
export function SharedKeys( groups: readonly TableGroup[] ): Set<string> {
	const seen = new Map<string, number>();

	for ( const group of groups ) {
		if ( group.Access === Access.None ) {
			continue;
		}
		for ( const key of group.Base.Document.Keys ) {
			seen.set(
				key,
				( seen.get( key ) ?? 0 ) + 1,
			);
		}
	}
	return new Set(
		[ ...seen ].filter( ( [ , count ] ) => count > 1 )
			.map( ( [ key ] ) => key ),
	);
}

function Collisions( groups: readonly TableGroup[] ): Diagnostic[] {
	const shared = SharedKeys( groups );
	const tables = new Set( groups.map( ( group ) => group.Name ) );
	const out: Diagnostic[] = [];

	for ( const group of groups ) {
		if ( group.Access === Access.None ) {
			continue;
		}
		for ( const key of group.Base.Document.Keys ) {
			const line = group.Base.Document.Entries.find(
				( entry ) => entry.Key === key,
			)!.Line;

			if ( shared.has( key ) ) {
				out.push(
					Problem(
						Severity.Warning,
						"CST033",
						group.Base.File,
						line,
						`${ key } is in several tables: reach it as `
						+ `CSTables.${ group.Name }.${ key }`,
					),
				);
			}
			else if ( tables.has( key ) ) {
				out.push(
					Problem(
						Severity.Warning,
						"CST035",
						group.Base.File,
						line,
						`${ key } is also a table's name: reach it as `
						+ `CSTables.${ group.Name }.${ key }`,
					),
				);
			}
		}
	}
	return out;
}

/**
 * A translation as the runtime keeps it: the text, the plural forms, or null
 * (not translated: the base language's).
 */
export type CompiledValue = string
	| Partial<Record<PluralCategory, string>>
	| null;

export interface CompiledKey {
	Table: string;
	Key: string;
	Arguments: string[];
	Plural: boolean;
	Access: Access;
}

/**
 * Everything the runtime and the generated code need: the keys (by id, their
 * index) and every language's values.
 */
export interface CompiledTables {
	BaseLanguage: string;
	Languages: string[];
	Keys: CompiledKey[];
	Values: Record<string, CompiledValue[]>;
}

/**
 * The tables as data: one id per key of every base table, a list of values per
 * language, in the order of the ids.
 */
export function Compile( tables: Tables ): CompiledTables {
	const languages = [
		tables.BaseLanguage,
		...new Set(
			tables.Groups.flatMap( ( group ) => [ ...group.Languages.keys() ] ),
		),
	].filter( ( language, index, all ) => all.indexOf( language ) === index );
	const keys: CompiledKey[] = [];
	const values: Record<string, CompiledValue[]> = Object.fromEntries(
		languages.map( ( language ) => [ language, [] ] ),
	);
	const ValueOf = (
		table: LanguageTable | undefined,
		key: string,
		plural: boolean,
	): CompiledValue => {
		const entries = table?.Document.Entries.filter(
			( entry ) => entry.Key === key,
		) ?? [];

		if ( entries.length === 0
			|| ( entries[0]!.Plural !== null ) !== plural ) {
			return null;
		}
		if ( !plural ) {
			return entries[0]!.Value;
		}
		const forms: Partial<Record<PluralCategory, string>> = {};

		for ( const category of PluralCategories ) {
			const entry = entries.find( ( e ) => e.Plural === category );

			if ( entry ) {
				forms[category] = entry.Value;
			}
		}
		return forms;
	};

	for ( const group of tables.Groups ) {
		for ( const key of group.Base.Document.Keys ) {
			const entries = group.Base.Document.Entries.filter(
				( entry ) => entry.Key === key,
			);
			const plural = entries[0]!.Plural !== null;

			keys.push(
				{
					Table: group.Name,
					Key: key,
					Arguments: [
						...new Set(
							entries.flatMap(
								( entry ) => Arguments( entry.Value ),
							),
						),
					],
					Plural: plural,
					Access: group.Access,
				},
			);
			for ( const language of languages ) {
				const table = language === tables.BaseLanguage
					? group.Base
					: group.Languages.get( language );

				values[language]!.push( ValueOf( table, key, plural ) );
			}
		}
	}
	return {
		BaseLanguage: tables.BaseLanguage,
		Languages: languages,
		Keys: keys,
		Values: values,
	};
}

/**
 * What a build reports: how many keys, which languages miss what, what isn't
 * used.
 */
export function Report( tables: Tables, compiled: CompiledTables ): string {
	const lines = [
		`CSTables: ${ tables.Groups.length } tables, ${ compiled.Keys.length } `
			+ `keys, languages: ${ compiled.Languages.join( ", " ) } `
			+ `(base ${ compiled.BaseLanguage })`,
	];

	for ( const language of compiled.Languages.slice( 1 ) ) {
		const missing = compiled.Values[language]!.filter(
			( value ) => value === null,
		).length;

		const total = compiled.Keys.length;

		lines.push(
			`  ${ language }: ${ total - missing }/${ total } translated`,
		);
	}
	const extra = tables.Diagnostics.filter(
		( d ) => d.Code === "CST021",
	).length;
	const errors = tables.Diagnostics.filter(
		( d ) => d.Severity === Severity.Error,
	).length;
	const warnings = tables.Diagnostics.length - errors;

	lines.push(
		`  ${ extra } unused keys, ${ errors } errors, ${ warnings } warnings`,
	);
	return lines.join( "\n" );
}
