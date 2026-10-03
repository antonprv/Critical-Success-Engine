// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { vi, type MockInstance } from "vitest";
import { Component } from "../Source/Engine/Core/Component";
import type { EngineContext } from "../Source/Engine/Core/EngineContext";
import { EntityWorld } from "../Source/Engine/Core/EntityWorld";
import type { Entity } from "../Source/Engine/Core/Entity";

/** An EntityWorld wired to a bare engine object - enough for entities and components that only need the world. */
export function MakeWorld(extra: Partial<EngineContext> = {}): { engine: EngineContext; world: EntityWorld; } {
	const engine = { ...extra } as { World?: EntityWorld; } & Partial<EngineContext>;
	const world = new EntityWorld(engine as EngineContext);
	engine.World = world;
	return { engine: engine as EngineContext, world };
}

/** Records every hook call as "<tag>:<Hook>" - or "<tag>:<Hook>(<other entity name>)" for the overlap hooks. */
export function MakeProbe(log: string[]): new () => Component & { Tag: string; } {
	return class Probe extends Component {
		public Tag = "";
		private Note(hook: string, other?: Entity): void {
			log.push(`${this.Tag}:${hook}${other ? `(${other.Name})` : ""}`);
		}
		public override Awake(): void { this.Note("Awake"); }
		public override Start(): void { this.Note("Start"); }
		public override Update(): void { this.Note("Update"); }
		public override OnPhysicsUpdate(): void { this.Note("OnPhysicsUpdate"); }
		public override OnInputUpdate(): void { this.Note("OnInputUpdate"); }
		public override OnUIUpdate(): void { this.Note("OnUIUpdate"); }
		public override OnPhysicsSync(): void { this.Note("OnPhysicsSync"); }
		public override OnCollisionEnter(other: Entity): void { this.Note("OnCollisionEnter", other); }
		public override OnCollisionExit(other: Entity): void { this.Note("OnCollisionExit", other); }
		public override OnTriggerEnter(other: Entity): void { this.Note("OnTriggerEnter", other); }
		public override OnTriggerExit(other: Entity): void { this.Note("OnTriggerExit", other); }
		public override OnDestroy(): void { this.Note("OnDestroy"); }
	};
}

/** Silences (and records) what the Logger writes to the console. */
type ConsoleSpy = MockInstance<(...args: unknown[]) => void>;

export function SilenceConsole(): { error: ConsoleSpy; warn: ConsoleSpy; log: ConsoleSpy; debug: ConsoleSpy; } {
	return {
		error: vi.spyOn(console, "error").mockImplementation(() => undefined),
		warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
		log: vi.spyOn(console, "log").mockImplementation(() => undefined),
		debug: vi.spyOn(console, "debug").mockImplementation(() => undefined),
	};
}
