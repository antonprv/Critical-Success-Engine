// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, test } from "./support/game";

// The site built on a machine without a .NET build: no physics runtime in the output at all. Everything but the simulation
// must keep working, and the player must be told.
const ExpectedPhysicsFailure = [/PhysicsWorker|PhysicsBridge|physics/i, /MIME type|Failed to load module script|dotnet/i];

test.describe("site without a physics build", () => {
	test("loads, tells the player physics is missing, and the menu still works", async ({ game, page }) => {
		await game.open({ allowedIssues: ExpectedPhysicsFailure });
		await game.play();

		await expect(game.toasts.filter({ hasText: "Physics failed to load" })).toBeVisible();
		await expect(game.hud.first()).toContainText("kick the ball");

		await game.switchScene("Character test room");
		await game.expectHud(/^Mode: /);
		await game.expectHud(/^Floor: air$/); // nothing simulates, so the player never lands
		await game.switchScene(/Coin Hunt/);
		await game.expectHud(/^Coins: 0 \/ 9$/);

		expect(await page.evaluate(() => document.pointerLockElement?.id)).toBe("gameCanvas");
	});

	test("still draws the scene (rendering does not depend on physics)", async ({ game }) => {
		await game.open({ allowedIssues: ExpectedPhysicsFailure });
		await game.play();
		await expect.poll(async () => (await import("./support/game")).Game.colourVariety(await game.pixels()), { timeout: 30_000 }).toBeGreaterThan(5);
	});
});
