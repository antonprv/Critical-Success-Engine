// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { ResizeEdge, WindowController, WindowState } from "../Source/Controls/WindowController";
import { WindowManager } from "../Source/Controls/WindowManager";

const Win = (options: ConstructorParameters<typeof WindowController>[0] = {}) =>
	new WindowController({ Title: "Notepad", X: 100, Y: 50, Width: 300, Height: 200, ...options });

describe("WindowController", () => {
	it("starts normal at its bounds, with sensible defaults", () => {
		const window = Win();
		expect(window).toMatchObject({ Title: "Notepad", X: 100, Y: 50, Width: 300, Height: 200, State: WindowState.Normal, Active: false });
		expect(window).toMatchObject({ Resizable: true, Minimizable: true, Maximizable: true, Closable: true, MinWidth: 120, MinHeight: 60 });
		expect(new WindowController()).toMatchObject({ Title: "", X: 0, Y: 0, Width: 320, Height: 240 });
	});

	it("minimize, maximize, restore and toggle, remembering the normal bounds", () => {
		const window = Win();
		const states: WindowState[] = [];
		window.Events.On("state-change", (state) => states.push(state));

		window.Maximize({ Width: 1024, Height: 768 });
		expect([window.X, window.Y, window.Width, window.Height]).toEqual([0, 0, 1024, 768]);
		window.Maximize({ Width: 1024, Height: 768 });
		window.Restore();
		expect([window.X, window.Y, window.Width, window.Height]).toEqual([100, 50, 300, 200]);
		window.Minimize();
		window.Minimize();
		window.Restore();
		window.ToggleMaximize({ Width: 800, Height: 600 });
		window.ToggleMaximize({ Width: 800, Height: 600 });
		window.Restore();
		expect(states).toEqual([WindowState.Maximized, WindowState.Normal, WindowState.Minimized, WindowState.Normal, WindowState.Maximized, WindowState.Normal]);
	});

	it("restoring a window minimized from maximized brings it back maximized", () => {
		const window = Win();
		window.Maximize({ Width: 800, Height: 600 });
		window.Minimize();
		window.Restore();
		expect(window.State).toBe(WindowState.Maximized);
	});

	it("respects Minimizable / Maximizable", () => {
		const window = Win({ Minimizable: false, Maximizable: false });
		window.Minimize();
		window.Maximize({ Width: 800, Height: 600 });
		expect(window.State).toBe(WindowState.Normal);
	});

	it("closing asks first ('closing' can be canceled), then closes once", () => {
		const window = Win();
		const closed = vi.fn();
		window.Events.On("close", closed);
		const veto = window.Events.On("closing", (event) => event.Cancel());
		expect(window.RequestClose()).toBe(false);
		expect(window.Closed).toBe(false);
		veto();
		expect(window.RequestClose()).toBe(true);
		expect(window.RequestClose()).toBe(false);
		expect(closed).toHaveBeenCalledOnce();
		expect(Win({ Closable: false }).RequestClose()).toBe(false);
	});

	it("dragging the title bar moves the window; not while maximized", () => {
		const window = Win();
		const moves: number[][] = [];
		const phases: string[] = [];
		window.Events.On("move", (x, y) => moves.push([x, y]));
		window.Events.On("drag-start", () => phases.push("start"));
		window.Events.On("drag-end", () => phases.push("end"));

		window.BeginDrag(110, 60);
		expect(window.Dragging).toBe(true);
		window.DragTo(150, 80);
		window.DragTo(150, 80);
		window.EndDrag();
		window.EndDrag();
		window.DragTo(500, 500);
		expect([window.X, window.Y]).toEqual([140, 70]);
		expect(moves).toEqual([[140, 70]]);
		expect(phases).toEqual(["start", "end"]);

		window.Maximize({ Width: 800, Height: 600 });
		window.BeginDrag(10, 10);
		expect(window.Dragging).toBe(false);
	});

	it("resizing from each edge and corner, never below the minimum size, only when resizable and normal", () => {
		const cases: [ResizeEdge, number, number, number[]][] = [
			[ResizeEdge.Right, 50, 0, [100, 50, 350, 200]],
			[ResizeEdge.Bottom, 0, 40, [100, 50, 300, 240]],
			[ResizeEdge.Left, -20, 0, [80, 50, 320, 200]],
			[ResizeEdge.Top, 0, -10, [100, 40, 300, 210]],
			[ResizeEdge.TopLeft, 10, 10, [110, 60, 290, 190]],
			[ResizeEdge.TopRight, 10, 10, [100, 60, 310, 190]],
			[ResizeEdge.BottomLeft, 10, 10, [110, 50, 290, 210]],
			[ResizeEdge.BottomRight, 10, 10, [100, 50, 310, 210]],
		];
		for (const [edge, dx, dy, bounds] of cases) {
			const window = Win();
			window.BeginResize(edge, 0, 0);
			window.ResizeTo(dx, dy);
			window.EndResize();
			expect([window.X, window.Y, window.Width, window.Height], `edge ${edge}`).toEqual(bounds);
		}

		const small = Win();
		small.BeginResize(ResizeEdge.TopLeft, 0, 0);
		small.ResizeTo(1000, 1000);
		expect([small.X, small.Y, small.Width, small.Height]).toEqual([280, 190, 120, 60]); // the right/bottom edge stays put

		const fixed = Win({ Resizable: false });
		fixed.BeginResize(ResizeEdge.Right, 0, 0);
		expect(fixed.Resizing).toBe(false);
		fixed.ResizeTo(50, 0);
		fixed.EndResize();
		expect(fixed.Width).toBe(300);
	});

	it("resize events report the new size; MoveTo / SetSize set bounds directly", () => {
		const window = Win();
		const sizes: number[][] = [];
		const phases: string[] = [];
		window.Events.On("resize", (w, h) => sizes.push([w, h]));
		window.Events.On("resize-start", () => phases.push("start"));
		window.Events.On("resize-end", () => phases.push("end"));
		window.BeginResize(ResizeEdge.Right, 0, 0);
		window.ResizeTo(10, 0);
		window.EndResize();
		window.SetSize(50, 10);
		window.MoveTo(1, 2);
		window.MoveTo(1, 2);
		expect(sizes).toEqual([[310, 200], [120, 60]]);
		expect(phases).toEqual(["start", "end"]);
		expect([window.X, window.Y]).toEqual([1, 2]);
	});
});

describe("WindowManager", () => {
	it("stacks windows: the last added or activated one is on top and active, the others inactive", () => {
		const manager = new WindowManager();
		const a = Win({ Title: "A" }), b = Win({ Title: "B" }), c = Win({ Title: "C" });
		manager.Add(a);
		manager.Add(b);
		manager.Add(c);
		expect(manager.Windows.map((w) => w.Title)).toEqual(["A", "B", "C"]);
		expect(manager.ActiveWindow).toBe(c);
		expect([a.Active, b.Active, c.Active]).toEqual([false, false, true]);
		expect([manager.ZIndexOf(a), manager.ZIndexOf(c)]).toEqual([1, 3]);

		manager.Activate(a);
		expect(manager.Windows.map((w) => w.Title)).toEqual(["B", "C", "A"]);
		expect(manager.ActiveWindow).toBe(a);
		expect(c.Active).toBe(false);
	});

	it("emits active-change, activate and deactivate", () => {
		const manager = new WindowManager();
		const a = Win(), b = Win();
		const log: string[] = [];
		a.Events.On("activate", () => log.push("a on"));
		a.Events.On("deactivate", () => log.push("a off"));
		manager.Events.On("active-change", (w) => log.push(`active ${w?.Title ?? "none"}`));
		manager.Add(a);
		manager.Add(b);
		manager.Activate(b);
		expect(log).toEqual(["a on", "active Notepad", "a off", "active Notepad"]);
	});

	it("a closed window leaves, and the next one down becomes active; minimizing does the same", () => {
		const manager = new WindowManager();
		const a = Win({ Title: "A" }), b = Win({ Title: "B" });
		manager.Add(a);
		manager.Add(b);
		b.RequestClose();
		expect(manager.Windows).toEqual([a]);
		expect(manager.ActiveWindow).toBe(a);

		const c = Win({ Title: "C" });
		manager.Add(c);
		c.Minimize();
		expect(manager.ActiveWindow).toBe(a);
		a.Minimize();
		expect(manager.ActiveWindow).toBeNull();
		manager.Activate(c); // activating a minimized window restores it
		expect(c.State).toBe(WindowState.Normal);
		expect(manager.ActiveWindow).toBe(c);
	});

	it("new windows cascade from the previous one; unknown windows are ignored", () => {
		const manager = new WindowManager({ CascadeOffset: 24 });
		const a = new WindowController({ X: 10, Y: 20 });
		const b = new WindowController();
		manager.Add(a);
		manager.Add(b, { Cascade: true });
		expect([b.X, b.Y]).toEqual([34, 44]);
		manager.Activate(Win());
		manager.Remove(Win());
		expect(manager.Windows).toHaveLength(2);
		expect(manager.ZIndexOf(Win())).toBe(0);
		expect(new WindowManager().ActiveWindow).toBeNull();

		const first = new WindowController({ X: 5, Y: 5 });
		const lone = new WindowManager();
		lone.Add(first, { Cascade: true }); // nothing to cascade from
		expect([first.X, first.Y]).toEqual([5, 5]);
	});
});

describe("WindowManager task order", () => {
	it("keeps windows in the order they were added (the taskbar order), whatever the z-order", () => {
		const manager = new WindowManager();
		const a = new WindowController({ Title: "A" }), b = new WindowController({ Title: "B" }), c = new WindowController({ Title: "C" });
		manager.Add(a);
		manager.Add(b);
		manager.Add(c);
		manager.Activate(a);
		expect(manager.TaskOrder.map((w) => w.Title)).toEqual(["A", "B", "C"]);
		b.RequestClose();
		expect(manager.TaskOrder.map((w) => w.Title)).toEqual(["A", "C"]);
	});
});
