// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, test } from "./support/game";

test.describe("the Third Person and Top-Down templates' games", () => {
	test.beforeEach(async ({ game }) => {
		await game.open();
		await game.play();
	});

	test("Third Person: the HUD document counts the metres walked", async ({ game, page }) => {
		await game.switchScene("Third person arena");
		await game.expectUi("ThirdPersonHud", "Distance", /^Distance: 0 m$/);
		await page.keyboard.down("KeyW");
		await game.expectUi("ThirdPersonHud", "Distance", /^Distance: [1-9]\d* m$/, 20_000);
		await page.keyboard.up("KeyW");
	});

	test("Top-Down: the cursor stays free; walking up-left reaches the corner pad and the HUD counts it; Esc pauses, Resume goes on", async ({ game, page }) => {
		await game.switchScene("Top-down arena");
		await game.expectUi("TopDownHud", "Visited", /^Visited: 0 \/ 4$/);
		expect(await page.evaluate(() => document.pointerLockElement)).toBeNull(); // nothing took the mouse
		await page.mouse.move(400, 250);
		await page.mouse.down({ button: "middle" });
		await page.mouse.move(500, 300, { steps: 10 }); // drags the view
		await page.mouse.up({ button: "middle" });
		await page.mouse.wheel(0, -300); // zooms in
		await page.keyboard.down("KeyW");
		await page.keyboard.down("KeyA");
		await game.expectUi("TopDownHud", "Visited", /^Visited: 1 \/ 4$/, 30_000);
		await page.keyboard.up("KeyA");
		await page.keyboard.up("KeyW");

		await page.keyboard.press("Escape");
		await expect(game.menu).toBeVisible();
		await expect(game.playButton).toHaveText("Resume");
		await game.playButton.click();
		await expect(game.menu).toBeHidden();
		expect(await page.evaluate(() => document.pointerLockElement)).toBeNull(); // still free
	});
});
