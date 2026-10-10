// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { SceneRegistry } from "../Source/Engine/Scenes/SceneRegistry";
import { UiMsg } from "../Source/Workers/Common/CommonEnums";
import { Harness } from "./Harness";

/** Three scenes of one project: one plays with the First Person controls, one names none, one names a manifest that isn't there. */
function Project() {
	const registry = new SceneRegistry()
		.Register({ id: "shooter", name: "Shooter", description: "", input: "FirstPerson", entities: [] })
		.Register({ id: "plain", name: "Plain", description: "", entities: [] })
		.Register({ id: "broken", name: "Broken", description: "", input: "Ghost", entities: [] });
	return new Harness(registry);
}

describe("switching input manifests with the game (level 1)", () => {
	it("a scene puts the manifest it names in use; a scene that names none gets the project's default", async () => {
		const harness = Project();
		expect(harness.runtime.Input.System.ActiveManifest).toBe("Tests"); // the harness project's default, from the start
		await harness.BootToScene(); // the first scene: "shooter"
		expect([harness.runtime.Input.System.ActiveManifest, harness.runtime.Input.System.ActiveMap]).toEqual(["FirstPerson", "OnFoot"]);
		expect(harness.runtime.Input.Map.Codes("Fire")).toEqual(["Mouse0", "Pad:RT"]);
		harness.ui.Receive({ type: UiMsg.LoadScene, sceneId: "plain" });
		await harness.Pump();
		expect(harness.runtime.Input.System.ActiveManifest).toBe("Tests");
	});

	it("a scene naming a manifest the project doesn't have fails to load, saying which", async () => {
		const harness = Project();
		await harness.BootToScene();
		harness.ui.Receive({ type: UiMsg.LoadScene, sceneId: "broken" });
		await harness.Pump();
		expect(harness.UiMessages(UiMsg.LoadFailed).map((m) => m["message"])).toEqual(['The project has no input manifest "Ghost"']);
		expect(harness.runtime.Input.System.ActiveManifest).toBe("FirstPerson"); // what was in use stays
	});
});

describe("the player's bindings in the storage", () => {
	it("the runtime loads them (key Input) once the project's input manifests are in", async () => {
		const { MemoryBackend, SettingsStorage } = await import("../Source/Engine/Storage/SettingsStorage");
		const storage = new SettingsStorage(new MemoryBackend());
		await storage.Open();
		storage.Set("Input", { FirstPerson: { OnFoot: { Fire: { Keyboard: ["KeyF", ""], Gamepad: "Pad:RT" } } } });
		const harness = new Harness(new SceneRegistry().Register({ id: "s", name: "S", description: "", input: "FirstPerson", entities: [] }), undefined, undefined, storage);
		await harness.BootToScene();
		expect(harness.runtime.Input.Map.Codes("Fire")).toEqual(["KeyF", "Pad:RT"]);
		expect(harness.runtime.Context.Storage).toBe(storage);
	});
});

describe("the controls screen's channel in the runtime", () => {
	it("a request from the page is answered with the bindings of the manifest in use", async () => {
		const { ChannelHub } = await import("../Source/Engine/Core/Channels");
		const channels = new ChannelHub();
		const harness = new Harness(new SceneRegistry().Register({ id: "s", name: "S", description: "", input: "CoinHunt", entities: [] }), channels);
		await harness.BootToScene();
		harness.ui.Receive({ type: UiMsg.Channel, channel: "input", payload: { op: "request" } });
		const answer = harness.ui.sent.filter((m) => (m as { channel?: string; }).channel === "input").at(-1) as { payload: { manifest: string; maps: { Actions: { Name: string; }[]; }[]; }; };
		expect(answer.payload.manifest).toBe("CoinHunt");
		expect(answer.payload.maps[0]!.Actions.map((a) => a.Name)).toContain("Restart");
	});
});
