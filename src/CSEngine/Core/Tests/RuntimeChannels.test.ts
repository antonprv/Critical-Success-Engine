// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { ChannelHub } from "../Source/Engine/Core/Channels";
import { UiMsg } from "../Source/Workers/Common/CommonEnums";
import { CreateRegistry, Harness } from "./Harness";

describe("plugin channels in the game logic runtime", () => {
	it("what the game posts goes to the UI worker; what arrives from it reaches the channel's handlers", () => {
		const channels = new ChannelHub();
		channels.Post("ui", { op: "show", id: "Hud" }); // before the runtime exists: it waits
		const harness = new Harness(CreateRegistry(), channels);
		expect(harness.ui.sent).toContainEqual({ type: UiMsg.Channel, channel: "ui", payload: { op: "show", id: "Hud" } });
		const handler = vi.fn();
		channels.On("ui", handler);
		harness.ui.Receive({ type: UiMsg.Channel, channel: "ui", payload: { op: "event" } });
		expect(handler).toHaveBeenCalledWith({ op: "event" });
	});

	it("the engine module of every thread has its channels", async () => {
		const { default: EngineModule } = await import("../Source/Engine/EngineModule");
		expect(new EngineModule().Channels).toBeInstanceOf(ChannelHub);
	});
});
