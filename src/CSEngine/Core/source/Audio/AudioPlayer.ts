// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { AudioToMainMessage } from "../Workers/Protocol/AudioProtocol";

/**
 * Owns the one real-time AudioContext for the whole game. AudioWorker never
 * plays sound itself - see AudioBank's doc comment for why a worker can't
 * be trusted to have a working audio output everywhere - it only resolves
 * sound ids into either ready-to-play PCM or, when it couldn't decode
 * locally, the raw encoded bytes, and hands them here over its own
 * postMessage channel back to main. Per play, the main thread only ever
 * does a cheap AudioBuffer copy (already-decoded case) or, at most once per
 * sound id, a decodeAudioData call that the browser itself runs off the JS
 * main thread - neither reintroduces the stutter this split exists to avoid.
 */
export class AudioPlayer {
	private readonly _context: AudioContext;
	private readonly _decodedCache = new Map<string, AudioBuffer>();

	public constructor(audioWorker: Worker) {
		this._context = new AudioContext();
		audioWorker.onmessage = (event: MessageEvent<AudioToMainMessage>) => this.OnMessage(event.data);
	}

	/** Call from a real user gesture (see DomInputBridge) - browsers refuse to start a suspended AudioContext otherwise. */
	public Resume(): void {
		void this._context.resume();
	}

	private OnMessage(message: AudioToMainMessage): void {
		if (message.type !== "play-sound") return;

		if (message.sound.kind === "pcm") this.PlayPcm(message.sound, message.position);
		else this.PlayEncoded(message.soundId, message.sound.data, message.position);
	}

	private PlayPcm(sound: { sampleRate: number; channels: Float32Array[] }, position?: [number, number, number]): void {
		const length = sound.channels[0]?.length ?? 0;
		const buffer = this._context.createBuffer(sound.channels.length, length, sound.sampleRate);
		sound.channels.forEach((channel, index) => buffer.copyToChannel(channel, index));
		this.Start(buffer, position);
	}

	private PlayEncoded(soundId: string, data: ArrayBuffer, position?: [number, number, number]): void {
		const cached = this._decodedCache.get(soundId);
		if (cached) {
			this.Start(cached, position);
			return;
		}

		this._context
			.decodeAudioData(data)
			.then((decoded) => {
				this._decodedCache.set(soundId, decoded);
				this.Start(decoded, position);
			})
			.catch((error) => console.error(`[AudioPlayer] failed to decode "${soundId}"`, error));
	}

	private Start(buffer: AudioBuffer, position?: [number, number, number]): void {
		const source = this._context.createBufferSource();
		source.buffer = buffer;

		if (position) {
			const panner = this._context.createPanner();
			panner.positionX.value = position[0];
			panner.positionY.value = position[1];
			panner.positionZ.value = position[2];
			source.connect(panner).connect(this._context.destination);
		} else {
			source.connect(this._context.destination);
		}

		source.start();
	}
}
