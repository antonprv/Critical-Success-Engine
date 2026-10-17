// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import WinSelectList from "../Source/Components/WinSelectList.vue";

const Items = [{ Id: "a", Label: "Alpha" }, { Id: "b", Label: "Beta" }, { Id: "c", Label: "Gamma", Disabled: true }];

describe("WinSelectList", () => {
	it("marks the current item, adds the caller's classes, and a click asks to select that item", async () => {
		const view = mount(WinSelectList, { props: { items: Items, current: "b", itemClass: "mine", currentClass: "mine--current" } });
		const items = view.findAll(".win-selectlist__item");
		expect(items.map((i) => i.text())).toEqual(["Alpha", "Beta", "Gamma"]);
		expect(items.map((i) => i.classes().includes("win-selectlist__item--current"))).toEqual([false, true, false]);
		expect(items[1]!.classes()).toEqual(expect.arrayContaining(["mine", "mine--current"]));
		expect((items[2]!.element as HTMLButtonElement).disabled).toBe(true);
		await items[0]!.trigger("click");
		expect(view.emitted("select")).toEqual([["a"]]);
	});

	it("the arrow keys move the choice over the enabled items and stop at the ends", async () => {
		const view = mount(WinSelectList, { props: { items: Items, current: "a" } });
		await view.get(".win-selectlist").trigger("keydown", { code: "ArrowDown" });
		await view.get(".win-selectlist").trigger("keydown", { code: "ArrowUp" });
		expect(view.emitted("select")).toEqual([["b"], ["a"]]);
	});

	it("other keys pass through, and a list with nothing to choose stays as it is", async () => {
		const view = mount(WinSelectList, { props: { items: Items, current: "a" } });
		await view.get(".win-selectlist").trigger("keydown", { code: "Enter" });
		expect(view.emitted("select")).toBeUndefined();
		const empty = mount(WinSelectList, { props: { items: [{ Id: "x", Label: "Off", Disabled: true }], current: null } });
		await empty.get(".win-selectlist").trigger("keydown", { code: "ArrowDown" });
		expect(empty.emitted("select")).toBeUndefined();
	});
});
