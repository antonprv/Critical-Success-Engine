// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, test } from "./support/game";

test.describe("Coin Hunt (sample game)", () => {
	test.beforeEach(async ({ game }) => {
		await game.open();
		await game.play();
		await game.switchScene(/Coin Hunt/);
	});

	test("shows the score and a running clock", async ({ game }) => {
		await game.expectHud(/^Coins: 0 \/ 9$/);
		const first = Number((await game.hudLine(/^Time: /)).replace("Time: ", ""));
		await game.page.waitForTimeout(2500);
		const later = Number((await game.hudLine(/^Time: /)).replace("Time: ", ""));

		expect(first).toBeLessThanOrEqual(60);
		expect(later).toBeLessThan(first);
	});

	test("running into coins collects them one by one", async ({ game, page }) => {
		await game.expectHud(/^Coins: 0 \/ 9$/);

		await page.keyboard.down("KeyA"); // the first coin is 9 m to the left of the start
		await game.expectHud(/^Coins: 1 \/ 9$/, 30_000);
		await page.keyboard.up("KeyA");

		await page.keyboard.down("KeyD"); // the next one is 18 m to the right
		await game.expectHud(/^Coins: 2 \/ 9$/, 30_000);
		await page.keyboard.up("KeyD");
	});

	test("when the clock runs out the game says so, and R starts over with every coin back", async ({ game, page }) => {
		test.setTimeout(180_000);

		await page.keyboard.down("KeyA");
		await game.expectHud(/^Coins: 1 \/ 9$/, 30_000);
		await page.keyboard.up("KeyA");

		await game.expectHud(/^TIME'S UP - R to restart$/, 100_000);
		await expect(game.toasts.filter({ hasText: "Time's up!" }).first()).toBeVisible();

		await page.keyboard.press("KeyR");
		await game.expectHud(/^Coins: 0 \/ 9$/, 45_000);
		const time = Number((await game.hudLine(/^Time: /)).replace("Time: ", ""));
		expect(time).toBeGreaterThan(50);
		await game.expectHud(/^Floor: /);
	});

	test("the mouse stays captured through the restart (no menu pops up)", async ({ game, page }) => {
		await page.keyboard.down("KeyA");
		await game.expectHud(/^Coins: 1 \/ 9$/, 30_000);
		await page.keyboard.up("KeyA");

		await game.switchScene(/Coin Hunt/); // a reload through the menu
		await game.expectHud(/^Coins: 0 \/ 9$/);
		expect(await page.evaluate(() => document.pointerLockElement?.id)).toBe("gameCanvas");
	});
});
