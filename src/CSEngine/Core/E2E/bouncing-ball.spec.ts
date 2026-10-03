// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, Game, test } from "./support/game";

/** The ball's orange (0.95, 0.6, 0.2) after lighting: strong red, middling green, little blue. */
const isOrange = (r: number, g: number, b: number): boolean => r > 140 && g > 50 && g < 175 && b < 95 && r - b > 90;

test.describe("Bouncing ball scene", () => {
	test.beforeEach(async ({ game }) => {
		await game.open();
		await game.play();
	});

	test("draws the scene: ground, sky colour and an orange ball", async ({ game }) => {
		await expect.poll(async () => Game.find(await game.pixels(), isOrange).count, { timeout: 30_000, message: "orange ball pixels" }).toBeGreaterThan(150);
		expect(Game.colourVariety(await game.pixels())).toBeGreaterThan(5);
	});

	test("the ball falls to the ground and stays there", async ({ game }) => {
		// Let it land, then check it is not moving any more.
		await expect.poll(async () => Game.find(await game.pixels(), isOrange).count, { timeout: 30_000 }).toBeGreaterThan(150);
		await game.page.waitForTimeout(3000);

		const first = Game.find(await game.pixels(), isOrange);
		await game.page.waitForTimeout(1500);
		const second = Game.find(await game.pixels(), isOrange);

		expect(first.count).toBeGreaterThan(150);
		expect(Math.abs(second.centerY - first.centerY)).toBeLessThan(4);
		expect(Math.abs(second.centerX - first.centerX)).toBeLessThan(4);
	});

	test("Space kicks the ball up; it comes back down to the same spot", async ({ game, page }) => {
		await expect.poll(async () => Game.find(await game.pixels(), isOrange).count, { timeout: 30_000 }).toBeGreaterThan(150);
		await page.waitForTimeout(3000);
		const resting = Game.find(await game.pixels(), isOrange);

		// Every press adds an impulse, so a few quick presses send it well above the camera's view of the ground.
		for (let i = 0; i < 8; i++) {
			await page.keyboard.press("Space");
			await page.waitForTimeout(120);
		}
		await expect.poll(async () => {
			const now = Game.find(await game.pixels(), isOrange);
			return now.count < 60 || now.centerY < resting.centerY - 40;
		}, { timeout: 15_000, intervals: [100], message: "ball is up in the air" }).toBe(true);

		await expect.poll(async () => {
			const now = Game.find(await game.pixels(), isOrange);
			return now.count > 150 && Math.abs(now.centerY - resting.centerY) < 6 && Math.abs(now.centerX - resting.centerX) < 6;
		}, { timeout: 40_000, intervals: [500], message: "ball is back where it started" }).toBe(true);
	});
});
