// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { PhysicsWorldSettingsDescriptor } from "./PhysicsGameLogicProtocol";
import type { PhysicsMsg } from "../Common/CommonEnums";

export type MainToPhysicsMessage =
	| {
		type: PhysicsMsg.Init;
		gameLogicPort: MessagePort;
		settings: PhysicsWorldSettingsDescriptor;
		fixedTimestepMs: number;
	}
	| { type: PhysicsMsg.SetRunning; running: boolean; };
