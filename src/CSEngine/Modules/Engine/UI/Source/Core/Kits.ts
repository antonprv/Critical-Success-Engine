// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** How the toolkit's components look: the same components, controllers and skins, two sets of styles. */
export const enum WinKit {
	/** Windows 98 to 7 (the WinTheme themes). */
	Classic = "classic",
	/** Tailwind CSS design tokens: any palette, light or dark, any radius. */
	Tailwind = "tailwind",
	/**
	 * Quasar's own look (Material): Quasar's components as Quasar draws them, the toolkit's on the Tailwind kit's tokens
	 * with Quasar's font; the palette, dark mode and radius are the Tailwind theme's.
	 */
	Quasar = "quasar",
}

export const AllKits: readonly WinKit[] = [WinKit.Classic, WinKit.Tailwind, WinKit.Quasar];

/** The kit's name for people. */
export const KitLabels: Readonly<Record<WinKit, string>> = { [WinKit.Classic]: "Windows (Classic)", [WinKit.Tailwind]: "Tailwind", [WinKit.Quasar]: "Quasar" };

/** Every colour palette of Tailwind CSS 4, in Tailwind's order: any of them can be the accent. */
export const TailwindAccents: readonly string[] = [
	"red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet",
	"purple", "fuchsia", "pink", "rose", "slate", "gray", "zinc", "neutral", "stone", "mauve", "olive", "mist", "taupe",
];

/** Tailwind's grey families: surfaces, borders and text are drawn from one of them. */
export const TailwindNeutrals: readonly string[] = ["slate", "gray", "zinc", "neutral", "stone", "mauve", "olive", "mist", "taupe"];

/** Tailwind's radius scale (plus none and full). */
export const TailwindRadii: readonly string[] = ["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "full"];

export interface TailwindTheme {
	Accent: string;
	Neutral: string;
	Dark: boolean;
	Radius: string;
}

export const DefaultTailwindTheme: Readonly<TailwindTheme> = Object.freeze({ Accent: "indigo", Neutral: "zinc", Dark: false, Radius: "md" });

/** The Quasar kit starts in Quasar's own colours: its primary is a blue, its corners small. */
export const DefaultQuasarTheme: Readonly<TailwindTheme> = Object.freeze({ Accent: "blue", Neutral: "gray", Dark: false, Radius: "sm" });

/** The classes that select a Tailwind theme on the kit's root element. */
export function TailwindThemeClasses(theme: TailwindTheme): string[] {
	const classes = ["win-kit--tailwind", `tw-accent--${theme.Accent}`, `tw-neutral--${theme.Neutral}`, `tw-radius--${theme.Radius}`];
	if (theme.Dark) classes.push("tw-dark");
	return classes;
}

/**
 * The classes of the Quasar kit's root: its own (Styles/quasar-kit.css draws every toolkit component as Quasar draws
 * its own) and the palette's variables - not the Tailwind kit's look. A palette other than Quasar's default replaces
 * Quasar's primary colour.
 */
export function QuasarThemeClasses(theme: TailwindTheme): string[] {
	const classes = ["win-kit--quasar", `tw-accent--${theme.Accent}`, `tw-neutral--${theme.Neutral}`];
	if (theme.Accent !== DefaultQuasarTheme.Accent) classes.push("qk-brand--palette");
	if (theme.Dark) classes.push("tw-dark");
	return classes;
}
