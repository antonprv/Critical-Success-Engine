// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { FMath } from "@cse/fastmath";
import {
	ALL_LAYERS,
	SdfOp,
	SdfShape,
	type SdfEditInit,
} from "./SdfEdit";

/**
 * A splat: a soft blob of matter that hits a surface and stays there (paint,
 * mud, snow, slime). In flight it is drawn by the GPU (a dynamic edit,
 * SdfSplat in the engine); where it lands it becomes an ordinary edit -
 * flattened against the surface, merged into what it hit if the layers
 * allow (its mask has their layer: a smooth fillet and a fading colour),
 * stuck to it with a hard seam if not.
 */
export interface SdfSplatInit {
	/** Where it landed. */
	Position: [ number, number, number ];
	/** The surface's normal there (unit): the splat flattens along it. */
	Normal?: [ number, number, number ];
	/** Its size before it flattened. */
	Radius: number;
	/**
	 * How flat it lies: its thickness against its width (0..1]. Default 0.45.
	 */
	Flatness?: number;
	/** The fillet towards what it hit. Default 0.8 of the radius. */
	SmoothK?: number;
	MaterialId?: number;
	/** Its layer and the layers it merges with (as an edit's). */
	Layer?: number;
	Mask?: number;
	/**
	 * It takes matter away instead: a crater where it hit, deeper than wide
	 * (a shot that drills), its walls of MaterialId; where shots keep
	 * hitting, they go through. Flatness doesn't apply.
	 */
	Carve?: boolean;
}

/**
 * The edit a splat leaves: an ellipsoid as wide as it spreads (its volume
 * kept: a flatter one is wider), its short axis along the normal, a little
 * sunk into the surface, smoothly joined to it.
 */
export function SplatEdit( splat: SdfSplatInit ): SdfEditInit {
	if ( splat.Carve ) {
		return CraterEdit( splat );
	}

	const flat = FMath.Clamp( splat.Flatness ?? 0.45, 0.05, 1 );
	const r = splat.Radius;
	// the same volume as the round blob: w * w * t = r^3, t = flat * w
	const wide = r / Math.cbrt( flat );
	const thick = wide * flat;
	const [ nx, ny, nz ] = splat.Normal ?? [ 0, 1, 0 ];

	return {
		Shape: SdfShape.Ellipsoid,
		Op: SdfOp.SmoothUnion,
		// half sunk: it presses into what it hit
		Position: [
			splat.Position[0] - nx * thick * 0.3,
			splat.Position[1] - ny * thick * 0.3,
			splat.Position[2] - nz * thick * 0.3,
		],
		Rotation: RotationFromY( nx, ny, nz ),
		Params: [ wide, thick, wide, 0 ],
		SmoothK: splat.SmoothK ?? r * 0.8,
		MaterialId: splat.MaterialId ?? 0,
		Layer: splat.Layer ?? 1,
		Mask: splat.Mask ?? ALL_LAYERS,
	};
}

/**
 * The edit a carving splat leaves: an ellipsoid hollow a little wider than
 * the splat, deeper along the normal, most of it inside what was hit.
 */
function CraterEdit( splat: SdfSplatInit ): SdfEditInit {
	const r = splat.Radius;
	const wide = r * 1.1;
	const deep = r * 1.5;
	const [ nx, ny, nz ] = splat.Normal ?? [ 0, 1, 0 ];

	return {
		Shape: SdfShape.Ellipsoid,
		Op: SdfOp.SmoothSubtract,
		Position: [
			splat.Position[0] - nx * deep * 0.5,
			splat.Position[1] - ny * deep * 0.5,
			splat.Position[2] - nz * deep * 0.5,
		],
		Rotation: RotationFromY( nx, ny, nz ),
		Params: [ wide, deep, wide, 0 ],
		SmoothK: splat.SmoothK ?? r * 0.3,
		MaterialId: splat.MaterialId ?? 0,
		Layer: splat.Layer ?? 1,
		Mask: splat.Mask ?? ALL_LAYERS,
	};
}

/** The rotation that turns +Y onto a unit direction (x, y, z, w). */
export function RotationFromY(
	x: number,
	y: number,
	z: number,
): [ number, number, number, number ] {
	// half way between +Y and the direction, as a quaternion: axis Y x d,
	// cos(half angle) from the dot
	if ( y < -0.999999 ) {
		return [ 1, 0, 0, 0 ];
	}

	const w = 1 + y;
	const length = FMath.Sqrt( z * z + x * x + w * w );

	return [ z / length, 0, -x / length, w / length ];
}
