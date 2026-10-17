// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * One SDF edit: a shape with a pose and uniform scale, combined with what
 * comes before it in the list by a boolean operation. The world is the
 * ordered list of edits (plan.md 4): saves, undo, the network and a lost GPU
 * context all rebuild from it.
 */

/** The shapes an edit can have. Sizes are in the edit's local units. */
export const enum SdfShape {
	/** P0: radius. */
	Sphere = 0,
	/** P0..P2: half extents. */
	Box = 1,
	/** P0..P2: half extents (outer), P3: corner radius. */
	RoundBox = 2,
	/** Along local Y. P0: half height of the segment, P1: radius. */
	Capsule = 3,
	/** In the local XZ plane. P0: ring radius, P1: tube radius. */
	Torus = 4,
	/** Along local Y. P0: half height, P1: radius. */
	Cylinder = 5,
	/** P0..P2: radii (a bound, not an exact distance). */
	Ellipsoid = 6,
}

/**
 * How an edit meets what is before it. The smooth ones blend over
 * `SmoothK` world units.
 */
export const enum SdfOp {
	Union = 0,
	Subtract = 1,
	Intersect = 2,
	SmoothUnion = 3,
	SmoothSubtract = 4,
	SmoothIntersect = 5,
}

/** What the physics makes of an edit (plan.md 9.2). */
export const enum SdfPhysicsMode {
	/** Part of the static collision mesh. */
	StaticWorld = 0,
	/** A body of its own: kept out of the static mesh. */
	DynamicBody = 1,
	/** Seen, never collided with. */
	VisualOnly = 2,
	/** Reports overlaps, doesn't push. */
	Sensor = 3,
}

/** Edit flags (bit set). */
export const enum SdfEditFlags {
	None = 0,
	/** An editor preview: drawn, never saved. */
	Preview = 1,
	/** Muted in the editor's layer list: neither drawn nor collided. */
	Muted = 2,
}

/** An edit as the game sees it. */
export interface SdfEdit {
	/** Stable id: what deltas, undo and the BVH address. */
	readonly Id: number;
	Shape: SdfShape;
	Op: SdfOp;
	/** World position. */
	Position: [ number, number, number ];
	/** Rotation quaternion (x, y, z, w), unit length. */
	Rotation: [ number, number, number, number ];
	/** Uniform scale (non-uniform scale breaks the distance, plan.md 4.1). */
	Scale: number;
	/** Shape sizes, see SdfShape. */
	Params: [ number, number, number, number ];
	/** Blend radius of the smooth operations, world units. */
	SmoothK: number;
	MaterialId: number;
	Flags: SdfEditFlags;
	PhysicsMode: SdfPhysicsMode;
	/** Edits moved and combined as one (0: none). */
	Group: number;
	/** Position in the list: operations don't commute. */
	Order: number;
}

/** What a new edit is made of; the rest has defaults. */
export type SdfEditInit = Partial<Omit<SdfEdit, "Id" | "Order">> & {
	Shape: SdfShape;
};

/** One packed edit: 16 four-byte words, 64 bytes (plan.md 4.1). */
export const EDIT_WORDS = 16;

export const EDIT_BYTES = EDIT_WORDS * 4;

/** Highest material id: 16 bits of the packed word. */
export const MAX_MATERIAL = 0xffff;

/**
 * Packs an edit into `floats`/`words` (two views of the same buffer) at
 * `index`. Layout, in words: position + scale, rotation, params, then
 * op (bits 0-3) | shape (4-9) | physics mode (10-11) | flags (12-15) |
 * material (16-31), smoothK, group, order.
 */
export function PackEdit(
	edit: SdfEdit,
	floats: Float32Array,
	words: Uint32Array,
	index: number,
): void {
	const at = index * EDIT_WORDS;

	floats[at] = edit.Position[0];
	floats[at + 1] = edit.Position[1];
	floats[at + 2] = edit.Position[2];
	floats[at + 3] = edit.Scale;
	floats[at + 4] = edit.Rotation[0];
	floats[at + 5] = edit.Rotation[1];
	floats[at + 6] = edit.Rotation[2];
	floats[at + 7] = edit.Rotation[3];
	floats[at + 8] = edit.Params[0];
	floats[at + 9] = edit.Params[1];
	floats[at + 10] = edit.Params[2];
	floats[at + 11] = edit.Params[3];
	words[at + 12] = ( edit.Op & 0xf )
		| ( ( edit.Shape & 0x3f ) << 4 )
		| ( ( edit.PhysicsMode & 0x3 ) << 10 )
		| ( ( edit.Flags & 0xf ) << 12 )
		| ( ( edit.MaterialId & MAX_MATERIAL ) << 16 );
	floats[at + 13] = edit.SmoothK;
	words[at + 14] = edit.Group;
	words[at + 15] = edit.Order;
}

/** The edit at `index`, read back from PackEdit's layout. */
export function UnpackEdit(
	id: number,
	floats: Float32Array,
	words: Uint32Array,
	index: number,
): SdfEdit {
	const at = index * EDIT_WORDS;
	const kind = words[at + 12]!;

	return {
		Id: id,
		Position: [ floats[at]!, floats[at + 1]!, floats[at + 2]! ],
		Scale: floats[at + 3]!,
		Rotation: [
			floats[at + 4]!,
			floats[at + 5]!,
			floats[at + 6]!,
			floats[at + 7]!,
		],
		Params: [
			floats[at + 8]!,
			floats[at + 9]!,
			floats[at + 10]!,
			floats[at + 11]!,
		],
		Op: ( kind & 0xf ) as SdfOp,
		Shape: ( ( kind >>> 4 ) & 0x3f ) as SdfShape,
		PhysicsMode: ( ( kind >>> 10 ) & 0x3 ) as SdfPhysicsMode,
		Flags: ( ( kind >>> 12 ) & 0xf ) as SdfEditFlags,
		MaterialId: kind >>> 16,
		SmoothK: floats[at + 13]!,
		Group: words[at + 14]!,
		Order: words[at + 15]!,
	};
}

/** Whether an edit only removes or clips (it never adds material). */
export function IsCarving( op: SdfOp ): boolean {
	return op === SdfOp.Subtract || op === SdfOp.SmoothSubtract;
}

/**
 * Whether an edit changes the world everywhere, not just near itself: an
 * intersection empties all that lies outside it, so it can't be culled by
 * its bounds.
 */
export function IsGlobal( op: SdfOp ): boolean {
	return op === SdfOp.Intersect || op === SdfOp.SmoothIntersect;
}

/** Whether an operation blends (its reach grows by SmoothK). */
export function IsSmooth( op: SdfOp ): boolean {
	return op >= SdfOp.SmoothUnion;
}
