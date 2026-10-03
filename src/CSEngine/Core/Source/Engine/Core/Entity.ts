// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Component, ComponentConstructor } from "./Component";
import type { EngineContext } from "./EngineContext";
import { Transform } from "./Transform";

/** A bag of components with a transform. Ids are unique across the whole session (scene reloads never reuse them). */
export class Entity {
	public readonly Id: number;
	public Name: string;
	public readonly Tags = new Set<string>();
	public readonly Transform = new Transform();
	public readonly Engine: EngineContext;

	private _active = true;

	private readonly _components: Component[] = [];
	private _destroyed = false;

	public constructor(id: number, name: string, engine: EngineContext) {
		this.Id = id;
		this.Name = name;
		this.Engine = engine;
	}

	/** Inactive entities skip every per-frame and per-step hook. Changing it runs OnEnable / OnDisable on awake components. */
	public get Active(): boolean { return this._active; }
	public set Active(active: boolean) {
		if (this._active === active) return;
		this._active = active;
		this.Engine.World.NotifyActiveChanged(this);
	}

	/** Top-to-bottom iteration order == manifest order. */
	public get Components(): readonly Component[] { return this._components; }

	public get IsDestroyed(): boolean { return this._destroyed; }

	public AddComponent<T extends Component>(component: T): T {
		component.Entity = this;
		this._components.push(component);
		// Components added after the entity went live (runtime spawn) still get their Awake/Start.
		this.Engine.World.NotifyComponentAdded(component);
		return component;
	}

	public GetComponent<T extends Component>(type: ComponentConstructor<T> | (abstract new () => T)): T | undefined {
		for (const component of this._components) {
			if (component instanceof type) return component;
		}
		return undefined;
	}

	public GetComponents<T extends Component>(type: ComponentConstructor<T> | (abstract new () => T)): T[] {
		return this._components.filter((c): c is T => c instanceof type);
	}

	public RequireComponent<T extends Component>(type: ComponentConstructor<T> | (abstract new () => T)): T {
		const found = this.GetComponent(type);
		if (!found) throw new Error(`Entity "${this.Name}" (#${this.Id}) has no ${(type as { name: string; }).name}.`);
		return found;
	}

	/** Queued: OnDestroy runs at the end of the current frame/step, never in the middle of someone's hook. */
	public Destroy(): void {
		if (this._destroyed) return;
		this._destroyed = true;
		this.Engine.World.QueueDestroy(this);
	}
}
