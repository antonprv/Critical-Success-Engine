// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** Physics runs at a fixed rate regardless of display refresh; PhysicsWorker steps by this, GameLogic's OnPhysicsUpdate gets it as dt. */
export const PhysicsFixedTimestepMs = 1000 / 60;
