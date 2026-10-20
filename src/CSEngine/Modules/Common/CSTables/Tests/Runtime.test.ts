// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { Localization, type LocalizationKeys } from "../Source/Runtime.ts";
import type { CompiledValue } from "../Source/Tables.ts";

const Keys: LocalizationKeys = {
	BaseLanguage: "ru",
	Languages: [ "ru", "en", "pt-BR" ],
	Names: [
		"Ui.Title",
		"Ui.Greeting",
		"Ui.Coins",
		"Ui.Only",
		"Ui.Positional",
		"Ui.Braces",
		"Ui.Bag",
		"Ui.Bare",
	],
};
const Ru: CompiledValue[] = [
	"Меню",
	"Привет, {name}!",
	{ one: "{count} монета", few: "{count} монеты", other: "{count} монет" },
	"только здесь",
	"{0} и {1}",
	"\\{не аргумент\\}",
	{ one: "в {where} одна", other: "в {where} {count}" },
	{ one: "одна", other: "много" },
];
const En: CompiledValue[] = [
	"Menu",
	"Hello, {name}!",
	{ one: "{count} coin", other: "{count} coins" },
	null,
	"{0} and {1}",
	"\\{x\\}",
	{ other: "{count} in {where}" },
];

function Make( warn = vi.fn() ) {
	const load = vi.fn( async () => ( { default: En } ) );

	return {
		l: new Localization(
			Keys,
			{
				ru: Ru,
				en: load,
				"pt-BR": [ null, null, null, null, null, null, null ],
			},
			warn,
		),
		load,
		warn,
	};
}

describe( "Localization", () => {
	it(
		"looks keys up in the current language, falling back to the base, then "
			+ "to the name (logged once)",
		async () => {
			const { l, load, warn } = Make();

			expect( l.Language ).toBe( "ru" );
			expect( l.Get( 0 ) ).toBe( "Меню" );
			expect( l.IsLoaded( "en" ) ).toBe( false );
			const changed = vi.fn();
			const stop = l.OnLanguageChanged( changed );

			await l.SetLanguage( "en" );
			await l.SetLanguage( "en" );
			expect( load ).toHaveBeenCalledTimes( 1 );
			expect( changed.mock.calls ).toEqual( [ [ "en" ] ] );
			expect( l.Get( 0 ) ).toBe( "Menu" );
			expect( l.Get( 3 ) ).toBe( "только здесь" );
			expect( l.Get( 99 ) ).toBe( "#99" );
			expect( l.Get( 99 ) ).toBe( "#99" );
			expect( warn ).toHaveBeenCalledTimes( 1 );
			stop();
			await l.SetLanguage( "ru" );
			expect( changed ).toHaveBeenCalledTimes( 1 );
			await expect( l.SetLanguage( "de" ) ).rejects
				.toThrow( /no table for the language "de"/ );
			expect( l.BaseLanguage ).toBe( "ru" );
			expect( l.Languages ).toEqual( [ "ru", "en", "pt-BR" ] );
		},
	);

	it(
		"puts arguments in and picks plural forms by the current language",
		async () => {
			const { l } = Make();

			expect( l.Format( 1, { name: "Аня" } ) ).toBe( "Привет, Аня!" );
			expect( l.Format( 4, [ "a", "b" ] ) ).toBe( "a и b" );
			expect( l.Format( 0, {} ) ).toBe( "Меню" );
			expect( l.Get( 5 ) ).toBe( "{не аргумент}" );
			expect( [ 1, 3, 5 ].map( ( n ) => l.Plural( 2, n ) ) )
				.toEqual( [ "1 монета", "3 монеты", "5 монет" ] );
			expect( l.Plural( 6, 1, { where: "сумке" } ) )
				.toBe( "в сумке одна" );
			expect( l.Plural( 6, 5, { where: "сумке" } ) ).toBe( "в сумке 5" );
			expect( l.Get( 2 ) ).toBe( "{count} монета" );
			expect( l.Plural( 7, 1 ) ).toBe( "одна" );
			expect( l.Plural( 7, 1 ) ).toBe( "одна" );
			await l.SetLanguage( "en" );
			expect( l.Plural( 2, 1 ) ).toBe( "1 coin" );
			expect( l.Plural( 6, 1, { where: "the bag" } ) )
				.toBe( "1 in the bag" );
			expect( l.Get( 6 ) ).toBe( "{count} in {where}" );
			const { l: missing } = Make();

			expect( missing.Format( 99, {} ) ).toBe( "#99" );
			expect( missing.Plural( 99, 1 ) ).toBe( "#99" );
		},
	);

	it(
		"finds keys by name, loads a language ahead, and refuses a base "
			+ "language that would load later",
		async () => {
			const { l } = Make();

			expect( l.Id( "Ui.Greeting" ) ).toBe( 1 );
			expect( l.Id( "Ui.Nope" ) ).toBeNull();
			await l.Load( "pt-BR" );
			expect( l.IsLoaded( "pt-BR" ) ).toBe( true );
			expect( l.Language ).toBe( "ru" );
			const plain = new Localization(
				{ ...Keys, BaseLanguage: "en" },
				{ en: En, ru: async () => Ru },
			);

			await plain.SetLanguage( "ru" );
			expect( plain.Get( 0 ) ).toBe( "Меню" );
			expect( () => new Localization( Keys, { ru: async () => Ru } ) )
				.toThrow( /must be given as values/ );
		},
	);

	it(
		"starts in the remembered language, else the system's, else the base, "
			+ "and remembers the choice",
		async () => {
			const { l } = Make();

			expect( l.PickLanguage( [ "de-DE", "EN-gb" ] ) ).toBe( "en" );
			expect( l.PickLanguage( [ "pt-br" ] ) ).toBe( "pt-BR" );
			expect( l.PickLanguage( [ "de" ] ) ).toBe( "ru" );
			expect( l.PickLanguage() ).toBe( "ru" );
			let stored: string | null = "nope";
			const memory = {
				Load: () => stored,
				Save: ( language: string ) => {
					stored = language;
				},
			};

			l.Remember( memory );
			expect( l.PickLanguage( [ "en" ] ) ).toBe( "en" );
			await l.SetLanguage( "pt-BR" );
			expect( stored ).toBe( "pt-BR" );
			expect( l.PickLanguage( [ "en" ] ) ).toBe( "pt-BR" );
		},
	);

	it( "looks up a key without allocating", () => {
		const { l } = Make();
		const before = process.memoryUsage().heapUsed;
		let length = 0;

		for ( let i = 0; i < 100_000; i++ ) {
			length += l.Get( i % 2 ).length;
		}
		expect( length )
			.toBe( 50_000 * ( "Меню".length + "Привет, {name}!".length ) );
		// A string per lookup would be several megabytes; the lookups return
		// the stored strings.
		expect( process.memoryUsage().heapUsed - before )
			.toBeLessThan( 2_000_000 );
	} );
} );
