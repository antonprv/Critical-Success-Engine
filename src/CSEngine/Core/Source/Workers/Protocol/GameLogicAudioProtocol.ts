// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

export type GameLogicToAudioMessage = { type: "play-sound"; soundId: string; position?: [number, number, number] };
