// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { ChannelHub } from "@cse/core/Engine/Core/Channels";
import { nextTick, reactive } from "vue";
import { describe, expect, it, vi } from "vitest";
import { TouchControls } from "../Source/Runtime/TouchControls";

const A = (Name: string, Touch: string, Label = Name) => ({ Name, Label, Category: "", Touch, Binding: { Keyboard: ["", ""], Gamepad: "" } });
const snapshot = {
	op: "bindings", manifest: "FirstPerson", activeMap: "OnFoot",
	maps: [
		{ Name: "OnFoot", Actions: [
			A("MoveForward", "MoveStick"), A("MoveBack", "MoveStick"), A("MoveLeft", "MoveStick"), A("MoveRight", "MoveStick"),
			A("LookLeft", "LookStick"), A("LookRight", "LookStick"), A("LookUp", "LookStick"), A("LookDown", "LookStick"),
			A("Jump", "Button"), A("Fire", "Button", "Shoot"), A("Noclip", "None"),
		] },
		{ Name: "Vehicle", Actions: [A("Horn", "Button")] },
	],
};

function Make() {
	const page = reactive({ State: { loading: { visible: false }, menu: { visible: true } }, Pause: vi.fn(), SetTouchMode: vi.fn() });
	const channels = new ChannelHub();
	const sent: { op: string; [key: string]: unknown; }[] = [];
	channels.Connect((_channel, payload) => sent.push(payload as never));
	const touch = new TouchControls(channels, page);
	const settings = (on: boolean) => channels.Deliver("settings", { op: "definitions", definitions: [], values: { TouchControls: on } });
	const game = (message: unknown) => channels.Deliver("input", message);
	return { page, sent, touch, settings, game };
}

describe("TouchControls: the touch scheme on the page", () => {
	it("the TouchControls setting turns the scheme on and off (the page plays without the mouse then); shown only while playing", async () => {
		const { page, touch, settings } = Make();
		settings(true);
		settings(true); // unchanged: told once
		expect(page.SetTouchMode.mock.calls).toEqual([[true]]);
		expect(touch.State.Visible).toBe(false); // the menu is up
		page.State.menu.visible = false;
		await nextTick();
		expect(touch.State.Visible).toBe(true);
		page.State.loading.visible = true;
		await nextTick();
		expect(touch.State.Visible).toBe(false);
		settings(false);
		page.State.loading.visible = false;
		await nextTick();
		expect([touch.State.Visible, page.SetTouchMode.mock.calls.at(-1)]).toEqual([false, [false]]);
	});

	it("when it shows, it asks the game for the actions of the map in force: sticks for Move and Look, a button for each Button action", async () => {
		const { page, touch, settings, sent, game } = Make();
		settings(true);
		page.State.menu.visible = false;
		await nextTick();
		expect(sent).toEqual([{ op: "request" }]);
		game(snapshot);
		game({ op: "error", message: "x" }); // not for this
		expect([touch.State.MoveStick !== null, touch.State.LookStick !== null]).toEqual([true, true]);
		expect(touch.State.Buttons.map((b) => [b.Action, b.Controller.Label])).toEqual([["Jump", "Jump"], ["Fire", "Shoot"]]);
		game({ ...snapshot, activeMap: "Vehicle" }); // in a car: its actions
		expect([touch.State.MoveStick, touch.State.LookStick, touch.State.Buttons.map((b) => b.Action)]).toEqual([null, null, ["Horn"]]);
		game({ ...snapshot, activeMap: "Boat" }); // a map it doesn't list: nothing
		expect(touch.State.Buttons).toEqual([]);
	});

	it("the sticks press their actions by direction; buttons press theirs; the pause button pauses", async () => {
		const { page, touch, settings, sent, game } = Make();
		settings(true);
		page.State.menu.visible = false;
		await nextTick();
		game(snapshot);
		sent.length = 0;
		touch.State.MoveStick!.Press(20, -40); // up and a little right (radius 40)
		const values = Object.fromEntries(sent.map((m) => [m["action"], Math.round((m["value"] as number) * 100) / 100]));
		expect(values).toEqual({ MoveForward: 0.89, MoveBack: 0, MoveLeft: 0, MoveRight: 0.45 }); // (-40, 20) over its length
		sent.length = 0;
		touch.State.LookStick!.Press(-40, 0);
		expect(sent.find((m) => m["action"] === "LookLeft")!["value"]).toBe(1);
		sent.length = 0;
		touch.State.Buttons[0]!.Controller.Press(7);
		touch.State.Buttons[0]!.Controller.Release(7, true);
		expect(sent).toEqual([{ op: "touch", action: "Jump", value: 1 }, { op: "touch", action: "Jump", value: 0 }]);
		touch.Pause();
		expect(page.Pause).toHaveBeenCalledTimes(1);
	});

	it("Dispose stops listening", () => {
		const { page, touch, settings } = Make();
		touch.Dispose();
		settings(true);
		expect(page.SetTouchMode).not.toHaveBeenCalled();
	});
});

describe("TouchControls: the edges, and the overlay on screen", () => {
	it("the on-screen pause button pauses; other settings messages and a values-less one are fine; a stick action without a direction gets 0", async () => {
		const { page, touch, settings, sent, game } = Make();
		const channels = (touch as unknown as { _channels: ChannelHub; })._channels;
		channels.Deliver("settings", { op: "something" });
		channels.Deliver("settings", { op: "definitions", definitions: [] }); // no values: off (as it was)
		expect(page.SetTouchMode).not.toHaveBeenCalled();
		settings(true);
		page.State.menu.visible = false;
		await nextTick();
		game({ ...snapshot, maps: [{ Name: "OnFoot", Actions: [A("MoveTurbo", "MoveStick")] }] });
		sent.length = 0;
		touch.State.MoveStick!.Press(40, 0);
		expect(sent).toEqual([{ op: "touch", action: "MoveTurbo", value: 0 }]);
		touch.PauseButton.Press(1);
		touch.PauseButton.Release(1, true);
		expect(page.Pause).toHaveBeenCalledTimes(1);
	});

	it("the overlay shows the sticks, the buttons and the pause button while visible; nothing otherwise", async () => {
		const { mount } = await import("@vue/test-utils");
		const { default: WinTouchOverlay } = await import("../Source/Runtime/WinTouchOverlay.vue");
		const { page, touch, settings, game } = Make();
		const view = mount(WinTouchOverlay, { props: { touch } });
		expect(view.find(".cse-touch").exists()).toBe(false);
		settings(true);
		page.State.menu.visible = false;
		await nextTick();
		game(snapshot);
		await nextTick();
		expect(view.findAll(".cse-touch__stick").length).toBe(2);
		expect(view.findAll(".cse-touch__button").map((b) => b.attributes("data-action"))).toEqual(["Jump", "Fire"]);
		expect(view.get(".cse-touch__pause").text()).toBe("II");
		game({ ...snapshot, activeMap: "Vehicle" });
		await nextTick();
		expect(view.findAll(".cse-touch__stick").length).toBe(0);
	});
});

describe("TouchControls: arranging the controls", () => {
	async function Playing() {
		const made = Make();
		made.settings(true);
		made.page.State.menu.visible = false;
		await nextTick();
		made.game(snapshot);
		return made;
	}

	it("every control has a place: the defaults, or where the player put it (the game sends the layout with the actions)", async () => {
		const { touch, game } = await Playing();
		expect(touch.Position("MoveStick")).toEqual({ X: 0.14, Y: 0.78 });
		expect(touch.Position("LookStick")).toEqual({ X: 0.86, Y: 0.78 });
		expect(touch.Position("Pause")).toEqual({ X: 0.95, Y: 0.08 });
		expect([touch.Position("Button:Jump"), touch.Position("Button:Fire")]).toEqual([{ X: 0.92, Y: 0.5 }, { X: 0.82, Y: 0.5 }]);
		game({ ...snapshot, touchLayout: { MoveStick: { X: 0.3, Y: 0.6 } } });
		expect([touch.Position("MoveStick"), touch.Position("LookStick")]).toEqual([{ X: 0.3, Y: 0.6 }, { X: 0.86, Y: 0.78 }]);
		expect(touch.Position("Button:Nothing")).toEqual({ X: 0.5, Y: 0.5 });
	});

	it("arranging shows the controls even in the menu; moving keeps them on the screen; Done keeps the layout and goes back; Reset brings the defaults", async () => {
		const { page, touch, sent } = await Playing();
		touch.Done(); // not arranging: nothing is kept
		expect(sent.filter((m) => m.op === "touch-layout")).toEqual([]);
		page.State.menu.visible = true;
		await nextTick();
		expect(touch.State.Visible).toBe(false);
		const back = vi.fn();
		touch.StartArranging(back);
		await nextTick();
		expect([touch.State.Arranging, touch.State.Visible]).toEqual([true, true]);
		expect(sent.at(-1)).toEqual({ op: "request" });
		touch.MoveItem("MoveStick", 0.4, -0.2);
		expect(touch.Position("MoveStick")).toEqual({ X: 0.4, Y: 0 });
		touch.MoveItem("Button:Jump", 1.5, 0.3);
		touch.Done();
		expect(sent.at(-1)).toEqual({ op: "touch-layout", layout: { MoveStick: { X: 0.4, Y: 0 }, "Button:Jump": { X: 1, Y: 0.3 } } });
		expect([touch.State.Arranging, back.mock.calls.length]).toEqual([false, 1]);
		await nextTick();
		expect(touch.State.Visible).toBe(false); // back to the menu
		touch.StartArranging();
		touch.ResetLayout();
		expect(touch.Position("MoveStick")).toEqual({ X: 0.14, Y: 0.78 });
		touch.Done();
		expect(sent.at(-1)).toEqual({ op: "touch-layout", layout: {} });
	});

	it("on screen: in arranging a control is dragged (and lifted), not pressed; the Done and Reset buttons work", async () => {
		const { mount } = await import("@vue/test-utils");
		const { default: WinTouchOverlay } = await import("../Source/Runtime/WinTouchOverlay.vue");
		const { touch, sent } = await Playing();
		const view = mount(WinTouchOverlay, { props: { touch } });
		await nextTick();
		expect(view.find(".cse-touch__toolbar").exists()).toBe(false);
		const stick = view.get('[data-key="MoveStick"]');
		expect(stick.attributes("style")).toContain("left: 14%; top: 78%");
		touch.StartArranging();
		await nextTick();
		expect(view.classes()).toContain("cse-touch--arranging");
		const root = view.element as HTMLElement;
		root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) });
		const pointer = (type: string, x: number, y: number, id = 4) => {
			const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
			Object.defineProperty(event, "pointerId", { value: id });
			return event;
		};
		const knob = stick.get(".win-joystick").element;
		sent.length = 0;
		knob.dispatchEvent(pointer("pointerdown", 140, 390)); // grabbed at its middle
		await nextTick();
		expect(stick.classes()).toContain("cse-touch__item--dragging");
		stick.element.dispatchEvent(pointer("pointermove", 700, 100, 9)); // another finger: not the one carrying it
		stick.element.dispatchEvent(pointer("pointerup", 700, 100, 9));
		expect(touch.Position("MoveStick")).toEqual({ X: 0.14, Y: 0.78 });
		stick.element.dispatchEvent(pointer("pointermove", 300, 250));
		stick.element.dispatchEvent(pointer("pointerup", 300, 250));
		await nextTick();
		expect(touch.Position("MoveStick")).toEqual({ X: 0.3, Y: 0.5 });
		expect(stick.classes()).not.toContain("cse-touch__item--dragging");
		expect(sent).toEqual([]); // the stick itself didn't move: nothing pressed
		stick.element.dispatchEvent(pointer("pointermove", 900, 50)); // not dragging any more
		expect(touch.Position("MoveStick")).toEqual({ X: 0.3, Y: 0.5 });
		touch.DoneButton.PerformClick();
		expect(sent.at(-1)).toMatchObject({ op: "touch-layout" });
		touch.StartArranging();
		touch.ResetButton.PerformClick();
		expect(touch.Position("MoveStick")).toEqual({ X: 0.14, Y: 0.78 });
		await nextTick();
		const jump = view.get('[data-key="Button:Jump"]');
		jump.get(".win-game-button").element.dispatchEvent(pointer("pointermove", 1, 1)); // a move with nothing grabbed
		touch.State.Arranging = false;
		await nextTick();
		jump.get(".win-game-button").element.dispatchEvent(pointer("pointerdown", 920, 250)); // playing again: it presses
		expect(sent.at(-1)).toEqual({ op: "touch", action: "Jump", value: 1 });
	});
});
