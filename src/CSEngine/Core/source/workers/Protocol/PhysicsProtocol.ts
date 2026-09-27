// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

export type MainToPhysicsMessage =
	| {
		type: "init";
		gameLogicPort: MessagePort;
		gravity: [number, number, number];
		fixedTimestepMs: number;
	}
	| { type: "set-running"; running: boolean; };
