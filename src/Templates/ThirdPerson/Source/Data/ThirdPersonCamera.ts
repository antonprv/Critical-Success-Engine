// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { DataAsset } from "@cse/core/Engine/Data/DataAsset";

/** The Third Person camera: how far behind the player it sits, and how far the setting goes. Its values: Content/Data/ThirdPersonCamera.csedata (editable without a rebuild). */
export class ThirdPersonCamera extends DataAsset {
	public static readonly AssetType = "ThirdPersonCamera";

	/** Metres. */
	public Distance = 5;
	public Min = 3;
	public Max = 8;
	public Step = 0.5;
}
