// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, test } from "./support/game";

test.describe("a visitor opens the site", () => {
	test("sees the start menu with every scene once the game has loaded", async ({ game, page }) => {
		await game.open();

		await expect(page).toHaveTitle("Lantern Festival");
		await expect(page.locator("#boot-splash")).toHaveCount(0); // replaced by the Vue/Quasar UI
		await expect(game.menu).toContainText("Lantern Festival");
		await expect(game.menu).toContainText("Click Play to take control of the mouse");
		await expect(game.playButton).toHaveText("Play");

		await expect(game.menu.locator(".q-item")).toHaveCount(3);
		await expect(game.sceneItem("Bouncing ball")).toContainText("current");
		await expect(game.sceneItem("Character test room")).not.toContainText("current");
		await expect(game.sceneItem(/Coin Hunt/)).toContainText("Collect all 9 coins");
		await expect(game.hud).toHaveCount(0); // no HUD behind the menu
	});

	test("clicks Play: the mouse is captured, the menu closes and the HUD appears", async ({ game, page }) => {
		await game.open();
		await game.play();

		await expect(game.menu).toBeHidden();
		await expect(game.hud.first()).toContainText("Space - kick the ball");
		expect(await page.evaluate(() => document.pointerLockElement?.id)).toBe("gameCanvas");
	});

	test("presses Esc: the browser frees the mouse and the pause menu appears; Resume continues", async ({ game, page }) => {
		await game.open();
		await game.play();

		await game.pressEscape();
		await expect(game.menu).toContainText("Paused");
		await expect(game.playButton).toHaveText("Resume");
		await expect(game.hud).toHaveCount(0);
		expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();

		await game.playButton.click();
		await expect(game.menu).toBeHidden();
		await expect(game.hud.first()).toBeVisible();
		expect(await page.evaluate(() => document.pointerLockElement?.id)).toBe("gameCanvas");
	});

	test("closes the menu window with its X: back in the game, mouse captured again", async ({ game, page }) => {
		await game.open();
		await game.play();
		await game.pressEscape();

		await page.getByRole("button", { name: "Close menu" }).click();
		await expect(game.menu).toBeHidden();
		await expect(game.hud.first()).toBeVisible();
		expect(await page.evaluate(() => document.pointerLockElement?.id)).toBe("gameCanvas");
	});

	test("picks another scene from the menu: loading screen, then the new scene takes over", async ({ game, page }) => {
		await game.open();
		await game.play();

		await game.pressEscape();
		await page.evaluate(() => {
			(window as unknown as { __sawLoading: boolean; }).__sawLoading = false;
			new MutationObserver(() => {
				if (document.querySelector(".loading-overlay")) (window as unknown as { __sawLoading: boolean; }).__sawLoading = true;
			}).observe(document.body, { childList: true, subtree: true });
		});

		await game.sceneItem("Character test room").click();
		await expect(game.hud.first()).toBeVisible({ timeout: 45_000 });

		expect(await page.evaluate(() => (window as unknown as { __sawLoading: boolean; }).__sawLoading)).toBe(true);
		await game.expectHud(/^Mode: QuakeStrafeDoom2016/);
		await expect(game.hud.filter({ hasText: "kick the ball" })).toHaveCount(0); // the old scene's HUD is gone

		await game.pressEscape();
		await expect(game.sceneItem("Character test room")).toContainText("current");
		await expect(game.sceneItem("Bouncing ball")).not.toContainText("current");
	});

	test("goes back and forth between scenes without trouble", async ({ game }) => {
		await game.open();
		await game.play();

		for (const [scene, hud] of [
			["Character test room", /^Mode: /],
			[/Coin Hunt/, /^Coins: 0 \/ 9$/],
			["Bouncing ball", /kick the ball/],
			["Character test room", /^Mode: /],
		] as const) {
			await game.switchScene(scene);
			await game.expectHud(hud);
		}
	});

	test("reloads the current scene when it is picked again", async ({ game }) => {
		await game.open();
		await game.play();
		await game.switchScene(/Coin Hunt/);
		await game.expectHud(/^Coins: 0 \/ 9$/);
		await game.switchScene(/Coin Hunt/);
		await game.expectHud(/^Coins: 0 \/ 9$/);
	});

	test("when the browser refuses the mouse after a scene change, one click on Resume gives control back", async ({ game, page }) => {
		await game.open();
		await game.play();
		await game.pressEscape();

		// The user gesture of the click has "expired" by the time the scene is ready: the browser says no.
		await page.evaluate(() => {
			(window as unknown as { __realRequest: () => Promise<void>; }).__realRequest = Element.prototype.requestPointerLock as () => Promise<void>;
			Element.prototype.requestPointerLock = function () {
				setTimeout(() => document.dispatchEvent(new Event("pointerlockerror")), 0);
				return Promise.reject(new DOMException("blocked", "NotAllowedError"));
			};
		});
		await game.sceneItem("Character test room").click();

		await expect(game.menu).toBeVisible({ timeout: 45_000 });
		await expect(game.menu).toContainText("Paused");
		await expect(game.sceneItem("Character test room")).toContainText("current");

		await page.evaluate(() => {
			Element.prototype.requestPointerLock = (window as unknown as { __realRequest: () => Promise<void>; }).__realRequest;
		});
		await game.playButton.click();
		await game.expectHud(/^Mode: /);
	});
});
