// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { GameButtonController } from "../Source/Controls/GameButtonController";
import { JoystickController } from "../Source/Controls/JoystickController";

describe("JoystickController: a virtual stick", () => {
	it("follows the finger within its radius; X and Y go -1..1, up is negative (as a gamepad's stick)", () => {
		const stick = new JoystickController({ Radius: 40, DeadZone: 0 });
		const moves: [number, number][] = [];
		stick.Events.On("move", (x, y) => moves.push([x, y]));
		stick.Press(20, 0);
		expect([stick.Active, stick.X, stick.Y, stick.KnobX]).toEqual([true, 0.5, 0, 20]);
		stick.MoveTo(0, -80); // past the edge: held at the radius
		expect([stick.X, stick.Y, stick.KnobX, stick.KnobY]).toEqual([0, -1, 0, -40]);
		stick.MoveTo(30, 40); // a diagonal past the edge keeps its direction
		expect([stick.X, stick.Y].map((v) => Math.round(v * 100) / 100)).toEqual([0.6, 0.8]);
		expect(moves).toHaveLength(3);
		stick.MoveTo(30, 40); // the same place: no event
		expect(moves).toHaveLength(3);
	});

	it("a dead zone in the middle; past it the travel is rescaled to start at 0", () => {
		const stick = new JoystickController({ Radius: 100, DeadZone: 0.2 });
		stick.Press(10, 0);
		expect(stick.X).toBe(0);
		stick.MoveTo(60, 0); // 0.6 of the way: (0.6 - 0.2) / 0.8
		expect(stick.X).toBeCloseTo(0.5);
	});

	it("letting go springs the knob back to the middle (Returning, for the animation) and reports 0, then release", () => {
		const stick = new JoystickController({ Radius: 40 });
		const events: string[] = [];
		stick.Events.On("move", (x, y) => events.push(`move ${x} ${y}`));
		stick.Events.On("release", () => events.push("release"));
		stick.Press(0, -40);
		stick.Release();
		expect([stick.Active, stick.Returning, stick.X, stick.Y, stick.KnobX, stick.KnobY]).toEqual([false, true, 0, 0, 0, 0]);
		expect(events).toEqual(["move 0 -1", "move 0 0", "release"]);
		stick.Press(0, 0); // pressing again stops the spring
		expect(stick.Returning).toBe(false);
		stick.Release();
		expect(events.at(-1)).toBe("release"); // nothing moved: only release
		stick.Release(); // not pressed: nothing
		expect(events.filter((e) => e === "release")).toHaveLength(2);
	});

	it("disabled, it doesn't move; the radius can follow the widget's size; defaults", () => {
		const stick = new JoystickController({ Enabled: false });
		stick.Press(30, 0);
		stick.MoveTo(30, 0);
		expect([stick.Active, stick.X]).toEqual([false, 0]);
		const sized = new JoystickController();
		expect([sized.Radius, sized.DeadZone]).toEqual([40, 0.1]);
		sized.SetRadius(60);
		sized.Press(60, 0);
		expect(sized.X).toBe(1);
		sized.SetRadius(-5);
		expect(sized.Radius).toBe(1); // never zero
	});
});

describe("GameButtonController: a game button", () => {
	it("press and release, with click when let go over it; one finger at a time", () => {
		const button = new GameButtonController({ Label: "A" });
		const events: string[] = [];
		for (const name of ["press", "release", "click"] as const) button.Events.On(name, () => events.push(name));
		button.Press(1);
		button.Press(2); // a second finger on a held button: ignored
		expect(button.Pressed).toBe(true);
		button.Release(2, true); // not the finger that holds it
		expect(button.Pressed).toBe(true);
		button.Release(1, true);
		expect([button.Pressed, events]).toEqual([false, ["press", "release", "click"]]);
		button.Press(3);
		button.Release(3, false); // slid off before letting go: no click
		expect(events).toEqual(["press", "release", "click", "press", "release"]);
		button.Release(3, true); // not pressed: nothing
		expect(events).toHaveLength(5);
	});

	it("disabled, it doesn't press; its label can change", () => {
		const button = new GameButtonController({ Enabled: false });
		button.Press(1);
		expect(button.Pressed).toBe(false);
		expect(button.Label).toBe("");
		button.Label = "Jump";
		expect(button.Label).toBe("Jump");
	});
});

describe("WinJoystick and WinGameButton on the page", () => {
	/** A pointer event as the browser sends it (jsdom has no PointerEvent). */
	function Pointer(type: string, x: number, y: number, id = 1): MouseEvent {
		const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
		Object.defineProperty(event, "pointerId", { value: id });
		return event;
	}
	const Box = (element: Element) => { (element as HTMLElement).getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }); };

	it("the stick: a finger drives the knob (one finger), letting go springs it back; disabled, nothing", async () => {
		const { mount } = await import("@vue/test-utils");
		const { default: WinJoystick } = await import("../Source/Components/WinJoystick.vue");
		const controller = new JoystickController({ DeadZone: 0 });
		const view = mount(WinJoystick, { props: { controller } });
		Box(view.element);
		view.element.dispatchEvent(Pointer("pointerdown", 80, 50));
		await view.vm.$nextTick();
		expect(view.classes()).toContain("win-joystick--active");
		expect(controller.X).toBe(1); // 30 px right, a radius of 30 (0.3 of the size)
		expect(view.get(".win-joystick__knob").attributes("style")).toContain("translate(30px, 0px)");
		view.element.dispatchEvent(Pointer("pointerdown", 20, 50, 2)); // a second finger doesn't take it over
		view.element.dispatchEvent(Pointer("pointermove", 20, 50, 2));
		expect(controller.X).toBe(1);
		view.element.dispatchEvent(Pointer("pointermove", 50, 20));
		expect(controller.Y).toBe(-1);
		view.element.dispatchEvent(Pointer("pointerup", 50, 20, 2)); // not the finger that holds it
		expect(controller.Active).toBe(true);
		view.element.dispatchEvent(Pointer("pointerup", 50, 20));
		await view.vm.$nextTick();
		expect(view.classes()).toContain("win-joystick--returning");
		expect(view.emitted("release")).toHaveLength(1);
		controller.SetEnabled(false);
		view.element.dispatchEvent(Pointer("pointerdown", 80, 50, 3));
		expect(controller.Active).toBe(false);
	});

	it("the button: pressed while held, a click when let go over it, none when slid off or cancelled", async () => {
		const { mount } = await import("@vue/test-utils");
		const { default: WinGameButton } = await import("../Source/Components/WinGameButton.vue");
		const controller = new GameButtonController({ Label: "B" });
		const view = mount(WinGameButton, { props: { controller } });
		Box(view.element);
		expect(view.text()).toBe("B");
		view.element.dispatchEvent(Pointer("pointerdown", 50, 50));
		await view.vm.$nextTick();
		expect(view.classes()).toContain("win-game-button--pressed");
		view.element.dispatchEvent(Pointer("pointerup", 50, 50));
		view.element.dispatchEvent(Pointer("pointerdown", 50, 50));
		view.element.dispatchEvent(Pointer("pointerup", 150, 50)); // slid off
		view.element.dispatchEvent(Pointer("pointerdown", 50, 50));
		view.element.dispatchEvent(Pointer("pointercancel", 50, 50));
		expect([view.emitted("press")?.length, view.emitted("release")?.length, view.emitted("click")?.length]).toEqual([3, 3, 1]);
	});

	it("both are document widgets (in the designer's palette): their events reach the document's handlers", async () => {
		const { BuiltInWidgets, WidgetType } = await import("../Source/Documents/Widgets");
		const { CreateNode, NewLayout } = await import("../Source/Documents/Layout");
		const { UiDocument } = await import("../Source/Documents/UiDocument");
		expect([BuiltInWidgets.Get(WidgetType.Joystick)!.Label, BuiltInWidgets.Get(WidgetType.GameButton)!.Label]).toEqual(["Stick (touch)", "Game button (touch)"]);
		const layout = NewLayout("touch");
		layout.Root.Children!.push(CreateNode(WidgetType.Joystick, "Stick", 10, 300), { ...CreateNode(WidgetType.GameButton, "Jump", 600, 340), Props: { Text: "Jump", Enabled: true } });
		const document = new UiDocument(layout);
		const seen: unknown[] = [];
		document.On("Stick", "move", (x, y) => seen.push(["move", x, y]));
		document.On("Jump", "press", () => seen.push("press"));
		document.Controller<JoystickController>("Stick").Press(40, 0);
		document.Controller<GameButtonController>("Jump").Press(1);
		expect(document.Controller<GameButtonController>("Jump").Label).toBe("Jump");
		expect(seen).toEqual([["move", 1, 0], "press"]);
	});
});
