// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ChannelHub } from "@cse/core/Engine/Core/Channels";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { ButtonController } from "../Source/Controls/ButtonController";
import type { LabelController } from "../Source/Controls/LabelController";
import { UiManager } from "../Source/Documents/UiManager";
import { BindingName } from "../Source/Runtime/BindingNames";
import { ControlsScreen, EngineControlsId } from "../Source/Runtime/ControlsScreen";
import { WithEngineDocuments } from "../Source/Runtime/EngineScreens";

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0)); await nextTick(); };

const snapshot = (jump: [string, string, string] = ["Space", "", "Pad:A"]) => ({
	op: "bindings", manifest: "City", activeMap: "OnFoot",
	maps: [
		{ Name: "OnFoot", Actions: [{ Name: "Jump", Label: "Jump", Category: "Movement", Binding: { Keyboard: [jump[0], jump[1]], Gamepad: jump[2] } }] },
		{ Name: "Vehicle", Actions: [{ Name: "Horn", Label: "Horn", Category: "Driving", Binding: { Keyboard: ["KeyH", ""], Gamepad: "Pad:LS" } }] },
	],
});

/** A gamepad the test drives, and the frames it is read on. */
function Pad() {
	const buttons = Array.from({ length: 17 }, () => ({ value: 0 }));
	const axes = [0, 0, 0, 0];
	const frames: (() => void)[] = [];
	return { buttons, axes, gamepads: () => [{ connected: true, buttons, axes }], frame: (callback: () => void) => { frames.push(callback); }, tick: () => frames.shift()?.() };
}

function Make() {
	const page = new ChannelHub();
	const fromPage: { op: string; [key: string]: unknown; }[] = [];
	page.Connect((_c, payload) => fromPage.push(payload as never));
	const manager = new UiManager(WithEngineDocuments({ Manifest: { FileVersion: 1, Documents: [] }, Load: async () => "" }));
	const pad = Pad();
	const screen = new ControlsScreen(manager, page, { Target: window, Gamepads: pad.gamepads as never, Frame: pad.frame });
	const game = (message: unknown) => page.Deliver("input", message);
	return { manager, screen, fromPage, game, pad };
}

const doc = (manager: UiManager) => manager.Get(EngineControlsId)!;
const rows = (manager: UiManager) => doc(manager).Controller<{ Items: { text: string; }[]; }>("Bindings").Items.map((i) => i.text);
const pick = (manager: UiManager, index: number) => doc(manager).Controller<{ SetSelection(s: Set<number>): void; }>("Bindings").SetSelection(new Set([index]));
const press = (manager: UiManager, name: string) => doc(manager).Controller<ButtonController>(name).PerformClick();
const hint = (manager: UiManager) => doc(manager).Controller<LabelController>("Hint").Label;
const key = (code: string) => window.dispatchEvent(new KeyboardEvent("keydown", { code, cancelable: true }));

describe("binding names a player reads", () => {
	it("keys, mouse buttons, gamepad buttons and sticks", () => {
		expect(["KeyW", "Digit1", "ArrowUp", "Space", "ShiftLeft", "ControlRight", "AltLeft", "Numpad0", "Mouse0", "Mouse1", "Mouse2", "Mouse3", "", "F5"].map(BindingName))
			.toEqual(["W", "1", "Up", "Space", "Left Shift", "Right Ctrl", "Left Alt", "Num 0", "Left mouse", "Middle mouse", "Right mouse", "Mouse 4", "-", "F5"]);
		expect(["Pad:A", "Pad:LT", "Pad:RB", "Pad:LS", "Pad:DUp", "Pad:Start", "Pad:LeftStickUp", "Pad:RightStickLeft"].map(BindingName))
			.toEqual(["Pad A", "Left trigger", "Right bumper", "Left stick press", "D-pad up", "Pad Start", "Left stick up", "Right stick left"]);
	});
});

describe("ControlsScreen: rebinding on the page", () => {
	it("opening asks the game; every action of every map is listed with its main, spare and gamepad binding", async () => {
		const { manager, screen, fromPage, game } = Make();
		screen.Open();
		await settle();
		expect(fromPage).toEqual([{ op: "request" }]);
		game(snapshot());
		expect(rows(manager)).toEqual(["[OnFoot · Movement] Jump: Space · - · Pad A", "[Vehicle · Driving] Horn: H · - · Left stick press"]);
	});

	it("a keyboard slot takes the next key or mouse button; Esc cancels; Delete clears", async () => {
		const { manager, screen, fromPage, game } = Make();
		screen.Open();
		await settle();
		game(snapshot());
		press(manager, "MainButton"); // nothing picked: nothing to change
		expect(fromPage).toHaveLength(1);
		pick(manager, 0);
		press(manager, "SpareButton");
		expect(hint(manager)).toBe("Press a key or a mouse button for Jump (spare). Esc cancels, Delete clears.");
		key("KeyJ");
		expect(fromPage.at(-1)).toEqual({ op: "rebind", map: "OnFoot", action: "Jump", slot: "KeyboardSecondary", code: "KeyJ" });
		game(snapshot(["Space", "KeyJ", "Pad:A"]));
		expect(rows(manager)[0]).toBe("[OnFoot · Movement] Jump: Space · J · Pad A");
		key("KeyK"); // not listening any more
		expect(fromPage).toHaveLength(2);
		press(manager, "MainButton");
		window.dispatchEvent(new MouseEvent("mousedown", { button: 2 }));
		expect(fromPage.at(-1)).toMatchObject({ slot: "KeyboardPrimary", code: "Mouse2" });
		press(manager, "MainButton");
		key("Escape");
		expect(fromPage).toHaveLength(3);
		expect(hint(manager)).toBe("Pick an action, then the binding to change.");
		press(manager, "SpareButton");
		key("Delete");
		expect(fromPage.at(-1)).toMatchObject({ slot: "KeyboardSecondary", code: "" });
	});

	it("the gamepad slot takes the next button or stick push (not what was held when it started)", async () => {
		const { manager, screen, fromPage, game, pad } = Make();
		screen.Open();
		await settle();
		game(snapshot());
		pick(manager, 1);
		pad.buttons[0]!.value = 1; // A is held when listening starts
		press(manager, "PadButton");
		expect(hint(manager)).toBe("Press a gamepad button or push a stick for Horn. Esc cancels, Delete clears.");
		pad.tick();
		expect(fromPage).toHaveLength(1);
		pad.buttons[0]!.value = 0;
		pad.tick();
		pad.buttons[5]!.value = 1; // RB
		pad.tick();
		expect(fromPage.at(-1)).toEqual({ op: "rebind", map: "Vehicle", action: "Horn", slot: "Gamepad", code: "Pad:RB" });
		pad.buttons[5]!.value = 0;
		press(manager, "PadButton");
		pad.axes[3] = -0.9; // right stick up
		pad.tick();
		expect(fromPage.at(-1)).toMatchObject({ code: "Pad:RightStickUp" });
		press(manager, "PadButton");
		key("KeyQ"); // a key doesn't bind the gamepad slot
		key("Escape");
		pad.tick();
		expect(fromPage.at(-1)).toMatchObject({ code: "Pad:RightStickUp" });
	});

	it("Arrange touch hands over to the touch controls' arranging (made without it: nothing)", async () => {
		const page = new ChannelHub();
		const manager = new UiManager(WithEngineDocuments({ Manifest: { FileVersion: 1, Documents: [] }, Load: async () => "" }));
		const arrange = vi.fn();
		const screen = new ControlsScreen(manager, page, undefined, arrange);
		screen.Open();
		await settle();
		press(manager, "ArrangeButton");
		expect(arrange).toHaveBeenCalledTimes(1);
		const bare = new UiManager(WithEngineDocuments({ Manifest: { FileVersion: 1, Documents: [] }, Load: async () => "" }));
		new ControlsScreen(bare, page).Open();
		await settle();
		expect(() => bare.Get(EngineControlsId)!.Controller<ButtonController>("ArrangeButton").PerformClick()).not.toThrow();
	});

	it("Reset all asks the game; an error is shown; Back closes; Dispose stops listening", async () => {
		const { manager, screen, fromPage, game } = Make();
		screen.Open();
		await settle();
		game(snapshot());
		press(manager, "ResetButton");
		expect(fromPage.at(-1)).toEqual({ op: "reset" });
		game({ op: "error", message: 'No input action "Fly"' });
		expect(hint(manager)).toBe('No input action "Fly"');
		game({ op: "other" });
		press(manager, "BackButton");
		expect(manager.IsShown(EngineControlsId)).toBe(false);
		screen.Dispose();
		game(snapshot());
		expect(manager.IsShown(EngineControlsId)).toBe(false);
	});

	it("without a gamepad API, the gamepad slot waits for nothing but Esc", async () => {
		const page = new ChannelHub();
		const manager = new UiManager(WithEngineDocuments({ Manifest: { FileVersion: 1, Documents: [] }, Load: async () => "" }));
		const frames: (() => void)[] = [];
		const screen = new ControlsScreen(manager, page, { Target: window, Gamepads: () => [], Frame: (callback) => { frames.push(callback); } });
		screen.Open();
		await settle();
		page.Deliver("input", snapshot());
		pick(manager, 0);
		press(manager, "PadButton");
		frames.shift()!();
		key("Escape");
		frames.shift()!(); // the frame already asked for sees the cancel...
		expect(frames).toHaveLength(0); // ...and asks for no more
		expect(new ControlsScreen(manager, page)).toBeDefined(); // the browser's window and gamepads by default
	});
});

describe("ControlsScreen: in the browser, and before it is open", () => {
	it("uses the browser's frames and gamepads (an unplugged pad and a pad-less browser are fine); a stick pushed right binds", async () => {
		const frames: FrameRequestCallback[] = [];
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
		const page = new ChannelHub();
		const fromPage: { op: string; [key: string]: unknown; }[] = [];
		page.Connect((_c, payload) => fromPage.push(payload as never));
		const manager = new UiManager(WithEngineDocuments({ Manifest: { FileVersion: 1, Documents: [] }, Load: async () => "" }));
		const screen = new ControlsScreen(manager, page);
		page.Deliver("input", { op: "error", message: "early" }); // before the screen is open: nothing to show it on
		page.Deliver("input", snapshot());
		await manager.Show("EngineSettings"); // another screen: not this one's business
		screen.Open();
		await settle();
		page.Deliver("input", snapshot());
		pick(manager, 0);
		Object.defineProperty(navigator, "getGamepads", { configurable: true, value: undefined }); // no Gamepad API
		press(manager, "PadButton");
		frames.shift()!(0);
		const axes = [0.9, 0, 0, 0];
		Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [null, { connected: false, buttons: [], axes: [] }, { connected: true, buttons: [], axes }] });
		frames.shift()!(0);
		expect(fromPage.at(-1)).toMatchObject({ slot: "Gamepad", code: "Pad:LeftStickRight" });
		Object.defineProperty(navigator, "getGamepads", { configurable: true, value: undefined });
		vi.unstubAllGlobals();
	});
});
