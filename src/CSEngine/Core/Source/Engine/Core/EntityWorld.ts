// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Logger } from "../../Logging/Logger";
import { Quat } from "../Math/Quat";
import { Vec3 } from "../Math/Vec3";
import type { InputService } from "../Services/InputService";
import type { UiService } from "../Services/UiService";
import type { Component } from "./Component";
import type { EngineContext } from "./EngineContext";
import { Entity } from "./Entity";
import type { EntityManifest } from "./EntityManifest";

type Hook = (component: Component) => void;

/**
 * The live set of entities and the driver of every component hook. All iteration is "entities in spawn order, each
 * entity's components top to bottom" (the manifest order) - that determinism is the contract scripts can rely on.
 *
 * Structural changes are deferred so no hook ever sees the collection change under its feet: entities spawned during a
 * pass are picked up by the next pass, and Destroy() takes effect (OnDestroy + removal) at the end of the pass.
 */
export class EntityWorld {
	private readonly _engine: EngineContext;
	private readonly _byId = new Map<number, Entity>();
	private _ordered: Entity[] = [];

	private readonly _awakeQueue: Component[] = [];
	private readonly _startQueue: Component[] = [];
	private readonly _destroyQueue: Entity[] = [];

	private _nextEntityId = 1;

	/** Entities that draw something - registered by MeshRenderer, read when building each frame. */
	public readonly Renderables = new Map<number, Entity>();

	public constructor(engine: EngineContext) {
		this._engine = engine;
	}

	public get Entities(): readonly Entity[] { return this._ordered; }
	public get Count(): number { return this._ordered.length; }

	public Get(id: number): Entity | undefined { return this._byId.get(id); }

	public FindByName(name: string): Entity | undefined {
		return this._ordered.find((entity) => entity.Name === name && !entity.IsDestroyed);
	}

	public FindByTag(tag: string): Entity[] {
		return this._ordered.filter((entity) => entity.Tags.has(tag) && !entity.IsDestroyed);
	}

	//#region Spawning / destroying

	/** Creates the entity and its components; Awake/Start follow on the next FlushLifecycle. */
	public Spawn(manifest: EntityManifest): Entity {
		const entity = new Entity(this._nextEntityId++, manifest.name, this._engine);

		if (manifest.position) entity.Transform.Teleport(Vec3.FromTuple(manifest.position));
		if (manifest.rotation) entity.Transform.Teleport(entity.Transform.Position, Quat.FromTuple(manifest.rotation));
		for (const tag of manifest.tags ?? []) entity.Tags.add(tag);

		this._byId.set(entity.Id, entity);
		this._ordered.push(entity);

		for (const definition of manifest.components) {
			const component = new definition.type();
			if (definition.props) Object.assign(component, definition.props);
			entity.AddComponent(component);
		}
		return entity;
	}

	public NotifyComponentAdded(component: Component): void {
		this._awakeQueue.push(component);
		this._startQueue.push(component);
	}

	public QueueDestroy(entity: Entity): void {
		this._destroyQueue.push(entity);
	}

	/** Runs pending Awake hooks (all of them first), then pending Start hooks - repeat until nothing new was spawned. */
	public FlushLifecycle(): void {
		while (this._awakeQueue.length > 0 || this._startQueue.length > 0) {
			while (this._awakeQueue.length > 0) {
				const component = this._awakeQueue.shift()!;
				if (component.Entity.IsDestroyed) continue;
				component._awoken = true;
				EntityWorld.Run(component, "Awake", (c) => c.Awake());
			}

			while (this._startQueue.length > 0 && this._awakeQueue.length === 0) {
				const component = this._startQueue.shift()!;
				if (component.Entity.IsDestroyed) continue;
				component._started = true;
				EntityWorld.Run(component, "Start", (c) => c.Start());
			}
		}
	}

	/** Runs OnDestroy for everything queued with Entity.Destroy() and drops those entities. */
	public FlushDestroyed(): void {
		if (this._destroyQueue.length === 0) return;

		const doomed = this._destroyQueue.splice(0, this._destroyQueue.length);
		for (const entity of doomed) this.Teardown(entity);

		const gone = new Set(doomed);
		this._ordered = this._ordered.filter((entity) => !gone.has(entity));
	}

	/** Scene unload: destroys every entity (OnDestroy included) immediately. */
	public DestroyAll(): void {
		for (const entity of this._ordered) entity.Destroy();
		this.FlushDestroyed();
		this._awakeQueue.length = 0;
		this._startQueue.length = 0;
		this._byId.clear();
		this.Renderables.clear();
	}

	private Teardown(entity: Entity): void {
		for (const component of entity.Components) {
			if (component._awoken) EntityWorld.Run(component, "OnDestroy", (c) => c.OnDestroy());
		}
		this._byId.delete(entity.Id);
		this.Renderables.delete(entity.Id);
	}

	//#endregion

	//#region Hook drivers

	private ForEachComponent(hook: Hook, name: string): void {
		const entities = this._ordered;
		const count = entities.length;
		for (let i = 0; i < count; i++) {
			const entity = entities[i]!;
			if (!entity.Active || entity.IsDestroyed) continue;

			const components = entity.Components;
			for (let j = 0; j < components.length; j++) {
				const component = components[j]!;
				if (!component.Enabled || !component._started) continue;
				EntityWorld.Run(component, name, hook);
			}
		}
	}

	public RunInputUpdate(input: InputService, dt: number): void {
		this.ForEachComponent((c) => c.OnInputUpdate(input, dt), "OnInputUpdate");
	}

	public RunUpdate(dt: number): void {
		this.ForEachComponent((c) => c.Update(dt), "Update");
	}

	public RunUiUpdate(ui: UiService, dt: number): void {
		this.ForEachComponent((c) => c.OnUIUpdate(ui, dt), "OnUIUpdate");
	}

	public RunPhysicsSync(): void {
		this.ForEachComponent((c) => c.OnPhysicsSync(), "OnPhysicsSync");
	}

	public RunPhysicsUpdate(dt: number): void {
		this.ForEachComponent((c) => c.OnPhysicsUpdate(dt), "OnPhysicsUpdate");
	}

	/** Both sides get the callback, each with the other entity as argument (like Unity - Godot only notifies the Area). */
	public DispatchOverlap(a: Entity, b: Entity, entered: boolean, isTrigger: boolean): void {
		EntityWorld.NotifyOverlap(a, b, entered, isTrigger);
		EntityWorld.NotifyOverlap(b, a, entered, isTrigger);
	}

	private static NotifyOverlap(target: Entity, other: Entity, entered: boolean, isTrigger: boolean): void {
		if (!target.Active || target.IsDestroyed) return;
		for (const component of target.Components) {
			if (!component.Enabled || !component._started) continue;
			if (isTrigger) {
				EntityWorld.Run(component, entered ? "OnTriggerEnter" : "OnTriggerExit",
					(c) => (entered ? c.OnTriggerEnter(other) : c.OnTriggerExit(other)));
			} else {
				EntityWorld.Run(component, entered ? "OnCollisionEnter" : "OnCollisionExit",
					(c) => (entered ? c.OnCollisionEnter(other) : c.OnCollisionExit(other)));
			}
		}
	}

	/** One throwing script must not take the whole frame (or the other scripts) down with it. */
	private static Run(component: Component, hookName: string, hook: Hook): void {
		try {
			hook(component);
		} catch (error) {
			Logger.LogException(
				error,
				`[Script] ${component.constructor.name}.${hookName} threw on entity "${component.Entity.Name}" (#${component.Entity.Id}):`
			);
		}
	}

	//#endregion
}
