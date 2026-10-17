// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import {
	CameraComponent,
} from "@cse/core/Engine/Components/Camera/CameraComponent";
import { Inject } from "@cse/di";
import { Component } from "@cse/core/Engine/Core/Component";
import {
	IDataAssets, ISettingsSubsystem,
} from "@cse/core/Engine/DI/Contracts";
import { FirstPersonView } from "../Data/FirstPersonView";

/**
 * The First Person game's own setting: the field of view of the camera it sits
 * on (its numbers: FirstPersonView).
 */
export class ViewSettings extends Component {
	@Inject( IDataAssets ) private readonly _data!: IDataAssets;

	@Inject(
		ISettingsSubsystem,
	) private readonly _settings!: ISettingsSubsystem;

	public override Awake(): void {
		const view = this._data.GetOrDefault(
			FirstPersonView,
			"FirstPersonView",
		);
		this._settings.Declare(
			{
				Key: "FieldOfView",
				Label: "Field of view",
				Category: "First Person",
				Kind: "Number",
				Default: view.FieldOfView,
				Min: view.Min,
				Max: view.Max,
				Step: view.Step,
			},
		);
	}

	public override Update(): void {
		const camera = this.Entity.GetComponent( CameraComponent );

		if ( camera ) {
			camera.FovDegrees = this._settings.Number( "FieldOfView" );
		}
	}
}
