// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComboBoxController } from "../../Source/Toolkit/Controls/ComboBoxController";
import { MenuController } from "../../Source/Toolkit/Controls/MenuController";
import { MessageBoxController } from "../../Source/Toolkit/Controls/MessageBoxController";
import { TooltipController } from "../../Source/Toolkit/Controls/TooltipController";
import { WindowController } from "../../Source/Toolkit/Controls/WindowController";
import { UseControl } from "../../Source/Toolkit/Core/UseControl";
import { DialogService } from "../../Source/Toolkit/Designer/Dialogs";
import WinComboBox from "../../Source/Toolkit/Components/WinComboBox.vue";
import WinMenuBar from "../../Source/Toolkit/Components/WinMenuBar.vue";
import WinMessageBox from "../../Source/Toolkit/Components/WinMessageBox.vue";
import WinTooltip from "../../Source/Toolkit/Components/WinTooltip.vue";
import WinWindow from "../../Source/Toolkit/Components/WinWindow.vue";
import WinDialogHost from "../../Source/Toolkit/Designer/WinDialogHost.vue";

afterEach(() => vi.useRealTimers());

/** The names of the transitions a component renders (Vue Test Utils draws them as <transition-stub name="...">). */
const Transitions = (html: string): string[] => [...html.matchAll(/<transition(?:-group)?-stub[^>]*name="([^"]+)"/g)].map((m) => m[1]!);

describe("Windows 11 style motion", () => {
	it("windows open, close and minimize through the window transition", () => {
		const wrapper = mount(WinWindow, { props: { controller: UseControl(new WindowController({ Title: "W" })) } });
		expect(Transitions(wrapper.html())).toEqual(["win-window"]);
	});

	it("maximize and restore animate the window's bounds for a moment, never while it is dragged", async () => {
		vi.useFakeTimers();
		const controller = UseControl(new WindowController({ Title: "W" }));
		const wrapper = mount(WinWindow, { props: { controller } });
		const frame = () => wrapper.get(".win-window");
		controller.Maximize({ Width: 800, Height: 600 });
		await nextTick();
		expect(frame().classes()).toContain("win-window--settling");
		vi.advanceTimersByTime(300);
		await nextTick();
		expect(frame().classes()).not.toContain("win-window--settling");
		controller.Restore();
		controller.Maximize({ Width: 800, Height: 600 }); // a second change restarts the moment
		await nextTick();
		vi.advanceTimersByTime(299);
		await nextTick();
		expect(frame().classes()).toContain("win-window--settling");
		wrapper.unmount();
		vi.advanceTimersByTime(10);
	});

	it("menus, combo box lists and tooltips appear as flyouts; message boxes and dialogs as modals", () => {
		const menu = mount(WinMenuBar, { props: { controller: UseControl(new MenuController({ Items: [{ Id: "f", Label: "&File", Items: [{ Id: "n", Label: "New" }] }] })) } });
		expect(Transitions(menu.html())).toEqual(["win-flyout"]);
		const combo = mount(WinComboBox, { props: { controller: UseControl(new ComboBoxController({ Options: [{ Value: 1, Label: "One" }] })) } });
		expect(Transitions(combo.html())).toEqual(["win-flyout"]);
		const tip = mount(WinTooltip, { props: { controller: UseControl(new TooltipController({ Text: "t" })) } });
		expect(Transitions(tip.html())).toEqual(["win-tip"]);
		const box = mount(WinMessageBox, { props: { controller: UseControl(new MessageBoxController()) }, attachTo: document.body });
		expect(Transitions(box.html())).toEqual(["win-modal"]);
		box.unmount();
		const host = mount(WinDialogHost, { props: { service: new DialogService() } });
		expect(Transitions(host.html())).toEqual(["win-modal"]);
	});
});
