// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { QuasarController } from "../../Source/Quasar/QuasarController";
import { QuasarComponentTable } from "../../Source/Quasar/QuasarTable.generated";

const Row = (name: string) => QuasarComponentTable.find((row) => row.Name === name)!;

describe("QuasarController", () => {
	it("keeps the layout's props apart from its value, and starts disabled when the layout says so", () => {
		const props = { label: "Name", "model-value": "Ann", disable: true };
		const control = new QuasarController(Row("QInput"), props);
		expect(control.Props).toEqual({ label: "Name", disable: true });
		expect(control.Value).toBe("Ann");
		expect(control.Enabled).toBe(false);
		control.Props["label"] = "Changed";
		expect(props.label).toBe("Name"); // a copy: the layout isn't touched
		expect(new QuasarController(Row("QChip"), {}).Value).toBeUndefined();
	});

	it("shows its text as a label prop when it has one, else in its default slot", () => {
		const button = new QuasarController(Row("QBtn"), { label: "Ok" });
		expect(button.Label).toBe("Ok");
		button.Label = "Cancel";
		expect(button.Props["label"]).toBe("Cancel");
		const title = new QuasarController(Row("QToolbarTitle"), {}, "Title");
		expect(title.Label).toBe("Title");
		title.Label = "Other";
		expect(title.Content).toBe("Other");
		title.SetProp("shrink", true);
		expect(title.Props["shrink"]).toBe(true);
	});

	it("emits change once per new value, and reads a boolean value as Checked", () => {
		const toggle = new QuasarController(Row("QToggle"), { "model-value": false });
		const change = vi.fn(), update = vi.fn();
		toggle.Events.On("change", change);
		toggle.Events.On("update:model-value", update);
		expect(toggle.Checked).toBe(false);
		toggle.Raise("update:model-value", [true]);
		toggle.SetValue(true);
		expect(change).toHaveBeenCalledOnce();
		expect(update).toHaveBeenCalledWith(true);
		expect(toggle.Checked).toBe(true);
		expect(new QuasarController(Row("QInput"), { "model-value": "x" }).Checked).toBeUndefined();
		const click = vi.fn();
		toggle.Events.On("focus", click);
		toggle.Raise("focus", ["event"]);
		expect(click).toHaveBeenCalledWith("event");
	});

	it("fills the list a component shows", () => {
		const select = new QuasarController(Row("QSelect"), {});
		select.SetItems(["a", "b"]);
		expect(select.Props["options"]).toEqual(["a", "b"]);
		const table = new QuasarController(Row("QTable"), {});
		table.SetItems(["Alpha", { name: "Beta", value: 2 }]);
		expect(table.Props["rows"]).toEqual([{ name: "Alpha" }, { name: "Beta", value: 2 }]);
		const tree = new QuasarController(Row("QTree"), {});
		tree.SetItems(["Root", { label: "Other" }]);
		expect(tree.Props["nodes"]).toEqual([{ label: "Root" }, { label: "Other" }]);
		expect(() => new QuasarController(Row("QBtn"), {}).SetItems(["x"])).toThrow("QBtn has no list of items");
	});

	it("calls the methods of its mounted component, and passes focus to it", () => {
		const dialog = new QuasarController(Row("QDialog"), {});
		expect(() => dialog.Call("show")).toThrow('QDialog has no method "show" (or isn\'t on screen yet)');
		const instance = { show: vi.fn(() => "shown"), focus: vi.fn(), blur: vi.fn() };
		dialog.Bind(instance);
		expect(dialog.Call("show", 1)).toBe("shown");
		expect(instance.show).toHaveBeenCalledWith(1);
		dialog.Focus();
		dialog.Focus(); // already focused: once
		expect(instance.focus).toHaveBeenCalledOnce();
		dialog.Blur();
		expect(instance.blur).toHaveBeenCalledOnce();
		dialog.SetEnabled(false);
		dialog.Focus(); // a disabled control takes no focus
		expect(instance.focus).toHaveBeenCalledOnce();
		dialog.Bind(null);
		dialog.SetEnabled(true);
		dialog.Focus(); // nothing mounted: nothing to call
		dialog.Blur();
		expect(instance.focus).toHaveBeenCalledOnce();
	});
});
