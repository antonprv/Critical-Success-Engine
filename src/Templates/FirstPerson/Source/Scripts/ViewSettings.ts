// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { CameraComponent } from "@cse/core/Engine/Components/Camera/CameraComponent";
import { Component } from "@cse/core/Engine/Core/Component";
import { FirstPersonView } from "../Data/FirstPersonView";

/** The First Person game's own setting: the field of view of the camera it sits on (its numbers: FirstPersonView). */
export class ViewSettings extends Component {
	public override Awake(): void {
		const view = this.Engine.Data.GetOrDefault(FirstPersonView, "FirstPersonView");
		this.Engine.Settings.Declare({ Key: "FieldOfView", Label: "Field of view", Category: "First Person", Kind: "Number", Default: view.FieldOfView, Min: view.Min, Max: view.Max, Step: view.Step });
	}

	public override Update(): void {
		const camera = this.Entity.GetComponent(CameraComponent);
		if (camera) camera.FovDegrees = this.Engine.Settings.Number("FieldOfView");
	}
}
