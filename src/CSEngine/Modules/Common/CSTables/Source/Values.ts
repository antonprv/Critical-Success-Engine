// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { PluralCategory } from "./Format.ts";

/** A piece of a value: text, or the argument to put there (`{0}`, `{name}`). */
export type Segment = string | { Arg: string; };

const ArgumentName = /^(?:\d+|[A-Za-z_][A-Za-z0-9_]*)$/;

/**
 * A value cut into text and arguments. `\{` and `\}` are literal braces; a
 * brace that opens no argument (`{ not one`) stays as text (Validate reports
 * it).
 */
export function Segments( value: string ): Segment[] {
	const out: Segment[] = [];
	let text = "";

	for ( let at = 0; at < value.length; at++ ) {
		const character = value[at]!;

		if ( character === "\\" && ( value[at + 1] === "{"
			|| value[at + 1] === "}" ) ) {
			text += value[++at]!;
			continue;
		}
		if ( character === "{" ) {
			const end = value.indexOf( "}", at );
			const name = end < 0 ? "" : value.slice( at + 1, end );

			if ( ArgumentName.test( name ) ) {
				if ( text !== "" ) {
					out.push( text );
				}
				text = "";
				out.push( { Arg: name } );
				at = end;
				continue;
			}
		}
		text += character;
	}
	if ( text !== "" ) {
		out.push( text );
	}
	return out;
}

/** The arguments a value takes, in the order they first appear. */
export function Arguments( value: string ): string[] {
	const names = Segments( value )
		.flatMap(
			( segment ) => ( typeof segment === "string"
				? []
				: [ segment.Arg ] ),
		);

	return [ ...new Set( names ) ];
}

/** Whether a value has a brace that is neither an argument nor escaped. */
export function HasStrayBrace( value: string ): boolean {
	return /[{}]/.test(
		value.replace( /\\[{}]/g, "" )
			.replace( /\{(?:\d+|[A-Za-z_][A-Za-z0-9_]*)\}/g, "" ),
	);
}

/**
 * The value with its arguments put in: by name from an object, by position from
 * a list; a missing one stays as `{name}`.
 */
export function Fill(
	segments: readonly Segment[],
	args: Readonly<Record<string, unknown>> | readonly unknown[],
): string {
	let out = "";

	for ( const segment of segments ) {
		if ( typeof segment === "string" ) {
			out += segment;
			continue;
		}
		const value = ( args as Record<string, unknown> )[segment.Arg];

		out += value === undefined ? `{${ segment.Arg }}` : String( value );
	}
	return out;
}

const Rules = new Map<string, Intl.PluralRules>();

/**
 * The plural form a count takes in a language (CLDR rules; an unknown language
 * counts as English).
 */
export function PluralOf( language: string, count: number ): PluralCategory {
	let rules = Rules.get( language );

	if ( !rules ) {
		try {
			rules = new Intl.PluralRules( language );
		} catch {
			rules = new Intl.PluralRules( "en" );
		}
		Rules.set( language, rules );
	}
	return rules.select( count ) as PluralCategory;
}
