// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** Anything a layout file can hold. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue; };

/** Whether a value is plain JSON (what a layout file can hold): no functions, classes, cycles or non-finite numbers. */
export function IsJson(value: unknown, depth = 0): value is JsonValue {
	if (depth > 64) return false;
	if (value === null || typeof value === "string" || typeof value === "boolean") return true;
	if (typeof value === "number") return Number.isFinite(value);
	if (Array.isArray(value)) return value.every((item) => IsJson(item, depth + 1));
	if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
	return Object.values(value).every((item) => IsJson(item, depth + 1));
}

/** A deep copy of a JSON value. */
export function CloneJson<T extends JsonValue>(value: T): T {
	return value === null || typeof value !== "object" ? value : JSON.parse(JSON.stringify(value)) as T;
}
