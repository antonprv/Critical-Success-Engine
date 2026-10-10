// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const Main = fileURLToPath(new URL("../../../Binaries/Programs/Desktop/main.cjs", import.meta.url));
let sandbox = "";
let app: ElectronApplication;

/** Starts the app (its registry and home in a fresh folder); extra: its own arguments, as --ui-designer. */
async function Launch(...extra: string[]): Promise<ElectronApplication> {
	app = await electron.launch({
		// Chromium refuses its sandbox to root (a container): only then is it switched off.
		args: [...(process.getuid?.() === 0 ? ["--no-sandbox"] : []), Main, ...extra],
		env: { ...process.env, CSE_PROJECTS_REGISTRY: join(sandbox, "Projects.json"), HOME: sandbox },
	});
	return app;
}

test.beforeEach(() => {
	sandbox = mkdtempSync(join(tmpdir(), "cse-desktop-e2e-"));
});

test.afterEach(async () => {
	await app.close();
	rmSync(sandbox, { recursive: true, force: true });
});

const doc = (page: Page, id: string) => page.locator(`[data-ui="${id}"]`);
const button = (page: Page, id: string, name: string) => doc(page, id).locator(`[data-name="${name}"] button`);

test("the desktop app: the project browser creates a project from a template, opens it in a UI Designer window, wears any theme, forgets it", async () => {
	const window = await (await Launch()).firstWindow();
	await expect(doc(window, "ProjectBrowser")).toBeVisible();
	expect(await window.title()).toBe("Critical Success Engine - Projects");
	await expect(doc(window, "ProjectBrowser").locator('[data-name="Projects"] .win-listview__row')).toHaveCount(0);

	await button(window, "ProjectBrowser", "NewButton").click();
	const dialog = doc(window, "NewProject");
	await expect(dialog).toBeVisible();
	await expect(dialog.locator('[data-name="Location"] input')).toHaveValue(join(sandbox, "CSE Projects"));
	await dialog.locator('[data-name="Templates"] .win-listview__row', { hasText: "Coin Hunt" }).click();
	await expect(dialog.locator('[data-name="Description"]')).toContainText("coin");
	await dialog.locator('[data-name="Name"] input').fill("Moonrise");
	await expect(button(window, "NewProject", "CreateButton")).toBeEnabled();
	await window.screenshot({ path: "/tmp/shots/desktop-new-project.png" });
	await button(window, "NewProject", "CreateButton").click();
	await expect(dialog).toBeHidden();

	const file = join(sandbox, "CSE Projects", "Moonrise", "Moonrise.cseproject");
	const row = doc(window, "ProjectBrowser").locator('[data-name="Projects"] .win-listview__row');
	await expect(row).toHaveText([`Moonrise - CoinHunt (Collectathon) - ${file}`]);
	expect(existsSync(file)).toBe(true); // on disk, from the template
	expect(JSON.parse(readFileSync(join(sandbox, "Projects.json"), "utf8")).Projects.map((p: { File: string; }) => p.File)).toEqual([file]); // and the tools know it
	await expect(doc(window, "ProjectBrowser").locator('[data-name="Status"]')).toHaveText("Created Moonrise: the engine and the tools know it now.");

	await doc(window, "ProjectBrowser").locator('[data-name="Theme"] [role="combobox"]').click();
	await window.locator('.win-combobox__option', { hasText: "Tailwind (dark)" }).click();
	await expect(window.locator(".win-kit--tailwind")).toBeVisible();
	await expect(window.locator(".win-combobox__list")).toHaveCount(0); // the list has closed (its animation done)
	await window.screenshot({ path: "/tmp/shots/desktop-tailwind-dark.png" });

	await row.click();
	const designerOpens = app.waitForEvent("window");
	await button(window, "ProjectBrowser", "OpenButton").click();
	const designer = await designerOpens;
	await designer.waitForLoadState();
	expect(new URL(designer.url()).searchParams.get("project")).toBe(file);
	expect(app.windows()).toHaveLength(2); // a window of its own, not a tab

	await row.click();
	await button(window, "ProjectBrowser", "RemoveButton").click();
	await expect(row).toHaveCount(0);
	expect(existsSync(file)).toBe(true); // forgotten, not deleted
});

/** Creates a project from a template in the project browser, as a player would. */
async function CreateInBrowser(window: Page, template: string, name: string): Promise<string> {
	await button(window, "ProjectBrowser", "NewButton").click();
	const dialog = doc(window, "NewProject");
	await dialog.locator('[data-name="Templates"] .win-listview__row', { hasText: template }).click();
	await dialog.locator('[data-name="Name"] input').fill(name);
	await button(window, "NewProject", "CreateButton").click();
	await expect(dialog).toBeHidden();
	return join(sandbox, "CSE Projects", name, `${name}.cseproject`);
}

test("the UI designer on a project: its documents, Ctrl+S saves into the project, a new document lands in the manifest", async () => {
	const window = await (await Launch()).firstWindow();
	await CreateInBrowser(window, "Coin Hunt", "Moonrise");
	await doc(window, "ProjectBrowser").locator(".win-listview__row").first().click();
	const opens = app.waitForEvent("window");
	await button(window, "ProjectBrowser", "OpenButton").click();
	const designer = await opens;
	await expect(designer.locator(".win-designer__project legend")).toHaveText("Project: Moonrise");
	await expect(designer).toHaveTitle("UI Designer - Moonrise");
	await expect(designer.locator(".win-designer__document--current")).toHaveText("CoinHuntHud");

	const hud = join(sandbox, "CSE Projects/Moonrise/Content/UI/CoinHuntHud.ui.json");
	const before = JSON.parse(readFileSync(hud, "utf8")).Root.Children.length;
	await designer.locator(".win-designer__palette-item", { hasText: /^Button$/ }).click();
	await designer.locator(".win-designer").press("Control+s");
	await expect(designer.locator(".win-statusbar")).toContainText("Saved CoinHuntHud to Moonrise");
	expect(JSON.parse(readFileSync(hud, "utf8")).Root.Children.length).toBe(before + 1); // on disk, in the project

	await designer.locator('.win-designer__new-document input').fill("PauseMenu");
	await designer.locator(".win-designer__add-document").click();
	await expect(designer.locator(".win-designer__document--current")).toHaveText("PauseMenu");
	expect(existsSync(join(sandbox, "CSE Projects/Moonrise/Content/UI/PauseMenu.ui.json"))).toBe(true);
	const manifest = JSON.parse(readFileSync(join(sandbox, "CSE Projects/Moonrise/Content/UI/Ui.manifest.json"), "utf8"));
	expect(manifest.Documents.map((d: { Id: string; }) => d.Id)).toEqual(["CoinHuntHud", "PauseMenu"]);
	await designer.screenshot({ path: "/tmp/shots/desktop-designer-project.png" });
	// The left column fits its width: nothing in it (the project panel, the palette) pushes it sideways.
	expect(await designer.evaluate(() => { const side = document.querySelector(".win-designer__side")!; return side.scrollWidth - side.clientWidth; })).toBeLessThanOrEqual(0);

	// The Code tab: the project's own code (its Source folder), edited in Monaco and saved to disk with Ctrl+S.
	await designer.locator('[data-view="code"]').click();
	await expect(designer.locator(".win-code__file", { hasText: "MoonriseModule.ts" })).toBeVisible();
	await designer.locator(".win-code__file", { hasText: "CoinHunt.ts" }).click();
	const lines = designer.locator(".win-code__editor .monaco-editor .view-lines");
	await expect(lines).toContainText("class GameRules");
	// The project's real script, with its engine imports (@cse/core, @cse/ui/game): the editor knows them, no errors.
	await designer.waitForTimeout(4_000);
	await expect(designer.locator(".win-code__editor .squiggly-error")).toHaveCount(0);
	await lines.click();
	await designer.keyboard.press("Control+Home");
	await designer.keyboard.type("// Tuned in the code editor.\n");
	await expect(designer.locator(".win-code__tab--changed")).toHaveCount(1);
	await designer.keyboard.press("Control+s");
	await expect(designer.locator(".win-statusbar")).toContainText("Saved Source/Scripts/CoinHunt.ts");
	const script = readFileSync(join(sandbox, "CSE Projects/Moonrise/Source/Scripts/CoinHunt.ts"), "utf8");
	expect(script.startsWith("// Tuned in the code editor.\n")).toBe(true); // on disk, in the project
	await designer.screenshot({ path: "/tmp/shots/desktop-designer-code.png" });
});

test("the UI designer on its own (--ui-designer) asks which project the UI is for, then opens it", async () => {
	const browser = await (await Launch()).firstWindow();
	await CreateInBrowser(browser, "First Person", "Starfall");
	await app.close();
	const window = await (await Launch("--ui-designer")).firstWindow();
	const choice = window.locator(".win-designer__project-choice", { hasText: "Starfall" });
	await expect(choice).toBeVisible();
	await choice.click();
	await expect(window.locator(".win-designer__project legend")).toHaveText("Project: Starfall");
	await expect(window.locator(".win-designer__document--current")).toHaveText("FirstPersonHud");
});
