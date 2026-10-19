// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, test, type Page } from "@playwright/test";

// Splats and splat grass in the demo, in both tiers: balls rolling over the
// grass scene's grass press it flat where they are (it stands up again behind
// them); splats thrown at the splats scene's wall (its face at x = 3.6) pile
// up on it, half merged with it, half on a layer of their own.

interface Demo {
	world: {
		Field: {
			Distance( x: number, y: number, z: number ): number;
			LastLayer: number;
		};
	};
	Layers(): {
		grass: {
			Count: number;
			Drawn: number;
			Field: { FlatAt( x: number, z: number ): number; };
		} | null;
		balls: { Balls: Array<{ position: { x: number; z: number; }; }>; }
			| null;
		thrower: { Landed: number; } | null;
	};
}

async function Open( page: Page, url: string ): Promise<string[]> {
	const errors: string[] = [];

	page.on( "pageerror", ( error ) => errors.push( error.message ) );
	await page.goto( url );
	await page.waitForFunction( () => "sdfReady" in window );
	return errors;
}

for ( const tier of [ "gl", "mesh" ] ) {
	test(
		`balls press the grass flat as they roll (tier ${ tier })`,
		async ( { page } ) => {
			const errors = await Open( page, `/?scene=grass&tier=${ tier }` );

			await expect.poll( () => page.evaluate(
				() => ( window as unknown as {
					sdfDemo: Demo;
				} ).sdfDemo.Layers().grass?.Count ?? 0,
			) ).toBeGreaterThan( 1000 );
			await page.waitForTimeout( 1500 );

			const state = await page.evaluate( () => {
				const layers = ( window as unknown as {
					sdfDemo: Demo;
				} ).sdfDemo.Layers();
				const field = layers.grass!.Field;

				return {
					drawn: layers.grass!.Drawn,
					under: layers.balls!.Balls.map(
						( ball ) => field.FlatAt(
							ball.position.x,
							ball.position.z,
						),
					),
					// the middle of the field, away from the balls' loops
					away: field.FlatAt( -5, -5 ),
				};
			} );

			expect( state.drawn ).toBeGreaterThan( 0 );
			// under every ball on the grass the blades lie down
			expect( state.under.filter( ( flat ) => flat > 0.5 ).length )
				.toBeGreaterThanOrEqual( 3 );
			expect( state.away ).toBe( 0 );
			expect( errors ).toEqual( [] );
		},
	);

	test(
		`splats thrown at a wall pile up on it (tier ${ tier })`,
		async ( { page } ) => {
			const errors = await Open( page, `/?scene=splats&tier=${ tier }` );
			// points just in front of the wall's face: inside the pile, or air
			const Pile = (): Promise<
				{ inside: number; layers: number[]; landed: number; }
			> => page.evaluate( () => {
				const demo = ( window as unknown as {
					sdfDemo: Demo;
				} ).sdfDemo;
				const field = demo.world.Field;
				const layers = new Set<number>();
				let inside = 0;

				for ( let y = 0.2; y <= 3; y += 0.2 ) {
					for ( let z = -2; z <= 2; z += 0.2 ) {
						if ( field.Distance( 3.5, y, z ) < 0 ) {
							inside++;
							layers.add( field.LastLayer );
						}
					}
				}
				return {
					inside,
					layers: [ ...layers ].sort(),
					landed: demo.Layers().thrower!.Landed,
				};
			} );

			const first = await Pile();

			// before any landed, only air there
			expect( first.landed > 0 || first.inside === 0 ).toBe( true );
			await expect.poll(
				async () => ( await Pile() ).landed,
				{ timeout: 60_000 },
			)
				.toBeGreaterThan( 12 );

			const pile = await Pile();

			expect( pile.inside ).toBeGreaterThan( 5 );
			// merged with the wall (its layer, the first) and on their own (the
			// second)
			expect( pile.layers ).toEqual( [ 0, 1 ] );
			expect( errors ).toEqual( [] );
		},
	);
}
