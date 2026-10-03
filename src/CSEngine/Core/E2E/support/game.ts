// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { SimulatePointerLock } from "./pointer-lock";

/** Every line the game's Logger sent to the log sink (E2E/support/serve.mjs, :4790) - the same stream a developer sees in the log file. */
const LogSinkUrl = "http://127.0.0.1:4790";

export type LockMode = "simulated" | "real";

export interface OpenOptions {
	/** "simulated" (default): browser pointer-lock rules without the real lock. "real": the browser's own. */
	lock?: LockMode;
	/** Console messages / log lines that are expected for this test and must not fail it (matched against the text). */
	allowedIssues?: RegExp[];
}

/** What a player does on the page - plus the checks that no browser console error, warning or failed request went unnoticed. */
export class Game {
	public readonly issues: string[] = [];
	private _allowed: RegExp[] = [];

	public constructor(public readonly page: Page) {
		page.on("pageerror", (error) => this.Note(`pageerror: ${error.message}`));
		page.on("console", (message) => {
			if (message.type() === "error" || message.type() === "warning") this.Note(`console.${message.type()}: ${message.text()}`);
		});
		page.on("requestfailed", (request) => {
			const reason = request.failure()?.errorText ?? "?";
			// A log upload still in flight when the page goes away is cancelled by the browser - not a failure of the site.
			if (request.url().startsWith(LogSinkUrl) && reason.includes("ERR_ABORTED")) return;
			this.Note(`request failed: ${request.url()} (${reason})`);
		});
		page.on("crash", () => this.Note("PAGE CRASHED"));
	}

	private Note(issue: string): void {
		if (!this._allowed.some((pattern) => pattern.test(issue))) this.issues.push(issue);
	}

	//#region page structure

	public get playButton(): Locator { return this.page.getByRole("button", { name: /^(Play|Resume)$/ }); }
	public get loadingOverlay(): Locator { return this.page.locator(".loading-overlay"); }
	public get menu(): Locator { return this.page.locator(".menu-card"); }
	public get hud(): Locator { return this.page.locator(".hud-line"); }
	/** The menu or the game HUD - whichever shows up first (they can overlap for a moment while the menu fades out). */
	public get menuOrHud(): Locator { return this.menu.or(this.hud.first()).first(); }
	public get toasts(): Locator { return this.page.locator(".q-notification"); }
	public get canvas(): Locator { return this.page.locator("#gameCanvas"); }
	public sceneItem(name: string | RegExp): Locator { return this.page.locator(".q-item", { hasText: name }); }

	//#endregion

	//#region opening

	/** Opens the site like a visitor: navigates, waits until the game is either running (HUD) or waiting for a click (menu). */
	public async open(options: OpenOptions = {}): Promise<void> {
		this._allowed = options.allowedIssues ?? [];
		if ((options.lock ?? "simulated") === "simulated") await this.page.addInitScript(SimulatePointerLock);

		await this.page.goto("/");
		await expect(this.page.locator("#boot-splash, .loading-overlay, .menu-card, .hud-line").first()).toBeVisible();
		await expect(this.menuOrHud).toBeVisible({ timeout: 45_000 });
	}

	/**
	 * Gets the player into the game: while the menu is up it clicks Play/Resume (a real click - that is the user gesture the
	 * browser demands), and it is done when the HUD shows without the menu. Polls instead of clicking once, because the menu
	 * can be fading out (the game already took the mouse back by itself) at the moment of the first look.
	 */
	public async play(): Promise<void> {
		await expect.poll(async () => {
			if (!(await this.menu.isVisible()) && (await this.hud.first().isVisible())) return "playing";
			if (await this.playButton.isVisible()) await this.playButton.click({ timeout: 2_000 }).catch(() => undefined);
			return "waiting";
		}, { timeout: 45_000, intervals: [150, 250, 500], message: "the game starts (menu closed, HUD visible)" }).toBe("playing");
	}

	public async hudLines(): Promise<string[]> {
		return (await this.hud.allTextContents()).map((line) => line.trim());
	}

	/** Waits until some HUD line matches (HUD text arrives a few times per second). */
	public async expectHud(pattern: RegExp, timeout = 20_000): Promise<void> {
		await expect.poll(async () => (await this.hudLines()).find((line) => pattern.test(line)) ?? null, { timeout, message: `HUD line ${pattern}` }).not.toBeNull();
	}

	public async hudLine(pattern: RegExp): Promise<string> {
		const line = (await this.hudLines()).find((candidate) => pattern.test(candidate));
		if (!line) throw new Error(`no HUD line matches ${pattern}; HUD: ${JSON.stringify(await this.hudLines())}`);
		return line;
	}

	//#endregion

	//#region input

	public async hold(key: string, milliseconds: number): Promise<void> {
		await this.page.keyboard.down(key);
		await this.page.waitForTimeout(milliseconds);
		await this.page.keyboard.up(key);
	}

	/** Esc: the browser releases the pointer lock and the game shows its menu. */
	public async pressEscape(): Promise<void> {
		await this.page.keyboard.press("Escape");
		await expect(this.menu).toBeVisible({ timeout: 10_000 });
	}

	/** Opens the menu (Esc), picks a scene by name, waits for it to load and for the game to hand control back (after a click if the browser asks for one). */
	public async switchScene(name: string | RegExp): Promise<void> {
		await this.pressEscape();
		await this.sceneItem(name).click();
		await expect(this.menuOrHud).toBeVisible({ timeout: 45_000 });
		await this.play();
	}

	//#endregion

	//#region pixels

	/** Screenshot of the page as raw pixels - the canvas is a WebGL surface in a worker, so this is what the player sees. */
	public async pixels(): Promise<PNG> {
		return PNG.sync.read(await this.page.screenshot({ animations: "disabled", timeout: 60_000 }));
	}

	/**
	 * Pixels matching `predicate`, with their count, centre and vertical extent. `fromY` skips the top of the page, where the
	 * HUD text and toast notifications are drawn (they are white too).
	 */
	public static find(png: PNG, predicate: (r: number, g: number, b: number) => boolean, fromY = 0): { count: number; centerX: number; centerY: number; minY: number; maxY: number; } {
		let count = 0, sumX = 0, sumY = 0, minY = Infinity, maxY = -Infinity;
		for (let y = fromY; y < png.height; y++) {
			for (let x = 0; x < png.width; x++) {
				const i = (y * png.width + x) * 4;
				if (predicate(png.data[i]!, png.data[i + 1]!, png.data[i + 2]!)) {
					count++; sumX += x; sumY += y; minY = Math.min(minY, y); maxY = Math.max(maxY, y);
				}
			}
		}
		return { count, centerX: count ? sumX / count : -1, centerY: count ? sumY / count : -1, minY, maxY };
	}

	/** Number of distinct colours in a coarse sample of the image - a blank or crashed canvas has almost none. */
	public static colourVariety(png: PNG): number {
		const seen = new Set<number>();
		for (let y = 0; y < png.height; y += 7) {
			for (let x = 0; x < png.width; x += 7) {
				const i = (y * png.width + x) * 4;
				seen.add(((png.data[i]! >> 4) << 8) | ((png.data[i + 1]! >> 4) << 4) | (png.data[i + 2]! >> 4));
			}
		}
		return seen.size;
	}

	//#endregion
}

export const test = base.extend<{ game: Game }>({
	game: async ({ page, request }, use) => {
		await request.delete(`${LogSinkUrl}/lines`).catch(() => undefined);
		const game = new Game(page);
		await use(game);

		// Whatever the test was about, the whole session must have been free of browser errors, warnings and failed requests...
		expect(game.issues, "browser console errors, warnings, page errors or failed requests").toEqual([]);

		// ...and the game's own log (what the Logger writes for developers) must hold no warnings or errors either.
		const lines = (await (await request.get(`${LogSinkUrl}/lines`)).json()) as string[];
		const bad = lines.filter((line) => /\] \[(Warning|Error)\] /.test(line) && !(game as unknown as { _allowed: RegExp[]; })._allowed.some((p) => p.test(line)));
		expect(bad, "game log warnings or errors").toEqual([]);
	},
});

export { expect };
