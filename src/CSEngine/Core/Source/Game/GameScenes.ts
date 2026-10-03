// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { SceneRegistry } from "../Engine/Scenes/SceneRegistry";
import { BouncingBallScene } from "./Scenes/BouncingBallScene";
import { CharacterTestScene } from "./Scenes/CharacterTestScene";
import { CoinHuntScene } from "./Scenes/CoinHuntScene";

/** Every scene that shows up in the pause menu. The first one is what loads at startup. */
export function RegisterGameScenes(registry: SceneRegistry): void {
	registry.Register(BouncingBallScene).Register(CharacterTestScene).Register(CoinHuntScene);
}
