// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { beforeEach, describe, expect, it } from "vitest";

import { UiController } from "../Source/Workers/Ui/UiController";
import type { UiToGameLogicMessage, UiToMainMessage } from "../Source/Workers/Protocol/UiProtocol";

const scenes = [
	{ id: "a", name: "A", description: "" },
	{ id: "b", name: "B", description: "" },
];

describe("UiController (pause / loading / pointer-lock state machine)", () => {
	let toMain: UiToMainMessage[];
	let toGame: UiToGameLogicMessage[];
	let ui: UiController;

	const of = <T extends { type: string; }>(list: T[], type: string): T[] => list.filter((m) => m.type === type);

	beforeEach(() => {
		toMain = [];
		toGame = [];
		ui = new UiController((m) => toMain.push(m), (m) => toGame.push(m));
		ui.OnGameLogicMessage({ type: "scenes", scenes });
	});

	/** Boot + first scene done, browser granted the pointer lock -> the game is running. */
	const startPlaying = (): void => {
		ui.OnGameLogicMessage({ type: "load-progress", sceneId: "a", label: "x", fraction: 0.5 });
		ui.OnGameLogicMessage({ type: "load-finished", sceneId: "a" });
		ui.OnMainMessage({ type: "pointer-lock", locked: true });
	};

	it("shows the loading overlay at boot and asks for the pointer lock when the first scene is ready", () => {
		expect(ui.State.loading.visible).toBe(true);
		ui.OnGameLogicMessage({ type: "load-progress", sceneId: "a", label: "Spawning", fraction: 0.5 });
		expect(ui.State.loading).toEqual({ visible: true, label: "Spawning", fraction: 0.5 });

		ui.OnGameLogicMessage({ type: "load-finished", sceneId: "a" });
		expect(ui.State.loading.visible).toBe(false);
		expect(ui.State.menu.currentSceneId).toBe("a");
		expect(of(toMain, "request-pointer-lock")).toHaveLength(1);
	});

	it("falls back to the 'Play' menu when the browser refuses the first pointer lock (no user gesture yet)", () => {
		ui.OnGameLogicMessage({ type: "load-finished", sceneId: "a" });
		ui.OnMainMessage({ type: "pointer-lock-failed" });

		expect(ui.State.menu).toMatchObject({ visible: true, mode: "start" });
	});

	it("gives the game input while the pointer is locked, takes it back and shows the menu on Esc", () => {
		startPlaying();
		expect(ui.State.menu.visible).toBe(false);
		expect(toGame).toContainEqual({ type: "set-capture", enabled: true });

		toGame.length = 0;
		ui.OnMainMessage({ type: "pointer-lock", locked: false }); // browser released it (Esc)

		expect(toGame).toContainEqual({ type: "set-capture", enabled: false });
		expect(ui.State.menu).toMatchObject({ visible: true, mode: "paused" });
	});

	it("scene switch: hides the menu, shows loading, forwards the request, and re-requests the lock when done", () => {
		startPlaying();
		ui.OnMainMessage({ type: "pointer-lock", locked: false });
		toGame.length = 0;
		toMain.length = 0;

		ui.OnMainMessage({ type: "select-scene", sceneId: "b" });
		expect(ui.State.menu.visible).toBe(false);
		expect(ui.State.loading.visible).toBe(true);
		expect(toGame).toContainEqual({ type: "load-scene", sceneId: "b" });
		expect(toGame).toContainEqual({ type: "set-capture", enabled: false });

		ui.OnGameLogicMessage({ type: "load-progress", sceneId: "b", label: "Working", fraction: 0.4 });
		ui.OnGameLogicMessage({ type: "load-finished", sceneId: "b" });
		expect(ui.State.loading.visible).toBe(false);
		expect(ui.State.menu.currentSceneId).toBe("b");
		expect(of(toMain, "request-pointer-lock")).toHaveLength(1);

		// Browser says no (the click's user activation expired): back to the menu, one click returns control.
		ui.OnMainMessage({ type: "pointer-lock-failed" });
		expect(ui.State.menu).toMatchObject({ visible: true, mode: "paused" });

		ui.OnMainMessage({ type: "pointer-lock", locked: true });
		expect(ui.State.menu.visible).toBe(false);
		expect(toGame).toContainEqual({ type: "set-capture", enabled: true });
	});

	it("ignores a second scene request while one is loading", () => {
		startPlaying();
		ui.OnMainMessage({ type: "pointer-lock", locked: false });
		ui.OnMainMessage({ type: "select-scene", sceneId: "b" });
		toGame.length = 0;

		ui.OnMainMessage({ type: "select-scene", sceneId: "a" });
		expect(of(toGame, "load-scene")).toHaveLength(0);
	});

	it("a failed refusal during loading does not pop the menu over the loading screen", () => {
		startPlaying();
		ui.OnMainMessage({ type: "pointer-lock", locked: false });
		ui.OnMainMessage({ type: "select-scene", sceneId: "b" });

		ui.OnMainMessage({ type: "pointer-lock-failed" });
		expect(ui.State.menu.visible).toBe(false);
	});

	it("a load failure brings the menu back and tells the player", () => {
		startPlaying();
		ui.OnMainMessage({ type: "pointer-lock", locked: false });
		ui.OnMainMessage({ type: "select-scene", sceneId: "b" });
		toMain.length = 0;

		ui.OnGameLogicMessage({ type: "load-failed", sceneId: "b", message: "boom" });
		expect(ui.State.loading.visible).toBe(false);
		expect(ui.State.menu.visible).toBe(true);
		expect(of(toMain, "toast").some((t) => String((t as { message: string; }).message).includes("boom"))).toBe(true);
	});

	it("forwards HUD lines and toasts", () => {
		ui.OnGameLogicMessage({ type: "hud", lines: ["a", "b"] });
		expect(ui.State.hud.lines).toEqual(["a", "b"]);
		ui.OnGameLogicMessage({ type: "toast", message: "hi" });
		expect(toMain).toContainEqual({ type: "toast", message: "hi" });
	});

	it("a script-initiated reload while the pointer is locked goes straight back to playing (and Esc still opens the menu)", () => {
		startPlaying(); // locked
		toMain.length = 0;

		ui.OnGameLogicMessage({ type: "load-progress", sceneId: "a", label: "Reloading", fraction: 0.3 });
		expect(ui.State.loading.visible).toBe(true);
		ui.OnGameLogicMessage({ type: "load-finished", sceneId: "a" });

		expect(ui.State.loading.visible).toBe(false);
		expect(ui.Phase).toBe("playing");
		expect(of(toMain, "request-pointer-lock")).toHaveLength(0); // already locked: nothing to ask for

		ui.OnMainMessage({ type: "pointer-lock", locked: false }); // Esc
		expect(ui.State.menu).toMatchObject({ visible: true, mode: "paused" });
	});
});
