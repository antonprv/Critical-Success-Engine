// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/game";

const screen = (page: Page, id: string) => page.locator(`.cse-ui-host [data-ui="${id}"]`);
const overlay = (page: Page) => page.locator(".cse-ui-host .cse-touch");

/** Drags from the middle of an element by (dx, dy) and holds there. */
async function Drag(page: Page, element: Locator, dx: number, dy: number): Promise<void> {
	const box = (await element.boundingBox())!;
	const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dx, y + dy, { steps: 6 });
}

test("the touch scheme: switched on in the settings, the game plays without the mouse; the sticks and buttons drive it; its pause button pauses", async ({ game, page }) => {
	await game.open();
	await game.play();
	await game.switchScene("Character test room");
	await page.keyboard.press("Escape");
	await expect(game.menu).toBeVisible();
	await game.menu.getByRole("button", { name: "Settings" }).click();
	await screen(page, "EngineSettings").locator(".win-listview__row", { hasText: "Touch controls" }).click();
	await screen(page, "EngineSettings").getByRole("button", { name: "More" }).click();
	await expect(screen(page, "EngineSettings").locator(".win-listview__row", { hasText: "Touch controls: On" })).toBeVisible();
	await screen(page, "EngineSettings").getByRole("button", { name: "Back" }).click();
	await game.playButton.click();
	await expect(game.menu).toBeHidden();
	expect(await page.evaluate(() => document.pointerLockElement)).toBeNull(); // nothing took the mouse

	await expect(overlay(page)).toBeVisible();
	await expect(overlay(page).locator(".cse-touch__stick")).toHaveCount(2);
	await expect(overlay(page).locator(".cse-touch__button")).toHaveText(["Jump", "Sprint", "First / third person", "Fire"]); // no debug Noclip
	await page.screenshot({ path: "/tmp/shots/touch-scheme.png" });

	await Drag(page, overlay(page).locator('[data-key="MoveStick"] .win-joystick'), 0, -80); // forward
	await game.expectHud(/Speed: [1-9]/);
	await page.mouse.up();
	await game.expectHud(/Speed: 0\.0/, 15_000);

	const jump = overlay(page).locator(".cse-touch__button", { hasText: "Jump" });
	await expect.poll(async () => {
		await jump.click();
		await page.waitForTimeout(250);
		return (await game.hudLines()).some((line) => /Vertical: [1-9]/.test(line));
	}, { timeout: 8_000, intervals: [1_500] }).toBe(true);

	await overlay(page).locator(".cse-touch__pause .win-game-button").click();
	await expect(game.menu).toBeVisible();
	await expect(overlay(page)).toBeHidden(); // only while playing
	await game.playButton.click();
	await expect(overlay(page)).toBeVisible();
});

test("arranging: the player drags a control to a new place in the controls screen; it stays there, keeps working, and is kept after a reload", async ({ game, page }) => {
	await game.open();
	await game.play();
	await game.switchScene("Character test room");
	await page.keyboard.press("Escape");
	await game.menu.getByRole("button", { name: "Settings" }).click();
	await screen(page, "EngineSettings").locator(".win-listview__row", { hasText: "Touch controls" }).click();
	await screen(page, "EngineSettings").getByRole("button", { name: "More" }).click();
	await screen(page, "EngineSettings").getByRole("button", { name: "Controls" }).click();
	await screen(page, "EngineControls").getByRole("button", { name: "Arrange touch" }).click();
	await expect(screen(page, "EngineControls")).toBeHidden();
	await expect(page.locator(".cse-touch--arranging")).toBeVisible();

	const viewport = page.viewportSize()!;
	const target = { x: viewport.width * 0.4, y: viewport.height * 0.35 };
	const move = page.locator('.cse-touch__item[data-key="MoveStick"]');
	await Drag(page, move, target.x - ((await move.boundingBox())!.x + (await move.boundingBox())!.width / 2), target.y - ((await move.boundingBox())!.y + (await move.boundingBox())!.height / 2));
	await expect(move).toHaveClass(/cse-touch__item--dragging/);
	await page.screenshot({ path: "/tmp/shots/touch-arranging.png" });
	await page.mouse.up();
	const Middle = async () => { const box = (await move.boundingBox())!; return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
	const placed = await Middle();
	expect(Math.abs(placed.x - target.x)).toBeLessThan(4);
	expect(Math.abs(placed.y - target.y)).toBeLessThan(4);
	await page.locator(".cse-touch__toolbar").getByRole("button", { name: "Done" }).click();
	await expect(screen(page, "EngineControls")).toBeVisible(); // back where the player was

	await screen(page, "EngineControls").getByRole("button", { name: "Back" }).click();
	await screen(page, "EngineSettings").getByRole("button", { name: "Back" }).click();
	await game.playButton.click();
	await expect(overlay(page)).toBeVisible();
	expect(Math.abs((await Middle()).x - target.x)).toBeLessThan(4);
	await Drag(page, move.locator(".win-joystick"), 0, -80); // it still walks the player
	await game.expectHud(/Speed: [1-9]/);
	await page.mouse.up();

	await page.reload(); // the scheme and the layout are kept by the game
	await game.open();
	await game.play();
	await game.switchScene("Character test room");
	await expect(overlay(page)).toBeVisible();
	expect(Math.abs((await Middle()).x - target.x)).toBeLessThan(4);
	expect(Math.abs((await Middle()).y - target.y)).toBeLessThan(4);
});
