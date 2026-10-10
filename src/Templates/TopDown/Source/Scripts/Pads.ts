// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Component } from "@cse/core/Engine/Core/Component";
import type { Entity } from "@cse/core/Engine/Core/Entity";
import { MeshRenderer } from "@cse/core/Engine/Components/MeshRenderer";
import { TriggerArea } from "@cse/core/Engine/Components/Physics/TriggerAreas";
import { GetGameUi, type GameUi } from "@cse/ui/game";

/** The HUD's UI document, by its Id in the project's UI manifest. */
const HudId = "TopDownHud";

/** A pad on the floor: the player stepping on it visits it (once), and it turns green. Give it the tag "pad". */
export class VisitPad extends TriggerArea {
	public Visited = false;

	protected override OnBodyEntered(body: Entity): void {
		if (this.Visited || !body.Tags.has("player")) return;
		this.Visited = true;
		this.Entity.GetComponent(MeshRenderer)?.SetColor([0.25, 0.85, 0.35]);
	}
}

/** The rules: visit every pad. The HUD (Content/UI/TopDownHud.ui.json) counts them. */
export class PadCounter extends Component {
	private _ui: GameUi | null = null;
	private _shown = "";

	public override OnUIUpdate(): void {
		if (!this._ui) {
			this._ui = GetGameUi();
			this._ui.Show(HudId);
		}
		const pads = this.Engine.World.FindByTag("pad").map((pad) => pad.GetComponent(VisitPad)!);
		const visited = pads.filter((pad) => pad.Visited).length;
		const text = visited === pads.length ? "All pads visited!" : `Visited: ${visited} / ${pads.length}`;
		if (text === this._shown) return;
		this._shown = text;
		this._ui.SetText(HudId, "Visited", text);
	}

	public override OnDestroy(): void {
		this._ui?.Hide(HudId);
	}
}
