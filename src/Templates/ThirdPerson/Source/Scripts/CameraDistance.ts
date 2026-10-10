// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { CameraComponent } from "@cse/core/Engine/Components/Camera/CameraComponent";
import { Component } from "@cse/core/Engine/Core/Component";
import { ThirdPersonCamera } from "../Data/ThirdPersonCamera";

/** The Third Person game's own setting: how far behind the player the camera sits (its numbers: ThirdPersonCamera). */
export class CameraDistance extends Component {
	public override Awake(): void {
		const camera = this.Engine.Data.GetOrDefault(ThirdPersonCamera, "ThirdPersonCamera");
		this.Engine.Settings.Declare({ Key: "CameraDistance", Label: "Camera distance", Category: "Third Person", Kind: "Number", Default: camera.Distance, Min: camera.Min, Max: camera.Max, Step: camera.Step });
	}

	public override Update(): void {
		const camera = this.Entity.GetComponent(CameraComponent);
		if (camera) camera.ArmLength = this.Engine.Settings.Number("CameraDistance");
	}
}
