// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Component } from "@cse/core/Engine/Core/Component";
import { GetGameUi, type GameUi } from "@cse/ui/game";

/** The HUD's UI document, by its Id in the project's UI manifest. */
const HudId = "ThirdPersonHud";

/** The third-person HUD (Content/UI/ThirdPersonHud.ui.json): how far the player has walked, in whole metres. */
export class DistanceHud extends Component {
	public PlayerName = "Player";
	/** Metres covered on the ground (height changes, jumps, don't count). */
	public Walked = 0;

	private _ui: GameUi | null = null;
	private _last: { X: number; Z: number; } | null = null;
	private _shown = -1;

	public override Update(): void {
		const player = this.Engine.World.FindByName(this.PlayerName);
		if (!player) return;
		const { X, Z } = player.Transform.Position;
		if (this._last) this.Walked += Math.hypot(X - this._last.X, Z - this._last.Z);
		this._last = { X, Z };
	}

	public override OnUIUpdate(): void {
		if (!this._ui) {
			this._ui = GetGameUi();
			this._ui.Show(HudId);
		}
		const metres = Math.floor(this.Walked);
		if (metres === this._shown) return;
		this._shown = metres;
		this._ui.SetText(HudId, "Distance", `Distance: ${metres} m`);
	}

	public override OnDestroy(): void {
		this._ui?.Hide(HudId);
	}
}
