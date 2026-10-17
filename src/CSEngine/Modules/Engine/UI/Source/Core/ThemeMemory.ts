// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { DefaultTailwindTheme, WinKit, type TailwindTheme } from "./Kits";
import { GetTheme, WinTheme } from "./Themes";

/** A whole look: the kit, the Windows theme (the classic kit's), the Tailwind palette (the Tailwind kit's). */
export interface ToolTheme {
	Kit: WinKit;
	Theme: WinTheme;
	Tailwind: TailwindTheme;
}

export const DefaultToolTheme: Readonly<ToolTheme> = Object.freeze({ Kit: WinKit.Classic, Theme: WinTheme.XpBlue, Tailwind: { ...DefaultTailwindTheme } });

/** Where a tool's theme is kept: the page's localStorage (each tool's under its own key). */
type Store = Pick<Storage, "getItem" | "setItem"> | undefined;

function DefaultStore(): Store {
	try {
		return globalThis.localStorage;
	} catch {
		return undefined;
	}
}

const Key = (tool: string): string => `cse.theme.${tool}`;

/** The theme the tool was left in last time, or null (never chosen, or the store can't be read). */
export function RememberedTheme(tool: string, store: Store = DefaultStore()): ToolTheme | null {
	try {
		const raw = JSON.parse(store?.getItem(Key(tool)) ?? "null") as Partial<ToolTheme> | null;
		return raw && typeof raw.Kit === "string" && typeof raw.Theme === "string" && typeof raw.Tailwind === "object" ? (raw as ToolTheme) : null;
	} catch {
		return null;
	}
}

/** Keeps the tool's theme for next time (quietly not, where the store refuses). */
export function RememberTheme(tool: string, theme: ToolTheme, store: Store = DefaultStore()): void {
	try {
		store?.setItem(Key(tool), JSON.stringify(theme));
	} catch {
		// a private window, a sandboxed frame: the tool just starts in its default next time
	}
}

/** A project's theme (Ui.Theme of its .cseproject) as a whole look; the engine's default when it names none. */
export function ThemeOfProject(theme: { Kit: string; Theme: string; Tailwind?: TailwindTheme; } | undefined): ToolTheme {
	if (!theme) return { ...DefaultToolTheme, Tailwind: { ...DefaultTailwindTheme } };
	return { Kit: theme.Kit as WinKit, Theme: theme.Theme as WinTheme, Tailwind: theme.Tailwind ?? { ...DefaultTailwindTheme } };
}

/** A look in words: the Windows theme's name, or the Tailwind palette ("Tailwind rose, dark"). */
export function ThemeLabel(theme: ToolTheme): string {
	return theme.Kit === WinKit.Tailwind ? `Tailwind ${theme.Tailwind.Accent}${theme.Tailwind.Dark ? ", dark" : ""}` : GetTheme(theme.Theme).Name;
}
