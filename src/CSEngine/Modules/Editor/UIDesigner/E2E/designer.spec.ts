// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// The UI designer (designer.html), used like a person would: palette, mouse, details panel, preview, files.

const canvasNode = (page: Page, name: string) => page.locator(`.win-designer__canvas [data-name="${name}"]`);
const treeItems = (page: Page) => page.locator(".win-designer__tree-item");
const toolbarButton = (page: Page, label: string) => page.locator(".win-designer__toolbar .win-toolbar__button", { hasText: label });

test.describe("UI designer", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto("/");
		await expect(page).toHaveTitle("Critical Success Engine - UI Designer");
		await expect(canvasNode(page, "LoginWindow")).toBeVisible();
	});

	test("the example layout comes alive in Preview: its script enables OK once a name is typed and greets on OK", async ({ page }) => {
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

	test("a widget dragged from the palette lands where it is dropped; the mouse moves and resizes it; Ctrl+Z undoes", async ({ page }) => {
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

	test("the details panel renames and edits props; Preview shows the result", async ({ page }) => {
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

	test("Save downloads a .ui.json file that Open loads back", async ({ page }) => {
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
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto("/");
		await page.locator('[data-tab="skin"]').click();
	});

	test("a preset skin restyles the layout on the canvas, and only it", async ({ page }) => {
		await page.locator('[data-skin="Preset"]').selectOption("grimoire");
		const ok = canvasNode(page, "OkButton").locator("button");
		await expect.poll(() => ok.evaluate((el) => getComputedStyle(el).borderImageSource)).toContain("data:image/svg+xml");
		const paletteButton = page.locator(".win-designer__palette-item").first();
		expect(await paletteButton.evaluate((el) => getComputedStyle(el).borderImageSource)).toBe("none");
	});

	test("an uploaded image becomes the hover sprite of buttons, seen in Preview", async ({ page }) => {
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
	test("the layout can be designed in the Tailwind kit, and a skin still goes on top of it", async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto("/");
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

test.describe("UI designer: Tailwind look", () => {
	const Resolve = (page: Page, variable: string) => page.evaluate((name) => {
		const probe = document.createElement("div");
		probe.style.backgroundColor = `var(${name})`;
		document.querySelector(".win-root")!.appendChild(probe);
		const color = getComputedStyle(probe).backgroundColor;
		probe.remove();
		return color;
	}, variable);
	const Background = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor);

	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto("/");
		await page.locator(".win-designer__kit [role=combobox]").click();
		await page.locator(".win-designer__kit [role=option]", { hasText: "Tailwind" }).click();
	});

	test("dark mode paints the whole editor, and the neutral palette visibly changes it", async ({ page }) => {
		await page.locator(".win-designer__tailwind .win-switch").click();
		await expect.poll(() => Background(page, ".win-designer__side")).toBe(await Resolve(page, "--color-zinc-900"));
		expect(await Background(page, ".win-designer__bar")).toBe(await Resolve(page, "--color-zinc-900"));
		await page.locator(".win-designer__tailwind label", { hasText: "Neutral" }).locator("[role=combobox]").click();
		await page.locator(".win-designer__tailwind [role=option]", { hasText: /^slate$/ }).click();
		await expect.poll(() => Background(page, ".win-designer__side")).toBe(await Resolve(page, "--color-slate-900"));
	});

	test("the selected widget is highlighted in the hierarchy; widgets on the canvas are exactly their size", async ({ page }) => {
		await page.locator(".win-designer__tree-item", { hasText: "OkButton" }).click();
		expect(await Background(page, ".win-designer__tree-item--selected")).not.toBe("rgba(0, 0, 0, 0)");
		const node = (await canvasNode(page, "OkButton").boundingBox())!;
		const button = (await canvasNode(page, "OkButton").locator("button").boundingBox())!;
		expect([Math.round(button.width), Math.round(button.height)]).toEqual([Math.round(node.width), Math.round(node.height)]);
	});

	test("dragging across the canvas selects no text", async ({ page }) => {
		const label = (await canvasNode(page, "UserLabel").boundingBox())!;
		await page.mouse.move(label.x + 2, label.y + 4);
		await page.mouse.down();
		await page.mouse.move(label.x + 200, label.y + 60, { steps: 5 });
		await page.mouse.up();
		expect(await page.evaluate(() => window.getSelection()!.toString())).toBe("");
	});
});

test.describe("UI designer: anchors and screen sizes", () => {
	test("a widget anchored to the bottom-right keeps its margins on every screen size, and nothing scrolls", async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto("/");
		await page.locator(".win-designer__tree-item", { hasText: "LoginWindow" }).click();
		await page.locator('[data-field="AnchorX"]').selectOption("end");
		await page.locator('[data-field="AnchorY"]').selectOption("end");
		const margins = async () => {
			const view = (await page.locator(".win-designer__canvas .win-layout").boundingBox())!;
			const box = (await canvasNode(page, "LoginWindow").boundingBox())!;
			return [Math.round(view.x + view.width - box.x - box.width), Math.round(view.y + view.height - box.y - box.height)];
		};
		const before = await margins();
		await toolbarButton(page, "Preview").click();
		for (const size of ["1024x768", "390x844", "1920x1080"]) {
			await page.locator('[data-field="Screen"]').selectOption(size);
			expect(await margins(), size).toEqual(before);
			const scroll = await page.locator(".win-designer__canvas .win-layout").evaluate((el) => [el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight]);
			expect(scroll.every((extra) => extra <= 0), `${size}: the layout scrolls`).toBe(true);
		}
	});
});

test.describe("UI designer: node scripting", () => {
	test("an event and an action linked with the mouse generate code and run in Preview", async ({ page }) => {
		await page.setViewportSize({ width: 1400, height: 800 });
		await page.goto("/");
		await page.locator(".win-designer__tree-item", { hasText: "CancelButton" }).click();
		await page.locator('[data-view="nodes"]').click();
		await page.locator('[data-add="event"]').click();
		await page.locator('[data-add="action"]').selectOption("set-text");
		const action = page.locator(".win-nodes__node--action");
		await action.locator('[data-param="Widget"]').selectOption("Status");
		await action.locator('[data-param="Text"]').fill("From nodes");

		const out = (await page.locator(".win-nodes__node--event .win-nodes__port--out").boundingBox())!;
		const into = (await action.locator(".win-nodes__port--in").boundingBox())!;
		await page.mouse.move(out.x + out.width / 2, out.y + out.height / 2);
		await page.mouse.down();
		await page.mouse.move(into.x + into.width / 2, into.y + into.height / 2, { steps: 6 });
		await page.mouse.up();
		await expect(page.locator(".win-nodes__links path")).toHaveCount(1);
		await expect(page.locator(".win-designer__code")).toContainText('this.SetText("Status", "From nodes");');
		await page.screenshot({ path: "/tmp/shots/nodes.png", timeout: 60_000 });

		await page.locator('[data-view="canvas"]').click();
		await toolbarButton(page, "Preview").click();
		await canvasNode(page, "CancelButton").locator("button").click();
		await expect(canvasNode(page, "Status")).toContainText("From nodes");
	});
});

test.describe("UI designer: the code editor (Monaco)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.locator('[data-view="code"]').click();
	});

	test("opens a file in a tab; TypeScript is understood: a type error is underlined, completion offers the code's own names", async ({ page }) => {
		await page.locator(".win-code__file", { hasText: "Game.ts" }).click();
		const editor = page.locator(".win-code__editor .monaco-editor");
		await expect(editor).toBeVisible();
		await expect(editor.locator(".view-lines")).toContainText("export const PlayerSpeed: number = 6;");
		await editor.locator(".view-lines").click();
		await page.keyboard.press("Control+End");
		await page.keyboard.type('\nconst wrong: number = "fast";\nPlay');
		await expect(editor.locator(".squiggly-error").first()).toBeVisible({ timeout: 20_000 }); // the TypeScript worker checked it
		await page.keyboard.press("Control+Space");
		await expect(page.locator(".suggest-widget .monaco-list-row", { hasText: "PlayerSpeed" }).first()).toBeVisible({ timeout: 20_000 });
		await page.keyboard.press("Escape");
		await page.screenshot({ path: "/tmp/shots/designer-code.png" });
	});

	test("an edit marks the tab changed; Ctrl+S saves the file and clears the mark", async ({ page }) => {
		await page.locator(".win-code__file", { hasText: "Game.ts" }).click();
		const view = page.locator(".win-code__editor .monaco-editor .view-lines");
		await expect(view).toContainText("PlayerSpeed");
		await view.click();
		await page.keyboard.press("Control+End");
		await page.keyboard.type("\n// tuned\n");
		await expect(page.locator(".win-code__tab--changed")).toHaveCount(1);
		await page.keyboard.press("Control+s");
		await expect(page.locator(".win-designer")).toContainText("Saved Source/Game.ts");
		await expect(page.locator(".win-code__tab--changed")).toHaveCount(0);
	});

	test("knows the engine's types: an engine import resolves, and a class built on it completes the engine's members", async ({ page }) => {
		await page.locator(".win-code__file", { hasText: "Game.ts" }).click();
		const editor = page.locator(".win-code__editor .monaco-editor");
		await expect(editor.locator(".view-lines")).toContainText("PlayerSpeed");
		await editor.locator(".view-lines").click();
		await page.keyboard.press("Control+a");
		await page.keyboard.insertText([
			'import { Component } from "@cse/core/Engine/Core/Component";',
			"",
			"export class Spinner extends Component {",
			"\tpublic Speed = 2;",
			"}",
			"",
		].join("\n"));
		await page.waitForTimeout(3_000); // the TypeScript worker checks the file
		await expect(editor.locator(".squiggly-error")).toHaveCount(0); // the engine's import resolved
		await page.keyboard.press("Control+End");
		await page.keyboard.insertText("const probe = new Spinner();\nprobe.");
		await page.keyboard.press("Control+Space");
		await expect(page.locator(".suggest-widget .monaco-list-row", { hasText: /^Engine/ }).first()).toBeVisible({ timeout: 20_000 }); // a member of the engine's Component
		await page.screenshot({ path: "/tmp/shots/designer-engine-types.png" });
	});
});

test.describe("UI designer: where the code sits", () => {
	test("View puts the code beside the design; its splitter resizes it; the choice outlives a reload", async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => localStorage.clear());
		await page.locator(".win-designer .win-menubar__item", { hasText: "View" }).click();
		await page.locator(".win-menu__item", { hasText: "Code on the right" }).click();
		const docked = page.locator(".win-designer__code-docked");
		await expect(docked.locator(".win-code")).toBeVisible();
		await expect(page.locator(".win-designer__canvas")).toBeVisible(); // the design stays in view beside it
		await expect(page.locator('[data-view="code"]')).toHaveCount(0);
		await docked.locator(".win-code__file", { hasText: "Game.ts" }).click();
		await expect(docked.locator(".monaco-editor .view-lines")).toContainText("PlayerSpeed");
		const before = (await docked.boundingBox())!.width;
		const splitter = page.locator(".win-designer__work > .win-splitter");
		const box = (await splitter.boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x - 120, box.y + box.height / 2, { steps: 6 });
		await page.mouse.up();
		expect((await docked.boundingBox())!.width).toBeGreaterThan(before + 100); // dragged towards the design: the code grows
		await page.screenshot({ path: "/tmp/shots/designer-code-right.png" });
		// The narrower design still reaches its whole layout: the canvas scrolls sideways within its part.
		expect(await page.locator(".win-designer__canvas").evaluate((canvas) => { canvas.scrollLeft = 10_000; return canvas.scrollLeft > 0; })).toBe(true);
		await page.reload();
		await expect(page.locator(".win-designer__work")).toHaveClass(/win-designer__work--code-right/);
	});
});

