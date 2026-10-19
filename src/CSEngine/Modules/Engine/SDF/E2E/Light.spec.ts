// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, test, type Page } from "@playwright/test";

// plan.md 8.2-8.3: the SDF world and Babylon meshes shadow each other through
// the sun's shadow map, and a dynamic edit (drawn by the GPU, never meshed)
// changes the world in both tiers. The demo's light scene, the sun straight
// above: a cube (1 m) floating at (3, 1.5, 0) over the SDF ground, an SDF ball
// (r 0.6) floating at (0, 3.2, 0) over a cube whose top is at y = 1.5, and a
// dynamic hole (r 1, material 2: green) at (-3, 0.3, 0).

interface Probe {
	Pixel( x: number, y: number, z: number ): Promise<number[]>;
	Pending: number;
}

async function Rgb( page: Page, x: number, y: number, z: number ): Promise<
	number[]
> {
	return page.evaluate(
		( [ px, py, pz ] ) => ( window as unknown as { sdfProbe: Probe; } )
			.sdfProbe.Pixel( px!, py!, pz! ),
		[ x, y, z ],
	);
}

function Luma( [ r, g, b ]: number[] ): number {
	return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

for ( const tier of [ "gl", "mesh" ] ) {
	test(
		`meshes and the SDF world shadow each other (tier ${ tier })`,
		async ( { page } ) => {
			const errors: string[] = [];

			page.on( "pageerror", ( error ) => errors.push( error.message ) );
			await page.goto( `/?scene=light&tier=${ tier }` );
			await page.waitForFunction( () => "sdfReady" in window );
			await expect.poll( () => page.evaluate(
				() => ( window as unknown as {
					sdfProbe: Probe;
				} ).sdfProbe.Pending,
			) ).toBe( 0 );
			await page.waitForTimeout( 1500 );

			// the floating cube's shadow on the SDF ground
			const shaded = Luma( await Rgb( page, 3, 0, 0 ) );
			const lit = Luma( await Rgb( page, 3, 0, 2.5 ) );

			expect( shaded ).toBeLessThan( lit * 0.75 );

			// the SDF ball's shadow on the cube's top
			const under = Luma( await Rgb( page, 0, 1.5, 0 ) );
			const beside = Luma( await Rgb( page, 0.6, 1.5, -0.6 ) );

			expect( under ).toBeLessThan( beside * 0.75 );

			// the dynamic hole: where the ground was, its green inside
			const [ r, g, b ] = await Rgb( page, -3, 0, 0 );

			expect( g! ).toBeGreaterThan( r! * 1.2 );
			expect( g! ).toBeGreaterThan( b! * 1.2 );
			// and the ground beside it stays grey
			const [ gr, gg ] = await Rgb( page, -3, 0, 2.5 );

			expect( gg! ).toBeLessThan( gr! * 1.2 );
			expect( errors ).toEqual( [] );
		},
	);
}
