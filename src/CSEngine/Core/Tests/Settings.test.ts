// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { ChannelHub } from "../Source/Engine/Core/Channels";
import { GeneralSettings, SettingsChannel, SettingsService, type SettingDefinition } from "../Source/Engine/Services/SettingsService";

const EdgeScroll: SettingDefinition = { Key: "EdgeScroll", Label: "Scroll at the screen edges", Category: "Camera", Kind: "Toggle", Default: false };
const Fov: SettingDefinition = { Key: "FieldOfView", Label: "Field of view", Category: "Camera", Kind: "Number", Default: 70, Min: 60, Max: 100, Step: 5 };
const TimeLimit: SettingDefinition = { Key: "TimeLimit", Label: "Time limit", Category: "Coin Hunt", Kind: "Choice", Default: "60", Choices: ["30", "60", "90"] };

function Wired() {
	const channels = new ChannelHub();
	const sent: { op: string; [key: string]: unknown; }[] = [];
	channels.Connect((channel, payload) => { if (channel === SettingsChannel) sent.push(payload as never); });
	return { channels, sent, settings: new SettingsService(channels) };
}

describe("SettingsService: the engine's general settings and a game's own", () => {
	it("the general ones are always there, at their defaults; the page is told", () => {
		const { settings, sent } = Wired();
		expect(settings.Definitions.map((d) => d.Key)).toEqual(GeneralSettings.map((d) => d.Key));
		expect([settings.Toggle("TouchControls"), settings.Number("MouseSensitivity"), settings.Toggle("InvertLook"), settings.Number("PadLookSpeed")]).toEqual([false, 1, false, 1]);
		expect(sent.at(-1)).toEqual({ op: "definitions", definitions: settings.Definitions, values: settings.Values });
	});

	it("a game declares its own when its scene starts; they go with the scene, the player's values stay", () => {
		const { settings, sent } = Wired();
		expect(settings.Declare(EdgeScroll)).toBe(false);
		settings.Declare(EdgeScroll); // twice: once
		expect(settings.Definitions.at(-1)).toEqual(EdgeScroll);
		expect(settings.Definitions.filter((d) => d.Key === "EdgeScroll")).toHaveLength(1);
		settings.Set("EdgeScroll", true);
		settings.ClearScene();
		expect(settings.Definitions.map((d) => d.Key)).toEqual(GeneralSettings.map((d) => d.Key));
		expect(settings.Declare(EdgeScroll)).toBe(true); // the next time the scene comes, the player's choice is back
		expect(sent.at(-1)!["op"]).toBe("definitions");
	});

	it("the player's values live in the storage (key Settings): earlier sessions' apply, also to settings declared later; changes are kept", async () => {
		const { MemoryBackend, SettingsStorage } = await import("../Source/Engine/Storage/SettingsStorage");
		const storage = new SettingsStorage(new MemoryBackend());
		await storage.Open();
		storage.Set("Settings", { MouseSensitivity: 2, FieldOfView: 85, Bogus: "x" });
		const channels = new ChannelHub();
		const settings = new SettingsService(channels, storage);
		expect(settings.Number("MouseSensitivity")).toBe(2);
		expect(settings.Declare(Fov)).toBe(85);
		channels.Deliver(SettingsChannel, { op: "set", key: "FieldOfView", value: 90 });
		expect(settings.Number("FieldOfView")).toBe(90);
		expect(storage.Get("Settings", {})).toEqual({ MouseSensitivity: 2, FieldOfView: 90, Bogus: "x" }); // the player's choices, also of other games
		channels.Deliver(SettingsChannel, { op: "nonsense" });
		storage.Set("Settings", "broken" as never);
		expect(new SettingsService(undefined, storage).Number("MouseSensitivity")).toBe(1); // a broken entry: defaults
	});

	it("keeps values sane: numbers within their range and on their step, choices from the list, the wrong kind gives the default", () => {
		const { settings } = Wired();
		settings.Declare(Fov);
		settings.Declare(TimeLimit);
		settings.Set("FieldOfView", 200);
		expect(settings.Number("FieldOfView")).toBe(100);
		settings.Set("FieldOfView", 71);
		expect(settings.Number("FieldOfView")).toBe(70); // on the step
		settings.Set("TimeLimit", "45");
		expect(settings.Text("TimeLimit")).toBe("60"); // not a choice: unchanged
		settings.Set("TimeLimit", "90");
		expect(settings.Text("TimeLimit")).toBe("90");
		settings.Set("InvertLook", "yes");
		expect(settings.Toggle("InvertLook")).toBe(false);
		settings.Set("Nope", 1); // unknown: kept for when it is declared
		expect(settings.Get("Nope")).toBeUndefined();
		const loose: SettingDefinition = { Key: "Loose", Label: "L", Category: "", Kind: "Number", Default: 3 };
		settings.Set("Loose", 7.25);
		expect(settings.Declare(loose)).toBe(7.25); // no range, no step: as given
		expect([settings.Number("Missing"), settings.Toggle("Missing"), settings.Text("Missing")]).toEqual([0, false, ""]);
	});

	it("a step without a lower bound counts from 0; a choice with no options takes nothing", () => {
		const settings = new SettingsService();
		settings.Declare({ Key: "Halves", Label: "H", Category: "", Kind: "Number", Default: 1, Step: 0.5 });
		settings.Set("Halves", 1.3);
		expect(settings.Number("Halves")).toBe(1.5);
		settings.Declare({ Key: "Empty", Label: "E", Category: "", Kind: "Choice", Default: "a" });
		settings.Set("Empty", "b");
		expect(settings.Text("Empty")).toBe("a");
	});

	it("works without a page (a test engine): nothing is sent anywhere", () => {
		const settings = new SettingsService();
		settings.Declare(EdgeScroll);
		settings.Set("EdgeScroll", true);
		expect(settings.Toggle("EdgeScroll")).toBe(true);
	});
});
