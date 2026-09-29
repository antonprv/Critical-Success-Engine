// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../../Logging/Logger";
import { SoundType as SoundKind } from "../Common/CommonEnums";
import type { ResolvedSound } from "../Protocol/AudioProtocol";

/**
 * Sound-id -> URL registry plus the fetch/cache/best-effort-decode pipeline
 * behind it. Runs entirely inside AudioWorker, so the network round-trip,
 * the raw compressed bytes it returns, and (where this browser allows it)
 * the decode work never touch the main thread until a sound is actually
 * about to play - see AudioWorker for how a Resolve() result gets shipped
 * out, and AudioPlayer (main thread, Source/Audio/AudioPlayer.ts) for where
 * sound is actually rendered to speakers.
 *
 * KNOWN LIMITATION (browser support): decoding needs a BaseAudioContext,
 * and exposing one inside a dedicated Worker's global scope is still an
 * open WebAudio spec item - reliable on Chromium, not yet shipped on
 * Firefox/Safari. `_offlineCtor` below is undefined there, and Resolve()
 * degrades to shipping the raw encoded bytes to the main thread instead,
 * where AudioPlayer's always-present AudioContext.decodeAudioData does the
 * one-time decode - browsers run that off the JS main thread internally,
 * so this fallback doesn't reintroduce the stutter this split exists to
 * avoid. Check current support before assuming otherwise:
 * https://github.com/WebAudio/web-audio-api/issues/2423
 */
export class AudioBank {
	private readonly _offlineCtor =
		(self as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; }).OfflineAudioContext;
	private readonly _rawCache = new Map<string, ArrayBuffer>();
	private readonly _pcmCache = new Map<string, { sampleRate: number; channels: Float32Array[]; }>();

	/** Registry of sound-id -> URL. Fill in with your actual asset list. */
	private readonly _soundUrls: Record<string, string> = {
		// impact: "assets/audio/impact.wav",
	};

	/** Resolves a sound id to something AudioPlayer can play, decoding/caching along the way. */
	public async Resolve(soundId: string): Promise<ResolvedSound | null> {
		const cachedPcm = this._pcmCache.get(soundId);
		if (cachedPcm) return { kind: SoundKind.Pcm, sampleRate: cachedPcm.sampleRate, channels: cachedPcm.channels.map((c) => c.slice()) };

		const raw = await this.LoadRaw(soundId);
		if (!raw) return null;

		const decoded = await this.TryDecode(soundId, raw);
		if (decoded) return { kind: SoundKind.Pcm, sampleRate: decoded.sampleRate, channels: decoded.channels.map((c) => c.slice()) };

		// Copy, not the cached original - LoadRaw's cache entry must survive being transferred away.
		return { kind: SoundKind.Encoded, data: raw.slice(0) };
	}

	private async LoadRaw(soundId: string): Promise<ArrayBuffer | null> {
		const cached = this._rawCache.get(soundId);
		if (cached) return cached;

		const url = this._soundUrls[soundId];
		if (!url) {
			Logger.LogWarning(`[AudioBank] no URL registered for sound "${soundId}" - add it to _soundUrls.`);
			return null;
		}

		const response = await fetch(url);
		const buffer = await response.arrayBuffer();
		this._rawCache.set(soundId, buffer);
		return buffer;
	}

	private async TryDecode(soundId: string, raw: ArrayBuffer): Promise<{ sampleRate: number; channels: Float32Array[]; } | null> {
		if (!this._offlineCtor) return null;

		try {
			// The (channels, length, sampleRate) triple here is just what decodeAudioData
			// needs to exist on - it has no bearing on the file's actual format.
			const probe = new this._offlineCtor(2, 1, 44100);
			// decodeAudioData detaches whatever ArrayBuffer it's given - never pass `raw` itself.
			const decoded = await probe.decodeAudioData(raw.slice(0));
			const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
			const resolved = { sampleRate: decoded.sampleRate, channels };
			this._pcmCache.set(soundId, resolved);
			return resolved;
		} catch (error) {
			Logger.LogWarning(`[AudioBank] in-worker decode unavailable/failed for "${soundId}", falling back to main-thread decode: ${String(error)}`);
			return null;
		}
	}
}
