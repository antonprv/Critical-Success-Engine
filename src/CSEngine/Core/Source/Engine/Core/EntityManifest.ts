// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { Component, ComponentConstructor } from "./Component";
import type { QuatTuple } from "../Math/Quat";
import type { Vec3Tuple } from "../Math/Vec3";

/** Data fields of a component class (everything that is not a method) - what a manifest may set. */
export type ComponentProps<T> = Partial<{
	// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
	[K in keyof T as T[K] extends Function ? never : K]: T[K];
}>;

/** One "component to attach" entry of an entity. Use {@link Comp} to build it with checked props. */
export interface ComponentManifest {
	type: ComponentConstructor;
	props?: Record<string, unknown>;
}

export interface EntityManifest {
	name: string;
	position?: Vec3Tuple;
	/** Quaternion (x, y, z, w). */
	rotation?: QuatTuple;
	tags?: string[];
	/** Attached - and later visited by every lifecycle hook - in this order. */
	components: ComponentManifest[];
}

/** Whether a scene takes the mouse (first or third person) or leaves the cursor free (top-down, strategy). */
export type CursorMode = "locked" | "free";

export interface SceneManifest {
	id: string;
	name: string;
	description: string;
	gravity?: Vec3Tuple;
	/** Background colour, 0..1 rgb. */
	clearColor?: Vec3Tuple;
	/** "free": the cursor stays visible (Esc opens the menu); "locked" (the default): the game takes the mouse. */
	cursor?: CursorMode;
	/** Which of the project's input manifests this scene plays with (its Id); omitted: the project's default. */
	input?: string;
	entities: EntityManifest[];
}

/** `Comp(RigidBody, { Mass: 2 })` - props are type-checked against the component's own fields. */
export function Comp<T extends Component>(type: ComponentConstructor<T>, props?: ComponentProps<T>): ComponentManifest {
	return props ? { type, props: props as Record<string, unknown> } : { type };
}

/** Shorthand for an entity entry; everything but the name and component list is optional. */
export function Ent(name: string, components: ComponentManifest[], options: Omit<EntityManifest, "name" | "components"> = {}): EntityManifest {
	return { name, components, ...options };
}
