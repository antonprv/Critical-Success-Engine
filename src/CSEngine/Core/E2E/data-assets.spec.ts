// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Game } from "./support/game";

/** The built game the E2E server serves (E2E/support/serve.mjs builds into .e2e/<variant>/dist). */
const BuiltRules = resolve(process.cwd(), ".e2e/mock/dist/data/CoinHuntRules.csedata");

async function Clock(game: Game): Promise<number> {
	await game.expectUi("CoinHuntHud", "Time", /^Time: \d+\.\d$/);
	return Number((await game.uiText("CoinHuntHud", "Time")).replace("Time: ", ""));
}

test("a .csedata file sits beside the built game as plain JSON, and editing it there changes the game - no rebuild", async ({ game, page }) => {
	const original = readFileSync(BuiltRules, "utf8");
	try {
		const served = await page.request.get("/data/CoinHuntRules.csedata");
		expect(served.ok()).toBe(true);
		expect(await served.json()).toMatchObject({ Type: "CoinHuntRules", Values: { TimeLimitSeconds: 60 } });

		writeFileSync(BuiltRules, JSON.stringify({ FileVersion: 1, Type: "CoinHuntRules", Values: { TimeLimitSeconds: 20, TimeLimitChoices: [20, 40] } }, null, 2));
		await game.open();
		await game.play();
		await game.switchScene(/Coin Hunt/);
		await expect.poll(() => Clock(game), { timeout: 5_000 }).toBeLessThanOrEqual(20); // a 20-second game (a 60-second one couldn't get there in 5 s)
	} finally {
		writeFileSync(BuiltRules, original);
	}
});
