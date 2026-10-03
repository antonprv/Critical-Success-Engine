// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { CancelableEvent, EventHub } from "../../Source/Toolkit/Core/EventHub";
import { ControlBase } from "../../Source/Toolkit/Core/ControlBase";
import { AllThemes, GetTheme, ThemeFamily, WinTheme } from "../../Source/Toolkit/Core/Themes";

describe("EventHub", () => {
	type Events = { change: [value: number, previous: number]; ping: []; };

	it("calls subscribers in subscription order with the event arguments", () => {
		const hub = new EventHub<Events>();
		const seen: string[] = [];
		hub.On("change", (value, previous) => seen.push(`a ${value} ${previous}`));
		hub.On("change", (value) => seen.push(`b ${value}`));
		hub.Emit("change", 2, 1);
		expect(seen).toEqual(["a 2 1", "b 2"]);
	});

	it("On returns an unsubscribe function; Once fires a single time", () => {
		const hub = new EventHub<Events>();
		const handler = vi.fn();
		const off = hub.On("ping", handler);
		const once = vi.fn();
		hub.Once("ping", once);

		hub.Emit("ping");
		off();
		off(); // twice is harmless
		hub.Emit("ping");
		expect(handler).toHaveBeenCalledTimes(1);
		expect(once).toHaveBeenCalledTimes(1);
		expect(hub.ListenerCount("ping")).toBe(0);
	});

	it("a handler that unsubscribes during an emit does not disturb the others", () => {
		const hub = new EventHub<Events>();
		const seen: string[] = [];
		const off = hub.On("ping", () => { seen.push("first"); off(); });
		hub.On("ping", () => seen.push("second"));
		hub.Emit("ping");
		hub.Emit("ping");
		expect(seen).toEqual(["first", "second", "second"]);
	});

	it("emitting with no subscribers is fine, and Clear removes everything", () => {
		const hub = new EventHub<Events>();
		expect(() => hub.Emit("ping")).not.toThrow();
		hub.On("ping", vi.fn());
		hub.On("change", vi.fn());
		hub.Clear();
		expect(hub.ListenerCount("ping") + hub.ListenerCount("change")).toBe(0);
	});

	it("CancelableEvent records cancellation", () => {
		const event = new CancelableEvent();
		expect(event.Canceled).toBe(false);
		event.Cancel();
		expect(event.Canceled).toBe(true);
	});
});

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
