// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { EngineContext } from "./EngineContext";
import type { Entity } from "./Entity";
import type { Transform } from "./Transform";
import type { InputService } from "../Services/InputService";
import type { UiService } from "../Services/UiService";

/**
 * Base class of everything attached to an {@link Entity}: subclass it, override the hooks you need, list it in a scene
 * manifest (`Comp(Spinner, { Speed: 3 })` sets public fields after the parameterless constructor).
 *
 * Components run top to bottom in manifest order:
 *   Awake once, after the whole batch exists; Start once, before the first update;
 *   OnInputUpdate, Update, OnUIUpdate every rendered frame; OnPhysicsUpdate every physics step;
 *   OnCollision* / OnTrigger* when an overlap starts or ends; OnDestroy once.
 * `OnPhysicsSync` is for physics body components (copy the snapshot into Transform); scripts don't override it.
 */
export abstract class Component {
	/** Set by the engine before Awake. */
	public Entity!: Entity;

	/** Disabled components are skipped by every per-frame/per-step hook (Awake/Start/OnDestroy still run). */
	public Enabled = true;

	public get Engine(): EngineContext { return this.Entity.Engine; }
	public get Transform(): Transform { return this.Entity.Transform; }

	public Awake(): void { /* hook */ }
	public Start(): void { /* hook */ }
	public Update(_dt: number): void { /* hook */ }
	public OnPhysicsUpdate(_dt: number): void { /* hook */ }
	public OnInputUpdate(_input: InputService, _dt: number): void { /* hook */ }
	public OnUIUpdate(_ui: UiService, _dt: number): void { /* hook */ }
	public OnCollisionEnter(_other: Entity): void { /* hook */ }
	public OnCollisionExit(_other: Entity): void { /* hook */ }
	public OnTriggerEnter(_other: Entity): void { /* hook */ }
	public OnTriggerExit(_other: Entity): void { /* hook */ }
	public OnDestroy(): void { /* hook */ }
	/** The entity was switched back on (`Entity.Active = true`), e.g. taken out of an EntityPool. */
	public OnEnable(): void { /* hook */ }
	/** The entity was switched off (`Entity.Active = false`), e.g. returned to an EntityPool. */
	public OnDisable(): void { /* hook */ }

	public OnPhysicsSync(): void { /* engine hook */ }

	/** Set by the engine once Awake / Start ran; used for lifecycle bookkeeping. */
	public _awoken = false;
	public _started = false;
}

export type ComponentConstructor<T extends Component = Component> = new () => T;
