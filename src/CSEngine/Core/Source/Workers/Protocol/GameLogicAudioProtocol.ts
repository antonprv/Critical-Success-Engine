// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { SoundAction } from "../Common/CommonEnums";

export type GameLogicToAudioMessage = {
    action: SoundAction.PlaySound;
    soundId: string;
    position?: [number, number, number];
};
