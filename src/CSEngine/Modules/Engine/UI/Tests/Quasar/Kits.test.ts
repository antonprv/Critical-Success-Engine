// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";
import WinThemeProvider from "../../Source/Components/WinThemeProvider.vue";
import { HidePortalTheme, PortalHost, ShowPortalTheme, UseKit, type KitContext } from "../../Source/Core/KitContext";
import { AllKits, DefaultQuasarTheme, KitLabels, QuasarThemeClasses, WinKit } from "../../Source/Core/Kits";
import { WinTheme } from "../../Source/Core/Themes";

describe("the Quasar kit", () => {
	it("is a third kit of its own look, in Quasar's own colours by default", () => {
		expect(AllKits).toEqual([WinKit.Classic, WinKit.Tailwind, WinKit.Quasar]);
		expect(KitLabels[WinKit.Quasar]).toBe("Quasar");
		// its own look, not the Tailwind kit's; the palette's variables
		expect(QuasarThemeClasses({ ...DefaultQuasarTheme, Dark: true })).toEqual(["win-kit--quasar", "tw-accent--blue", "tw-neutral--gray", "tw-dark"]);
		// another palette than Quasar's own: its colour is the primary
		expect(QuasarThemeClasses({ ...DefaultQuasarTheme, Accent: "emerald" })).toEqual(["win-kit--quasar", "tw-accent--emerald", "tw-neutral--gray", "qk-brand--palette"]);
	});

	it("tells what is inside a provider its kit and whether it is dark; outside one, Classic and light", () => {
		let seen: KitContext | null = null;
		const Probe = defineComponent({ setup: () => { seen = UseKit(); return () => null; } });
		mount(Probe);
		expect({ ...seen! }).toEqual({ Kit: WinKit.Classic, Dark: false });

		const kit = ref(WinKit.Quasar);
		const wrapper = mount({ render: () => h(WinThemeProvider, { theme: WinTheme.XpBlue, kit: kit.value }, () => h(Probe)) });
		expect(wrapper.get(".win-root").classes()).toEqual(expect.arrayContaining(["win-kit--quasar", "tw-accent--blue"]));
		expect(wrapper.get(".win-root").classes()).not.toContain("win-kit--tailwind");
		expect(seen!.Kit).toBe(WinKit.Quasar);
		expect(seen!.Dark).toBe(false);
		const dark = mount({ render: () => h(WinThemeProvider, { theme: WinTheme.XpBlue, kit: WinKit.Tailwind, tailwind: { Accent: "rose", Neutral: "stone", Dark: true, Radius: "lg" } }, () => h(Probe)) });
		expect(seen!.Dark).toBe(true);
		expect(dark.get(".win-root").classes()).toContain("tw-accent--rose");
		dark.unmount();
		wrapper.unmount();
	});

	it("dresses Quasar's pop-ups in the theme shown last, and the one before when it goes", async () => {
		const host = PortalHost();
		expect(PortalHost()).toBe(host);
		const portals = ref(true);
		const classic = mount({ render: () => h(WinThemeProvider, { theme: WinTheme.Win98 }) });
		expect(host.className).toBe("win-root win-portals win-kit--classic win-family--classic win-theme--win98");
		const tailwind = mount({ render: () => h(WinThemeProvider, { theme: WinTheme.Win98, kit: WinKit.Tailwind, portals: portals.value }) });
		expect(host.classList.contains("win-kit--tailwind")).toBe(true);
		portals.value = false; // a preview inside another tool: it leaves the pop-ups alone
		await nextTick();
		expect(host.classList.contains("win-theme--win98")).toBe(true);
		tailwind.unmount();
		classic.unmount();
		expect(host.className).toBe("win-root win-portals win-kit--classic win-family--luna win-theme--xp-blue");

		// The host was taken off the page (a test, a page that cleared its body): it comes back.
		host.remove();
		const owner = {};
		ShowPortalTheme(owner, ["a"]);
		ShowPortalTheme(owner, ["b"]);
		const again = PortalHost();
		expect(again.isConnected).toBe(true);
		expect(again.className).toBe("win-root win-portals b");
		HidePortalTheme(owner);
		HidePortalTheme(owner);
		expect(again.className).toContain("win-theme--xp-blue");
		// a page that has its own #cse-portals keeps it
		again.remove();
		const own = Object.assign(document.createElement("div"), { id: "cse-portals" });
		document.body.append(own);
		expect(PortalHost()).toBe(own);
	});
});
