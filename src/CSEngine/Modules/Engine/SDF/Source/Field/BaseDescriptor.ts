// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	GroundPlane,
	NoiseTerrain,
	type NoiseTerrainOptions,
	type SdfBaseLayer,
} from "./BaseLayers";
import { MandelbulbBase, type MandelbulbOptions } from "./Fractal";
import { FormulaBase, type FormulaBaseOptions } from "./Formula/FormulaBase";
import { InvertedMandelbrotFormula } from "./Formula/FormulaPresets";

/**
 * An analytic base as data: what a worker, a save or a scene file carries
 * to build the same base again (CreateBaseLayer).
 */
export type SdfBaseDescriptor =
	| { Kind: "Ground"; Height?: number; MaterialId?: number; }
	| { Kind: "Noise"; Options?: NoiseTerrainOptions; }
	| { Kind: "Mandelbulb"; Options?: MandelbulbOptions; }
	| { Kind: "Formula"; Options: FormulaBaseOptions; };

/** The base a descriptor stands for. */
export function CreateBaseLayer( descriptor: SdfBaseDescriptor ): SdfBaseLayer {
	switch ( descriptor.Kind ) {
		case "Ground":
			return new GroundPlane(
				descriptor.Height ?? 0,
				descriptor.MaterialId ?? 0,
			);
		case "Noise":
			return new NoiseTerrain( descriptor.Options );
		case "Mandelbulb":
			return new MandelbulbBase( descriptor.Options );
		case "Formula":
			return new FormulaBase( descriptor.Options );
	}
}

/**
 * "Inside the Mandelbulb" (machina-infinitum; the default world of the
 * fractal templates): the power-2 Julia bulb with the article's constant,
 * turned inside out in a sphere - a cave whose walls are the bulb, with
 * spiral tunnels leading off. `scale`: world units per fractal unit (the
 * cave is about 1.4 of them across to the nearest wall).
 */
export function InvertedMandelbulb( scale = 20 ): SdfBaseDescriptor {
	return {
		Kind: "Mandelbulb",
		Options: {
			Power: 2,
			Iterations: 12,
			Bailout: 4,
			Julia: [ 0.166791, 0.651987, 0.07568 ],
			Invert: 1,
			Scale: scale,
			Thickness: 0.02,
		},
	};
}

/**
 * The same world written as a formula (FormulaPresets): the default of the
 * fractal templates and the formula editor - one source for the CPU and the
 * GPU.
 */
export function InvertedMandelbrot( scale = 20 ): SdfBaseDescriptor {
	return { Kind: "Formula", Options: InvertedMandelbrotFormula( scale ) };
}
