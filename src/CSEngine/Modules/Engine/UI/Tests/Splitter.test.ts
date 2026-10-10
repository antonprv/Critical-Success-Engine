// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { SplitterController } from "../Source/Controls/SplitterController";
import { UseControl } from "../Source/Core/UseControl";
import WinSplitter from "../Source/Components/WinSplitter.vue";

async function pointer(target: Element | Window, type: string, init: MouseEventInit = {}): Promise<void> {
	target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
	await nextTick();
}

describe("SplitterController", () => {
	it("keeps the size between Min and Max and reports changes", () => {
		const splitter = new SplitterController({ Size: 200, Min: 100, Max: 400 });
		const sizes: number[] = [];
		splitter.Events.On("resize", (size) => sizes.push(size));
		splitter.SetSize(50);
		splitter.SetSize(500);
		splitter.SetSize(500);
		splitter.SetSize(250);
		expect(sizes).toEqual([100, 400, 250]);
		expect(new SplitterController({ Size: 10 })).toMatchObject({ Size: 10, Min: 0, Max: Infinity, Step: 10, Reverse: false });
	});

	it("dragging adds the pointer's travel (subtracts it for a panel on the far side); Dragging flags the drag", () => {
		const left = new SplitterController({ Size: 200 });
		const phases: string[] = [];
		left.Events.On("drag-start", () => phases.push("start"));
		left.Events.On("drag-end", () => phases.push("end"));
		left.BeginDrag(500);
		expect(left.Dragging).toBe(true);
		left.DragTo(560);
		left.EndDrag();
		left.EndDrag();
		left.DragTo(900);
		expect([left.Size, left.Dragging, phases]).toEqual([260, false, ["start", "end"]]);

		const right = new SplitterController({ Size: 200, Reverse: true });
		right.BeginDrag(500);
		right.DragTo(440);
		expect(right.Size).toBe(260);
	});

	it("keys: arrows by Step in the pointer's direction, Home / End to the limits; Reset brings back the first size", () => {
		const splitter = new SplitterController({ Size: 200, Min: 100, Max: 300, Step: 20 });
		splitter.KeyDown("ArrowRight");
		splitter.KeyDown("ArrowDown");
		expect(splitter.Size).toBe(240);
		splitter.KeyDown("ArrowLeft");
		splitter.KeyDown("ArrowUp");
		splitter.KeyDown("End");
		expect(splitter.Size).toBe(300);
		splitter.KeyDown("Home");
		splitter.KeyDown("KeyX");
		expect(splitter.Size).toBe(100);
		splitter.Reset();
		expect(splitter.Size).toBe(200);
		const reversed = new SplitterController({ Size: 200, Reverse: true });
		reversed.KeyDown("ArrowLeft");
		expect(reversed.Size).toBe(210);
	});

	it("a disabled splitter doesn't move", () => {
		const splitter = new SplitterController({ Size: 200, Enabled: false });
		splitter.BeginDrag(0);
		splitter.DragTo(100);
		splitter.KeyDown("End");
		expect([splitter.Size, splitter.Dragging]).toEqual([200, false]);
	});
});

describe("WinSplitter", () => {
	it("is a separator with its value; dragging it (without selecting text) and keys change the controller", async () => {
		const controller = UseControl(new SplitterController({ Size: 200, Min: 100, Max: 400 }));
		const wrapper = mount(WinSplitter, { props: { controller }, attachTo: document.body });
		const bar = wrapper.get("[role=separator]");
		expect(bar.attributes()).toMatchObject({ "aria-orientation": "vertical", "aria-valuenow": "200", "aria-valuemin": "100", "aria-valuemax": "400", tabindex: "0" });

		const press = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 300 });
		bar.element.dispatchEvent(press);
		expect(press.defaultPrevented).toBe(true);
		await nextTick();
		expect(bar.classes()).toContain("win-splitter--dragging");
		await pointer(window, "pointermove", { clientX: 350, clientY: 999 });
		await pointer(window, "pointerup");
		expect(controller.Size).toBe(250);
		expect(bar.classes()).not.toContain("win-splitter--dragging");

		await pointer(bar.element, "pointerdown", { button: 2, clientX: 0 });
		expect(controller.Dragging).toBe(false);
		await bar.trigger("keydown", { code: "End" });
		expect(controller.Size).toBe(400);
		await bar.trigger("dblclick");
		expect(controller.Size).toBe(200);
		expect(wrapper.emitted("resize")).toHaveLength(3);
		wrapper.unmount();
	});

	it("a horizontal splitter follows the pointer's Y", async () => {
		const controller = UseControl(new SplitterController({ Size: 100 }));
		const wrapper = mount(WinSplitter, { props: { controller, horizontal: true }, attachTo: document.body });
		const bar = wrapper.get("[role=separator]");
		expect(bar.attributes("aria-orientation")).toBe("horizontal");
		await pointer(bar.element, "pointerdown", { button: 0, clientX: 0, clientY: 50 });
		await pointer(window, "pointermove", { clientX: 999, clientY: 80 });
		await pointer(window, "pointerup");
		expect(controller.Size).toBe(130);
		wrapper.unmount();
	});
});
