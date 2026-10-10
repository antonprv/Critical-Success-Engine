// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { ControlBase } from "../Source/Core/ControlBase";
import { AllThemes, GetTheme, ThemeFamily, WinTheme } from "../Source/Core/Themes";

describe("ControlBase", () => {
	class Probe extends ControlBase {}

	it("tracks enabled, visible, focused and hovered, emitting a change event only on real changes", () => {
		const control = new Probe();
		const log: string[] = [];
		control.Events.On("enabled-change", (v) => log.push(`enabled ${v}`));
		control.Events.On("visible-change", (v) => log.push(`visible ${v}`));
		control.Events.On("focus-change", (v) => log.push(`focus ${v}`));
		control.Events.On("hover-change", (v) => log.push(`hover ${v}`));

		expect([control.Enabled, control.Visible, control.Focused, control.Hovered]).toEqual([true, true, false, false]);
		control.SetEnabled(true);
		control.Focus();
		control.Focus();
		control.HoverEnter();
		control.SetVisible(false);
		control.HoverLeave();
		control.Blur();
		control.SetEnabled(false);
		expect(log).toEqual(["focus true", "hover true", "visible false", "hover false", "focus false", "enabled false"]);
	});

	it("a disabled control can't take focus or hover, and disabling drops both", () => {
		const control = new Probe();
		control.Focus();
		control.HoverEnter();
		control.SetEnabled(false);
		expect([control.Focused, control.Hovered]).toEqual([false, false]);
		control.Focus();
		control.HoverEnter();
		expect([control.Focused, control.Hovered]).toEqual([false, false]);
	});

	it("options set the initial flags", () => {
		const control = new Probe({ Enabled: false, Visible: false });
		expect([control.Enabled, control.Visible]).toEqual([false, false]);
	});
});

describe("themes", () => {
	it("covers every Windows from 98 to 7 and their colour schemes, each in one of three looks", () => {
		expect(AllThemes.map((t) => t.Id)).toEqual([
			WinTheme.Win98, WinTheme.WinMe, WinTheme.Win2000, WinTheme.Classic,
			WinTheme.XpBlue, WinTheme.XpOlive, WinTheme.XpSilver, WinTheme.XpRoyale,
			WinTheme.VistaBasic, WinTheme.VistaAero, WinTheme.Win7Basic, WinTheme.Win7Aero,
		]);
		expect(AllThemes.filter((t) => t.Family === ThemeFamily.Classic).map((t) => t.Id)).toEqual([WinTheme.Win98, WinTheme.WinMe, WinTheme.Win2000, WinTheme.Classic]);
		expect(AllThemes.filter((t) => t.Family === ThemeFamily.Luna)).toHaveLength(4);
		expect(AllThemes.filter((t) => t.Family === ThemeFamily.Aero)).toHaveLength(4);
	});

	it("each theme has a name, a year and a CSS class; looking one up returns it", () => {
		const xp = GetTheme(WinTheme.XpBlue);
		expect(xp).toMatchObject({ Name: "Windows XP (Blue)", Year: 2001, Family: ThemeFamily.Luna, ClassName: "win-theme--xp-blue" });
		for (const theme of AllThemes) {
			expect(theme.Name).toMatch(/^Windows /);
			expect(theme.ClassName).toBe(`win-theme--${theme.Id}`);
			expect(GetTheme(theme.Id)).toBe(theme);
		}
	});
});
