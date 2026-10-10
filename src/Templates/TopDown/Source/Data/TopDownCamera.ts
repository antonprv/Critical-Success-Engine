// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { DataAsset } from "@cse/core/Engine/Data/DataAsset";

/** The Top-Down camera: zoom and its limits, the pitch near and far, and whether edge scrolling starts on. Its values: Content/Data/TopDownCamera.csedata (editable without a rebuild). */
export class TopDownCamera extends DataAsset {
	public static readonly AssetType = "TopDownCamera";

	/** Distance from the point it looks at. */
	public Zoom = 18;
	public ZoomMin = 6;
	public ZoomMax = 30;
	/** Degrees at the nearest zoom. */
	public PitchNear = -35;
	/** Degrees at the farthest zoom. */
	public PitchFar = -68;
	/** Edge scrolling, until the player chooses. */
	public EdgeScroll = false;
}
