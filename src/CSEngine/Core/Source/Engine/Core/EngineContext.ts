// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { DataStream } from "@cse/datastream";
import type { Container } from "@cse/di";
import type { ScriptRuntime } from "@cse/scripting";
import type { DataAssets } from "../Data/DataAsset";
import type { SettingsStorage } from "../Storage/SettingsStorage";
import type { SettingsService } from "../Services/SettingsService";
import type { AudioService } from "../Services/AudioService";
import type { InputService } from "../Services/InputService";
import type { PhysicsService } from "../Services/PhysicsService";
import type { RenderService } from "../Services/RenderService";
import type { UiService } from "../Services/UiService";
import type { SceneManager } from "../Scenes/SceneManager";
import type { EntityWorld } from "./EntityWorld";

export interface TimeInfo {
	/** Seconds of the last rendered frame. */
	Delta: number;
	/** Seconds per physics step (constant). */
	FixedDelta: number;
	/** Seconds since the engine started (advances with rendered frames). */
	Elapsed: number;
	FrameCount: number;
	PhysicsStepCount: number;
	/**
	 * Fraction (0..1) of the current physics step that has elapsed - how far
	 * render poses are interpolated.
	 */
	RenderAlpha: number;
}

/**
 * Everything a script can reach through `this.Engine`. One instance per
 * GameLogic worker; built by GameLogicRuntime. This is deliberately a flat bag
 * of services (no globals, no singletons) so tests can assemble their own.
 */
export interface EngineContext {
	readonly World: EntityWorld;
	readonly Physics: PhysicsService;
	readonly Render: RenderService;
	readonly Input: InputService;
	readonly Ui: UiService;
	/**
	 * Game settings: the engine's general ones and the current game's own (the
	 * player changes them in the menu).
	 */
	readonly Settings: SettingsService;
	/**
	 * Where the project keeps what the player chose (as Unity's PlayerPrefs):
	 * JSON by key, kept between sessions.
	 */
	readonly Storage: SettingsStorage;
	/**
	 * The project's data assets (.csedata), loaded at start: typed parameters
	 * editable without a rebuild.
	 */
	readonly Data: DataAssets;
	readonly Audio: AudioService;
	readonly Scenes: SceneManager;
	readonly Time: TimeInfo;
	/**
	 * The DataStream: tagged messages between components that don't know each
	 * other, in TypeScript and in C# alike (`Publish`, `Subscribe`, `Observe`).
	 */
	readonly Stream: DataStream;
	/**
	 * The runtime of the project's C# components (`CSharp( "Class" )` in a
	 * manifest); null when the project has none or they failed to load.
	 */
	readonly Scripts: ScriptRuntime | null;
	/**
	 * The DI container components are injected from (`@Inject` fields, before
	 * Awake): the current scene's, falling back to the game's root container;
	 * null where nothing installed one (a bare test world).
	 */
	readonly Container: Container | null;
}
