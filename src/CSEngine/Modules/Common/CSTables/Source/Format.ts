// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * The .cstables format (docs/cstables.md): one key a line, `Key = value`.
 *
 * ```
 * @access public
 * # Right above a key: the key's comment (the editor's Comment column).
 * MenuTitle = Главное меню
 * Greeting = Привет, {name}!
 * Padded = "  spaces kept  "
 * Coins[one] = {count} монета
 * Coins[few] = {count} монеты
 * Coins[other] = {count} монет
 * About = """
 * Several lines,
 *   indentation kept.
 * """
 * ```
 *
 * A document keeps every line as it was (blank lines, free comments, spacing),
 * so a table saved by the editor changes only what was edited.
 */

export const enum LineKind {
	Blank = "Blank",
	Comment = "Comment",
	Directive = "Directive",
	Entry = "Entry",
	/** A line that is none of the others: kept as it is, reported by Parse. */
	Invalid = "Invalid",
}

/** The plural categories of CLDR (Intl.PluralRules). */
export const PluralCategories = [
	"zero",
	"one",
	"two",
	"few",
	"many",
	"other",
] as const;
export type PluralCategory = typeof PluralCategories[number];

export interface BlankLine {
	Kind: LineKind.Blank;
	Raw: string;
}

export interface CommentLine {
	Kind: LineKind.Comment;
	Raw: string;
	/** The text after `#` (one space after it dropped). */
	Text: string;
}

export interface DirectiveLine {
	Kind: LineKind.Directive;
	Raw: string;
	Name: string;
	Value: string;
}

export interface EntryLine {
	Kind: LineKind.Entry;
	/**
	 * The entry's lines as written (a multi-line value spans several); null
	 * once edited (written anew).
	 */
	Raw: string | null;
	Key: string;
	/** The plural form (`Key[few]`); null for an ordinary key. */
	Plural: PluralCategory | null;
	Value: string;
	/** The line number (1-based) it started on in the parsed text. */
	Line: number;
}

export interface InvalidLine {
	Kind: LineKind.Invalid;
	Raw: string;
}

export type TableLine = BlankLine
	| CommentLine
	| DirectiveLine
	| EntryLine
	| InvalidLine;

export const enum Severity {
	Error = "Error",
	Warning = "Warning",
}

/**
 * A problem found in a table, at its line (1-based; 0: the table as a whole).
 */
export interface Diagnostic {
	Severity: Severity;
	Code: string;
	Message: string;
	File: string;
	Line: number;
}

/**
 * Who the generated code is for (the editor's Access Modifier, as in Visual
 * Studio's resource editor).
 */
export const enum Access {
	Public = "public",
	Internal = "internal",
	/** No code: the table is only data (looked up by name at run time). */
	None = "none",
}

export const Accesses: readonly Access[] = [
	Access.Public,
	Access.Internal,
	Access.None,
];

const KeyPattern = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[([a-z]+)\])?$/;
const Identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function IsKey( key: string ): boolean {
	return Identifier.test( key );
}

/**
 * Decodes the escapes of a value: \n, \t, \\, \". \{ and \} stay escaped (the
 * placeholder parser reads them as literal braces), as does anything else after
 * \.
 */
export function Unescape( text: string ): string {
	return text.replace( /\\(.)/g, ( all, character: string ) => {
		switch ( character ) {
			case "n": return "\n";
			case "t": return "\t";
			case "\\": case "\"": return character;
			default: return all;
		}
	} );
}

/**
 * Whether the text is a quoted value: it starts with " and ends with a " no
 * backslash escapes.
 */
function IsQuoted( text: string ): boolean {
	if ( text.length < 2
		|| !text.startsWith( "\"" )
		|| !text.endsWith( "\"" ) ) {
		return false;
	}
	let slashes = 0;

	for ( let at = text.length - 2; at > 0
		&& text[at] === "\\"; at-- ) {
		slashes++;
	}
	return slashes % 2 === 0;
}

/**
 * The value written so it reads back the same: plain when it can be, quoted
 * with spaces at its ends, `"""` when multi-line.
 */
export function FormatValue( value: string ): string[] {
	// A backslash is doubled, but not the one of \{ and \} (kept escaped in
	// values).
	const slashes = value.replace( /\\(?![{}])/g, "\\\\" );

	if ( value.includes( "\n" ) ) {
		// A line of only """ would end the value early.
		return [
			"\"\"\"",
			...slashes.split( "\n" )
				.map(
					( line ) => ( line.trim() === "\"\"\""
						? line.replace( "\"\"\"", "\\\"\"\"" )
						: line ),
				),
			"\"\"\"",
		];
	}
	const escaped = slashes.replace( /\t/g, "\\t" );

	if ( value !== value.trim()
		|| value.startsWith( "\"" )
		|| value === "" ) {
		return [ `"${ escaped.replace( /"/g, "\\\"" ) }"` ];
	}
	return [ escaped ];
}

export class TableDocument {
	private constructor(
		public readonly Lines: TableLine[],
		public readonly Newline: string,
		public readonly Problems: Diagnostic[],
	) {
	}

	/**
	 * Reads a table; lines it can't read are kept and reported, the rest is
	 * usable.
	 */
	public static Parse( text: string, file = "" ): TableDocument {
		const newline = text.includes( "\r\n" ) ? "\r\n" : "\n";
		const raw = text.replace( /^﻿/, "" ).split( /\r?\n/ );

		// The last newline ends the last line; it isn't one more line.
		if ( raw.at( -1 ) === "" ) {
			raw.pop();
		}
		const lines: TableLine[] = [];
		const problems: Diagnostic[] = [];
		const problem = (
			line: number,
			code: string,
			message: string,
		): void => {
			problems.push(
				{
					Severity: Severity.Error,
					Code: code,
					Message: message,
					File: file,
					Line: line,
				},
			);
		};

		for ( let index = 0; index < raw.length; index++ ) {
			const line = raw[index]!;
			const trimmed = line.trim();

			if ( trimmed === "" ) {
				lines.push( { Kind: LineKind.Blank, Raw: line } );
				continue;
			}
			if ( trimmed.startsWith( "#" ) ) {
				lines.push(
					{
						Kind: LineKind.Comment,
						Raw: line,
						Text: trimmed.slice( 1 ).replace( /^ /, "" ),
					},
				);
				continue;
			}
			if ( trimmed.startsWith( "@" ) ) {
				const match = /^@([A-Za-z]+)\s*(.*)$/.exec( trimmed );

				if ( match ) {
					lines.push(
						{
							Kind: LineKind.Directive,
							Raw: line,
							Name: match[1]!,
							Value: match[2]!.trim(),
						},
					);
					continue;
				}
			}
			const equals = line.indexOf( "=" );
			const name = equals < 0 ? "" : line.slice( 0, equals ).trim();
			const key = KeyPattern.exec( name );

			if ( equals < 0 || !key ) {
				lines.push( { Kind: LineKind.Invalid, Raw: line } );
				problem(
					index + 1,
					equals < 0 ? "CST001" : "CST002",
					equals < 0
						? "Not a key, a comment or a directive: "
							+ "\"Key = value\" expected"
						: `"${ name }" is not a key: a letter or _, `
							+ "then letters, digits or _",
				);
				continue;
			}
			const plural = key[2] ?? null;

			if ( plural !== null
				&& !( PluralCategories as readonly string[] ).includes(
					plural,
				) ) {
				lines.push( { Kind: LineKind.Invalid, Raw: line } );
				problem(
					index + 1,
					"CST003",
					`"${ plural }" is not a plural form `
						+ `(${ PluralCategories.join( ", " ) })`,
				);
				continue;
			}
			const rest = line.slice( equals + 1 ).trim();
			const start = index;
			let value: string;

			if ( rest === "\"\"\"" ) {
				const body: string[] = [];

				index++;
				while ( index < raw.length
					&& raw[index]!.trim() !== "\"\"\"" ) {
					body.push(
						raw[index++]!,
					);
				}
				if ( index >= raw.length ) {
					problem(
						start + 1,
						"CST004",
						`The value of ${ name } has no closing """`,
					);
				}
				value = Unescape(
					body.join( "\n" ).replace( /\\"""/g, "\"\"\"" ),
				);
			} else if ( IsQuoted( rest ) ) {
				value = Unescape( rest.slice( 1, -1 ) );
			} else {
				value = Unescape( rest );
			}
			lines.push( {
				Kind: LineKind.Entry,
				Raw: raw.slice( start, Math.min( index, raw.length - 1 ) + 1 )
					.join( newline ),
				Key: key[1]!,
				Plural: plural as PluralCategory | null,
				Value: value,
				Line: start + 1,
			} );
		}
		return new TableDocument( lines, newline, problems );
	}

	public static Empty(): TableDocument {
		return new TableDocument( [], "\n", [] );
	}

	/** Every entry, in the file's order. */
	public get Entries(): EntryLine[] {
		return this.Lines.filter(
			( line ): line is EntryLine => line.Kind === LineKind.Entry,
		);
	}

	/** The keys in the file's order (a plural key once). */
	public get Keys(): string[] {
		return [ ...new Set( this.Entries.map( ( entry ) => entry.Key ) ) ];
	}

	/** The table's access (`@access`); public when it doesn't say. */
	public get Access(): Access {
		const value = this.Directive( "access" );

		return ( Accesses as readonly string[] ).includes( value ?? "" )
			? value as Access
			: Access.Public;
	}

	public Directive( name: string ): string | null {
		const line = this.Lines.find(
			( l ): l is DirectiveLine => l.Kind === LineKind.Directive
				&& l.Name === name,
		);

		return line?.Value ?? null;
	}

	/** The entry of a key (and plural form). */
	public Entry( key: string, plural: PluralCategory | null = null ): EntryLine
		| undefined {
		return this.Entries.find(
			( entry ) => entry.Key === key && entry.Plural === plural,
		);
	}

	/**
	 * The key's comment: the comment lines right above its first entry, joined
	 * by newlines (null: none).
	 */
	public Comment( key: string ): string | null {
		const index = this.Lines.findIndex(
			( line ) => line.Kind === LineKind.Entry && line.Key === key,
		);

		if ( index < 0 ) {
			return null;
		}
		const texts: string[] = [];

		for ( let at = index - 1; at >= 0
			&& this.Lines[at]!.Kind === LineKind.Comment; at-- ) {
			texts.unshift(
				( this.Lines[at] as CommentLine ).Text,
			);
		}
		return texts.length > 0 ? texts.join( "\n" ) : null;
	}

	//#region editing (what the table editor does)

	/**
	 * Sets a key's value: in place when it exists, else a new entry after the
	 * key's other forms, or at the end.
	 */
	public Set(
		key: string,
		value: string,
		plural: PluralCategory | null = null,
	): void {
		const entry = this.Entry( key, plural );

		if ( entry ) {
			if ( entry.Value === value ) {
				return;
			}
			entry.Value = value;
			entry.Raw = null;
			return;
		}
		const fresh: EntryLine = {
			Kind: LineKind.Entry,
			Raw: null,
			Key: key,
			Plural: plural,
			Value: value,
			Line: 0,
		};
		let last = this.Lines.length;

		for ( let at = 0; at < this.Lines.length; at++ ) {
			const line = this.Lines[at]!;

			if ( line.Kind === LineKind.Entry && line.Key === key ) {
				last = at + 1;
			}
		}
		this.Lines.splice( last, 0, fresh );
	}

	/** Removes a key (every plural form) and its comment. */
	public Remove( key: string ): void {
		this.SetComment( key, null );
		for ( let index = this.Lines.length - 1; index >= 0; index-- ) {
			const line = this.Lines[index]!;

			if ( line.Kind === LineKind.Entry
				&& line.Key === key ) {
				this.Lines.splice( index, 1 );
			}
		}
	}

	/** Renames a key (every plural form); the comment stays with it. */
	public Rename( key: string, to: string ): void {
		for ( const entry of this.Entries ) {
			if ( entry.Key !== key ) {
				continue;
			}
			entry.Key = to;
			entry.Raw = null;
		}
	}

	/** Replaces the key's comment (null or "": removes it). */
	public SetComment( key: string, comment: string | null ): void {
		const index = this.Lines.findIndex(
			( line ) => line.Kind === LineKind.Entry && line.Key === key,
		);

		if ( index < 0 ) {
			return;
		}
		let first = index;

		while ( first > 0
			&& this.Lines[first - 1]!.Kind === LineKind.Comment ) {
			first--;
		}
		const lines: CommentLine[] = comment ? comment.split( "\n" )
			.map(
				( text ) => ( {
					Kind: LineKind.Comment,
					Raw: text === "" ? "#" : `# ${ text }`,
					Text: text,
				} ),
			) : [];

		this.Lines.splice( first, index - first, ...lines );
	}

	/** Sets a directive (null: removes it); a new one goes on top. */
	public SetDirective( name: string, value: string | null ): void {
		const index = this.Lines.findIndex(
			( line ) => line.Kind === LineKind.Directive && line.Name === name,
		);
		const line: DirectiveLine | null = value === null
			? null
			: {
				Kind: LineKind.Directive,
				Raw: `@${ name } ${ value }`,
				Name: name,
				Value: value,
			};

		if ( index >= 0 ) {
			if ( line ) {
				this.Lines[index] = line;
			}
			else {
				this.Lines.splice( index, 1 );
			}
		} else if ( line ) {
			this.Lines.unshift( line );
		}
	}

	/**
	 * Moves a key (with its forms and comment) before another key, or to the
	 * end (the table editor's order).
	 */
	public Move( key: string, before: string | null ): void {
		if ( key === before ) {
			return;
		}
		const block = this.Block( key );

		if ( block.length === 0 ) {
			return;
		}
		this.Lines.splice( this.Lines.indexOf( block[0]! ), block.length );
		const anchor = before === null ? undefined : this.Block( before )[0];

		this.Lines.splice(
			anchor ? this.Lines.indexOf( anchor ) : this.Lines.length,
			0,
			...block,
		);
	}

	//#endregion

	/**
	 * The text: untouched lines as they were, edited ones written anew, the
	 * file's own newline.
	 */
	public Serialize(): string {
		const out: string[] = [];

		for ( const line of this.Lines ) {
			if ( line.Kind !== LineKind.Entry || line.Raw !== null ) {
				out.push( ( line as { Raw: string; } ).Raw );
				continue;
			}
			const [ first, ...rest ] = FormatValue( line.Value );

			out.push(
				[
					`${ line.Key }${ line.Plural ? `[${ line.Plural }]` : "" } `
						+ `= ${ first! }`,
					...rest,
				].join( this.Newline ),
			);
		}
		return out.length === 0
			? ""
			: `${ out.join( this.Newline ) }${ this.Newline }`;
	}

	/**
	 * A key's lines: its comment and its consecutive entries (the forms written
	 * apart stay where they are).
	 */
	private Block( key: string ): TableLine[] {
		const index = this.Lines.findIndex(
			( line ) => line.Kind === LineKind.Entry && line.Key === key,
		);

		if ( index < 0 ) {
			return [];
		}
		let first = index;
		let last = index;

		while ( first > 0
			&& this.Lines[first - 1]!.Kind === LineKind.Comment ) {
			first--;
		}
		for ( let next = this.Lines[last + 1]; next?.Kind === LineKind.Entry
			&& next.Key === key; next = this.Lines[last + 1] ) {
			last++;
		}
		return this.Lines.slice( first, last + 1 );
	}
}
