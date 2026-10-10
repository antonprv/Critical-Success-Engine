// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Page } from "@playwright/test";
import { expect, test, type Game } from "./support/game";

/** The Coin Hunt clock, in seconds (the HUD reads "Time: 42.3"). */
async function Clock(game: Game): Promise<number> {
	await game.expectUi("CoinHuntHud", "Time", /^Time: \d+\.\d$/);
	return Number((await game.uiText("CoinHuntHud", "Time")).replace("Time: ", ""));
}

/** The settings screen's row for a setting, and its buttons. */
const settings = (page: Page) => page.locator('.cse-ui-host [data-ui="EngineSettings"]');
const row = (page: Page, text: RegExp) => settings(page).locator(".win-listview__row", { hasText: text });

async function OpenSettings(game: Game, page: Page): Promise<void> {
	await page.keyboard.press("Escape");
	await expect(game.menu).toBeVisible();
	await game.menu.getByRole("button", { name: "Settings" }).click();
	await expect(settings(page)).toBeVisible();
}

test("a game's own setting: Coin Hunt's time limit, chosen in the settings, is the clock of the next game - also after a reload", async ({ game, page }) => {
	await game.open();
	await game.play();
	await game.switchScene(/Coin Hunt/);
	expect(await Clock(game)).toBeGreaterThan(30); // the default 60-second game (a busy machine may show it a little late)
	await OpenSettings(game, page);
	await expect(row(page, /\[Controls\] Mouse sensitivity: 1\.0/)).toBeVisible(); // the general ones are there too
	await row(page, /Time limit/).click();
	await settings(page).getByRole("button", { name: "Less" }).click();
	await expect(row(page, /Time limit \(seconds\): 30/)).toBeVisible();
	await settings(page).getByRole("button", { name: "Back" }).click();
	await expect(settings(page)).toBeHidden();
	await game.sceneItem(/Coin Hunt/).click(); // a new game
	await expect.poll(() => Clock(game), { timeout: 5_000 }).toBeLessThanOrEqual(30); // a 30-second game (a 60-second one couldn't get there in 5 s)

	await page.reload(); // the choice is kept between sessions
	await game.open();
	await game.play();
	await game.switchScene(/Coin Hunt/);
	await expect.poll(() => Clock(game), { timeout: 5_000 }).toBeLessThanOrEqual(30); // a 30-second game (a 60-second one couldn't get there in 5 s)
});
