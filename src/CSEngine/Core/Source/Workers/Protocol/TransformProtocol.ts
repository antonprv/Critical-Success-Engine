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
 * Sent in the transfer list: the receiver reads it right away and never keeps it. `buffer.byteLength` may exceed
 * `count * stride * 8`, so iterate up to `count`.
 */
export interface TransformBatchPayload {
	entityCount: number;
	buffer: ArrayBuffer;
}
