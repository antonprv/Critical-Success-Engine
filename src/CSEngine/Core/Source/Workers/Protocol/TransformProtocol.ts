// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** Flat [posX, posY, posZ, quatX, quatY, quatZ, quatW]. */
export type FlatTransform = [number, number, number, number, number, number, number];

/** Float64 slots per entity in a {@link TransformBatchPayload} buffer. */
export const TRANSFORM_STRIDE = 8; // [entityId, posX, posY, posZ, quatX, quatY, quatZ, quatW]

/**
 * Flat, transferable representation of one physics tick's entity transforms.
 * `buffer` is the underlying ArrayBuffer of a Float64Array, laid out as
 * `entityCount` back-to-back groups of TRANSFORM_STRIDE float64s each:
 * `[entityId, posX, posY, posZ, quatX, quatY, quatZ, quatW]`.
 *
 * Always sent as the transfer list of its postMessage call
 * (`postMessage(msg, [payload.buffer])`) - that moves ownership of the
 * buffer between worker realms instead of structured-cloning it, so it's
 * zero-copy at every hop. Whoever receives it either reads it immediately
 * or forwards it on (transferring it again); never hold onto a buffer
 * across a tick and expect to still be able to write into it - once
 * transferred, the sending realm's view of it is permanently detached.
 *
 * `buffer.byteLength` may be larger than `entityCount * TRANSFORM_STRIDE * 8`
 * (the sender may reuse capacity from a bigger previous tick) - always
 * iterate up to `entityCount`, never derive it from `buffer.byteLength`.
 */
export interface TransformBatchPayload {
	step: number;
	entityCount: number;
	buffer: ArrayBuffer;
}
