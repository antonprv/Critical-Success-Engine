// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Page } from "@playwright/test";
import { expect, test } from "./support/game";

// The UI designer (designer.html), used like a person would: palette, mouse, details panel, preview, files.

const canvasNode = (page: Page, name: string) => page.locator(`.win-designer__canvas [data-name="${name}"]`);
const treeItems = (page: Page) => page.locator(".win-designer__tree-item");
const toolbarButton = (page: Page, label: string) => page.locator(".win-designer__toolbar .win-toolbar__button", { hasText: label });

test.describe("UI designer", () => {
	test.beforeEach(async ({ game }) => {
		await game.page.setViewportSize({ width: 1280, height: 720 });
		await game.page.goto("/designer.html");
		await expect(game.page).toHaveTitle("Critical Success Engine - UI Designer");
		await expect(canvasNode(game.page, "LoginWindow")).toBeVisible();
	});

	test("the example layout comes alive in Preview: its script enables OK once a name is typed and greets on OK", async ({ game }) => {
		const page = game.page;
		await toolbarButton(page, "Preview").click();
		const ok = canvasNode(page, "OkButton").locator("button");
		await expect(ok).toBeDisabled();
		await canvasNode(page, "UserName").locator("input").fill("Anton");
		await expect(ok).toBeEnabled();
		await ok.click(); // validates first: the password is empty
		await expect(canvasNode(page, "Password")).toHaveClass(/win-layout__node--invalid/);
		await expect(canvasNode(page, "Password").locator(".win-layout__error")).toHaveAttribute("title", "At least 4 characters");
		await canvasNode(page, "Password").locator("input").fill("secret");
		await canvasNode(page, "Password").locator("input").press("Enter"); // the window's AcceptButton is OK
		await expect(canvasNode(page, "Status")).toContainText("Welcome, Anton!");
		await expect(canvasNode(page, "Password")).not.toHaveClass(/win-layout__node--invalid/);
		await expect(page.locator(".win-designer__log li").last()).toHaveText("closed: OK");

		await toolbarButton(page, "Design").click();
		await expect(canvasNode(page, "Status")).toContainText("Enter your name"); // design shows the layout as saved
	});

	test("a widget dragged from the palette lands where it is dropped; the mouse moves and resizes it; Ctrl+Z undoes", async ({ game }) => {
		const page = game.page;
		const container = page.locator('[data-container="LoginWindow"]');
		const box = (await container.boundingBox())!;
		// Aim at the window widget (in design mode only widget wrappers take the pointer), at a point 24, 136 into its inner area.
		const windowNode = canvasNode(page, "LoginWindow");
		const outer = (await windowNode.boundingBox())!;
		await page.locator(".win-designer__palette-item", { hasText: "Button" }).first().dragTo(windowNode, { targetPosition: { x: box.x - outer.x + 24, y: box.y - outer.y + 136 } });
		await expect(treeItems(page).filter({ hasText: "Button1" })).toHaveCount(1);
		const button = canvasNode(page, "Button1");
		await expect(button).toHaveClass(/win-layout__node--selected/);
		const placed = (await button.boundingBox())!;
		expect([Math.round(placed.x - box.x), Math.round(placed.y - box.y)]).toEqual([24, 136]);

		await page.mouse.move(placed.x + 10, placed.y + 10);
		await page.mouse.down();
		await page.mouse.move(placed.x + 50, placed.y + 10, { steps: 4 });
		await page.mouse.up();
		await expect(page.locator('[data-field="X"]')).toHaveValue("64");

		const corner = (await button.locator('[data-handle="corner"]').boundingBox())!;
		await page.mouse.move(corner.x + 3, corner.y + 3);
		await page.mouse.down();
		await page.mouse.move(corner.x + 3 + 29, corner.y + 3 + 9, { steps: 4 }); // 75 + 29 = 104, 23 + 9 = 32
		await page.mouse.up();
		await expect(page.locator('[data-field="Width"]')).toHaveValue("104");
		await expect(page.locator('[data-field="Height"]')).toHaveValue("32");

		await page.locator(".win-designer__canvas").click({ position: { x: 5, y: 5 } }); // focus the designer, not a field
		await page.keyboard.press("Control+z");
		await expect(page.locator('[data-field="Width"]')).toHaveValue("75");
	});

	test("the details panel renames and edits props; Preview shows the result", async ({ game }) => {
		const page = game.page;
		await treeItems(page).filter({ hasText: "CancelButton" }).click();
		await page.locator('[data-field="Name"]').fill("CloseButton");
		await page.locator('[data-field="Name"]').press("Enter");
		await expect(treeItems(page).filter({ hasText: "CloseButton" })).toHaveCount(1);
		await page.locator('[data-prop="Text"]').fill("Close");
		await page.locator('[data-prop="Text"]').press("Enter");
		await expect(canvasNode(page, "CloseButton").locator("button")).toHaveText("Close");
		await page.locator('[data-field="Name"]').fill("bad name");
		await page.locator('[data-field="Name"]').press("Enter");
		await expect(page.locator(".win-designer__statusbar")).toContainText('"bad name" is not a valid unique name');
	});

	test("Save downloads a .ui.json file that Open loads back", async ({ game }) => {
		const page = game.page;
		await page.locator('[data-field="LayoutName"]').fill("My dialog");
		await page.locator('[data-field="LayoutName"]').press("Enter");
		const downloading = page.waitForEvent("download");
		await page.locator(".win-designer .win-menubar__item", { hasText: "File" }).click();
		await page.locator(".win-menu__item", { hasText: "Save" }).click();
		const download = await downloading;
		expect(download.suggestedFilename()).toBe("My dialog.ui.json");
		const path = await download.path();

		await page.locator(".win-designer .win-menubar__item", { hasText: "File" }).click();
		await page.locator(".win-menu__item", { hasText: "New" }).click();
		await expect(treeItems(page)).toHaveCount(1);
		await page.locator(".win-designer__open").setInputFiles(path);
		await expect(treeItems(page).filter({ hasText: "LoginWindow" })).toHaveCount(1);
		await expect(page.locator(".win-designer__statusbar")).toContainText("Opened");
	});
});

test.describe("UI designer: skins", () => {
	test.beforeEach(async ({ game }) => {
		await game.page.setViewportSize({ width: 1280, height: 720 });
		await game.page.goto("/designer.html");
		await game.page.locator('[data-tab="skin"]').click();
	});

	test("a preset skin restyles the layout on the canvas, and only it", async ({ game }) => {
		const page = game.page;
		await page.locator('[data-skin="Preset"]').selectOption("grimoire");
		const ok = canvasNode(page, "OkButton").locator("button");
		await expect.poll(() => ok.evaluate((el) => getComputedStyle(el).borderImageSource)).toContain("data:image/svg+xml");
		const paletteButton = page.locator(".win-designer__palette-item").first();
		expect(await paletteButton.evaluate((el) => getComputedStyle(el).borderImageSource)).toBe("none");
	});

	test("an uploaded image becomes the hover sprite of buttons, seen in Preview", async ({ game }) => {
		const page = game.page;
		await page.locator('[data-skin="Part"]').selectOption("button");
		await page.locator('[data-skin="State"]').selectOption("hover");
		const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAAEklEQVR4nGP4z8DwHwyBNAMDACCCBfuQb9lYAAAAAElFTkSuQmCC", "base64");
		await page.locator('[data-skin="SpriteFile"]').setInputFiles({ name: "hover.png", mimeType: "image/png", buffer: png });
		await expect(page.locator(".win-designer__sprite-preview")).toBeVisible();
		await page.locator('[data-skin="Slice0"]').fill("1");
		await page.locator('[data-skin="Slice0"]').press("Enter");

		await toolbarButton(page, "Preview").click();
		const cancel = canvasNode(page, "CancelButton").locator("button");
		await cancel.hover();
		await expect.poll(() => cancel.evaluate((el) => getComputedStyle(el).borderImageSource)).toContain("data:image/png");
	});
});

test.describe("UI designer: Tailwind kit", () => {
	test("the layout can be designed in the Tailwind kit, and a skin still goes on top of it", async ({ game }) => {
		const page = game.page;
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto("/designer.html");
		await page.locator(".win-designer__kit [role=combobox]").click();
		await page.locator(".win-designer__kit [role=option]", { hasText: "Tailwind" }).click();
		await expect(page.locator(".win-root")).toHaveClass(/win-kit--tailwind/);
		const ok = canvasNode(page, "OkButton").locator("button");
		expect(await ok.evaluate((el) => getComputedStyle(el).borderImageSource)).toBe("none");
		await page.locator('[data-tab="skin"]').click();
		await page.locator('[data-skin="Preset"]').selectOption("grimoire");
		await expect.poll(() => ok.evaluate((el) => getComputedStyle(el).borderImageSource)).toContain("data:image/svg+xml");
	});
});
