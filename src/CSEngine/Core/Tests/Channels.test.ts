// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { ChannelHub } from "../Source/Engine/Core/Channels";

describe("ChannelHub: plugin messages between threads", () => {
	it("posts wait until the thread is connected, then go out in order; later posts go straight out", () => {
		const hub = new ChannelHub();
		hub.Post("ui", { op: "show", id: "Hud" });
		hub.Post("audio", 1);
		const send = vi.fn();
		hub.Connect(send);
		expect(send.mock.calls).toEqual([["ui", { op: "show", id: "Hud" }], ["audio", 1]]);
		hub.Post("ui", 2);
		expect(send).toHaveBeenLastCalledWith("ui", 2);
		expect(hub.Connected).toBe(true);
	});

	it("delivers what arrives to the handlers of that channel only, until they unsubscribe", () => {
		const hub = new ChannelHub();
		const ui = vi.fn();
		const other = vi.fn();
		const off = hub.On("ui", ui);
		hub.On("other", other);
		hub.Deliver("ui", { op: "event" });
		off();
		hub.Deliver("ui", "late");
		hub.Deliver("nobody-listens", 0);
		expect(ui.mock.calls).toEqual([[{ op: "event" }]]);
		expect(other).not.toHaveBeenCalled();
	});
});
