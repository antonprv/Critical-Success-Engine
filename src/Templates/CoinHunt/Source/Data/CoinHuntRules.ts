// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { DataAsset } from "@cse/core/Engine/Data/DataAsset";

/** Coin Hunt's rules: the time limit a game starts with, and the limits the player can choose in the settings. Its values: Content/Data/CoinHuntRules.csedata (editable without a rebuild). */
export class CoinHuntRules extends DataAsset {
	public static readonly AssetType = "CoinHuntRules";

	/** The time limit of a game, unless the player chose another. */
	public TimeLimitSeconds = 60;
	/** The limits the player can choose from (the default is added when it is not one of them). */
	public TimeLimitChoices = [30, 60, 90];
}
