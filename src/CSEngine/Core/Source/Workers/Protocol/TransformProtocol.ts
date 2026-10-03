// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** Flat [posX, posY, posZ, quatX, quatY, quatZ, quatW]. */
export type FlatTransform = [number, number, number, number, number, number, number];

/** Float64 slots per entity in a render transform batch (GameLogic -> Render). */
export const TRANSFORM_STRIDE = 8; // [entityId, posX, posY, posZ, quatX, quatY, quatZ, quatW]

/**
 * Float64 slots per body in a physics step snapshot (Physics -> GameLogic). GameLogic needs velocities too (so scripts can
 * read `RigidBody.LinearVelocity` synchronously), which is why this is wider than the render-side stride.
 */
export const BODY_STRIDE = 14; // [entityId, pos(3), quat(4), linearVelocity(3), angularVelocity(3)]

/** Float64 slots per character in a physics step snapshot: results of that step's MoveCharacter. */
export const CHARACTER_STRIDE = 9; // [entityId, isOnFloor(0/1), floorNormal(3), groundEntityId, velocity(3)]

/**
 * Buffers here are always sent in the transfer list of their postMessage call: ownership moves between worker realms
 * instead of being structured-cloned. Whoever receives one reads it immediately or forwards it on; never hold onto a
 * buffer across a tick and expect to write into it - once transferred, the sender's view is permanently detached.
 *
 * `buffer.byteLength` may be larger than `count * stride * 8`: always iterate up to the explicit count.
 */
export interface TransformBatchPayload {
	entityCount: number;
	buffer: ArrayBuffer;
}
