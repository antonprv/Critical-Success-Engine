// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ParseLayout, type LayoutNode } from "../../Source/Documents/Layout";
import { UiDocument } from "../../Source/Documents/UiDocument";
import WinLayoutView from "../../Source/Documents/WinLayoutView.vue";
import type { QuasarController } from "../../Source/Quasar/QuasarController";
import { GetQuasarServices } from "../../Source/Quasar/QuasarServices";

// The sample apps of S6-08 (Content/Samples): made of palette widgets alone - no CSS, no classes, no styles.

const folder = join(__dirname, "../../Content/Samples");
const Sample = (name: string): UiDocument => new UiDocument(ParseLayout(readFileSync(join(folder, `${name}.ui.json`), "utf8")));
const Nodes = (node: LayoutNode): LayoutNode[] => [node, ...(node.Children ?? []).flatMap(Nodes)];

describe("the sample apps", () => {
	it("are layouts of palette widgets, with no CSS of their own, and draw", async () => {
		const files = readdirSync(folder);
		expect(files.sort()).toEqual(["DataTable.ui.json", "PropertyEditor.ui.json", "Settings.ui.json"]);
		for (const file of files) {
			const text = readFileSync(join(folder, file), "utf8");
			const layout = ParseLayout(text);
			// nothing in the file the format drops (it only adds empty lists of children to containers)
			const Bare = (value: string): unknown => JSON.parse(value, (key, item: unknown) => (key === "Children" && Array.isArray(item) && item.length === 0 ? undefined : item));
			expect(Bare(text)).toEqual(Bare(JSON.stringify(layout)));
			expect(layout.Skin).toBeUndefined();
			for (const node of Nodes(layout.Root)) {
				expect(Object.keys(node.Props).some((key) => key === "class" || key === "style" || key.endsWith("-class") || key.endsWith("-style")), `${file}: ${node.Name}`).toBe(false);
			}
			const view = mount(WinLayoutView, { props: { document: new UiDocument(layout) } });
			await flushPromises();
			await vi.waitFor(() => expect(view.find(".win-quasar--loading").exists()).toBe(false));
			view.unmount();
		}
	});

	it("work: the data table filters as you type, settings switch tabs, the editor applies and notifies", async () => {
		const table = Sample("DataTable");
		table.Controller<QuasarController>("Filter").SetValue("Rogue");
		expect(table.Controller<QuasarController>("Data").Props["filter"]).toBe("Rogue");

		const settings = Sample("Settings");
		settings.Controller<QuasarController>("Tabs").SetValue("graphics");
		expect(settings.Controller<QuasarController>("Panels").Value).toBe("graphics");

		const notify = vi.spyOn(GetQuasarServices(), "Notify").mockResolvedValue(() => undefined);
		const editor = Sample("PropertyEditor");
		editor.Controller<QuasarController>("NameInput").SetValue("Hero");
		expect(editor.PressHotkey("Ctrl+Enter")).toBe(true);
		expect(notify).toHaveBeenCalledWith({ message: "Hero applied", type: "positive" });
		editor.Controller<QuasarController>("Reset").Raise("click", []);
		expect(editor.Controller<QuasarController>("NameInput").Value).toBe("Player");
	});
});
