// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, test } from "./support/game";

// A gamepad the test controls: the page reads it like a real one (the Gamepad API's standard mapping).
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		const state = { buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })), axes: [0, 0, 0, 0] };
		(window as unknown as { __pad: typeof state; }).__pad = state;
		Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [{ connected: true, ...state }] });
	});
});

test("a gamepad and the keyboard work at once: the left stick walks the player, the keys still do", async ({ game, page }) => {
	await game.open();
	await game.play();
	await game.switchScene("Character test room");
	await game.expectHud(/^Speed: 0\.0/);
	await page.evaluate(() => { (window as unknown as { __pad: { axes: number[]; }; }).__pad.axes[1] = -1; }); // left stick fully up
	await game.expectHud(/^Speed: [1-9]/);
	await page.evaluate(() => { (window as unknown as { __pad: { axes: number[]; }; }).__pad.axes[1] = 0; });
	await game.expectHud(/^Speed: 0\.0/, 15_000);
	await page.keyboard.down("KeyW"); // and the keyboard, with the pad still connected
	await game.expectHud(/^Speed: [1-9]/);
	await page.keyboard.up("KeyW");
	expect(await page.evaluate(() => navigator.getGamepads().length)).toBe(1);
});
