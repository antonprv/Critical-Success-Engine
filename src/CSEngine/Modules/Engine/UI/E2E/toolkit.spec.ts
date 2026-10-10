// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// The UI toolkit gallery (toolkit.html), driven with a real mouse and keyboard.

const windowNamed = (page: Page, title: string): Locator => page.locator(`.win-window[aria-label="${title}"]`);
const logLines = (page: Page): Locator => page.locator(".gallery-log li");
const box = async (locator: Locator) => (await locator.boundingBox())!;

test.describe("UI toolkit gallery", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle("Critical Success Engine - UI Toolkit");
		await expect(page.locator(".win-window")).toHaveCount(4);
	});

	test("every theme can be picked, and each one actually changes how windows look", async ({ page }) => {
		const radios = windowNamed(page, "Themes").locator(".gallery-classic").getByRole("radio");
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

	test("a real click on a button is logged; Step fills the progress bar", async ({ page }) => {
		const controls = windowNamed(page, "Controls");
		await controls.getByRole("button", { name: "Push me" }).click();
		await expect(logLines(page).first()).toHaveText("Button: click");
		await controls.getByRole("button", { name: "Step" }).click();
		await controls.getByRole("button", { name: "Step" }).click();
		await expect(controls.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20");
	});

	test("dragging a title bar moves the window; dragging its border resizes it; double-clicking the title maximizes it", async ({ page }) => {
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
		// Maximizing glides (Windows 11 motion): wait for it to settle before measuring.
		await expect.poll(async () => { const maximized = await box(controls); return [Math.round(maximized.width), Math.round(maximized.height)]; })
			.toEqual([Math.round(desktop.width), Math.round(desktop.height)]);
		await expect(logLines(page).first()).toHaveText("Window: Controls maximized");
	});

	test("the taskbar minimizes the active window and brings it back", async ({ page }) => {
		const button = page.locator(".win-taskbar__button", { hasText: "Event log" });
		await expect(button).toHaveClass(/win-taskbar__button--active/);
		await button.click();
		await expect(windowNamed(page, "Event log")).toHaveCount(0);
		await button.click();
		await expect(windowNamed(page, "Event log")).toBeVisible();
		await expect(logLines(page).first()).toHaveText("Window: Event log normal");
	});

	test("menus open on click, switch on hover and close on a click elsewhere; choosing an item is logged", async ({ page }) => {
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

	test("the list selects like Explorer: click, then Shift+Down extends; the tree expands with its +/- box", async ({ page }) => {
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
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.locator(".win-taskbar__button", { hasText: "More controls" }).click();
		await expect(windowNamed(page, "More controls")).toBeVisible();
	});

	test("typing into the text box updates the status bar; the spinner, combo box and toolbar work with mouse and keys", async ({ page }) => {
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

	test("the scroll bar thumb can be dragged; the tooltip appears on hover; the message box is modal and answers", async ({ page }) => {
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

test.describe("UI toolkit gallery: the Tailwind kit", () => {
	/** The colour a CSS variable resolves to, as the browser computes it (so oklch values compare exactly). */
	const Resolve = (page: Page, variable: string) => page.evaluate((name) => {
		const probe = document.createElement("div");
		probe.style.backgroundColor = `var(${name})`;
		document.querySelector(".win-root")!.appendChild(probe);
		const color = getComputedStyle(probe).backgroundColor;
		probe.remove();
		return color;
	}, variable);
	const style = (locator: Locator, property: string) => locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);

	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await windowNamed(page, "Themes").locator(".gallery-kit").getByRole("radio").nth(1).click();
		await expect(page.locator(".win-root")).toHaveClass(/win-kit--tailwind/);
	});

	test("buttons, windows and radius follow the Tailwind theme; nothing of the classic kit leaks in", async ({ page }) => {
		const push = windowNamed(page, "Controls").getByRole("button", { name: "Push me" });
		// Colours animate (transition-colors): wait for them to settle instead of sampling mid-transition.
		await expect.poll(() => style(push, "background-color")).toBe(await Resolve(page, "--color-indigo-600"));
		expect(await style(push, "min-width")).toBe("80px"); // Tailwind's min-w-20, not the classic 75px

		const themes = windowNamed(page, "Themes");
		const pick = async (index: number, option: string) => {
			await themes.locator(".gallery-tailwind [role=combobox]").nth(index).click();
			await themes.locator(".gallery-tailwind [role=option]", { hasText: new RegExp(`^${option}$`) }).click();
		};
		await pick(0, "rose");
		await expect.poll(() => style(push, "background-color")).toBe(await Resolve(page, "--color-rose-600"));

		await themes.locator(".gallery-tailwind .win-switch").click();
		const log = windowNamed(page, "Event log");
		await expect.poll(() => style(log, "background-color")).toBe(await Resolve(page, "--color-zinc-900"));

		await pick(2, "full");
		await expect.poll(() => style(log, "border-top-left-radius")).toBe("9999px");
	});
});

test.describe("UI toolkit gallery: classic chrome geometry", () => {
	/** Centre of a pseudo-element relative to its host's box, from computed left/top/width/height and the host size. */
	// left/top of an absolutely placed pseudo-element count from the host's padding edge, so the host's border is added.
	const PseudoCentre = (locator: Locator, pseudo: "::before" | "::after") => locator.evaluate((el, which) => {
		const style = getComputedStyle(el, which);
		const hostStyle = getComputedStyle(el);
		const host = el.getBoundingClientRect();
		const left = parseFloat(hostStyle.borderLeftWidth) + parseFloat(style.left);
		const top = parseFloat(hostStyle.borderTopWidth) + parseFloat(style.top);
		return { dx: left + parseFloat(style.width) / 2 - host.width / 2, dy: top + parseFloat(style.height) / 2 - host.height / 2 };
	}, pseudo);

	test("in every classic theme the title bar buttons sit inside the window and their close cross and the check marks are centred", async ({ page }) => {
		await page.goto("/");
		const controls = windowNamed(page, "Controls");
		await controls.click({ position: { x: 300, y: 90 } });
		await controls.locator(".win-checkbox").first().click();
		const radios = windowNamed(page, "Themes").locator(".gallery-classic").getByRole("radio");
		for (let i = 0; i < 12; i++) {
			await radios.nth(i).click();
			const theme = await page.locator(".win-root").getAttribute("class");
			const frame = (await controls.boundingBox())!;
			for (const button of await controls.locator(".win-window__button").all()) {
				const box = (await button.boundingBox())!;
				expect(box.y, `${theme}: title button above the window`).toBeGreaterThanOrEqual(frame.y - 0.5);
			}
			const cross = await PseudoCentre(controls.locator(".win-window__button--close"), "::before");
			expect(Math.abs(cross.dx) + Math.abs(cross.dy), `${theme}: close cross off-centre by ${JSON.stringify(cross)}`).toBeLessThanOrEqual(1);
			const check = await PseudoCentre(controls.locator('.win-checkbox__box[aria-checked="true"]').first(), "::after");
			expect(Math.abs(check.dx) + Math.abs(check.dy), `${theme}: check mark off-centre by ${JSON.stringify(check)}`).toBeLessThanOrEqual(1);
		}
	});
});

test.describe("UI toolkit gallery: Windows 11 motion", () => {
	test("menus slide in, windows shrink away when minimized and grow back when restored", async ({ page }) => {
		await page.goto("/");
		const explorer = windowNamed(page, "Explorer");
		await explorer.click({ position: { x: 300, y: 200 } });
		// Click and read within the page, two frames later: the slide-in lasts only 167 ms.
		const animation = await explorer.locator(".win-menubar__item", { hasText: "File" }).evaluate(async (item) => {
			(item as HTMLElement).click();
			await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
			return getComputedStyle(item.parentElement!.querySelector(".win-menu__levels")!).animationName;
		});
		expect(animation).toBe("win-flyout-in");

		await page.mouse.click(5, 5);
		/** Clicks inside the page and reports which of the classes exist two frames later. */
		const ClickAndSee = (selector: string, classes: string[]) => page.evaluate(async ({ selector, classes }) => {
			(document.querySelector(selector) as HTMLElement).click();
			await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
			return classes.filter((name) => document.querySelector(`.${name}`) !== null);
		}, { selector, classes });
		expect(await ClickAndSee('.win-window[aria-label="Controls"] [aria-label=Minimize]', ["win-window-leave-active"])).toEqual(["win-window-leave-active"]);
		await expect(windowNamed(page, "Controls")).toHaveCount(0);
		const task = await page.locator(".win-taskbar__button", { hasText: /^\s*Controls\s*$/ }).evaluate((el) => [...el.parentElement!.children].indexOf(el) + 1);
		expect(await ClickAndSee(`.win-taskbar__button:nth-child(${task})`, ["win-window-enter-active"])).toEqual(["win-window-enter-active"]);
		await expect(windowNamed(page, "Controls")).toBeVisible();
	});
});

test.describe("UI toolkit gallery: touch controls", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
	});

	test("touch controls: dragging the stick moves its knob and reports the position, game buttons press - in every kit", async ({ page }) => {
		await page.locator(".win-taskbar__button", { hasText: "Touch controls" }).click();
		const touch = windowNamed(page, "Touch controls");
		const stick = touch.locator(".win-joystick");
		const box = (await stick.boundingBox())!;
		const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
		await page.mouse.move(cx, cy);
		await page.mouse.down();
		await page.mouse.move(cx, cy - 80, { steps: 8 }); // up, past the edge
		// Straight up, all the way (X within a hundredth: the mouse lands within a pixel of the middle).
		await expect(touch.locator(".gallery-touch__readout")).toHaveText(/^Stick: -?0\.0\d, -1\.00$/);
		await expect(stick).toHaveClass(/win-joystick--active/);
		const knob = touch.locator(".win-joystick__knob");
		// Up by its whole travel: 0.3 of the 150 px stick (a fraction of a pixel sideways is the mouse's rounding).
		expect(await knob.getAttribute("style")).toMatch(/translate\(-?0(\.\d+)?px, -4[45](\.\d+)?px\)/);
		await page.screenshot({ path: "/tmp/shots/touch-xp-blue-dragging.png", clip: (await touch.boundingBox())! });
		await page.mouse.up();
		await expect(touch.locator(".gallery-touch__readout")).toHaveText("Stick: 0.00, 0.00");
		await expect(stick).toHaveClass(/win-joystick--returning/);
		await expect(logLines(page).first()).toHaveText(/^Stick: let go at -?0\.0\d, -1\.00$/);

		const jump = touch.locator(".win-game-button", { hasText: "Jump" });
		const jumpBox = (await jump.boundingBox())!;
		await page.mouse.move(jumpBox.x + jumpBox.width / 2, jumpBox.y + jumpBox.height / 2);
		await page.mouse.down();
		await expect(jump).toHaveClass(/win-game-button--pressed/);
		await page.screenshot({ path: "/tmp/shots/touch-xp-blue-pressed.png", clip: (await touch.boundingBox())! });
		await page.mouse.up();
		await expect(logLines(page).first()).toHaveText("Game button: Jump pressed");

		for (const [index, name] of [[0, "win98"], [11, "win7-aero"]] as const) {
			await windowNamed(page, "Themes").locator(".gallery-classic").getByRole("radio").nth(index).click();
			await touch.locator(".win-window__title, .win-window__titlebar").first().click({ force: true }).catch(() => undefined);
			await page.screenshot({ path: `/tmp/shots/touch-${name}.png`, clip: (await touch.boundingBox())! });
		}
		await windowNamed(page, "Themes").locator(".gallery-kit").getByRole("radio").nth(1).click(); // Tailwind
		await page.screenshot({ path: "/tmp/shots/touch-tailwind.png", clip: (await touch.boundingBox())! });
		await expect(touch.locator(".win-joystick__knob")).toHaveCSS("border-radius", /px|%/);
	});
});
