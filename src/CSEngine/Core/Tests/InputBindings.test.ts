// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { ChannelHub } from "../Source/Engine/Core/Channels";
import { InputBindings, InputChannel } from "../Source/Engine/Input/InputBindings";
import { type InputManifest } from "../Source/Engine/Input/InputActions";
import { InputService } from "../Source/Engine/Services/InputService";
import { MemoryBackend, SettingsStorage } from "../Source/Engine/Storage/SettingsStorage";

const City: InputManifest = {
	FileVersion: 1, Name: "City", DefaultMap: "OnFoot",
	ActionMaps: [
		{ Name: "OnFoot", Actions: [{ Name: "Jump", Label: "Jump", Category: "Movement", Default: { Keyboard: ["Space", ""], Gamepad: "Pad:A" } }] },
		{ Name: "Vehicle", Actions: [{ Name: "Horn", Label: "Horn", Category: "Driving", Default: { Keyboard: ["KeyH", ""], Gamepad: "Pad:LS" } }] },
	],
};

async function Make() {
	const input = new InputService();
	const system = input.System;
	system.Install({ Manifests: { City }, Default: "City" });
	const storage = new SettingsStorage(new MemoryBackend());
	await storage.Open();
	const channels = new ChannelHub();
	const told: { op: string; [key: string]: unknown; }[] = [];
	channels.Connect((channel, payload) => { if (channel === InputChannel) told.push(payload as never); });
	new InputBindings(input, storage, channels);
	const page = (message: unknown) => channels.Deliver(InputChannel, message);
	return { input, system, storage, told, page };
}

describe("InputBindings: the page's controls screen talks to the input system", () => {
	it("on request, tells every map of the manifest in use, its actions and their bindings", async () => {
		const { told, page } = await Make();
		page({ op: "request" });
		expect(told.at(-1)).toEqual({
			op: "bindings", manifest: "City", activeMap: "OnFoot", touchLayout: {},
			maps: [
				{ Name: "OnFoot", Actions: [{ Name: "Jump", Label: "Jump", Category: "Movement", Touch: "Button", Binding: { Keyboard: ["Space", ""], Gamepad: "Pad:A" } }] },
				{ Name: "Vehicle", Actions: [{ Name: "Horn", Label: "Horn", Category: "Driving", Touch: "Button", Binding: { Keyboard: ["KeyH", ""], Gamepad: "Pad:LS" } }] },
			],
		});
	});

	it("rebinding changes that map's action, is kept in the storage at once (key Input), and the page is told", async () => {
		const { system, storage, told, page } = await Make();
		page({ op: "rebind", map: "Vehicle", action: "Horn", slot: "KeyboardSecondary", code: "KeyB" });
		expect(system.MapOf("City", "Vehicle").Binding("Horn")).toEqual({ Keyboard: ["KeyH", "KeyB"], Gamepad: "Pad:LS" });
		expect((storage.Get("Input", {}) as never)["City"]["Vehicle"]["Horn"]).toEqual({ Keyboard: ["KeyH", "KeyB"], Gamepad: "Pad:LS" });
		expect(told.at(-1)!["op"]).toBe("bindings");
		page({ op: "rebind", map: "OnFoot", action: "Jump", slot: "Gamepad", code: "" }); // cleared
		expect(system.Map.Codes("Jump")).toEqual(["Space"]);
	});

	it("reset brings back one action's defaults, or every map's", async () => {
		const { system, page } = await Make();
		page({ op: "rebind", map: "OnFoot", action: "Jump", slot: "KeyboardPrimary", code: "KeyJ" });
		page({ op: "rebind", map: "Vehicle", action: "Horn", slot: "KeyboardPrimary", code: "KeyB" });
		page({ op: "reset", map: "OnFoot", action: "Jump" });
		expect([system.MapOf("City", "OnFoot").Codes("Jump"), system.MapOf("City", "Vehicle").Codes("Horn")]).toEqual([["Space", "Pad:A"], ["KeyB", "Pad:LS"]]);
		page({ op: "reset" });
		expect(system.MapOf("City", "Vehicle").Codes("Horn")).toEqual(["KeyH", "Pad:LS"]);
	});

	it("what doesn't exist is reported to the page; with no manifest in use there is nothing to tell; other messages are ignored", async () => {
		const { told, page } = await Make();
		page({ op: "rebind", map: "Boat", action: "Row", slot: "Gamepad", code: "Pad:A" });
		expect(told.at(-1)).toEqual({ op: "error", message: 'Input manifest "City" has no action map "Boat"' });
		page({ op: "rebind", map: "OnFoot", action: "Fly", slot: "Gamepad", code: "Pad:A" });
		expect(told.at(-1)).toEqual({ op: "error", message: 'No input action "Fly"' });
		page({ op: "something" });
		const channels = new ChannelHub();
		const sent: unknown[] = [];
		channels.Connect((_c, payload) => sent.push(payload));
		new InputBindings(new InputService(), new SettingsStorage(new MemoryBackend()), channels);
		channels.Deliver(InputChannel, { op: "request" });
		expect(sent).toEqual([{ op: "bindings", manifest: null, activeMap: null, touchLayout: {}, maps: [] }]);
	});
});

describe("InputBindings: the touch scheme presses actions", () => {
	it("a touch message presses the action from the screen (and nothing is sent back: a stick sends many)", async () => {
		const { input, told, page } = await Make();
		input.CapturePlayerInput = true;
		page({ op: "touch", action: "Jump", value: 1 });
		expect(input.IsActionDown("Jump")).toBe(true);
		page({ op: "touch", action: "Jump", value: 0 });
		expect(input.IsActionDown("Jump")).toBe(false);
		expect(told).toEqual([]);
	});
});

describe("InputBindings: the player's touch layout, per input manifest", () => {
	it("is kept in the storage (key TouchLayout) for the manifest in use and comes with every snapshot; another manifest has its own", async () => {
		const { system, storage, told, page } = await Make();
		page({ op: "request" });
		expect(told.at(-1)!["touchLayout"]).toEqual({});
		page({ op: "touch-layout", layout: { MoveStick: { X: 0.2, Y: 0.6 }, "Button:Jump": { X: 0.9, Y: 0.5 } } });
		expect(told.at(-1)!["touchLayout"]).toEqual({ MoveStick: { X: 0.2, Y: 0.6 }, "Button:Jump": { X: 0.9, Y: 0.5 } });
		expect(storage.Get("TouchLayout", {})).toEqual({ City: { MoveStick: { X: 0.2, Y: 0.6 }, "Button:Jump": { X: 0.9, Y: 0.5 } } });
		system.Register("Arena", { FileVersion: 1, Name: "Arena", DefaultMap: "Main", ActionMaps: [{ Name: "Main", Actions: [] }] });
		system.UseManifest("Arena");
		page({ op: "request" });
		expect(told.at(-1)!["touchLayout"]).toEqual({});
		page({ op: "touch-layout", layout: {} }); // reset: the defaults again
		expect(storage.Get("TouchLayout", {})).toEqual({ City: { MoveStick: { X: 0.2, Y: 0.6 }, "Button:Jump": { X: 0.9, Y: 0.5 } }, Arena: {} });
	});

	it("a stored layout that isn't one reads as none; with no manifest in use, nothing is kept", async () => {
		const { storage, told, page } = await Make();
		storage.Set("TouchLayout", "broken");
		page({ op: "request" });
		expect(told.at(-1)!["touchLayout"]).toEqual({});
		const channels = new ChannelHub();
		const store = new SettingsStorage(new MemoryBackend());
		new InputBindings(new InputService(), store, channels);
		channels.Deliver(InputChannel, { op: "touch-layout", layout: { MoveStick: { X: 0.5, Y: 0.5 } } });
		expect(store.Has("TouchLayout")).toBe(false);
	});
});
