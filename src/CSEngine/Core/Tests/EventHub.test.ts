// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { CancelableEvent, EventHub } from "../Source/Engine/Core/EventHub";

describe("EventHub", () => {
	type Events = { change: [value: number, previous: number]; ping: []; };

	it("calls subscribers in subscription order with the event arguments", () => {
		const hub = new EventHub<Events>();
		const seen: string[] = [];
		hub.On("change", (value, previous) => seen.push(`a ${value} ${previous}`));
		hub.On("change", (value) => seen.push(`b ${value}`));
		hub.Emit("change", 2, 1);
		expect(seen).toEqual(["a 2 1", "b 2"]);
	});

	it("On returns an unsubscribe function; Once fires a single time", () => {
		const hub = new EventHub<Events>();
		const handler = vi.fn();
		const off = hub.On("ping", handler);
		const once = vi.fn();
		hub.Once("ping", once);

		hub.Emit("ping");
		off();
		off(); // twice is harmless
		hub.Emit("ping");
		expect(handler).toHaveBeenCalledTimes(1);
		expect(once).toHaveBeenCalledTimes(1);
		expect(hub.ListenerCount("ping")).toBe(0);
	});

	it("a handler that unsubscribes during an emit does not disturb the others", () => {
		const hub = new EventHub<Events>();
		const seen: string[] = [];
		const off = hub.On("ping", () => { seen.push("first"); off(); });
		hub.On("ping", () => seen.push("second"));
		hub.Emit("ping");
		hub.Emit("ping");
		expect(seen).toEqual(["first", "second", "second"]);
	});

	it("emitting with no subscribers is fine, and Clear removes everything", () => {
		const hub = new EventHub<Events>();
		expect(() => hub.Emit("ping")).not.toThrow();
		hub.On("ping", vi.fn());
		hub.On("change", vi.fn());
		hub.Clear();
		expect(hub.ListenerCount("ping") + hub.ListenerCount("change")).toBe(0);
	});

	it("CancelableEvent records cancellation", () => {
		const event = new CancelableEvent();
		expect(event.Canceled).toBe(false);
		event.Cancel();
		expect(event.Canceled).toBe(true);
	});
});
