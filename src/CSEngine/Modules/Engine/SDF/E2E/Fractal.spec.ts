// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, test } from "@playwright/test";

// The formula editor's promise (S6-26): one formula, compiled to JavaScript
// for the CPU (meshing, physics, rays) and to GLSL for the GPU, is one
// surface. The demo's fractal scene - inside the inverted Mandelbrot - on a
// grid of pixels: what the GPU drew against a ray marched through the pixel
// on the CPU, both reading no detail finer than the pixel.

interface Agreement {
	Samples: number;
	Gpu: number;
	Cpu: number;
	Disagree: number;
}

interface Probe {
	Agreement( columns: number, rows: number ): Promise<Agreement>;
	Pending: number;
}

for ( const [ tier, allowed ] of [
	// the GPU marches the formula itself: only silhouettes may differ
	[ "gl", 0.02 ],
	// the meshes sample it in cells (coarser further off): thin fins go
	[ "mesh", 0.1 ],
] as const ) {
	test(
		`the GPU draws the formula's surface (tier ${ tier })`,
		async ( { page } ) => {
			const errors: string[] = [];

			page.on( "pageerror", ( error ) => errors.push( error.message ) );
			// the cave seen from inside, a tunnel's mouth in view (a camera
			// given: no one put down on the floor)
			await page.goto(
				`/?scene=fractal&tier=${ tier }&cam=-1.2083,1.2,12,0,0,0`,
			);
			await page.waitForFunction( () => "sdfReady" in window );
			await expect.poll( () => page.evaluate(
				() => ( window as unknown as {
					sdfProbe: Probe;
				} ).sdfProbe.Pending,
			), { timeout: 30000 } ).toBe( 0 );
			await page.waitForTimeout( 1500 );

			const result = await page.evaluate(
				() => ( window as unknown as { sdfProbe: Probe; } )
					.sdfProbe.Agreement( 48, 27 ),
			);

			// a cave: walls on most of the screen, a tunnel's mouth in it
			expect( result.Cpu / result.Samples ).toBeGreaterThan( 0.3 );
			expect( result.Cpu / result.Samples ).toBeLessThan( 0.95 );
			expect( result.Disagree / result.Samples ).toBeLessThan( allowed );
			expect( errors ).toEqual( [] );
		},
	);
}
