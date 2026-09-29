// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { SoundAction, SoundType } from "../Common/CommonEnums";

export type MainToAudioMessage = { type: "init"; gameLogicPort: MessagePort; };

/**
 * What AudioBank resolved a sound id to. "pcm" is the happy path - AudioBank
 * managed to decode the sound itself (see its doc comment for when that's
 * possible) so AudioPlayer only has to copy channel data into an
 * AudioBuffer, no decoding on the main thread at all. "encoded" is the
 * fallback for browsers that won't let a worker decode audio - AudioPlayer
 * runs the one-time decodeAudioData there instead.
 */
export type ResolvedSound =
	| { kind: SoundType.Pcm; sampleRate: number; channels: Float32Array[]; }
	| { kind: SoundType.Encoded; data: ArrayBuffer; };

/**
 * Sent AudioWorker -> main whenever GameLogicWorker asked to play a sound
 * and AudioBank finished resolving it. Always sent with every buffer inside
 * `sound` in the transfer list (see AudioWorker) - AudioBank keeps its own
 * cached copy, so transferring this one away costs it nothing.
 */
export type AudioToMainMessage = {
	action: SoundAction.PlaySound;
	soundId: string;
	position?: [number, number, number] | undefined;
	sound: ResolvedSound;
};
