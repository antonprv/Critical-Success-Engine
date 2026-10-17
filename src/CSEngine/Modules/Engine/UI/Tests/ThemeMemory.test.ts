// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { DefaultTailwindTheme, WinKit } from "../Source/Core/Kits";
import { DefaultToolTheme, RememberedTheme, RememberTheme, ThemeLabel, ThemeOfProject, type ToolTheme } from "../Source/Core/ThemeMemory";
import { WinTheme } from "../Source/Core/Themes";

/** A Storage stand-in. */
function Memory(): Pick<Storage, "getItem" | "setItem"> & { Items: Map<string, string>; } {
	const items = new Map<string, string>();
	return { Items: items, getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) };
}

describe("ThemeMemory: each tool remembers its theme", () => {
	it("gives back what was remembered, per tool; nothing remembered is null", () => {
		const storage = Memory();
		expect(RememberedTheme("ProjectBrowser", storage)).toBeNull();
		const dark: ToolTheme = { Kit: WinKit.Tailwind, Theme: WinTheme.XpBlue, Tailwind: { ...DefaultTailwindTheme, Dark: true } };
		RememberTheme("ProjectBrowser", dark, storage);
		RememberTheme("UIDesigner", { ...DefaultToolTheme, Theme: WinTheme.Win98 }, storage);
		expect(RememberedTheme("ProjectBrowser", storage)).toEqual(dark);
		expect(RememberedTheme("UIDesigner", storage)!.Theme).toBe(WinTheme.Win98);
	});

	it("a broken or missing store is ignored (private windows, a sandbox)", () => {
		const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
		expect(RememberedTheme("X", broken)).toBeNull();
		expect(() => RememberTheme("X", DefaultToolTheme, broken)).not.toThrow();
		const garbage = Memory();
		garbage.Items.set("cse.theme.X", "not json");
		expect(RememberedTheme("X", garbage)).toBeNull();
		garbage.Items.set("cse.theme.X", JSON.stringify({ Kit: 1 }));
		expect(RememberedTheme("X", garbage)).toBeNull();
		expect(RememberedTheme("X", undefined)).toBeNull();
		expect(() => RememberTheme("X", DefaultToolTheme, undefined)).not.toThrow();
	});

	it("by default the page's localStorage; a page that refuses it remembers nothing", () => {
		const saved = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
		const items = new Map<string, string>();
		Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => ({ getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => items.set(k, v) }) });
		RememberTheme("Default", DefaultToolTheme);
		expect(RememberedTheme("Default")).toEqual(DefaultToolTheme);
		Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("SecurityError"); } });
		expect(RememberedTheme("Default")).toBeNull();
		if (saved) Object.defineProperty(globalThis, "localStorage", saved);
		else Reflect.deleteProperty(globalThis, "localStorage");
	});

	it("names a look", () => {
		expect(ThemeLabel(DefaultToolTheme)).toBe("Windows XP (Blue)");
		expect(ThemeLabel({ ...DefaultToolTheme, Kit: WinKit.Tailwind })).toBe("Tailwind indigo");
		expect(ThemeLabel({ ...DefaultToolTheme, Kit: WinKit.Tailwind, Tailwind: { ...DefaultTailwindTheme, Dark: true } })).toBe("Tailwind indigo, dark");
	});

	it("the project's theme (its .cseproject) as a tool theme: the engine's default when it has none", () => {
		expect(ThemeOfProject(undefined)).toEqual(DefaultToolTheme);
		expect(ThemeOfProject({ Kit: "classic", Theme: "win98" })).toEqual({ ...DefaultToolTheme, Theme: WinTheme.Win98 });
		const tailwind = { Accent: "rose", Neutral: "stone", Dark: true, Radius: "lg" };
		expect(ThemeOfProject({ Kit: "tailwind", Theme: "xp-blue", Tailwind: tailwind })).toEqual({ Kit: WinKit.Tailwind, Theme: WinTheme.XpBlue, Tailwind: tailwind });
	});
});
