// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { EngineContext } from "./EngineContext";
import type { Entity } from "./Entity";
import type { Transform } from "./Transform";
import type { InputService } from "../Services/InputService";
import type { UiService } from "../Services/UiService";

/**
 * Base class of everything that can be attached to an {@link Entity} - this is the ONE extension point scripting hangs
 * off. Subclass it, override the hooks you care about, list the class in a scene manifest:
 *
 * ```ts
 * class Spinner extends Component {
 *     public Speed = 1;                          // plain public fields are what the manifest's `props` sets
 *
 *     public override Update(dt: number): void {
 *         this.Transform.Rotation = Quat.FromAxisAngle(Vec3.Up(), this.Speed * dt).Mul(this.Transform.Rotation);
 *     }
 * }
 * // in a manifest:  Comp(Spinner, { Speed: 3 })
 * ```
 *
 * Components must have a constructor without parameters (props are applied right after construction).
 *
 * Hook order, per entity: components are visited top to bottom in the order the manifest lists them.
 *   1. Awake                 - once, right after the whole batch (e.g. a scene) has been created. Other entities exist.
 *   2. Start                 - once, before this component's first Update / OnPhysicsUpdate.
 *   3. OnInputUpdate / Update / OnUIUpdate - every rendered frame, in that order.
 *   4. OnPhysicsUpdate       - every fixed physics step (not tied to the frame rate).
 *   5. OnCollisionEnter/Exit, OnTriggerEnter/Exit - when the physics step reports a new/ended overlap.
 *   6. OnDestroy             - once, when the entity is destroyed (or the scene unloads).
 *
 * `OnPhysicsSync` is engine-level plumbing: physics body components use it to copy the latest simulation snapshot into
 * `Transform` before any script's OnPhysicsUpdate runs. Scripts normally never override it.
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

	public OnPhysicsSync(): void { /* engine hook */ }

	/** Set by the engine once Awake / Start ran; used for lifecycle bookkeeping. */
	public _awoken = false;
	public _started = false;
}

export type ComponentConstructor<T extends Component = Component> = new () => T;
