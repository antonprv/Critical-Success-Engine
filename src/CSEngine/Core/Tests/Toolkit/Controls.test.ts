// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { ButtonController } from "../../Source/Toolkit/Controls/ButtonController";
import { CheckBoxController, CheckState } from "../../Source/Toolkit/Controls/CheckBoxController";
import { ProgressBarController, ProgressState } from "../../Source/Toolkit/Controls/ProgressBarController";
import { RadioGroupController } from "../../Source/Toolkit/Controls/RadioGroupController";
import { TabsController } from "../../Source/Toolkit/Controls/TabsController";

describe("ButtonController", () => {
	it("mouse: press, then release over the button = click; release outside = no click", () => {
		const button = new ButtonController({ Label: "OK" });
		const log: string[] = [];
		for (const e of ["press", "release", "click"] as const) button.Events.On(e, () => log.push(e));

		button.Press();
		expect(button.Pressed).toBe(true);
		button.Release(true);
		button.Press();
		button.Release(false);
		expect(log).toEqual(["press", "release", "click", "press", "release"]);
		expect(button.Pressed).toBe(false);
	});

	it("keyboard: Space presses and clicks on release, Enter clicks at once, other keys do nothing", () => {
		const button = new ButtonController();
		const click = vi.fn();
		button.Events.On("click", click);
		button.KeyDown("Space");
		expect(button.Pressed).toBe(true);
		button.KeyUp("Space");
		button.KeyDown("Enter");
		button.KeyDown("KeyA");
		button.KeyUp("KeyA");
		expect(click).toHaveBeenCalledTimes(2);
	});

	it("a disabled button ignores everything; Release without Press does nothing", () => {
		const button = new ButtonController({ Enabled: false });
		const any = vi.fn();
		for (const e of ["press", "release", "click"] as const) button.Events.On(e, any);
		button.Press();
		button.Release(true);
		button.KeyDown("Enter");
		button.PerformClick();
		new ButtonController().Release(true);
		expect(any).not.toHaveBeenCalled();
		expect(button.Pressed).toBe(false);
	});

	it("PerformClick clicks programmatically; Label and IsDefault are plain state", () => {
		const button = new ButtonController({ Label: "Save", IsDefault: true });
		const click = vi.fn();
		button.Events.On("click", click);
		button.PerformClick();
		expect(click).toHaveBeenCalledOnce();
		expect([button.Label, button.IsDefault]).toEqual(["Save", true]);
		expect(new ButtonController()).toMatchObject({ Label: "", IsDefault: false });
	});

	it("losing focus or being disabled while pressed lets go without a click", () => {
		const button = new ButtonController();
		const click = vi.fn();
		button.Events.On("click", click);
		button.Focus();
		button.Press();
		button.Blur();
		expect(button.Pressed).toBe(false);
		button.Press();
		button.SetEnabled(false);
		expect(button.Pressed).toBe(false);
		expect(click).not.toHaveBeenCalled();
	});
});

describe("CheckBoxController", () => {
	it("toggles unchecked <-> checked and reports old and new state", () => {
		const box = new CheckBoxController();
		const change = vi.fn();
		box.Events.On("change", change);
		box.Toggle();
		box.Toggle();
		expect(change.mock.calls).toEqual([[CheckState.Checked, CheckState.Unchecked], [CheckState.Unchecked, CheckState.Checked]]);
		expect(box.Checked).toBe(false);
	});

	it("three-state boxes cycle through indeterminate", () => {
		const box = new CheckBoxController({ ThreeState: true });
		const states: CheckState[] = [];
		box.Events.On("change", (state) => states.push(state));
		box.Toggle();
		box.Toggle();
		box.Toggle();
		expect(states).toEqual([CheckState.Checked, CheckState.Indeterminate, CheckState.Unchecked]);
	});

	it("SetState / the Checked flag set the state directly; no event when nothing changes", () => {
		const box = new CheckBoxController({ State: CheckState.Indeterminate });
		const change = vi.fn();
		box.Events.On("change", change);
		box.Checked = true;
		expect(box.State).toBe(CheckState.Checked);
		box.SetState(CheckState.Checked);
		box.Checked = false;
		expect(change).toHaveBeenCalledTimes(2);
	});

	it("Space toggles; a disabled box doesn't", () => {
		const box = new CheckBoxController({ Label: "Remember me" });
		box.KeyDown("Space");
		box.KeyDown("Enter");
		expect(box.Checked).toBe(true);
		box.SetEnabled(false);
		box.Toggle();
		box.KeyDown("Space");
		expect(box.Checked).toBe(true);
		expect(box.Label).toBe("Remember me");
	});
});

describe("RadioGroupController", () => {
	const options = [{ Value: "a", Label: "A" }, { Value: "b", Label: "B", Disabled: true }, { Value: "c", Label: "C" }];

	it("selects a value, skipping disabled options, and reports the change", () => {
		const group = new RadioGroupController({ Options: options, Value: "a" });
		const change = vi.fn();
		group.Events.On("change", change);
		group.Select("b");
		group.Select("missing");
		group.Select("c");
		group.Select("c");
		expect(change.mock.calls).toEqual([["c", "a"]]);
		expect(group.Value).toBe("c");
	});

	it("arrow keys move to the next / previous enabled option and wrap around", () => {
		const group = new RadioGroupController({ Options: options, Value: "a" });
		group.KeyDown("ArrowDown");
		expect(group.Value).toBe("c");
		group.KeyDown("ArrowRight");
		expect(group.Value).toBe("a");
		group.KeyDown("ArrowUp");
		expect(group.Value).toBe("c");
		group.KeyDown("ArrowLeft");
		expect(group.Value).toBe("a");
		group.KeyDown("KeyX");
		expect(group.Value).toBe("a");
	});

	it("with nothing selected the first arrow press picks the first enabled option; a disabled group ignores keys", () => {
		const group = new RadioGroupController({ Options: [{ Value: 1, Label: "one", Disabled: true }, { Value: 2, Label: "two" }] });
		expect(group.Value).toBeNull();
		group.KeyDown("ArrowDown");
		expect(group.Value).toBe(2);

		const off = new RadioGroupController({ Options: options, Enabled: false });
		off.KeyDown("ArrowDown");
		off.Select("a");
		expect(off.Value).toBeNull();

		const none = new RadioGroupController<string>({ Options: [{ Value: "x", Label: "x", Disabled: true }] });
		none.KeyDown("ArrowDown");
		expect(none.Value).toBeNull();
	});
});

describe("ProgressBarController", () => {
	it("clamps the value to the range and reports percent", () => {
		const bar = new ProgressBarController({ Min: 10, Max: 20 });
		bar.SetValue(15);
		expect(bar.Percent).toBe(50);
		bar.SetValue(99);
		expect(bar.Value).toBe(20);
		bar.SetValue(-5);
		expect(bar.Value).toBe(10);
		expect(new ProgressBarController({ Min: 5, Max: 5 }).Percent).toBe(0);
	});

	it("Step advances; reaching the maximum fires complete once per arrival", () => {
		const bar = new ProgressBarController({ StepSize: 40 });
		const complete = vi.fn();
		const change = vi.fn();
		bar.Events.On("complete", complete);
		bar.Events.On("change", change);
		bar.Step();
		bar.Step();
		bar.Step();
		bar.Step();
		expect(bar.Value).toBe(100);
		expect(complete).toHaveBeenCalledOnce();
		expect(change).toHaveBeenCalledTimes(3);
		bar.SetValue(50);
		bar.SetValue(100);
		expect(complete).toHaveBeenCalledTimes(2);
	});

	it("marquee and the Vista/7 paused/error states are flags with their own events", () => {
		const bar = new ProgressBarController();
		const states: ProgressState[] = [];
		const marquee: boolean[] = [];
		bar.Events.On("state-change", (s) => states.push(s));
		bar.Events.On("marquee-change", (m) => marquee.push(m));
		bar.SetState(ProgressState.Paused);
		bar.SetState(ProgressState.Paused);
		bar.SetState(ProgressState.Error);
		bar.SetMarquee(true);
		bar.SetMarquee(true);
		expect(states).toEqual([ProgressState.Paused, ProgressState.Error]);
		expect(marquee).toEqual([true]);
		expect([bar.State, bar.Marquee]).toEqual([ProgressState.Error, true]);
		expect(new ProgressBarController().State).toBe(ProgressState.Normal);
	});
});

describe("TabsController", () => {
	const tabs = [{ Id: "general", Label: "General" }, { Id: "sharing", Label: "Sharing", Disabled: true }, { Id: "security", Label: "Security" }];

	it("starts on the first enabled tab unless told otherwise, and selects enabled tabs only", () => {
		const control = new TabsController({ Tabs: tabs });
		expect(control.SelectedId).toBe("general");
		const change = vi.fn();
		control.Events.On("change", change);
		control.Select("sharing");
		control.Select("nope");
		control.Select("security");
		control.Select("security");
		expect(change.mock.calls).toEqual([["security", "general"]]);
		expect(new TabsController({ Tabs: tabs, SelectedId: "security" }).SelectedId).toBe("security");
		expect(new TabsController({ Tabs: [] }).SelectedId).toBeNull();
	});

	it("a cancelable 'selecting' event can veto the switch", () => {
		const control = new TabsController({ Tabs: tabs });
		control.Events.On("selecting", (event) => { if (event.To === "security") event.Cancel(); });
		control.Select("security");
		expect(control.SelectedId).toBe("general");
	});

	it("arrow keys, Home/End and Ctrl+Tab move between enabled tabs, wrapping", () => {
		const control = new TabsController({ Tabs: tabs });
		control.KeyDown("ArrowRight");
		expect(control.SelectedId).toBe("security");
		control.KeyDown("ArrowRight");
		expect(control.SelectedId).toBe("general");
		control.KeyDown("ArrowLeft");
		expect(control.SelectedId).toBe("security");
		control.KeyDown("Home");
		expect(control.SelectedId).toBe("general");
		control.KeyDown("End");
		expect(control.SelectedId).toBe("security");
		control.KeyDown("Tab", { Ctrl: true });
		expect(control.SelectedId).toBe("general");
		control.KeyDown("Tab", { Ctrl: true, Shift: true });
		expect(control.SelectedId).toBe("security");
		control.KeyDown("Tab");
		control.KeyDown("KeyQ");
		expect(control.SelectedId).toBe("security");
	});

	it("keys do nothing when disabled or empty", () => {
		const off = new TabsController({ Tabs: tabs, Enabled: false });
		off.KeyDown("ArrowRight");
		off.Select("security");
		expect(off.SelectedId).toBe("general");
		const empty = new TabsController({ Tabs: [] });
		empty.KeyDown("ArrowRight");
		expect(empty.SelectedId).toBeNull();
	});
});
