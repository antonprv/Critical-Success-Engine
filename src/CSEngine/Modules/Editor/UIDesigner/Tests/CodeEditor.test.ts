// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import { CodeSession, MemoryCodeHost } from "../Source/Code/CodeSession";
import { MonacoView } from "../Source/Code/MonacoView";

// Monaco itself runs only in a real browser: here every load of it gets the current test's stand-in (it stays set up).
const loaded = vi.hoisted(() => ({ monaco: null as unknown }));
vi.mock("../Source/Code/MonacoSetup", () => ({ get monaco() { return loaded.monaco; } }));

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0)); await nextTick(); };

/** Monaco, as far as the view uses it: models with text and change listeners, an editor showing one. */
function FakeMonaco() {
	const models: { uri: string; language: string; text: string; disposed: boolean; listeners: (() => void)[]; getValue(): string; setValue(text: string): void; onDidChangeContent(listener: () => void): void; dispose(): void; }[] = [];
	const editor = { model: null as unknown, options: {} as Record<string, unknown>, setModel(model: unknown) { this.model = model; }, dispose: vi.fn() };
	const monaco = {
		editor: {
			create: vi.fn((_element: HTMLElement, options: Record<string, unknown>) => { editor.options = options; return editor; }),
			createModel: vi.fn((text: string, language: string, uri: { path: string; }) => {
				const model = {
					uri: uri.path, language, text, disposed: false, listeners: [] as (() => void)[],
					getValue() { return this.text; },
					setValue(value: string) { this.text = value; for (const listener of this.listeners) listener(); },
					onDidChangeContent(listener: () => void) { this.listeners.push(listener); },
					dispose() { this.disposed = true; },
				};
				models.push(model);
				return model;
			}),
			setTheme: vi.fn(),
		},
		Uri: { parse: (text: string) => ({ path: text }) },
		typescript: { typescriptDefaults: { getDiagnosticsOptions: () => ({ noSemanticValidation: false }), setDiagnosticsOptions: vi.fn() } },
	};
	return { monaco, editor, models };
}

async function Session() {
	const host = new MemoryCodeHost({ "Source/Game.ts": "export const A = 1;\n", "Source/UI/Hud.ts": "export class Hud {}\n" });
	const session = new CodeSession(host);
	await session.Refresh();
	return { host, session };
}

describe("MonacoView: a code session shown in Monaco", () => {
	it("loads every project code file for the language service; a tab uses its file's model; edits reach the session", async () => {
		const { session } = await Session();
		const { monaco, editor, models } = FakeMonaco();
		const view = new MonacoView(monaco as never, document.createElement("div"), session);
		await view.Loaded;
		expect([editor.model, editor.options["theme"]]).toEqual([null, "vs"]);
		expect(models.map((m) => [m.uri, m.language])).toEqual([["file:///Source/Game.ts", "typescript"], ["file:///Source/UI/Hud.ts", "typescript"]]); // the whole project, unseen
		expect(monaco.typescript.typescriptDefaults.setDiagnosticsOptions).toHaveBeenCalledWith({ noSemanticValidation: false }); // and what is shown checked again
		await session.Open("Source/Game.ts");
		await nextTick();
		expect([models.length, editor.model]).toEqual([2, models[0]]); // the file's own model
		models[0]!.setValue("export const A = 2;\n");
		expect(session.Tab("Source/Game.ts")!.Changed).toBe(true);
		view.SetDark(true);
		view.SetDark(false);
		expect(monaco.editor.setTheme.mock.calls).toEqual([["vs-dark"], ["vs"]]);
		view.Dispose();
		expect([models.every((m) => m.disposed), editor.dispose.mock.calls.length, view.Editor]).toEqual([true, 1, editor]);
		new MonacoView(monaco as never, document.createElement("div"), session, true); // made dark
		expect(editor.options["theme"]).toBe("vs-dark");
	});

	it("a closed tab's model goes back to the saved file (edits let go aren't seen); a file outside the project's list is freed", async () => {
		const { session, host } = await Session();
		const { monaco, models } = FakeMonaco();
		const view = new MonacoView(monaco as never, document.createElement("div"), session);
		await view.Loaded;
		await session.Open("Source/Game.ts");
		await nextTick();
		models[0]!.setValue("let go;\n");
		session.Close("Source/Game.ts", true);
		await nextTick();
		expect([models[0]!.disposed, models[0]!.getValue()]).toEqual([false, "export const A = 1;\n"]);
		await session.Open("Source/UI/Hud.ts"); // unchanged, then closed: left as it is
		await nextTick();
		session.Close("Source/UI/Hud.ts");
		await nextTick();
		expect(models[1]!.getValue()).toBe("export class Hud {}\n");
		await host.Write("Source/Late.ts", "export {};\n"); // not in the list (no Refresh yet)
		await session.Open("Source/Late.ts");
		await nextTick();
		session.Close("Source/Late.ts");
		await nextTick();
		expect(models.at(-1)!.disposed).toBe(true);
		const notes = new CodeSession(new MemoryCodeHost({ "Source/Notes.md": "# x\n", "Source/Tool.js": "export {};\n" }));
		await notes.Refresh();
		const other = FakeMonaco();
		delete (other.monaco as { typescript?: unknown; }).typescript; // a Monaco without the TypeScript service: nothing to check again
		await new MonacoView(other.monaco as never, document.createElement("div"), notes).Loaded;
		expect(other.models.map((m) => [m.uri, m.language])).toEqual([["file:///Source/Tool.js", "javascript"]]); // code only
	});
});

describe("WinCodeEditor", () => {
	async function Mounted() {
		const { session, host } = await Session();
		const fake = FakeMonaco();
		loaded.monaco = fake.monaco;
		const { default: WinCodeEditor } = await import("../Source/Code/WinCodeEditor.vue");
		const view = mount(WinCodeEditor, { props: { session }, attachTo: document.body });
		await settle();
		return { session, host, view, fake };
	}

	it("lists the files (indented by folder); a click opens one in a tab; changed tabs are marked; an error is told", async () => {
		const { session, view } = await Mounted();
		expect(view.findAll(".win-code__file").map((f) => [f.text(), f.attributes("style")])).toEqual([["Game.ts", "padding-left: 4px;"], ["Hud.ts", "padding-left: 14px;"]]);
		expect(view.findAll(".win-code__folder").map((f) => f.text())).toEqual(["UI/"]); // its folder, as a heading before it
		session.State.Files.push("Source/UI/Menu.ts");
		await nextTick();
		expect(view.findAll(".win-code__folder").map((f) => f.text())).toEqual(["UI/"]); // once, however many files it has
		expect(view.text()).toContain("Pick a file on the left");
		await view.findAll(".win-code__file")[1]!.trigger("click");
		await settle();
		expect(view.findAll(".win-code__tab").map((t) => t.attributes("title"))).toEqual(["Source/UI/Hud.ts"]);
		expect(view.get(".win-code__file--active").text()).toBe("Hud.ts");
		session.Edit("Source/UI/Hud.ts", "changed");
		await nextTick();
		expect(view.get(".win-code__tab").classes()).toContain("win-code__tab--changed");
		session.State.Files.push("Source/Gone.ts");
		await nextTick();
		await view.findAll(".win-code__file").at(-1)!.trigger("click");
		await settle();
		expect(view.emitted("message")![0]).toEqual(["Could not open Source/Gone.ts: There is no Source/Gone.ts"]);
		view.unmount();
	});

	it("a tab is picked by its name; closing a changed one asks first; the theme follows dark mode", async () => {
		const { session, view, fake } = await Mounted();
		await session.Open("Source/Game.ts");
		await session.Open("Source/UI/Hud.ts");
		await nextTick();
		await view.findAll(".win-code__tab-name")[0]!.trigger("click");
		expect(session.State.Active).toBe("Source/Game.ts");
		session.Edit("Source/Game.ts", "changed");
		const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
		await view.findAll(".win-code__tab-close")[0]!.trigger("click");
		expect(session.Tab("Source/Game.ts")).toBeDefined(); // not confirmed: kept
		await view.findAll(".win-code__tab-close")[0]!.trigger("click");
		expect(session.Tab("Source/Game.ts")).toBeUndefined();
		expect(confirm).toHaveBeenCalledTimes(2);
		await view.findAll(".win-code__tab-close")[0]!.trigger("click"); // unchanged: no question
		expect(confirm).toHaveBeenCalledTimes(2);
		await view.setProps({ dark: true });
		expect(fake.monaco.editor.setTheme).toHaveBeenCalledWith("vs-dark");
		view.unmount();
	});
});

describe("the designer's Code tab", () => {
	it("shows the code editor; Ctrl+S there saves the open file, not the layout; without a code session there is no tab", async () => {
		const fake = FakeMonaco();
		loaded.monaco = fake.monaco;
		const { session, host } = await Session();
		const { default: WinDesigner } = await import("../Source/WinDesigner.vue");
		const view = mount(WinDesigner, { props: { code: session }, attachTo: document.body });
		await view.get('[data-view="code"]').trigger("click");
		await settle();
		expect(view.find(".win-code").exists()).toBe(true);
		await session.Open("Source/Game.ts");
		session.Edit("Source/Game.ts", "export const A = 3;\n");
		const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
		view.get(".win-designer").element.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS", ctrlKey: true, bubbles: true, cancelable: true }));
		await settle();
		expect(await host.Read("Source/Game.ts")).toBe("export const A = 3;\n");
		expect(download).not.toHaveBeenCalled(); // the layout wasn't saved
		expect(view.text()).toContain("Saved Source/Game.ts");
		session.State.Files.push("Source/Gone.ts");
		await nextTick();
		await view.findAll(".win-code__file").at(-1)!.trigger("click");
		await settle();
		expect(view.text()).toContain("Could not open Source/Gone.ts"); // the code editor's messages, in the status bar
		view.get(".win-designer").element.dispatchEvent(new KeyboardEvent("keydown", { code: "Delete", bubbles: true })); // the editor's keys, not the canvas's
		view.unmount();
		const bare = mount(WinDesigner, { props: {} });
		expect(bare.find('[data-view="code"]').exists()).toBe(false);
		bare.unmount();
	});
});

describe("the designer's layout: where the code sits", () => {
	async function Designer() {
		const fake = FakeMonaco();
		loaded.monaco = fake.monaco;
		const { session, host } = await Session();
		const { default: WinDesigner } = await import("../Source/WinDesigner.vue");
		const view = mount(WinDesigner, { props: { code: session }, attachTo: document.body });
		const choose = async (id: string) => {
			(view.vm as unknown as { $: { setupState: { menu: { Invoke(id: string): void; Items: { Id: string; Items?: { Id: string; Checked?: boolean; }[]; }[]; }; }; }; }).$.setupState.menu.Invoke(id);
			await settle();
		};
		const checked = () => (view.vm as unknown as { $: { setupState: { menu: { Items: { Id: string; Items?: { Id: string; Checked?: boolean; }[]; }[]; }; }; }; }).$.setupState.menu.Items.find((i) => i.Id === "view")!.Items!.filter((i) => i.Checked).map((i) => i.Id);
		return { view, session, host, choose, checked, WinDesigner };
	}

	it("the View menu puts the code beside the design on any side (or back in a tab), checks the choice and keeps it", async () => {
		localStorage.clear();
		const { view, choose, checked, WinDesigner } = await Designer();
		expect([view.find('[data-view="code"]').exists(), checked()]).toEqual([true, ["code-tab"]]);
		await view.get('[data-view="code"]').trigger("click");
		await choose("code-right");
		expect(view.find('[data-view="code"]').exists()).toBe(false); // no tab: it is beside the design
		expect(view.get(".win-designer__work").classes()).toContain("win-designer__work--code-right");
		expect(view.find(".win-designer__code-docked .win-code").exists()).toBe(true);
		expect(view.find(".win-designer__canvas").isVisible()).toBe(true); // the design is back in view
		expect(checked()).toEqual(["code-right"]);
		expect(localStorage.getItem("cse.designer.code-place")).toBe("right");
		(view.vm as unknown as { $: { props: { code: CodeSession; }; }; }).$.props.code.State.Files.push("Source/Gone.ts");
		await settle();
		await view.findAll(".win-designer__code-docked .win-code__file").at(-1)!.trigger("click");
		await settle();
		expect(view.text()).toContain("Could not open Source/Gone.ts"); // the docked editor's messages reach the status bar too
		await choose("code-bottom");
		expect(view.get(".win-designer__code-docked").attributes("style")).toMatch(/height: \d+px/);
		expect(view.findComponent({ name: "WinSplitter" }).exists()).toBe(true);
		await choose("code-left");
		await choose("code-top");
		expect(view.get(".win-designer__work").classes()).toContain("win-designer__work--code-top");
		view.unmount();
		const again = mount(WinDesigner, { props: { code: (await Session()).session } }); // the next run starts where it was left
		expect(again.get(".win-designer__work").classes()).toContain("win-designer__work--code-top");
		again.unmount();
		await choose("code-tab");
	});

	it("Ctrl+S saves the code when the code editor has the keys, the layout otherwise; a browser that keeps nothing still moves it", async () => {
		localStorage.clear();
		const { view, session, host, choose } = await Designer();
		await choose("code-right");
		await session.Open("Source/Game.ts");
		session.Edit("Source/Game.ts", "export const A = 4;\n");
		await settle();
		const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
		view.get(".win-code").element.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS", ctrlKey: true, bubbles: true, cancelable: true }));
		await settle();
		expect([await host.Read("Source/Game.ts"), download.mock.calls.length]).toEqual(["export const A = 4;\n", 0]);
		view.get(".win-designer__canvas").element.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS", ctrlKey: true, bubbles: true, cancelable: true }));
		await settle();
		expect(download).toHaveBeenCalled(); // the layout this time
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
		await choose("code-bottom");
		expect(view.get(".win-designer__work").classes()).toContain("win-designer__work--code-bottom");
		const { default: WinDesigner } = await import("../Source/WinDesigner.vue");
		const fresh = mount(WinDesigner, { props: { code: session } });
		expect(fresh.find('[data-view="code"]').exists()).toBe(true); // nothing kept: a tab
		fresh.unmount();
		view.unmount();
	});
});
