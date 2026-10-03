// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/game";

// The UI toolkit gallery (toolkit.html), driven with a real mouse and keyboard.

const windowNamed = (page: Page, title: string): Locator => page.locator(`.win-window[aria-label="${title}"]`);
const logLines = (page: Page): Locator => page.locator(".gallery-log li");
const box = async (locator: Locator) => (await locator.boundingBox())!;

test.describe("UI toolkit gallery", () => {
	test.beforeEach(async ({ game }) => {
		await game.page.goto("/toolkit.html");
		await expect(game.page).toHaveTitle("Critical Success Engine - UI Toolkit");
		await expect(game.page.locator(".win-window")).toHaveCount(4);
	});

	test("every theme can be picked, and each one actually changes how windows look", async ({ game }) => {
		const page = game.page;
		const radios = windowNamed(page, "Themes").getByRole("radio");
		await expect(radios).toHaveCount(12);
		const looks = new Set<string>();
		for (let i = 0; i < 12; i++) {
			await radios.nth(i).click();
			// The Themes window is the active one now (it was just clicked): its frame and title bar show the theme.
			const frame = windowNamed(page, "Themes");
			await expect(frame).not.toHaveClass(/win-window--inactive/);
			looks.add(await frame.evaluate((el) => {
				const title = el.querySelector(".win-window__titlebar")!;
				return [getComputedStyle(el).backgroundColor, getComputedStyle(title).backgroundImage, getComputedStyle(title).height].join("|");
			}));
		}
		await expect(page.locator(".win-root")).toHaveClass(/win-theme--win7-aero/);
		expect(looks.size).toBe(10); // 98 and ME share their window colours, and so do 2000 and Classic
		await expect(logLines(page).first()).toHaveText("Theme: Windows 7 (Aero)");
	});

	test("a real click on a button is logged; Step fills the progress bar", async ({ game }) => {
		const page = game.page;
		const controls = windowNamed(page, "Controls");
		await controls.getByRole("button", { name: "Push me" }).click();
		await expect(logLines(page).first()).toHaveText("Button: click");
		await controls.getByRole("button", { name: "Step" }).click();
		await controls.getByRole("button", { name: "Step" }).click();
		await expect(controls.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20");
	});

	test("dragging a title bar moves the window; dragging its border resizes it; double-clicking the title maximizes it", async ({ game }) => {
		const page = game.page;
		const controls = windowNamed(page, "Controls");
		await controls.click({ position: { x: 100, y: 120 } }); // bring it to the front
		const before = await box(controls);
		const title = await box(controls.locator(".win-window__title"));

		await page.mouse.move(title.x + 20, title.y + title.height / 2);
		await page.mouse.down();
		await page.mouse.move(title.x + 80, title.y + title.height / 2 + 40, { steps: 5 });
		await page.mouse.up();
		const moved = await box(controls);
		expect(Math.round(moved.x - before.x)).toBe(60);
		expect(Math.round(moved.y - before.y)).toBe(40);

		const edge = await box(controls.locator(".win-window__resize--right"));
		await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
		await page.mouse.down();
		await page.mouse.move(edge.x + edge.width / 2 + 50, edge.y + edge.height / 2, { steps: 5 });
		await page.mouse.up();
		expect(Math.round((await box(controls)).width - moved.width)).toBe(50);

		await controls.locator(".win-window__title").dblclick();
		await expect(controls).toHaveClass(/win-window--maximized/);
		const desktop = await box(page.locator(".win-desktop__area"));
		const maximized = await box(controls);
		expect([Math.round(maximized.width), Math.round(maximized.height)]).toEqual([Math.round(desktop.width), Math.round(desktop.height)]);
		await expect(logLines(page).first()).toHaveText("Window: Controls maximized");
	});

	test("the taskbar minimizes the active window and brings it back", async ({ game }) => {
		const page = game.page;
		const button = page.locator(".win-taskbar__button", { hasText: "Event log" });
		await expect(button).toHaveClass(/win-taskbar__button--active/);
		await button.click();
		await expect(windowNamed(page, "Event log")).toHaveCount(0);
		await button.click();
		await expect(windowNamed(page, "Event log")).toBeVisible();
		await expect(logLines(page).first()).toHaveText("Window: Event log normal");
	});

	test("menus open on click, switch on hover and close on a click elsewhere; choosing an item is logged", async ({ game }) => {
		const page = game.page;
		const explorer = windowNamed(page, "Explorer");
		await explorer.click({ position: { x: 300, y: 200 } });
		await explorer.locator(".win-menubar__item", { hasText: "File" }).click();
		await expect(explorer.getByRole("menu")).toContainText("Exit");
		await explorer.locator(".win-menubar__item", { hasText: "View" }).hover();
		await expect(explorer.getByRole("menu")).toContainText("Status Bar");
		await page.mouse.click(5, 5);
		await expect(explorer.getByRole("menu")).toHaveCount(0);

		await explorer.locator(".win-menubar__item", { hasText: "Help" }).click();
		await explorer.getByRole("menuitem", { name: "About" }).click();
		await expect(logLines(page).first()).toHaveText("Menu: About");
	});

	test("the list selects like Explorer: click, then Shift+Down extends; the tree expands with its +/- box", async ({ game }) => {
		const page = game.page;
		const explorer = windowNamed(page, "Explorer");
		await explorer.click({ position: { x: 300, y: 200 } });
		await explorer.locator(".win-listview__row").first().click();
		await page.keyboard.press("Shift+ArrowDown");
		await expect(explorer.locator(".win-listview__row--selected")).toHaveCount(2);
		await expect(logLines(page).first()).toHaveText("List: 2 selected");

		await explorer.locator(".win-tree__expander").first().click();
		await expect(explorer.getByRole("treeitem", { name: "Local Disk (C:)" })).toBeVisible();
	});
});

test.describe("UI toolkit gallery: More controls", () => {
	test.beforeEach(async ({ game }) => {
		await game.page.goto("/toolkit.html");
		await game.page.locator(".win-taskbar__button", { hasText: "More controls" }).click();
		await expect(windowNamed(game.page, "More controls")).toBeVisible();
	});

	test("typing into the text box updates the status bar; the spinner, combo box and toolbar work with mouse and keys", async ({ game }) => {
		const page = game.page;
		const more = windowNamed(page, "More controls");
		await more.locator(".win-textbox").fill("Hello world");
		await expect(more.locator(".win-statusbar__panel").nth(1)).toHaveText("11 characters");

		await more.getByRole("button", { name: "Increase" }).click();
		await more.locator(".win-spinner__edit").fill("42");
		await more.locator(".win-spinner__edit").press("Enter");
		await expect(logLines(page).first()).toHaveText("Spinner: 42");

		await more.getByRole("combobox").click();
		await more.getByRole("option", { name: "Times New Roman" }).click();
		await expect(more.locator(".win-combobox__text")).toHaveText("Times New Roman");
		await more.getByRole("combobox").press("ArrowUp");
		await expect(logLines(page).first()).toHaveText("Font: Courier New");

		await more.getByRole("button", { name: "Center" }).click();
		await expect(more.getByRole("button", { name: "Center" })).toHaveAttribute("aria-pressed", "true");
		await expect(more.getByRole("button", { name: "Left" })).toHaveAttribute("aria-pressed", "false");
		await expect(more.getByRole("button", { name: "Print" })).toBeDisabled();
	});

	test("the scroll bar thumb can be dragged; the tooltip appears on hover; the message box is modal and answers", async ({ game }) => {
		const page = game.page;
		const more = windowNamed(page, "More controls");
		const thumb = await box(more.locator(".win-scrollbar__thumb"));
		const track = await box(more.locator(".win-scrollbar__track"));
		await page.mouse.move(thumb.x + 5, thumb.y + thumb.height / 2);
		await page.mouse.down();
		await page.mouse.move(track.x + track.width, thumb.y + thumb.height / 2, { steps: 4 });
		await page.mouse.up();
		await expect(logLines(page).first()).toHaveText("Scroll: 80");

		await more.getByRole("button", { name: "Message box..." }).hover();
		await expect(more.getByRole("tooltip")).toHaveText("Shows a classic message box");
		await more.getByRole("button", { name: "Message box..." }).click();
		const dialog = page.getByRole("alertdialog");
		await expect(dialog).toContainText("Do you want to save changes?");
		await expect(dialog.getByRole("button", { name: "Yes" })).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(dialog).toHaveCount(0);
		await expect(logLines(page).first()).toHaveText("Message box: Cancel");
	});
});
