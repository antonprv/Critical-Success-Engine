// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { afterEach, describe, expect, it, vi } from "vitest";
import { ComboBoxController } from "../Source/Controls/ComboBoxController";
import { MessageBoxButtons, MessageBoxController, MessageBoxIcon, MessageBoxResult } from "../Source/Controls/MessageBoxController";
import { ScrollBarController } from "../Source/Controls/ScrollBarController";
import { SpinnerController } from "../Source/Controls/SpinnerController";
import { StatusBarController } from "../Source/Controls/StatusBarController";
import { TextBoxController } from "../Source/Controls/TextBoxController";
import { ToolbarController } from "../Source/Controls/ToolbarController";
import { TooltipController } from "../Source/Controls/TooltipController";

afterEach(() => vi.useRealTimers());

describe("TextBoxController", () => {
	it("user input respects MaxLength and ReadOnly; SetValue from code ignores ReadOnly but not MaxLength", () => {
		const box = new TextBoxController({ MaxLength: 5 });
		const change = vi.fn();
		box.Events.On("change", change);
		box.Input("Hello, world");
		expect(box.Value).toBe("Hello");
		box.ReadOnly = true;
		box.Input("Bye");
		expect(box.Value).toBe("Hello");
		box.SetValue("Changed by code");
		expect(box.Value).toBe("Chang");
		box.SetValue("Chang");
		expect(change.mock.calls).toEqual([["Hello", ""], ["Chang", "Hello"]]);
	});

	it("selection: Select clamps to the text, SelectAll covers it, both report; Ctrl+A selects all", () => {
		const box = new TextBoxController({ Value: "notes.txt" });
		const selections: number[][] = [];
		box.Events.On("select", (start, end) => selections.push([start, end]));
		box.Select(-3, 5);
		box.Select(4, 99);
		box.Select(4, 99);
		box.KeyDown("KeyA", { Ctrl: true });
		box.KeyDown("KeyA");
		expect(selections).toEqual([[0, 5], [4, 9], [0, 9]]);
		expect(box.SelectedText).toBe("notes.txt");
	});

	it("disabled boxes take no input; typing replaces the value and puts the caret at its end", () => {
		const box = new TextBoxController({ Value: "abc", Enabled: false });
		box.Input("x");
		expect(box.Value).toBe("abc");
		box.SetEnabled(true);
		box.Input("xy");
		expect([box.Value, box.SelectionStart, box.SelectionEnd]).toEqual(["xy", 2, 2]);
		expect(new TextBoxController()).toMatchObject({ Value: "", MaxLength: Infinity, ReadOnly: false, Password: false, Placeholder: "" });
	});
});

describe("SpinnerController", () => {
	it("steps, clamps and reports; keys step by one, ten (page) or jump to the ends", () => {
		const spin = new SpinnerController({ Min: 0, Max: 20, Step: 2, Value: 10 });
		const change = vi.fn();
		spin.Events.On("change", change);
		spin.Increment();
		spin.Decrement();
		spin.KeyDown("ArrowUp");
		spin.KeyDown("PageUp");
		expect(spin.Value).toBe(20);
		spin.KeyDown("ArrowDown");
		spin.KeyDown("PageDown");
		spin.KeyDown("Home");
		expect(spin.Value).toBe(0);
		spin.KeyDown("End");
		spin.KeyDown("KeyX");
		expect(spin.Value).toBe(20);
		expect(change.mock.calls.map((c) => c[0])).toEqual([12, 10, 12, 20, 18, 0, 20]);
	});

	it("Wrap goes round the ends instead of stopping", () => {
		const spin = new SpinnerController({ Min: 1, Max: 3, Value: 3, Wrap: true });
		spin.Increment();
		expect(spin.Value).toBe(1);
		spin.Decrement();
		expect(spin.Value).toBe(3);
	});

	it("typed text is parsed; text that is not a number is rejected and the value stays", () => {
		const spin = new SpinnerController({ Min: 0, Max: 100, Value: 5 });
		expect(spin.CommitText(" 42 ")).toBe(true);
		expect(spin.Value).toBe(42);
		expect(spin.CommitText("abc")).toBe(false);
		expect(spin.CommitText("500")).toBe(true);
		expect(spin.Value).toBe(100);
		expect(new SpinnerController()).toMatchObject({ Min: 0, Max: 100, Step: 1, Value: 0, Wrap: false });
	});

	it("a disabled spinner ignores input", () => {
		const spin = new SpinnerController({ Enabled: false });
		spin.Increment();
		spin.KeyDown("End");
		expect(spin.CommitText("7")).toBe(false);
		expect(spin.Value).toBe(0);
	});
});

describe("ComboBoxController", () => {
	const options = [{ Value: "arial", Label: "Arial" }, { Value: "courier", Label: "Courier New" }, { Value: "comic", Label: "Comic Sans MS" }, { Value: "times", Label: "Times New Roman" }];

	it("opens and closes its list; choosing an item selects it, reports it and closes", () => {
		const combo = new ComboBoxController({ Options: options });
		const opens: boolean[] = [];
		const change = vi.fn();
		combo.Events.On("open-change", (open) => opens.push(open));
		combo.Events.On("change", change);
		expect([combo.SelectedIndex, combo.SelectedOption]).toEqual([-1, null]);
		combo.Toggle();
		expect(combo.HighlightedIndex).toBe(0);
		combo.Choose(2);
		combo.Choose(99);
		expect([combo.Open, combo.SelectedIndex, combo.SelectedOption?.Label]).toEqual([false, 2, "Comic Sans MS"]);
		combo.Close();
		expect(opens).toEqual([true, false]);
		expect(change).toHaveBeenCalledWith(2, "comic");
	});

	it("closed: arrows change the selection directly; Alt+Down opens; Home/End jump", () => {
		const combo = new ComboBoxController({ Options: options, SelectedIndex: 1 });
		combo.KeyDown("ArrowDown");
		expect(combo.SelectedIndex).toBe(2);
		combo.KeyDown("ArrowUp");
		combo.KeyDown("ArrowUp");
		combo.KeyDown("ArrowUp");
		expect(combo.SelectedIndex).toBe(0);
		combo.KeyDown("End");
		expect(combo.SelectedIndex).toBe(3);
		combo.KeyDown("Home");
		combo.KeyDown("ArrowDown", { Alt: true });
		expect(combo.Open).toBe(true);
		expect(combo.HighlightedIndex).toBe(0);
	});

	it("open: arrows move the highlight, Enter chooses it, Escape closes without choosing, F4 toggles", () => {
		const combo = new ComboBoxController({ Options: options, SelectedIndex: 0 });
		combo.KeyDown("F4");
		combo.KeyDown("ArrowDown");
		combo.KeyDown("ArrowDown");
		combo.KeyDown("ArrowUp");
		combo.KeyDown("End");
		combo.KeyDown("Home");
		combo.KeyDown("ArrowDown");
		expect(combo.HighlightedIndex).toBe(1);
		combo.KeyDown("Escape");
		expect([combo.Open, combo.SelectedIndex]).toEqual([false, 0]);
		combo.KeyDown("F4");
		combo.KeyDown("ArrowDown");
		combo.KeyDown("Enter");
		expect([combo.Open, combo.SelectedIndex]).toEqual([false, 1]);
		combo.KeyDown("Enter"); // closed: nothing
		combo.KeyDown("Escape");
		combo.KeyDown("ArrowUp", { Alt: true });
		expect(combo.Open).toBe(true);
		combo.KeyDown("ArrowUp", { Alt: true });
		expect(combo.Open).toBe(false);
	});

	it("typing a letter picks the next item starting with it, cycling through matches", () => {
		const combo = new ComboBoxController({ Options: options });
		combo.KeyDown("KeyC");
		expect(combo.SelectedIndex).toBe(1);
		combo.KeyDown("KeyC");
		expect(combo.SelectedIndex).toBe(2);
		combo.KeyDown("KeyC");
		expect(combo.SelectedIndex).toBe(1);
		combo.KeyDown("KeyZ");
		expect(combo.SelectedIndex).toBe(1);
		combo.KeyDown("F4");
		combo.KeyDown("KeyT");
		expect(combo.HighlightedIndex).toBe(3);
	});

	it("does nothing when disabled or empty; Highlight follows the pointer", () => {
		const off = new ComboBoxController({ Options: options, Enabled: false });
		off.Toggle();
		off.KeyDown("ArrowDown");
		off.Choose(1);
		expect([off.Open, off.SelectedIndex]).toEqual([false, -1]);
		const empty = new ComboBoxController({ Options: [] });
		empty.KeyDown("ArrowDown");
		empty.Toggle();
		expect(empty.HighlightedIndex).toBe(-1);
		const combo = new ComboBoxController({ Options: options });
		combo.Toggle();
		combo.Highlight(3);
		combo.Highlight(42);
		expect(combo.HighlightedIndex).toBe(3);
	});
});

describe("ScrollBarController", () => {
	it("value runs from Min to Max - PageSize; lines and pages move it; the thumb size follows the page", () => {
		const bar = new ScrollBarController({ Min: 0, Max: 100, PageSize: 25, SmallChange: 5 });
		const scroll = vi.fn();
		bar.Events.On("scroll", scroll);
		expect([bar.MaxValue, bar.ThumbSize, bar.ThumbPosition]).toEqual([75, 0.25, 0]);
		bar.LineDown();
		bar.PageDown();
		expect(bar.Value).toBe(30);
		bar.PageDown();
		bar.PageDown();
		expect(bar.Value).toBe(75);
		expect(bar.ThumbPosition).toBe(0.75);
		bar.LineUp();
		bar.PageUp();
		expect(bar.Value).toBe(45);
		bar.SetValue(-10);
		bar.SetValue(0);
		expect(scroll.mock.calls.map((c) => c[0])).toEqual([5, 30, 55, 75, 70, 45, 0]);
	});

	it("dragging the thumb maps a track position; keys scroll; a page larger than the range leaves nothing to scroll", () => {
		const bar = new ScrollBarController({ Max: 200, PageSize: 50 });
		bar.SetThumbPosition(0.5);
		expect(bar.Value).toBe(75);
		bar.KeyDown("ArrowDown");
		bar.KeyDown("PageDown");
		bar.KeyDown("ArrowUp");
		bar.KeyDown("End");
		expect(bar.Value).toBe(150);
		bar.KeyDown("Home");
		bar.KeyDown("PageUp");
		bar.KeyDown("KeyQ");
		expect(bar.Value).toBe(0);

		const full = new ScrollBarController({ Max: 10, PageSize: 50 });
		full.LineDown();
		expect([full.Value, full.MaxValue, full.ThumbSize, full.ThumbPosition]).toEqual([0, 0, 1, 0]);
		expect(new ScrollBarController()).toMatchObject({ Min: 0, Max: 100, PageSize: 10, SmallChange: 1, Value: 0 });
	});

	it("disabled bars ignore input", () => {
		const bar = new ScrollBarController({ Enabled: false });
		bar.LineDown();
		bar.PageDown();
		bar.SetThumbPosition(1);
		bar.KeyDown("End");
		expect(bar.Value).toBe(0);
	});
});

describe("MessageBoxController", () => {
	it("each button set offers the classic results in the classic order", () => {
		expect(MessageBoxController.ResultsFor(MessageBoxButtons.Ok)).toEqual([MessageBoxResult.Ok]);
		expect(MessageBoxController.ResultsFor(MessageBoxButtons.OkCancel)).toEqual([MessageBoxResult.Ok, MessageBoxResult.Cancel]);
		expect(MessageBoxController.ResultsFor(MessageBoxButtons.YesNo)).toEqual([MessageBoxResult.Yes, MessageBoxResult.No]);
		expect(MessageBoxController.ResultsFor(MessageBoxButtons.YesNoCancel)).toEqual([MessageBoxResult.Yes, MessageBoxResult.No, MessageBoxResult.Cancel]);
		expect(MessageBoxController.ResultsFor(MessageBoxButtons.RetryCancel)).toEqual([MessageBoxResult.Retry, MessageBoxResult.Cancel]);
		expect(MessageBoxController.ResultsFor(MessageBoxButtons.AbortRetryIgnore)).toEqual([MessageBoxResult.Abort, MessageBoxResult.Retry, MessageBoxResult.Ignore]);
		expect(MessageBoxController.Label(MessageBoxResult.Ignore)).toBe("Ignore");
	});

	it("choosing a result closes it once and reports the result", () => {
		const box = new MessageBoxController({ Title: "Notepad", Text: "Save changes?", Icon: MessageBoxIcon.Warning, Buttons: MessageBoxButtons.YesNoCancel });
		const close = vi.fn();
		box.Events.On("close", close);
		expect([box.Result, box.Closed, box.Results.length]).toEqual([null, false, 3]);
		box.Choose(MessageBoxResult.Ok); // not one of its buttons
		box.Choose(MessageBoxResult.No);
		box.Choose(MessageBoxResult.Yes);
		expect([box.Result, box.Closed]).toEqual([MessageBoxResult.No, true]);
		expect(close).toHaveBeenCalledOnce();
		expect(close).toHaveBeenCalledWith(MessageBoxResult.No);
	});

	it("Enter presses the default button; Escape means Cancel only where there is one (as in Windows)", () => {
		const yesNoCancel = new MessageBoxController({ Buttons: MessageBoxButtons.YesNoCancel, DefaultButton: 1 });
		yesNoCancel.KeyDown("Enter");
		expect(yesNoCancel.Result).toBe(MessageBoxResult.No);

		const okCancel = new MessageBoxController({ Buttons: MessageBoxButtons.OkCancel });
		okCancel.KeyDown("KeyX");
		okCancel.KeyDown("Escape");
		expect(okCancel.Result).toBe(MessageBoxResult.Cancel);

		const yesNo = new MessageBoxController({ Buttons: MessageBoxButtons.YesNo });
		yesNo.KeyDown("Escape");
		expect(yesNo.Closed).toBe(false);

		const ok = new MessageBoxController();
		ok.KeyDown("Escape"); // a lone OK box closes with OK
		expect(ok.Result).toBe(MessageBoxResult.Ok);
		expect(new MessageBoxController({ DefaultButton: 9 }).DefaultButton).toBe(0);
		expect(ok).toMatchObject({ Title: "", Text: "", Icon: MessageBoxIcon.None });
	});
});

describe("TooltipController", () => {
	it("shows after the initial delay while the pointer stays, hides when it leaves or presses", () => {
		vi.useFakeTimers();
		const tip = new TooltipController({ Text: "Save the file", Delay: 500 });
		const log: string[] = [];
		tip.Events.On("show", () => log.push("show"));
		tip.Events.On("hide", () => log.push("hide"));
		tip.PointerEnter();
		vi.advanceTimersByTime(499);
		expect(tip.Shown).toBe(false);
		vi.advanceTimersByTime(1);
		expect(tip.Shown).toBe(true);
		tip.PointerDown();
		tip.PointerLeave();
		tip.PointerEnter();
		tip.PointerLeave();
		vi.advanceTimersByTime(1000);
		expect(log).toEqual(["show", "hide"]);
	});

	it("hides by itself after AutoPopDelay; disabled tooltips never show; defaults are the Windows ones", () => {
		vi.useFakeTimers();
		const tip = new TooltipController({ Text: "x", Delay: 100, AutoPopDelay: 1000 });
		tip.PointerEnter();
		tip.PointerEnter();
		vi.advanceTimersByTime(100);
		vi.advanceTimersByTime(1000);
		expect(tip.Shown).toBe(false);

		const off = new TooltipController({ Text: "x", Enabled: false });
		off.PointerEnter();
		vi.advanceTimersByTime(5000);
		expect(off.Shown).toBe(false);
		expect(new TooltipController()).toMatchObject({ Text: "", Delay: 500, AutoPopDelay: 5000 });
	});
});

describe("StatusBarController", () => {
	it("holds panels whose text can be changed by index, reporting changes", () => {
		const bar = new StatusBarController({ Panels: [{ Text: "Ready" }, { Text: "Ln 1, Col 1", Width: 120 }] });
		const change = vi.fn();
		bar.Events.On("change", change);
		bar.SetText(1, "Ln 3, Col 7");
		bar.SetText(1, "Ln 3, Col 7");
		bar.SetText(5, "nope");
		expect(bar.Panels.map((p) => p.Text)).toEqual(["Ready", "Ln 3, Col 7"]);
		expect(change).toHaveBeenCalledOnce();
		expect(change).toHaveBeenCalledWith(1, "Ln 3, Col 7");
	});
});

describe("ToolbarController", () => {
	const buttons = () => [
		{ Id: "new", Label: "New" },
		{ Id: "bold", Label: "Bold", Toggle: true },
		{ Id: "left", Label: "Left", Toggle: true, Group: "align", Pressed: true },
		{ Id: "center", Label: "Center", Toggle: true, Group: "align" },
		{ Id: "print", Label: "Print", Disabled: true },
	];

	it("plain buttons click; toggles flip; buttons in a group act like radio buttons", () => {
		const toolbar = new ToolbarController({ Buttons: buttons() });
		const clicks: string[] = [];
		const toggles: [string, boolean][] = [];
		toolbar.Events.On("click", (id) => clicks.push(id));
		toolbar.Events.On("toggle", (id, pressed) => toggles.push([id, pressed]));
		toolbar.Click("new");
		toolbar.Click("bold");
		toolbar.Click("bold");
		toolbar.Click("center");
		toolbar.Click("center"); // a pressed group button stays pressed
		toolbar.Click("print");
		toolbar.Click("nope");
		expect(clicks).toEqual(["new", "bold", "bold", "center", "center"]);
		expect(toggles).toEqual([["bold", true], ["bold", false], ["left", false], ["center", true]]);
		expect(toolbar.IsPressed("center")).toBe(true);
		expect(toolbar.IsPressed("left")).toBe(false);
		expect(toolbar.IsPressed("nope")).toBe(false);
	});

	it("a disabled toolbar ignores clicks; SetDisabled switches single buttons", () => {
		const toolbar = new ToolbarController({ Buttons: buttons(), Enabled: false });
		const click = vi.fn();
		toolbar.Events.On("click", click);
		toolbar.Click("new");
		toolbar.SetEnabled(true);
		toolbar.SetDisabled("new", true);
		toolbar.Click("new");
		toolbar.SetDisabled("print", false);
		toolbar.SetDisabled("nope", false);
		toolbar.Click("print");
		expect(click.mock.calls).toEqual([["print"]]);
	});
});
