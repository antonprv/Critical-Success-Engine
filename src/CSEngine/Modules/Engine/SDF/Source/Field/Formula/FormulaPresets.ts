// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { FormulaBaseOptions } from "./FormulaBase";

/**
 * The Mandelbulb (White, Nylander): z -> z^power + c in spherical
 * coordinates. `julia` 1 fixes c at `juliaC` (a Julia set; the derivative
 * then grows without the +1).
 */
export const MandelbulbFormula = `// the triplex power of z
param float power = 8 in [2, 16];
param float julia = 0 in [0, 1];
param vec3 juliaC = vec3(0, 0, 0);

init {
	c = mix(p, juliaC, julia);
}

iterate {
	float theta = acos(clamp(z.z / max(r, 1e-30), -1, 1)) * power;
	float phi = atan(z.y, z.x) * power;
	float rp = pow(r, power - 1);

	dr = rp * power * dr + 1 - julia;
	z = rp * r * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi),
		cos(theta)) + c;
}
`;

/**
 * The power-2 Julia bulb in closed form (r^2 and the doubled angles with
 * no trigonometry): what "inside the Mandelbulb" turns inside out.
 */
export const JuliaBulb2Formula = `// z^2 + c without trigonometry
param vec3 juliaC = vec3(0.166791, 0.651987, 0.07568);

init {
	c = juliaC;
}

iterate {
	float rho = sqrt(z.x * z.x + z.y * z.y);
	float s = 0;

	if (rho > 0) {
		s = 2 * z.z / rho;
	}
	dr = 2 * r * dr;
	z = vec3(s * (z.x * z.x - z.y * z.y), s * 2 * z.x * z.y,
		z.z * z.z - rho * rho) + c;
}
`;

/** The Mandelbox (Lowe): a box fold, a sphere fold, scale and add. */
export const MandelboxFormula = `param float scale = 2 in [-3, 3];
param float folding = 1 in [0.1, 2];
param float minRadius = 0.5 in [0.01, 1];
param float fixedRadius = 1 in [0.1, 2];

iterate {
	z = clamp(z, -folding, folding) * 2 - z;

	float r2 = dot(z, z);
	float m2 = minRadius * minRadius;
	float f2 = fixedRadius * fixedRadius;

	if (r2 < m2) {
		z *= f2 / m2;
		dr *= f2 / m2;
	} else if (r2 < f2) {
		z *= f2 / r2;
		dr *= f2 / r2;
	}
	z = z * scale + c;
	dr = dr * abs(scale) + 1;
}

distance {
	return r / abs(dr);
}
`;

/** The Menger sponge as a folding system: sort, scale, shift. */
export const MengerFormula = `param float scale = 3 in [2, 4];
param vec3 offset = vec3(1, 1, 1);

iterate {
	z = abs(z);
	if (z.x < z.y) {
		float t = z.x;
		z.x = z.y;
		z.y = t;
	}
	if (z.x < z.z) {
		float t = z.x;
		z.x = z.z;
		z.z = t;
	}
	if (z.y < z.z) {
		float t = z.y;
		z.y = z.z;
		z.z = t;
	}
	z = z * scale - offset * (scale - 1);
	if (z.z < -0.5 * offset.z * (scale - 1)) {
		z.z += offset.z * (scale - 1);
	}
	dr *= scale;
}

distance {
	return (max(max(abs(z.x), abs(z.y)), abs(z.z)) - 1) / dr;
}
`;

/** A formula preset: its name and what it is made of. */
export interface FormulaPreset {
	Name: string;
	Options: FormulaBaseOptions;
}

/**
 * "Inside the Mandelbulb" (machina-infinitum; the default world of the
 * fractal templates): the power-2 Julia bulb with the article's constant,
 * turned inside out in a sphere. `scale`: world units per fractal unit.
 */
export function InvertedMandelbrotFormula( scale = 20 ): FormulaBaseOptions {
	return {
		Source: JuliaBulb2Formula,
		Frame: {
			Iterations: 12,
			Bailout: 4,
			Invert: 1,
			Scale: scale,
			Thickness: 0.02,
		},
	};
}

/** The presets the formula editor starts from (the first is the default). */
export const FormulaPresets: readonly FormulaPreset[] = [
	{ Name: "Inverted Mandelbrot", Options: InvertedMandelbrotFormula() },
	{
		Name: "Mandelbulb",
		Options: {
			Source: MandelbulbFormula,
			Frame: { Scale: 20, Iterations: 10 },
		},
	},
	{
		Name: "Mandelbox",
		Options: {
			Source: MandelboxFormula,
			Frame: { Scale: 4, Iterations: 15, Bailout: 64 },
		},
	},
	{
		Name: "Menger sponge",
		Options: {
			Source: MengerFormula,
			Frame: { Scale: 20, Iterations: 6, Bailout: 1e6 },
		},
	},
];
