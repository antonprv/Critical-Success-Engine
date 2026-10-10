// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { AllThemes, DefaultTailwindTheme, WinKit, WinTheme, type TailwindTheme } from "@cse/ui";

/** A theme the tools can wear: one of the classic kit's, or the Tailwind kit light or dark. */
export interface ThemeChoice {
	Label: string;
	Kit: WinKit;
	Theme: WinTheme;
	Tailwind: TailwindTheme;
}

/** Every theme the toolkit has. */
export const ThemeChoices: readonly ThemeChoice[] = [
	...AllThemes.map((theme) => ({ Label: theme.Name, Kit: WinKit.Classic, Theme: theme.Id, Tailwind: { ...DefaultTailwindTheme } })),
	{ Label: "Tailwind (light)", Kit: WinKit.Tailwind, Theme: WinTheme.XpBlue, Tailwind: { ...DefaultTailwindTheme } },
	{ Label: "Tailwind (dark)", Kit: WinKit.Tailwind, Theme: WinTheme.XpBlue, Tailwind: { ...DefaultTailwindTheme, Dark: true } },
];
