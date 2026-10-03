// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { GameLogicToUiMessage, SceneInfo, UiBar } from "../../Workers/Protocol/UiProtocol";
import { UiMsg } from "../../Workers/Common/CommonEnums";

/** GameLogic's handle on the UI. HUD lines are keyed per owner and sent at most every `HudIntervalMs`. */
export class UiService {
	private static readonly HudIntervalMs = 100;

	private readonly _port: MessagePort;
	private readonly _hud = new Map<string, string>();
	private readonly _bars = new Map<string, UiBar>();
	private _barsDirty = false;
	private _hudDirty = false;
	private _lastHudSend = 0;

	public constructor(port: MessagePort) {
		this._port = port;
	}

	private Post(message: GameLogicToUiMessage): void {
		this._port.postMessage(message);
	}

	public PublishScenes(scenes: SceneInfo[]): void { this.Post({ type: UiMsg.Scenes, scenes }); }
	public LoadProgress(sceneId: string, label: string, fraction: number): void {
		this.Post({ type: UiMsg.LoadProgress, sceneId, label, fraction });
	}
	public LoadFinished(sceneId: string): void { this.Post({ type: UiMsg.LoadFinished, sceneId }); }
	public LoadFailed(sceneId: string, message: string): void { this.Post({ type: UiMsg.LoadFailed, sceneId, message }); }
	public Toast(message: string): void { this.Post({ type: UiMsg.Toast, message }); }

	/** Pass `null` to remove the line. Lines are shown in key insertion order. */
	public SetHud(key: string, text: string | null): void {
		if (text === null) {
			if (this._hud.delete(key)) this._hudDirty = true;
			return;
		}
		if (this._hud.get(key) !== text) {
			this._hud.set(key, text);
			this._hudDirty = true;
		}
	}

	/** A progress bar (`value` 0..1); pass `null` to remove it. */
	public SetBar(id: string, label: string, value: number | null): void {
		if (value === null) {
			if (this._bars.delete(id)) this._barsDirty = true;
			return;
		}
		const clamped = Math.min(1, Math.max(0, value));
		const old = this._bars.get(id);
		if (!old || old.label !== label || old.value !== clamped) {
			this._bars.set(id, { id, label, value: clamped });
			this._barsDirty = true;
		}
	}

	public ClearHud(): void {
		if (this._hud.size > 0) this._hudDirty = true;
		if (this._bars.size > 0) this._barsDirty = true;
		this._hud.clear();
		this._bars.clear();
	}

	/** Called by the runtime once per frame. */
	public Flush(nowMs: number): void {
		if ((!this._hudDirty && !this._barsDirty) || nowMs - this._lastHudSend < UiService.HudIntervalMs) return;
		this._lastHudSend = nowMs;

		if (this._hudDirty) {
			this._hudDirty = false;
			this.Post({ type: UiMsg.Hud, lines: [...this._hud.values()] });
		}
		if (this._barsDirty) {
			this._barsDirty = false;
			this.Post({ type: UiMsg.Bars, bars: [...this._bars.values()] });
		}
	}
}
