// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { SceneManifest } from "../Core/EntityManifest";

/** Scenes available in the menu, in registration order (the first one is loaded at startup). */
export class SceneRegistry {
	private readonly _scenes = new Map<string, SceneManifest>();

	public Register(scene: SceneManifest): this {
		if (this._scenes.has(scene.id)) throw new Error(`Scene "${scene.id}" is already registered.`);
		this._scenes.set(scene.id, scene);
		return this;
	}

	public Get(id: string): SceneManifest | undefined { return this._scenes.get(id); }
	public get All(): SceneManifest[] { return [...this._scenes.values()]; }
	public get First(): SceneManifest | undefined { return this._scenes.values().next().value; }
}
