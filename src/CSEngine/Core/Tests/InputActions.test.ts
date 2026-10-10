// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { InputMap, InputSystem, PadAxes, PadButtons, ParseInputManifest, type ActionDefinition, type InputManifest } from "../Source/Engine/Input/InputActions";
import { InputService } from "../Source/Engine/Services/InputService";
import { InputEvtType } from "../Source/Workers/Common/CommonEnums";

const A = (Name: string, keys: [string, string], Gamepad = "", Category = "Movement"): ActionDefinition => ({ Name, Label: Name, Category, Default: { Keyboard: keys, Gamepad } });

/** A game with two action maps: on foot, and in a car (as in GTA). */
const City: InputManifest = {
	FileVersion: 1, Name: "City", DefaultMap: "OnFoot",
	ActionMaps: [
		{ Name: "OnFoot", Actions: [A("MoveForward", ["KeyW", "ArrowUp"], "Pad:LeftStickUp"), A("Jump", ["Space", ""], "Pad:A"), A("EnterCar", ["KeyF", ""], "Pad:Y", "Actions")] },
		{ Name: "Vehicle", Actions: [A("Accelerate", ["KeyW", ""], "Pad:RT"), A("Horn", ["KeyH", ""], "Pad:LS"), A("ExitCar", ["KeyF", ""], "Pad:Y", "Actions")] },
	],
};
const Arena: InputManifest = { FileVersion: 1, Name: "Arena", DefaultMap: "Main", ActionMaps: [{ Name: "Main", Actions: [A("Fire", ["Mouse0", ""], "Pad:RT", "Actions")] }] };

describe("input manifests (a project's Content/Input/<Id>.input.json)", () => {
	it("round-trip; fill in what may be left out", () => {
		expect(ParseInputManifest(JSON.stringify(City))).toEqual(City);
		expect(ParseInputManifest(JSON.stringify({ Name: "Bare", ActionMaps: [{ Name: "Only", Actions: [{ Name: "Go", Default: { Keyboard: ["KeyG"] } }] }] }))).toEqual({
			FileVersion: 1, Name: "Bare", DefaultMap: "Only",
			ActionMaps: [{ Name: "Only", Actions: [{ Name: "Go", Label: "Go", Category: "", Default: { Keyboard: ["KeyG", ""], Gamepad: "" } }] }],
		});
	});

	it("say what is wrong", () => {
		const reason = (value: unknown) => { try { ParseInputManifest(typeof value === "string" ? value : JSON.stringify(value)); return "parsed"; } catch (e) { return (e as Error).message; } };
		expect(reason("{")).toBe("Not an input manifest: not JSON");
		expect(reason({})).toBe("Not an input manifest: Name must be a string");
		expect(reason({ Name: "X" })).toBe("Not an input manifest: it has no action maps");
		expect(reason({ Name: "X", ActionMaps: [{ Actions: [] }] })).toBe("Not an input manifest: an action map has no Name");
		expect(reason({ Name: "X", ActionMaps: [{ Name: "A", Actions: [] }, { Name: "A", Actions: [] }] })).toBe('Not an input manifest: two action maps are called "A"');
		expect(reason({ Name: "X", ActionMaps: [{ Name: "A", Actions: [{ Label: "x" }] }] })).toBe('Not an input manifest: an action in "A" has no Name');
		expect(reason({ Name: "X", ActionMaps: [{ Name: "A", Actions: [A("Go", ["K", ""]), A("Go", ["L", ""])] }] })).toBe('Not an input manifest: "A" has two actions called "Go"');
		expect(reason({ Name: "X", DefaultMap: "Nope", ActionMaps: [{ Name: "A", Actions: [] }] })).toBe('Not an input manifest: DefaultMap "Nope" is not one of its action maps');
		expect(reason({ Name: "X", ActionMaps: [{ Name: "A", Actions: [{ Name: "Go", Default: { Keyboard: [1, 2] } }] }] })).toBe('Not an input manifest: "Go" in "A" has a key that is not text');
		expect(reason({ FileVersion: 9, Name: "X", ActionMaps: [{ Name: "A", Actions: [] }] })).toBe("Not an input manifest: FileVersion 9 is newer than this engine understands (1)");
		expect(reason({ Name: "X", ActionMaps: "no" })).toBe("Not an input manifest: it has no action maps");
		expect(reason("[]")).toBe("Not an input manifest: Name must be a string");
		expect(reason({ Name: "X", ActionMaps: [{ Name: "A" }] })).toBe("parsed"); // a map without actions: an empty map
	});

	it("knows the standard gamepad's buttons and axes", () => {
		expect(PadButtons.slice(0, 4)).toEqual(["Pad:A", "Pad:B", "Pad:X", "Pad:Y"]);
		expect(PadButtons).toHaveLength(17);
		expect(PadAxes).toEqual(["Pad:LeftStickLeft", "Pad:LeftStickRight", "Pad:LeftStickUp", "Pad:LeftStickDown", "Pad:RightStickLeft", "Pad:RightStickRight", "Pad:RightStickUp", "Pad:RightStickDown"]);
	});
});

describe("InputMap: one action map and what presses its actions", () => {
	it("starts from the map's defaults; nothing of its own (the engine defines no actions)", () => {
		expect(new InputMap().Actions).toEqual([]);
		const map = new InputMap(City.ActionMaps[0]!.Actions);
		expect(map.Actions.map((a) => a.Name)).toEqual(["MoveForward", "Jump", "EnterCar"]);
		expect(map.Binding("MoveForward")).toEqual({ Keyboard: ["KeyW", "ArrowUp"], Gamepad: "Pad:LeftStickUp" });
		expect(map.Codes("Jump")).toEqual(["Space", "Pad:A"]);
		expect([map.Codes("Nope"), map.Binding("Nope")]).toEqual([[], undefined]);
	});

	it("rebinds main, spare and gamepad; resets one or all; saves and loads (skipping what doesn't fit)", () => {
		const map = new InputMap(City.ActionMaps[0]!.Actions);
		map.Rebind("Jump", "KeyboardPrimary", "KeyJ");
		map.Rebind("Jump", "KeyboardSecondary", "Numpad0");
		map.Rebind("Jump", "Gamepad", "Pad:B");
		expect(map.Binding("Jump")).toEqual({ Keyboard: ["KeyJ", "Numpad0"], Gamepad: "Pad:B" });
		expect(() => map.Rebind("Nope", "Gamepad", "Pad:A")).toThrow('No input action "Nope"');
		const saved = map.Save();
		map.Reset("Jump");
		expect(map.Binding("Jump")).toEqual({ Keyboard: ["Space", ""], Gamepad: "Pad:A" });
		map.Rebind("Jump", "KeyboardPrimary", "");
		expect(map.Codes("Jump")).toEqual(["Pad:A"]); // an empty slot binds nothing
		map.Reset();
		const other = new InputMap(City.ActionMaps[0]!.Actions);
		other.Load({ ...saved, Ghost: { Keyboard: ["A", "B"], Gamepad: "" }, EnterCar: { Keyboard: "x" } as never });
		expect([other.Binding("Jump"), other.Binding("EnterCar")]).toEqual([{ Keyboard: ["KeyJ", "Numpad0"], Gamepad: "Pad:B" }, City.ActionMaps[0]!.Actions[2]!.Default]);
	});
});

describe("InputSystem: the project's input manifests (level 1) and their action maps (level 2)", () => {
	function System() {
		const system = new InputSystem();
		system.Register("City", City);
		system.Register("Arena", Arena);
		return system;
	}

	it("nothing is active until a manifest is used: no actions at all", () => {
		const system = new InputSystem();
		expect([system.ActiveManifest, system.ActiveMap, system.Map.Actions]).toEqual([null, null, []]);
		expect(System().Ids).toEqual(["City", "Arena"]);
	});

	it("using a manifest makes its default map active; switching maps changes the actions in force", () => {
		const system = System();
		system.UseManifest("City");
		expect([system.ActiveManifest, system.ActiveMap]).toEqual(["City", "OnFoot"]);
		expect(system.Map.Codes("EnterCar")).toEqual(["KeyF", "Pad:Y"]);
		system.UseActionMap("Vehicle"); // got into a car
		expect(system.ActiveMap).toBe("Vehicle");
		expect([system.Map.Codes("Accelerate"), system.Map.Codes("Jump")]).toEqual([["KeyW", "Pad:RT"], []]);
		system.UseManifest("Arena"); // another game: its own default map
		expect([system.ActiveManifest, system.ActiveMap, system.Map.Codes("Fire")]).toEqual(["Arena", "Main", ["Mouse0", "Pad:RT"]]);
		system.UseManifest("City");
		expect(system.ActiveMap).toBe("OnFoot"); // a game starts on its default map
	});

	it("rebinding belongs to that map of that manifest, and outlives switching; all of it saves and loads", () => {
		const system = System();
		system.UseManifest("City");
		system.Map.Rebind("Jump", "KeyboardSecondary", "KeyJ");
		system.UseActionMap("Vehicle");
		system.Map.Rebind("Horn", "KeyboardPrimary", "KeyB");
		system.UseManifest("Arena");
		system.UseManifest("City");
		expect(system.Map.Binding("Jump")!.Keyboard).toEqual(["Space", "KeyJ"]);
		expect(system.MapOf("City", "Vehicle").Binding("Horn")!.Keyboard).toEqual(["KeyB", ""]);
		const saved = system.Save();
		const other = System();
		other.Load({ ...saved, Ghost: {} });
		expect(other.MapOf("City", "Vehicle").Binding("Horn")!.Keyboard).toEqual(["KeyB", ""]);
		expect(other.MapOf("City", "OnFoot").Binding("Jump")!.Keyboard).toEqual(["Space", "KeyJ"]);
	});

	it("says what doesn't exist; registering an Id again replaces it", () => {
		const system = System();
		expect(() => system.UseManifest("Nope")).toThrow('The project has no input manifest "Nope"');
		expect(() => system.UseActionMap("OnFoot")).toThrow("No input manifest is in use");
		system.UseManifest("City");
		expect(() => system.UseActionMap("Boat")).toThrow('Input manifest "City" has no action map "Boat"');
		expect(() => system.MapOf("City", "Boat")).toThrow('Input manifest "City" has no action map "Boat"');
		system.Register("Arena", { ...Arena, Name: "Arena 2" });
		expect(system.Ids).toEqual(["City", "Arena"]);
		system.UseManifest("Arena");
		expect(system.Map.Codes("Fire")).toEqual(["Mouse0", "Pad:RT"]);
	});
});

describe("InputService: actions of the active map, from the keyboard, the mouse and a gamepad at once", () => {
	function Service() {
		const input = new InputService();
		input.System.Register("City", City);
		input.System.Register("Arena", Arena);
		input.System.UseManifest("City");
		input.CapturePlayerInput = true;
		return input;
	}
	const pad = (buttons: number[] = [], axes: number[] = []) => ({ kind: InputEvtType.Gamepad as const, buttons, axes });

	it("an action is down while any of its keys or buttons is; just pressed once; actions of other maps don't exist", () => {
		const input = Service();
		input.Handle({ kind: InputEvtType.KeyDown, code: "ArrowUp" }); // the spare key
		expect([input.IsActionDown("MoveForward"), input.ActionJustPressed("MoveForward"), input.ActionJustPressedPhysics("MoveForward")]).toEqual([true, true, true]);
		input.EndFrame();
		input.EndPhysicsStep();
		expect([input.IsActionDown("MoveForward"), input.ActionJustPressed("MoveForward")]).toEqual([true, false]);
		input.Handle({ kind: InputEvtType.KeyDown, code: "KeyH" });
		expect(input.IsActionDown("Horn")).toBe(false); // Vehicle's
		input.System.UseActionMap("Vehicle");
		expect(input.IsActionDown("Horn")).toBe(true);
	});

	it("gamepad buttons press actions past half way; sticks give analog values past the dead zone", () => {
		const input = Service();
		const buttons = Array(17).fill(0);
		buttons[0] = 1;
		input.Handle(pad(buttons, [0.1, -0.8, 0, 0]));
		expect([input.IsActionDown("Jump"), input.ActionJustPressed("Jump")]).toEqual([true, true]);
		expect(input.ActionValue("MoveForward")).toBeCloseTo(0.75); // (0.8 - 0.2) / 0.8
		input.System.UseActionMap("Vehicle");
		buttons[7] = 0.3; // RT, not past half way: analog only
		input.Handle(pad(buttons, [0, 0, 0, 0]));
		expect([input.ActionValue("Accelerate"), input.IsActionDown("Accelerate")]).toEqual([0.3, false]);
		input.Handle(pad([], []));
		expect(input.ActionValue("Accelerate")).toBe(0);
	});

	it("the move vector reads the conventional Move actions of the active map (keys and stick), never longer than 1", () => {
		const input = new InputService();
		const moves: InputManifest = { FileVersion: 1, Name: "M", DefaultMap: "Main", ActionMaps: [{ Name: "Main", Actions: [
			A("MoveForward", ["KeyW", ""], "Pad:LeftStickUp"), A("MoveBack", ["KeyS", ""], "Pad:LeftStickDown"),
			A("MoveLeft", ["KeyA", ""], "Pad:LeftStickLeft"), A("MoveRight", ["KeyD", ""], "Pad:LeftStickRight"),
		] }] };
		input.System.Register("M", moves);
		input.System.UseManifest("M");
		input.CapturePlayerInput = true;
		input.Handle({ kind: InputEvtType.KeyDown, code: "KeyD" });
		input.Handle({ kind: InputEvtType.KeyDown, code: "KeyW" });
		expect(input.GetMoveVector().map((v) => Math.round(v * 1000) / 1000)).toEqual([0.707, -0.707]);
		input.Handle({ kind: InputEvtType.KeyUp, code: "KeyD" });
		input.Handle({ kind: InputEvtType.KeyUp, code: "KeyW" });
		input.Handle(pad([], [-0.6, 0, 0, 0]));
		expect(input.GetMoveVector().map((v) => Math.round(v * 100) / 100)).toEqual([-0.5, 0]);
		expect(input.GetInputVector()).toEqual(input.GetMoveVector());
		input.CapturePlayerInput = false;
		expect([input.GetMoveVector(), input.ActionValue("MoveLeft")]).toEqual([[0, 0], 0]);
	});
});

describe("InputSystem: installing a project, and the edges", () => {
	it("Install takes the project's manifests and puts the default in use; a project with none has nothing in use", () => {
		const system = new InputSystem();
		system.Install({ Manifests: { City, Arena }, Default: "Arena" });
		expect([system.Ids, system.Default, system.ActiveManifest, system.ActiveMap]).toEqual([["City", "Arena"], "Arena", "Arena", "Main"]);
		const empty = new InputSystem();
		empty.Install({ Manifests: {}, Default: "" });
		expect([empty.Default, empty.ActiveManifest]).toEqual([null, null]);
	});

	it("registering a manifest again after its maps were used drops them: the new actions are in force", () => {
		const system = new InputSystem();
		system.Register("Arena", Arena);
		system.Register("City", City);
		system.MapOf("City", "OnFoot").Rebind("Jump", "KeyboardSecondary", "KeyJ");
		system.UseManifest("Arena");
		system.Map.Rebind("Fire", "KeyboardPrimary", "KeyX");
		system.Register("Arena", { ...Arena, ActionMaps: [{ Name: "Main", Actions: [A("Block", ["KeyB", ""])] }] });
		expect([system.Map.Codes("Fire"), system.Map.Codes("Block")]).toEqual([[], ["KeyB"]]);
		expect(system.MapOf("City", "OnFoot").Binding("Jump")!.Keyboard).toEqual(["Space", "KeyJ"]); // another manifest's: kept
	});

	it("loading keeps the maps a save doesn't mention; an action with no default binding binds nothing", () => {
		const system = new InputSystem();
		system.Register("City", City);
		system.MapOf("City", "Vehicle").Rebind("Horn", "KeyboardPrimary", "KeyB");
		system.Load({ City: { OnFoot: {} } });
		expect(system.MapOf("City", "Vehicle").Binding("Horn")!.Keyboard).toEqual(["KeyB", ""]);
		const bare = ParseInputManifest(JSON.stringify({ Name: "B", ActionMaps: [{ Name: "M", Actions: [{ Name: "Wave" }] }] }));
		expect(bare.ActionMaps[0]!.Actions[0]!.Default).toEqual({ Keyboard: ["", ""], Gamepad: "" });
	});
});
