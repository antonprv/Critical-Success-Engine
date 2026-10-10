// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Page } from "@playwright/test";
import { expect, test, type Game } from "./support/game";

const screen = (page: Page, id: string) => page.locator(`.cse-ui-host [data-ui="${id}"]`);
const jumpRow = (page: Page) => screen(page, "EngineControls").locator(".win-listview__row", { hasText: /\[OnFoot · Movement\] Jump:/ });

async function OpenControls(game: Game, page: Page): Promise<void> {
	await page.keyboard.press("Escape");
	await expect(game.menu).toBeVisible();
	await game.menu.getByRole("button", { name: "Settings" }).click();
	await screen(page, "EngineSettings").getByRole("button", { name: "Controls" }).click();
	await expect(screen(page, "EngineControls")).toBeVisible();
}

async function BackToGame(game: Game, page: Page): Promise<void> {
	await screen(page, "EngineControls").getByRole("button", { name: "Back" }).click();
	await screen(page, "EngineSettings").getByRole("button", { name: "Back" }).click();
	await game.playButton.click();
	await expect(game.menu).toBeHidden();
}

/**
 * Presses a key until the player leaves the ground (vertical speed above 1). Pressing again covers the moment right after
 * Resume, when the menu is gone but the game hasn't been told to take input yet; an unbound key never jumps.
 */
async function JumpsWith(game: Game, page: Page, code: string): Promise<void> {
	await game.expectHud(/Vertical: 0\.0/);
	await expect.poll(async () => {
		await page.keyboard.press(code);
		await page.waitForTimeout(250);
		return (await game.hudLines()).some((line) => /Vertical: [1-9]/.test(line));
	}, { timeout: 8_000, intervals: [1_500] }).toBe(true);
}

test("rebinding: Jump gets J as its spare key in the controls screen; J jumps, Space still does, and it is kept after a reload", async ({ game, page }) => {
	await game.open();
	await game.play();
	await game.switchScene("Character test room");

	await OpenControls(game, page);
	await expect(jumpRow(page)).toContainText("Jump: Space · - · Pad A");
	await jumpRow(page).click();
	await screen(page, "EngineControls").getByRole("button", { name: "Spare key" }).click();
	await expect(screen(page, "EngineControls")).toContainText("Press a key or a mouse button for Jump (spare)");
	await page.keyboard.press("KeyJ");
	await expect(jumpRow(page)).toContainText("Jump: Space · J · Pad A");
	await BackToGame(game, page);
	await JumpsWith(game, page, "KeyJ");
	await JumpsWith(game, page, "Space");

	await page.reload(); // kept in the game's storage
	await game.open();
	await game.play();
	await game.switchScene("Character test room");
	await JumpsWith(game, page, "KeyJ");
	await OpenControls(game, page);
	await expect(jumpRow(page)).toContainText("Jump: Space · J · Pad A");
	await screen(page, "EngineControls").getByRole("button", { name: "Reset all" }).click();
	await expect(jumpRow(page)).toContainText("Jump: Space · - · Pad A");
});
