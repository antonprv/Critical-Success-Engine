// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, Game, test } from "./support/game";

test.describe("Character test room", () => {
	test.beforeEach(async ({ game }) => {
		await game.open();
		await game.play();
		await game.switchScene("Character test room");
		await game.expectHud(/^Mode: /);
	});

	test("the player drops in and lands on the floor", async ({ game }) => {
		await game.expectHud(/^Floor: Floor$/);
		await game.expectHud(/^WASD move/);
	});

	test("W / A / S / D make the player run, and the speed on the HUD shows it", async ({ game, page }) => {
		await game.expectHud(/^Floor: Floor$/);
		await expect.poll(async () => game.hudLine(/^Speed:/)).toMatch(/^Speed: 0\.0 m\/s/);

		await page.keyboard.down("KeyW");
		await game.expectHud(/^Speed: [1-9]\d*\.\d m\/s/);
		await page.keyboard.up("KeyW");
		await expect.poll(async () => game.hudLine(/^Speed:/), { timeout: 20_000 }).toMatch(/^Speed: 0\.\d m\/s/);

		for (const key of ["KeyA", "KeyS", "KeyD"]) {
			await page.keyboard.down(key);
			await game.expectHud(/^Speed: [1-9]\d*\.\d m\/s/);
			await page.keyboard.up(key);
			await expect.poll(async () => game.hudLine(/^Speed:/), { timeout: 20_000 }).toMatch(/^Speed: 0\.\d m\/s/);
		}
	});

	test("keys 1-5 switch the movement mode", async ({ game, page }) => {
		for (const [key, mode] of [["Digit1", "Quake"], ["Digit2", "Realistic"], ["Digit3", "Hybrid"], ["Digit4", "Doom3"], ["Digit5", "QuakeStrafeDoom2016"]] as const) {
			await page.keyboard.press(key);
			await game.expectHud(new RegExp(`^Mode: ${mode}$`));
		}
	});

	test("N toggles noclip on and off", async ({ game, page }) => {
		await page.keyboard.press("KeyN");
		await game.expectHud(/\(NOCLIP\)$/);
		await page.keyboard.press("KeyN");
		await expect.poll(async () => (await game.hudLines()).some((line) => line.includes("NOCLIP")), { timeout: 20_000 }).toBe(false);
	});

	test("Space makes the player jump: off the floor, then back down", async ({ game, page }) => {
		await game.expectHud(/^Floor: Floor$/);

		// A jump lasts under a second and the HUD refreshes a few times per second: keep jumping until a sample lands in the air.
		await expect.poll(async () => {
			await page.keyboard.press("Space");
			await page.waitForTimeout(150);
			return (await game.hudLines()).includes("Floor: air");
		}, { timeout: 30_000, intervals: [50], message: "player is airborne" }).toBe(true);

		await game.expectHud(/^Floor: Floor$/);
	});

	test("walking onto the blue pad shows a toast; walking off shows another", async ({ game, page }) => {
		await game.expectHud(/^Floor: Floor$/);

		await page.keyboard.down("KeyA");
		await expect(game.toasts.filter({ hasText: "Player entered Trigger Pad" })).toBeVisible({ timeout: 20_000 });
		await page.keyboard.up("KeyA");

		await page.keyboard.down("KeyD");
		await expect(game.toasts.filter({ hasText: "Player left Trigger Pad" })).toBeVisible({ timeout: 20_000 });
		await page.keyboard.up("KeyD");
	});

	test("clicking shoots projectiles without breaking the game", async ({ game, page }) => {
		await game.expectHud(/^Floor: Floor$/);

		// The crosshair sits in the middle of the screen, over where the clicks land: it must let them through.
		await expect(game.uiWidget("FirstPersonHud", "Crosshair")).toBeVisible();
		// Who takes the mouse is what the document says: the crosshair is marked Click pass-through, the ammo panel isn't.
		const box = (await game.uiWidget("FirstPersonHud", "Crosshair").boundingBox())!;
		expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.id, [box.x + box.width / 2, box.y + box.height / 2])).toBe("gameCanvas");
		const panel = (await game.page.locator('.cse-ui-host [data-name="AmmoWindow"]').boundingBox())!;
		expect(await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x!, y!)?.closest('[data-name="AmmoWindow"]')), [panel.x + panel.width / 2, panel.y + panel.height / 2])).toBe(true);
		await game.expectUi("FirstPersonHud", "Shots", /^Shots: 0$/);
		for (let i = 0; i < 4; i++) {
			await page.mouse.click(400, 250);
			await page.waitForTimeout(250);
		}
		await page.waitForTimeout(1500);

		await game.expectHud(/^Floor: Floor$/); // GameLogic is still alive and simulating
		await game.expectUi("FirstPersonHud", "Shots", /^Shots: [1-4]$/); // the HUD document counts them
	});

	test("V switches to the third-person camera: the white player capsule comes into view", async ({ game, page }) => {
		await game.expectHud(/^Floor: Floor$/);
		// The capsule is lit white (0.9, 0.9, 0.95); nothing else in the room is that bright. The HUD text and toasts are white
		// too, but they live in the top 130 px of the page, which is skipped.
		const HudBottom = 130;
		// What is measured is the 3D scene: the UI documents drawn over it (the HUD panel is light too) are hidden meanwhile.
		await page.addStyleTag({ content: ".cse-ui-host { visibility: hidden; }" });
		const isWhite = (r: number, g: number, b: number): boolean => r > 215 && g > 215 && b > 215;

		// First person: the camera sits inside the capsule, you cannot see yourself.
		await expect.poll(async () => Game.find(await game.pixels(), isWhite, HudBottom).count, { timeout: 20_000 }).toBeLessThan(40);

		await page.keyboard.press("KeyV");
		await expect.poll(async () => Game.find(await game.pixels(), isWhite, HudBottom).count, { timeout: 30_000, message: "white capsule pixels" }).toBeGreaterThan(150);

		await page.keyboard.press("KeyV"); // and back
		await expect.poll(async () => Game.find(await game.pixels(), isWhite, HudBottom).count, { timeout: 30_000 }).toBeLessThan(40);
	});

	test("mouse movement while the pointer is captured does not crash the camera", async ({ game, page }) => {
		await game.expectHud(/^Floor: Floor$/);
		for (let i = 0; i < 10; i++) await page.mouse.move(300 + i * 12, 200 + i * 5);
		await game.hold("KeyW", 400);
		await game.expectHud(/^Floor: /);
	});
});
