// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { DataAsset } from "@cse/core/Engine/Data/DataAsset";

/** The First Person view: the field of view the player starts with, and how far the setting goes. Its values: Content/Data/FirstPersonView.csedata (editable without a rebuild). */
export class FirstPersonView extends DataAsset {
	public static readonly AssetType = "FirstPersonView";

	/** Degrees. */
	public FieldOfView = 70;
	public Min = 60;
	public Max = 100;
	public Step = 5;
}
