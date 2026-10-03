// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { PhysicsWorldSettingsDescriptor } from "./PhysicsGameLogicProtocol";

export type MainToPhysicsMessage =
	| {
		type: "init";
		gameLogicPort: MessagePort;
		settings: PhysicsWorldSettingsDescriptor;
		fixedTimestepMs: number;
	}
	| { type: "set-running"; running: boolean; };
