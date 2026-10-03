// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { beforeEach, describe, expect, it } from "vitest";

import { UiController, UiPhase } from "../Source/Workers/Ui/UiController";
import type { UiToGameLogicMessage, UiToMainMessage } from "../Source/Workers/Protocol/UiProtocol";
import { MenuMode, UiMsg } from "../Source/Workers/Common/CommonEnums";

const scenes = [
	{ id: "a", name: "A", description: "" },
	{ id: "b", name: "B", description: "" },
];

describe("UiController (pause / loading / pointer-lock state machine)", () => {
	let toMain: UiToMainMessage[];
	let toGame: UiToGameLogicMessage[];
	let ui: UiController;

	const of = <T extends { type: UiMsg; }>(list: T[], type: UiMsg): T[] => list.filter((m) => m.type === type);

	beforeEach(() => {
		toMain = [];
		toGame = [];
		ui = new UiController((m) => toMain.push(m), (m) => toGame.push(m));
		ui.OnGameLogicMessage({ type: UiMsg.Scenes, scenes });
	});

	/** Boot + first scene done, browser granted the pointer lock -> the game is running. */
	const startPlaying = (): void => {
		ui.OnGameLogicMessage({ type: UiMsg.LoadProgress, sceneId: "a", label: "x", fraction: 0.5 });
		ui.OnGameLogicMessage({ type: UiMsg.LoadFinished, sceneId: "a" });
		ui.OnMainMessage({ type: UiMsg.PointerLock, locked: true });
	};

	it("shows the loading overlay at boot and asks for the pointer lock when the first scene is ready", () => {
		expect(ui.State.loading.visible).toBe(true);
		ui.OnGameLogicMessage({ type: UiMsg.LoadProgress, sceneId: "a", label: "Spawning", fraction: 0.5 });
		expect(ui.State.loading).toEqual({ visible: true, label: "Spawning", fraction: 0.5 });

		ui.OnGameLogicMessage({ type: UiMsg.LoadFinished, sceneId: "a" });
		expect(ui.State.loading.visible).toBe(false);
		expect(ui.State.menu.currentSceneId).toBe("a");
		expect(of(toMain, UiMsg.RequestPointerLock)).toHaveLength(1);
	});

	it("falls back to the 'Play' menu when the browser refuses the first pointer lock (no user gesture yet)", () => {
		ui.OnGameLogicMessage({ type: UiMsg.LoadFinished, sceneId: "a" });
		ui.OnMainMessage({ type: UiMsg.PointerLockFailed });

		expect(ui.State.menu).toMatchObject({ visible: true, mode: MenuMode.Start });
	});

	it("gives the game input while the pointer is locked, takes it back and shows the menu on Esc", () => {
		startPlaying();
		expect(ui.State.menu.visible).toBe(false);
		expect(toGame).toContainEqual({ type: UiMsg.SetCapture, enabled: true });

		toGame.length = 0;
		ui.OnMainMessage({ type: UiMsg.PointerLock, locked: false }); // browser released it (Esc)

		expect(toGame).toContainEqual({ type: UiMsg.SetCapture, enabled: false });
		expect(ui.State.menu).toMatchObject({ visible: true, mode: MenuMode.Paused });
	});

	it("scene switch: hides the menu, shows loading, forwards the request, and re-requests the lock when done", () => {
		startPlaying();
		ui.OnMainMessage({ type: UiMsg.PointerLock, locked: false });
		toGame.length = 0;
		toMain.length = 0;

		ui.OnMainMessage({ type: UiMsg.SelectScene, sceneId: "b" });
		expect(ui.State.menu.visible).toBe(false);
		expect(ui.State.loading.visible).toBe(true);
		expect(toGame).toContainEqual({ type: UiMsg.LoadScene, sceneId: "b" });
		expect(toGame).toContainEqual({ type: UiMsg.SetCapture, enabled: false });

		ui.OnGameLogicMessage({ type: UiMsg.LoadProgress, sceneId: "b", label: "Working", fraction: 0.4 });
		ui.OnGameLogicMessage({ type: UiMsg.LoadFinished, sceneId: "b" });
		expect(ui.State.loading.visible).toBe(false);
		expect(ui.State.menu.currentSceneId).toBe("b");
		expect(of(toMain, UiMsg.RequestPointerLock)).toHaveLength(1);

		// Browser says no (the click's user activation expired): back to the menu, one click returns control.
		ui.OnMainMessage({ type: UiMsg.PointerLockFailed });
		expect(ui.State.menu).toMatchObject({ visible: true, mode: MenuMode.Paused });

		ui.OnMainMessage({ type: UiMsg.PointerLock, locked: true });
		expect(ui.State.menu.visible).toBe(false);
		expect(toGame).toContainEqual({ type: UiMsg.SetCapture, enabled: true });
	});

	it("ignores a second scene request while one is loading", () => {
		startPlaying();
		ui.OnMainMessage({ type: UiMsg.PointerLock, locked: false });
		ui.OnMainMessage({ type: UiMsg.SelectScene, sceneId: "b" });
		toGame.length = 0;

		ui.OnMainMessage({ type: UiMsg.SelectScene, sceneId: "a" });
		expect(of(toGame, UiMsg.LoadScene)).toHaveLength(0);
	});

	it("a failed refusal during loading does not pop the menu over the loading screen", () => {
		startPlaying();
		ui.OnMainMessage({ type: UiMsg.PointerLock, locked: false });
		ui.OnMainMessage({ type: UiMsg.SelectScene, sceneId: "b" });

		ui.OnMainMessage({ type: UiMsg.PointerLockFailed });
		expect(ui.State.menu.visible).toBe(false);
	});

	it("a load failure brings the menu back and tells the player", () => {
		startPlaying();
		ui.OnMainMessage({ type: UiMsg.PointerLock, locked: false });
		ui.OnMainMessage({ type: UiMsg.SelectScene, sceneId: "b" });
		toMain.length = 0;

		ui.OnGameLogicMessage({ type: UiMsg.LoadFailed, sceneId: "b", message: "boom" });
		expect(ui.State.loading.visible).toBe(false);
		expect(ui.State.menu.visible).toBe(true);
		expect(of(toMain, UiMsg.Toast).some((t) => String((t as { message: string; }).message).includes("boom"))).toBe(true);
	});

	it("forwards HUD lines and toasts", () => {
		ui.OnGameLogicMessage({ type: UiMsg.Hud, lines: ["a", "b"] });
		expect(ui.State.hud.lines).toEqual(["a", "b"]);
		ui.OnGameLogicMessage({ type: UiMsg.Toast, message: "hi" });
		expect(toMain).toContainEqual({ type: UiMsg.Toast, message: "hi" });
	});

	it("a script-initiated reload while the pointer is locked goes straight back to playing (and Esc still opens the menu)", () => {
		startPlaying(); // locked
		toMain.length = 0;

		ui.OnGameLogicMessage({ type: UiMsg.LoadProgress, sceneId: "a", label: "Reloading", fraction: 0.3 });
		expect(ui.State.loading.visible).toBe(true);
		ui.OnGameLogicMessage({ type: UiMsg.LoadFinished, sceneId: "a" });

		expect(ui.State.loading.visible).toBe(false);
		expect(ui.Phase).toBe(UiPhase.Playing);
		expect(of(toMain, UiMsg.RequestPointerLock)).toHaveLength(0); // already locked: nothing to ask for

		ui.OnMainMessage({ type: UiMsg.PointerLock, locked: false }); // Esc
		expect(ui.State.menu).toMatchObject({ visible: true, mode: MenuMode.Paused });
	});
});
