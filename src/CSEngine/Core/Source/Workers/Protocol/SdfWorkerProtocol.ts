// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { SdfMsg } from "../Common/CommonEnums";

/**
 * main -> SdfWorker: its three ports. GameLogic sends it the game's edits
 * and questions; it sends chunks straight to the render and physics workers
 * (the messages themselves: @cse/sdf's SdfProtocol).
 */
export type MainToSdfMessage = {
	type: SdfMsg.Init;
	gameLogicPort: MessagePort;
	renderPort: MessagePort;
	physicsPort: MessagePort;
	/** Where the game's files are: a scene's baked SDF base by URL. */
	baseUrl: string;
};
