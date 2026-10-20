// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { PluralCategory } from "./Format.ts";
import type { CompiledValue } from "./Tables.ts";
import { Fill, PluralOf, Segments, type Segment } from "./Values.ts";

/**
 * What the generated code tells the runtime about the keys: "Table.Key" by id.
 */
export interface LocalizationKeys {
	BaseLanguage: string;
	Languages: readonly string[];
	/** "Table.Key", by id. */
	Names: readonly string[];
}

/**
 * A language's values (by key id), or how to get them (a lazily imported JSON
 * module).
 */
export type LanguageSource = readonly CompiledValue[]
	| ( () => Promise<
		readonly CompiledValue[] | { default: readonly CompiledValue[]; }
	> );

/**
 * Where the chosen language is kept between sessions (SettingsStorage,
 * localStorage, a platform's storage).
 */
export interface LanguageMemory {
	Load(): string | null;
	Save( language: string ): void;
}

type Prepared = { Text: string; Segments: Segment[] | null; }
	| Partial<
		Record<PluralCategory, { Text: string; Segments: Segment[] | null; }>
	>;

function Prepare( value: CompiledValue ): Prepared | null {
	if ( value === null ) {
		return null;
	}
	const one = ( text: string ) => {
		const segments = Segments( text );
		const plain = segments.every(
			( segment ) => typeof segment === "string",
		);

		// Text without arguments is kept whole (its \{ escapes resolved): a
		// lookup returns it as it is.
		return {
			Text: plain ? segments.join( "" ) : text,
			Segments: plain ? null : segments,
		};
	};

	if ( typeof value === "string" ) {
		return one( value );
	}
	return Object.fromEntries(
		Object.entries( value )
			.map( ( [ category, text ] ) => [ category, one( text! ) ] ),
	);
}

/**
 * The tables at run time: the current language, the values of the languages
 * loaded so far, and the lookup of a key in the current language, falling back
 * to the base language, then to the key's name (logged once). A lookup is an
 * array read: no allocation, no hashing. Other languages than the base one load
 * when first chosen.
 */
export class Localization {
	private readonly _sources = new Map<string, LanguageSource>();

	private readonly _loaded = new Map<string, ( Prepared | null )[]>();

	private readonly _listeners = new Set<( language: string ) => void>();

	private readonly _warned = new Set<number>();

	private readonly _ids: Map<string, number>;

	private _language: string;

	private _current: ( Prepared | null )[];

	private _base: ( Prepared | null )[];

	private _memory: LanguageMemory | null = null;

	/**
	 * `languages`: every language's values or loader; the base language's must
	 * be the values themselves.
	 */
	public constructor(
		private readonly _keys: LocalizationKeys,
		languages: Readonly<Record<string, LanguageSource>>,
		private readonly _warn: ( message: string ) => void = console.warn,
	) {
		for ( const [ language, source ] of Object.entries(
			languages,
		) ) {
			this._sources.set( language, source );
		}
		const base = languages[_keys.BaseLanguage];

		if ( typeof base !== "object" ) {
			throw new Error(
				`The base language (${ _keys.BaseLanguage }) must be given as `
					+ "values, not loaded later",
			);
		}
		this._base = base.map( Prepare );
		this._loaded.set( _keys.BaseLanguage, this._base );
		this._current = this._base;
		this._language = _keys.BaseLanguage;
		this._ids = new Map( _keys.Names.map( ( name, id ) => [ name, id ] ) );
	}

	public get Language(): string {
		return this._language;
	}

	public get BaseLanguage(): string {
		return this._keys.BaseLanguage;
	}

	/** Every language there is a table for, the base one first. */
	public get Languages(): readonly string[] {
		return this._keys.Languages;
	}

	public IsLoaded( language: string ): boolean {
		return this._loaded.has( language );
	}

	/**
	 * Calls `listener` with the new language after each change; returns the way
	 * to stop.
	 */
	public OnLanguageChanged(
		listener: ( language: string ) => void,
	): () => void {
		this._listeners.add( listener );
		return () => this._listeners.delete( listener );
	}

	/**
	 * Loads a language (if it isn't yet) and makes it the current one; the
	 * listeners hear of it. A language with no table is refused.
	 */
	public async SetLanguage( language: string ): Promise<void> {
		const values = await this.Load( language );

		this._memory?.Save( language );
		if ( language === this._language ) {
			return;
		}
		this._language = language;
		this._current = values;
		for ( const listener of this._listeners ) {
			listener( language );
		}
	}

	/** Loads a language without choosing it (to have it ready). */
	public async Load( language: string ): Promise<( Prepared | null )[]> {
		const loaded = this._loaded.get( language );

		if ( loaded ) {
			return loaded;
		}
		const source = this._sources.get( language );

		if ( !source ) {
			throw new Error(
				`There is no table for the language "${ language }" `
				+ `(${ this.Languages.join( ", " ) })`,
			);
		}
		const raw = typeof source === "function" ? await source() : source;
		const values = ( Array.isArray( raw )
			? raw
			: ( raw as { default: readonly CompiledValue[]; } ).default ).map(
			Prepare,
		);

		this._loaded.set( language, values );
		return values;
	}

	/**
	 * The language to start in: the one remembered (the player chose it), else
	 * the first of `preferred` (the system's, navigator.languages) there is a
	 * table for, by full code then by its language ("pt-BR", then "pt"), else
	 * the base.
	 */
	public PickLanguage( preferred: readonly string[] = [] ): string {
		const remembered = this._memory?.Load() ?? null;

		if ( remembered !== null
			&& this._sources.has( remembered ) ) {
			return remembered;
		}
		for ( const wanted of preferred ) {
			const exact = this.Languages.find(
				( language ) => language.toLowerCase() === wanted.toLowerCase(),
			);
			const general = this.Languages.find(
				( language ) => language.toLowerCase() === wanted.toLowerCase()
					.split( "-" )[0],
			);

			if ( exact ?? general ) {
				return ( exact ?? general )!;
			}
		}
		return this.BaseLanguage;
	}

	/** Keeps the chosen language in `memory` from now on. */
	public Remember( memory: LanguageMemory ): void {
		this._memory = memory;
	}

	/**
	 * The id of "Table.Key" (null: no such key), for text bound by name (UI
	 * documents).
	 */
	public Id( name: string ): number | null {
		return this._ids.get( name ) ?? null;
	}

	/** A key's text in the current language. */
	public Get( id: number ): string {
		const value = this.Value( id );

		if ( value === null ) {
			return this.NameOf( id );
		}
		return "Text" in value
			? ( value.Text as string )
			: this.PluralText(
				value as Partial<Record<PluralCategory, { Text: string; }>>,
				1,
			);
	}

	/** A key's text with its arguments put in. */
	public Format(
		id: number,
		args: Readonly<Record<string, unknown>> | readonly unknown[],
	): string {
		const value = this.Value( id );

		if ( value === null ) {
			return this.NameOf( id );
		}
		const one = value as { Text: string; Segments: Segment[] | null; };

		return one.Segments === null ? one.Text : Fill( one.Segments, args );
	}

	/**
	 * A plural key's text for `count` (its `{count}` argument is the count
	 * unless `args` says otherwise).
	 */
	public Plural(
		id: number,
		count: number,
		args: Readonly<Record<string, unknown>> = {},
	): string {
		const value = this.Value( id );

		if ( value === null ) {
			return this.NameOf( id );
		}
		const forms = value as Partial<
			Record<
				PluralCategory,
				{ Text: string; Segments: Segment[] | null; }
			>
		>;
		const form = forms[PluralOf( this._language, count )] ?? forms.other!;

		return form.Segments === null
			? form.Text
			: Fill( form.Segments, { count, ...args } );
	}

	/**
	 * The key's value in the current language, else the base one's (null: in
	 * neither; logged once).
	 */
	private Value( id: number ): Prepared | null {
		const value = this._current[id] ?? this._base[id] ?? null;

		if ( value === null && !this._warned.has( id ) ) {
			this._warned.add( id );
			this._warn(
				`CSTables: ${ this.NameOf( id ) } has no text `
					+ `in ${ this._language } nor in ${ this.BaseLanguage }`,
			);
		}
		return value;
	}

	private PluralText(
		forms: Partial<Record<PluralCategory, { Text: string; }>>,
		count: number,
	): string {
		return ( forms[PluralOf( this._language, count )]
			?? forms.other! ).Text;
	}

	private NameOf( id: number ): string {
		return this._keys.Names[id] ?? `#${ id }`;
	}
}
