// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * Input actions, as Unreal's Enhanced Input: game code asks for "Jump", not for Space. The engine defines no actions and
 * no bindings: the project does, in its input manifests (Content/Input/<Id>.input.json). A manifest holds action maps -
 * on foot, in a car, in a plane - each with its actions; an action has a main and a spare keyboard/mouse binding
 * ("KeyW", "Mouse0"...) and one gamepad binding ("Pad:A", "Pad:LeftStickUp"...), and the player rebinds them.
 *
 * Two levels: which manifest is in use (a project with several games, as Games Sample, switches with the game), and
 * which action map of it (the game switches when the player gets into a car).
 */

/** The standard gamepad's buttons, by their index in the Gamepad API's standard mapping. */
export const PadButtons: readonly string[] = [
	"Pad:A", "Pad:B", "Pad:X", "Pad:Y", "Pad:LB", "Pad:RB", "Pad:LT", "Pad:RT", "Pad:Back", "Pad:Start",
	"Pad:LS", "Pad:RS", "Pad:DUp", "Pad:DDown", "Pad:DLeft", "Pad:DRight", "Pad:Home",
];

/** The sticks, one code per direction (axes 0..3: left X, left Y, right X, right Y; up is negative Y). */
export const PadAxes: readonly string[] = [
	"Pad:LeftStickLeft", "Pad:LeftStickRight", "Pad:LeftStickUp", "Pad:LeftStickDown",
	"Pad:RightStickLeft", "Pad:RightStickRight", "Pad:RightStickUp", "Pad:RightStickDown",
];

export interface ActionBinding {
	/** Main and spare key or mouse button; "" binds nothing. */
	Keyboard: [string, string];
	Gamepad: string;
}

/** Which on-screen control presses an action in the touch scheme. */
export type TouchKind = "MoveStick" | "LookStick" | "Button" | "None";
const TouchKinds: readonly TouchKind[] = ["MoveStick", "LookStick", "Button", "None"];

export interface ActionDefinition {
	Name: string;
	Label: string;
	/** Where the settings list it ("Movement", "Camera", a game's own...). */
	Category: string;
	Default: ActionBinding;
	/** Its on-screen control; omitted: Move* actions the movement stick, Look* the look stick, the rest a button. */
	Touch?: TouchKind;
}

/** The on-screen control of an action (its Touch, or the default by its name). */
export function TouchKindOf(action: ActionDefinition): TouchKind {
	if (action.Touch) return action.Touch;
	if (action.Name.startsWith("Move")) return "MoveStick";
	return action.Name.startsWith("Look") ? "LookStick" : "Button";
}

export interface ActionMapDefinition {
	Name: string;
	Actions: ActionDefinition[];
}

export interface InputManifest {
	FileVersion: number;
	Name: string;
	/** The action map in force when the manifest comes into use. */
	DefaultMap: string;
	ActionMaps: ActionMapDefinition[];
}

export type BindingSlot = "KeyboardPrimary" | "KeyboardSecondary" | "Gamepad";

export const InputManifestFileVersion = 1;

//#region the manifest file

class ManifestError extends Error {
	public constructor(reason: string) {
		super(`Not an input manifest: ${reason}`);
	}
}

const IsObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const Text = (value: unknown, fallback: string): string => (typeof value === "string" ? value : fallback);

function ReadAction(raw: unknown, map: string): ActionDefinition {
	if (!IsObject(raw) || typeof raw["Name"] !== "string") throw new ManifestError(`an action in "${map}" has no Name`);
	const name = raw["Name"];
	const binding = IsObject(raw["Default"]) ? raw["Default"] : {};
	const keys = Array.isArray(binding["Keyboard"]) ? binding["Keyboard"] : [];
	if (!keys.every((key) => typeof key === "string")) throw new ManifestError(`"${name}" in "${map}" has a key that is not text`);
	const touch = raw["Touch"];
	if (touch !== undefined && !TouchKinds.includes(touch as TouchKind)) throw new ManifestError(`"${name}" in "${map}" has Touch "${String(touch)}" (${TouchKinds.slice(0, 3).join(", ")} or None)`);
	return {
		Name: name, Label: Text(raw["Label"], name), Category: Text(raw["Category"], ""),
		Default: { Keyboard: [Text(keys[0], ""), Text(keys[1], "")], Gamepad: Text(binding["Gamepad"], "") },
		...(touch === undefined ? {} : { Touch: touch as TouchKind }),
	};
}

function ReadMap(raw: unknown): ActionMapDefinition {
	if (!IsObject(raw) || typeof raw["Name"] !== "string") throw new ManifestError("an action map has no Name");
	const name = raw["Name"];
	const actions = (Array.isArray(raw["Actions"]) ? raw["Actions"] : []).map((action) => ReadAction(action, name));
	const seen = new Set<string>();
	for (const action of actions) {
		if (seen.has(action.Name)) throw new ManifestError(`"${name}" has two actions called "${action.Name}"`);
		seen.add(action.Name);
	}
	return { Name: name, Actions: actions };
}

/** Reads an input manifest; throws "Not an input manifest: ..." with what is wrong. */
export function ParseInputManifest(text: string): InputManifest {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new ManifestError("not JSON");
	}
	const record = IsObject(raw) ? raw : {};
	const version = typeof record["FileVersion"] === "number" ? record["FileVersion"] : InputManifestFileVersion;
	if (version > InputManifestFileVersion) throw new ManifestError(`FileVersion ${version} is newer than this engine understands (${InputManifestFileVersion})`);
	if (typeof record["Name"] !== "string") throw new ManifestError("Name must be a string");
	if (!Array.isArray(record["ActionMaps"]) || record["ActionMaps"].length === 0) throw new ManifestError("it has no action maps");
	const maps = record["ActionMaps"].map(ReadMap);
	const names = new Set<string>();
	for (const map of maps) {
		if (names.has(map.Name)) throw new ManifestError(`two action maps are called "${map.Name}"`);
		names.add(map.Name);
	}
	const defaultMap = Text(record["DefaultMap"], maps[0]!.Name);
	if (!names.has(defaultMap)) throw new ManifestError(`DefaultMap "${defaultMap}" is not one of its action maps`);
	return { FileVersion: version, Name: record["Name"], DefaultMap: defaultMap, ActionMaps: maps };
}

//#endregion

const Copy = (binding: ActionBinding): ActionBinding => ({ Keyboard: [binding.Keyboard[0], binding.Keyboard[1]], Gamepad: binding.Gamepad });

/** One action map: its actions and what presses them now (the defaults, or the player's). */
export class InputMap {
	private readonly _bindings = new Map<string, ActionBinding>();

	public constructor(public readonly Actions: readonly ActionDefinition[] = []) {
		this.Reset();
	}

	public Binding(name: string): ActionBinding | undefined {
		const binding = this._bindings.get(name);
		return binding && Copy(binding);
	}

	/** Every key, button or stick direction that presses the action. */
	public Codes(name: string): string[] {
		const binding = this._bindings.get(name);
		return binding ? [...binding.Keyboard, binding.Gamepad].filter((code) => code !== "") : [];
	}

	/** Binds a slot of an action ("" leaves it empty). */
	public Rebind(name: string, slot: BindingSlot, code: string): void {
		const binding = this._bindings.get(name);
		if (!binding) throw new Error(`No input action "${name}"`);
		if (slot === "Gamepad") binding.Gamepad = code;
		else binding.Keyboard[slot === "KeyboardPrimary" ? 0 : 1] = code;
	}

	/** Back to the defaults: one action, or all. */
	public Reset(name?: string): void {
		for (const action of this.Actions) {
			if (name === undefined || action.Name === name) this._bindings.set(action.Name, Copy(action.Default));
		}
	}

	public Save(): Record<string, ActionBinding> {
		return Object.fromEntries([...this._bindings].map(([name, binding]) => [name, Copy(binding)]));
	}

	/** Takes saved bindings back; unknown actions and broken entries are skipped. */
	public Load(saved: Record<string, ActionBinding>): void {
		for (const [name, binding] of Object.entries(saved)) {
			const valid = this._bindings.has(name) && Array.isArray(binding?.Keyboard) && binding.Keyboard.length === 2
				&& binding.Keyboard.every((code) => typeof code === "string") && typeof binding.Gamepad === "string";
			if (valid) this._bindings.set(name, Copy(binding));
		}
	}
}

/** A project's input manifests by Id, and the one in use at start (what the build hands the engine). */
export interface ProjectInput {
	Manifests: Record<string, InputManifest>;
	Default: string;
}

/** The project's input manifests by Id; the one in use (level 1) and its action map in force (level 2). */
export class InputSystem {
	private readonly _manifests = new Map<string, InputManifest>();
	/** Every map of every manifest, made once: the player's rebinding outlives switching. */
	private readonly _maps = new Map<string, InputMap>();
	private readonly _empty = new InputMap();
	private _manifest: string | null = null;
	private _map: string | null = null;
	/** The project's default manifest (scenes that name none use it). */
	public Default: string | null = null;

	public get Ids(): string[] { return [...this._manifests.keys()]; }
	public get ActiveManifest(): string | null { return this._manifest; }
	public get ActiveMap(): string | null { return this._map; }

	/** A registered manifest (what a controls screen lists). */
	public ManifestOf(id: string): InputManifest | undefined { return this._manifests.get(id); }

	/** The action map in force (an empty one before any manifest is in use). */
	public get Map(): InputMap {
		return this._manifest === null ? this._empty : this.MapOf(this._manifest, this._map!);
	}

	/** Takes the project's manifests and puts its default one in use. */
	public Install(project: ProjectInput): void {
		for (const [id, manifest] of Object.entries(project.Manifests)) this.Register(id, manifest);
		this.Default = project.Default || null;
		if (this.Default) this.UseManifest(this.Default);
	}

	/** Adds (or replaces) a manifest of the project. */
	public Register(id: string, manifest: InputManifest): void {
		this._manifests.set(id, manifest);
		for (const key of [...this._maps.keys()]) if (key.startsWith(`${id}\u0000`)) this._maps.delete(key);
	}

	/** Level 1: puts a manifest in use, on its default map (a project switches when the game changes). */
	public UseManifest(id: string): void {
		const manifest = this._manifests.get(id);
		if (!manifest) throw new Error(`The project has no input manifest "${id}"`);
		this._manifest = id;
		this._map = manifest.DefaultMap;
	}

	/** Level 2: another action map of the manifest in use (on foot, in a car...). */
	public UseActionMap(name: string): void {
		if (this._manifest === null) throw new Error("No input manifest is in use");
		this.MapOf(this._manifest, name);
		this._map = name;
	}

	/** A map of a manifest, with the player's bindings (what a settings screen edits). */
	public MapOf(id: string, mapName: string): InputMap {
		const key = `${id}\u0000${mapName}`;
		const existing = this._maps.get(key);
		if (existing) return existing;
		const definition = this._manifests.get(id)?.ActionMaps.find((map) => map.Name === mapName);
		if (!definition) throw new Error(`Input manifest "${id}" has no action map "${mapName}"`);
		const map = new InputMap(definition.Actions);
		this._maps.set(key, map);
		return map;
	}

	/** The player's bindings of every map of every manifest. */
	public Save(): Record<string, Record<string, Record<string, ActionBinding>>> {
		return Object.fromEntries([...this._manifests].map(([id, manifest]) =>
			[id, Object.fromEntries(manifest.ActionMaps.map((map) => [map.Name, this.MapOf(id, map.Name).Save()]))]));
	}

	public Load(saved: Record<string, Record<string, Record<string, ActionBinding>>>): void {
		for (const [id, maps] of Object.entries(saved)) {
			const manifest = this._manifests.get(id);
			if (!manifest) continue;
			for (const map of manifest.ActionMaps) if (maps[map.Name]) this.MapOf(id, map.Name).Load(maps[map.Name]!);
		}
	}
}
