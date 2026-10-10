// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/game";

/** What the mouse would hit at the middle of an element: which document, which widget, or the game's canvas. */
async function HitAtMiddle(page: Page, element: Locator): Promise<{ canvas: boolean; document: string | null; widget: string | null; }> {
	const box = (await element.boundingBox())!;
	return page.evaluate(([x, y]) => {
		const hit = document.elementFromPoint(x!, y!)!;
		return {
			canvas: hit.id === "gameCanvas",
			document: hit.closest("[data-ui]")?.getAttribute("data-ui") ?? null,
			widget: hit.closest("[data-name]:not(.win-layout__node--canvas)")?.getAttribute("data-name") ?? null,
		};
	}, [box.x + box.width / 2, box.y + box.height / 2]);
}

test.describe("click pass-through: what the document and its widgets say decides who gets the mouse", () => {
	test("a document that covers the game keeps clicks off it, even through a widget that lets clicks through itself", async ({ game, page }) => {
		await game.open();
		// The pause menu doesn't let clicks through; its watermark (decoration on the background) does.
		const watermark = game.menu.locator('[data-name="Watermark"]');
		await expect(watermark).toBeVisible();
		expect(await HitAtMiddle(page, watermark)).toEqual({ canvas: false, document: "EnginePauseMenu", widget: null }); // the menu's background
		await watermark.click({ force: true });
		await page.waitForTimeout(500);
		await expect(game.menu).toBeVisible(); // the click did nothing: still in the menu, the game didn't get it
		await expect(game.playButton).toHaveText("Play");
	});

	test("in a HUD that lets clicks through, a widget that does too hands them to the game; one that doesn't keeps them", async ({ game, page }) => {
		await game.open();
		await game.play();
		await game.switchScene("Character test room");
		const crosshair = game.uiWidget("FirstPersonHud", "Crosshair");
		await expect(crosshair).toBeVisible();
		expect(await HitAtMiddle(page, crosshair)).toEqual({ canvas: true, document: null, widget: null }); // through to the game
		const panel = page.locator('.cse-ui-host [data-ui="FirstPersonHud"] [data-name="AmmoWindow"]');
		const hit = await HitAtMiddle(page, panel);
		expect([hit.canvas, hit.document]).toEqual([false, "FirstPersonHud"]); // the panel takes its own clicks
	});
});
