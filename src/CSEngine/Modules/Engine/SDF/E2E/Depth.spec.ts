// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, test, type Page } from "@playwright/test";

// plan.md 15, the M0 criterion: Babylon meshes and the SDF world occlude each
// other correctly. The demo's still scene: a ball (radius 1) at the origin, a
// small cube in front of it (z = 2.5) and a big one behind (z = -2.5), the
// camera on +Z looking at the origin. Colors: the ball is orange, the cubes
// cyan.

interface Probe {
	Pixel( x: number, y: number, z: number ): Promise<number[]>;
	Pending: number;
}

async function Color( page: Page, x: number, y: number, z: number ): Promise<
	string
> {
	const [ r, g, b ] = await page.evaluate(
		( [ px, py, pz ] ) => ( window as unknown as { sdfProbe: Probe; } )
			.sdfProbe.Pixel( px!, py!, pz! ),
		[ x, y, z ],
	);

	// by hue, so a shaded side counts too
	return r! > b! * 1.5 && r! > 0.05 ? "ball"
		: b! > r! * 1.5 && b! > 0.05 ? "cube"
			: `other ${ r } ${ g } ${ b }`;
}

for ( const tier of [ "gl", "mesh" ] ) {
	test(
		`meshes and the SDF world sort by depth (tier ${ tier })`,
		async ( { page } ) => {
			const errors: string[] = [];

			page.on( "pageerror", ( error ) => errors.push( error.message ) );
			await page.goto( `/?scene=depth&tier=${ tier }&budget=1000` );
			await page.waitForFunction( () => "sdfReady" in window );
			await expect.poll( () => page.evaluate(
				() => ( window as unknown as {
					sdfProbe: Probe;
				} ).sdfProbe.Pending,
			) ).toBe( 0 );
			// a few frames with everything meshed and uploaded
			await page.waitForTimeout( 1500 );

			// the front cube hides the ball's center
			await expect.poll( () => Color( page, 0, 0, 2.75 ) ).toBe( "cube" );
			// the ball hides the cube behind it
			expect( await Color( page, 0.7, 0, 0.7 ) ).toBe( "ball" );
			expect( await Color( page, 0, -0.75, 0.6 ) ).toBe( "ball" );
			// past the ball's outline, the cube behind shows
			expect( await Color( page, 0, 1.3, -1 ) ).toBe( "cube" );
			expect( await Color( page, -1.3, 0, -1 ) ).toBe( "cube" );
			expect( errors ).toEqual( [] );
		},
	);
}
