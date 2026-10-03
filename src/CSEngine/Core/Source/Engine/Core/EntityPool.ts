// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Vec3 } from "../Math/Vec3";
import { Component } from "./Component";
import type { Entity } from "./Entity";
import type { EntityManifest } from "./EntityManifest";
import type { EntityWorld } from "./EntityWorld";

export interface EntityPoolOptions {
	/** Upper bound on entities the pool creates. When all are in use, the oldest active one is recycled. */
	MaxSize?: number;
}

/** Marks an entity as owned by a pool, so `Despawn` knows to return it there. */
export class PooledEntity extends Component {
	public Pool: EntityPool | null = null;
}

/**
 * Reuses entities instead of spawning and destroying them (bullets, effects, debris). Released entities are switched
 * off (`Active = false`): their components hide meshes and leave the physics world in OnDisable, and come back in
 * OnEnable when the entity is acquired again.
 */
export class EntityPool {
	private readonly _available: Entity[] = [];
	private readonly _active: Entity[] = [];
	private readonly _maxSize: number;

	public constructor(
		private readonly _world: EntityWorld,
		private readonly _build: () => EntityManifest,
		options: EntityPoolOptions = {}
	) {
		this._maxSize = options.MaxSize ?? 64;
	}

	public get ActiveCount(): number { return this._active.length; }
	public get AvailableCount(): number { return this._available.length; }
	public get TotalCount(): number { return this._active.length + this._available.length; }

	/**
	 * An entity at `position`: a released one, a new one, or (at MaxSize) the oldest active one. `prepare` runs before
	 * the entity wakes up or is switched back on - set per-use state there (velocity, color...).
	 */
	public Acquire(position: Vec3, prepare?: (entity: Entity) => void): Entity {
		this.Forget();

		const entity = this._available.pop() ?? (this.TotalCount < this._maxSize ? null : this.Recycle());
		if (!entity) return this.Create(position, prepare);

		entity.Transform.Teleport(position);
		prepare?.(entity);
		this._active.push(entity);
		entity.Active = true;
		return entity;
	}

	public Release(entity: Entity): void {
		const index = this._active.indexOf(entity);
		if (index < 0) return;

		this._active.splice(index, 1);
		entity.Active = false;
		this._available.push(entity);
	}

	private Create(position: Vec3, prepare?: (entity: Entity) => void): Entity {
		const manifest = this._build();
		const entity = this._world.Spawn({ ...manifest, position: position.ToTuple() });
		entity.AddComponent(new PooledEntity()).Pool = this;
		prepare?.(entity);
		this._active.push(entity);
		return entity;
	}

	private Recycle(): Entity {
		const oldest = this._active[0]!;
		this.Release(oldest);
		return this._available.pop()!;
	}

	/** Entities destroyed elsewhere (scene unload, a script) are no longer the pool's. */
	private Forget(): void {
		for (const list of [this._available, this._active]) {
			for (let i = list.length - 1; i >= 0; i--) {
				if (list[i]!.IsDestroyed) list.splice(i, 1);
			}
		}
	}
}

/** Returns a pooled entity to its pool, or destroys any other entity. */
export function Despawn(entity: Entity): void {
	const pool = entity.GetComponent(PooledEntity)?.Pool;
	if (pool) pool.Release(entity);
	else entity.Destroy();
}
