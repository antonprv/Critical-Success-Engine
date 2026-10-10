// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { StrategyCamera } from "@cse/core/Engine/Components/Camera/StrategyCamera";
import { Component } from "@cse/core/Engine/Core/Component";
import { TopDownCamera } from "../Data/TopDownCamera";

/** Puts the TopDownCamera data asset's numbers on the StrategyCamera beside it (listed before it, so it runs first). */
export class TopDownCameraSetup extends Component {
	public DataId = "TopDownCamera";

	public override Awake(): void {
		const camera = this.Entity.GetComponent(StrategyCamera);
		if (!camera) return;
		const data = this.Engine.Data.GetOrDefault(TopDownCamera, this.DataId);
		Object.assign(camera, { Zoom: data.Zoom, ZoomMin: data.ZoomMin, ZoomMax: data.ZoomMax, PitchNear: data.PitchNear, PitchFar: data.PitchFar, EdgeScroll: data.EdgeScroll });
	}
}
