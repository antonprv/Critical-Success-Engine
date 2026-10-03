// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

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
	/** Fraction (0..1) of the current physics step that has elapsed - how far render poses are interpolated. */
	RenderAlpha: number;
}

/**
 * Everything a script can reach through `this.Engine`. One instance per GameLogic worker; built by GameLogicRuntime.
 * This is deliberately a flat bag of services (no globals, no singletons) so tests can assemble their own.
 */
export interface EngineContext {
	readonly World: EntityWorld;
	readonly Physics: PhysicsService;
	readonly Render: RenderService;
	readonly Input: InputService;
	readonly Ui: UiService;
	readonly Audio: AudioService;
	readonly Scenes: SceneManager;
	readonly Time: TimeInfo;
}
