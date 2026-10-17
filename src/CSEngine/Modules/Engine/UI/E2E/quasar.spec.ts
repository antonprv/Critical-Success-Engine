// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, test } from "@playwright/test";
import { QuasarComponentTable } from "../Source/Quasar/QuasarTable.generated";

// Every Quasar component in every kit, photographed in its states (quasar.html): normal, hovered, focused, disabled,
// with an error. A change of how any of them looks fails here until its picture is taken again on purpose
// (pnpm test:e2e --update-snapshots).

const Kits = [
	{ Name: "classic", Query: "kit=classic&theme=xp-blue" },
	{ Name: "tailwind", Query: "kit=tailwind" },
	{ Name: "quasar", Query: "kit=quasar" },
];

/** Components that move by themselves (spinners, loading bars): their picture can't hold still. */
const Moving = new Set(["QAjaxBar", "QInnerLoading", "QSkeleton", "QSpinner", ...QuasarComponentTable.filter((row) => row.Name.startsWith("QSpinner")).map((row) => row.Name)]);

for (const kit of Kits) {
	test.describe(`Quasar widgets in the ${kit.Name} kit`, () => {
		for (const row of QuasarComponentTable.filter((entry) => !Moving.has(entry.Name))) {
			test(row.Name, async ({ page }) => {
				await page.setViewportSize({ width: 1800, height: 900 });
				await page.goto(`/quasar.html?${kit.Query}&only=${row.Name}`);
				const section = page.locator(`[data-component="${row.Name}"]`);
				await expect(section).toBeVisible();
				await expect(page.locator(".win-quasar--loading")).toHaveCount(0, { timeout: 30_000 });
				await page.evaluate(() => document.fonts.ready);
				await section.locator('[data-state="hover"] .win-layout__node:not(.win-layout__node--canvas)').first().hover({ force: true });
				const focusable = section.locator('[data-state="focus"]').locator("input, textarea, button, [tabindex]:not([tabindex='-1'])").first();
				if (await focusable.count()) await focusable.focus();
				await expect(section).toHaveScreenshot(`${kit.Name}-${row.Name}.png`, { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.01 });
			});
		}
	});
}
