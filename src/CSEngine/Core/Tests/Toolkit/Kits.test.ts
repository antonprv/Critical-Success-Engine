// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { DefaultTailwindTheme, TailwindAccents, TailwindNeutrals, TailwindRadii, TailwindThemeClasses, WinKit } from "../../Source/Toolkit/Core/Kits";
import { WinTheme } from "../../Source/Toolkit/Core/Themes";
import WinThemeProvider from "../../Source/Toolkit/Components/WinThemeProvider.vue";

describe("Tailwind themes", () => {
	it("offer every palette of the installed Tailwind as an accent, its grey families as neutrals, and its radius scale", () => {
		const theme = readFileSync(resolve("node_modules/tailwindcss/theme.css"), "utf8");
		const palettes = [...theme.matchAll(/--color-([a-z]+)-500:/g)].map((m) => m[1]);
		expect(TailwindAccents).toEqual(palettes);
		expect(TailwindNeutrals).toEqual(["slate", "gray", "zinc", "neutral", "stone", "mauve", "olive", "mist", "taupe"]);
		expect(TailwindRadii).toEqual(["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "full"]);
		expect(DefaultTailwindTheme).toEqual({ Accent: "indigo", Neutral: "zinc", Dark: false, Radius: "md" });
	});

	it("a theme is a set of classes on the kit's root", () => {
		expect(TailwindThemeClasses(DefaultTailwindTheme)).toEqual(["win-kit--tailwind", "tw-accent--indigo", "tw-neutral--zinc", "tw-radius--md"]);
		expect(TailwindThemeClasses({ Accent: "rose", Neutral: "stone", Dark: true, Radius: "full" })).toEqual(["win-kit--tailwind", "tw-accent--rose", "tw-neutral--stone", "tw-radius--full", "tw-dark"]);
	});

	it("the palette stylesheet maps every accent and neutral, all 11 shades, and every radius", () => {
		const css = readFileSync(resolve("Source/Toolkit/Styles/tailwind-palettes.css"), "utf8");
		const shades = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
		for (const accent of TailwindAccents) {
			for (const shade of shades) expect(css, `${accent}-${shade}`).toContain(`--accent-${shade}: var(--color-${accent}-${shade});`);
			expect(css).toContain(`.tw-accent--${accent} {`);
		}
		for (const neutral of TailwindNeutrals) {
			for (const shade of shades) expect(css, `${neutral}-${shade}`).toContain(`--neutral-${shade}: var(--color-${neutral}-${shade});`);
		}
		for (const radius of TailwindRadii) expect(css).toContain(`.tw-radius--${radius} {`);
	});
});

describe("WinThemeProvider kits", () => {
	it("draws the classic Windows themes by default", () => {
		const wrapper = mount(WinThemeProvider, { props: { theme: WinTheme.XpBlue } });
		expect(wrapper.classes()).toEqual(expect.arrayContaining(["win-root", "win-kit--classic", "win-family--luna", "win-theme--xp-blue"]));
	});

	it("with the Tailwind kit it carries the Tailwind theme instead, and a skin still applies on top", () => {
		const wrapper = mount(WinThemeProvider, { props: { theme: WinTheme.XpBlue, kit: WinKit.Tailwind, tailwind: { ...DefaultTailwindTheme, Dark: true }, skin: { Id: "s", Name: "", Parts: {} } } });
		expect(wrapper.classes()).toEqual(expect.arrayContaining(["win-root", "win-kit--tailwind", "tw-accent--indigo", "tw-dark", "win-skin", "win-skin--s"]));
		expect(wrapper.classes()).not.toContain("win-family--luna");
		expect(wrapper.classes()).not.toContain("win-kit--classic");
		const plain = mount(WinThemeProvider, { props: { theme: WinTheme.XpBlue, kit: WinKit.Tailwind } });
		expect(plain.classes()).toContain("tw-accent--indigo"); // the default Tailwind theme
	});
});
