// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Color3 } from "@babylonjs/core/Maths/math.color";

/** Colors of material ids 0..7 until a game sets its own. */
export const DefaultPalette: readonly Color3[] = [
	new Color3( 0.55, 0.52, 0.47 ),
	new Color3( 0.85, 0.42, 0.25 ),
	new Color3( 0.3, 0.6, 0.35 ),
	new Color3( 0.35, 0.5, 0.85 ),
	new Color3( 0.9, 0.8, 0.35 ),
	new Color3( 0.7, 0.35, 0.75 ),
	new Color3( 0.9, 0.9, 0.92 ),
	new Color3( 0.2, 0.2, 0.22 ),
];

/** A material id's color: ids past the palette wrap around it. */
export function PaletteColor(
	palette: readonly Color3[],
	materialId: number,
): Color3 {
	return palette[materialId % palette.length]!;
}

/** Palette colors as the shaders take them: eight, three floats each. */
export function PaletteFloats( palette: readonly Color3[] ): number[] {
	const floats = palette.slice( 0, 8 )
		.flatMap( ( color ) => [ color.r, color.g, color.b ] );

	while ( floats.length < 24 ) {
		floats.push( 1, 1, 1 );
	}
	return floats;
}
