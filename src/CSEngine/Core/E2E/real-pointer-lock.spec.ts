// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, test } from "./support/game";

// The browser's REAL Pointer Lock - deliberately short (see support/pointer-lock.ts for why the other specs simulate it).
test("the real pointer lock: Play captures the mouse, releasing it opens the menu, Resume captures it again", async ({ game, page }) => {
	await game.open({ lock: "real" });
	await game.play();
	expect(await page.evaluate(() => document.pointerLockElement?.id)).toBe("gameCanvas");
	await expect(game.hud.first()).toContainText("Space - kick the ball");

	await page.evaluate(() => document.exitPointerLock()); // what the browser does on Esc
	await expect(game.menu).toBeVisible({ timeout: 10_000 });
	await expect(game.menu).toContainText("Paused");
	expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();

	await game.playButton.click();
	await expect(game.hud.first()).toBeVisible();
	expect(await page.evaluate(() => document.pointerLockElement?.id)).toBe("gameCanvas");
});
