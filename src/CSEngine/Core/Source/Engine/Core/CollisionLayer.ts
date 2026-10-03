// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** Collision layer bits (same values as the Godot project). Two bodies interact when each one's layer is in the other's mask. */
export enum CollisionLayer {
	None = 0,
	World = 1 << 0,
	Character = 1 << 1,
	Projectile = 1 << 2,
	Trigger = 1 << 3,
	Prop = 1 << 4,
	Debris = 1 << 5,
	/** All 32 bits (-1 as int32 - the .NET marshaller only accepts int32, see PhysicsWorld.ts). */
	All = -1,
}
