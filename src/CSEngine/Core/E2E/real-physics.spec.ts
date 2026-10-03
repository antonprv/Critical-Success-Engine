// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, test } from "./support/game";

// Only runs with E2E_REAL_PHYSICS=1 (CI, after devops/build-physics.sh): the site built against the REAL BEPU wasm runtime.
test("the real physics runtime boots and simulates: the player lands, runs and jumps", async ({ game, page }) => {
	test.setTimeout(120_000);
	await game.open();
	await game.play();
	await game.switchScene("Character test room");

	await game.expectHud(/^Floor: Floor$/, 45_000);

	await page.keyboard.down("KeyW");
	await game.expectHud(/^Speed: [1-9]\d*\.\d m\/s/);
	await page.keyboard.up("KeyW");

	await expect.poll(async () => {
		await page.keyboard.press("Space");
		await page.waitForTimeout(150);
		return (await game.hudLines()).includes("Floor: air");
	}, { timeout: 30_000, intervals: [50] }).toBe(true);
	await game.expectHud(/^Floor: Floor$/);
});
