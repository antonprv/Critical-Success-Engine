// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { CodeSession, LanguageOf, MemoryCodeHost } from "../Source/Code/CodeSession";

function Make() {
	const host = new MemoryCodeHost({ "Source/Game.ts": "export const Speed = 5;\n", "Source/UI/HudNodes.ts": "export class HudNodes {}\n", "Source/Notes.md": "# Notes\n" });
	return { host, session: new CodeSession(host) };
}

describe("CodeSession: the code editor's files and tabs (whatever shows them)", () => {
	it("lists the project's code files; knows each one's language", async () => {
		const { session } = Make();
		await session.Refresh();
		expect(session.State.Files).toEqual(["Source/Game.ts", "Source/Notes.md", "Source/UI/HudNodes.ts"]);
		expect(["a.ts", "a.tsx", "a.js", "a.json", "a.md", "a.css", "a.txt"].map(LanguageOf)).toEqual(["typescript", "typescript", "javascript", "json", "markdown", "css", "plaintext"]);
	});

	it("opens a file in a tab (once), the one active; editing marks it changed; saving writes it and clears the mark", async () => {
		const { host, session } = Make();
		await session.Open("Source/Game.ts");
		await session.Open("Source/UI/HudNodes.ts");
		await session.Open("Source/Game.ts"); // already open: just active again
		expect(session.State.Tabs.map((t) => t.Path)).toEqual(["Source/Game.ts", "Source/UI/HudNodes.ts"]);
		expect(session.State.Active).toBe("Source/Game.ts");
		const tab = session.Tab("Source/Game.ts")!;
		expect([tab.Text, tab.Language, tab.Changed]).toEqual(["export const Speed = 5;\n", "typescript", false]);
		session.Edit("Source/Game.ts", "export const Speed = 7;\n");
		expect(session.Tab("Source/Game.ts")!.Changed).toBe(true);
		session.Edit("Source/Game.ts", "export const Speed = 5;\n"); // back as it was: not changed
		expect(session.Tab("Source/Game.ts")!.Changed).toBe(false);
		session.Edit("Source/Game.ts", "export const Speed = 9;\n");
		expect(await session.Save()).toBe("Saved Source/Game.ts");
		expect([await host.Read("Source/Game.ts"), session.Tab("Source/Game.ts")!.Changed]).toEqual(["export const Speed = 9;\n", false]);
	});

	it("a failed save keeps the changes and says why; saving with nothing open or nothing changed says so", async () => {
		const { host, session } = Make();
		expect(await session.Save()).toBe("No file is open");
		await session.Open("Source/Game.ts");
		expect(await session.Save()).toBe("Source/Game.ts has no changes");
		session.Edit("Source/Game.ts", "changed");
		vi.spyOn(host, "Write").mockRejectedValueOnce(new Error("The disk is full"));
		expect(await session.Save()).toBe("Could not save Source/Game.ts: The disk is full");
		expect(session.Tab("Source/Game.ts")!.Changed).toBe(true);
		expect(await session.Open("Source/Nope.ts")).toBe("Could not open Source/Nope.ts: There is no Source/Nope.ts");
	});

	it("closing a tab makes its neighbour active; a changed one is kept unless closing is confirmed", async () => {
		const { session } = Make();
		await session.Open("Source/Game.ts");
		await session.Open("Source/Notes.md");
		await session.Open("Source/UI/HudNodes.ts");
		session.Close("Source/Game.ts"); // not the active one: the active tab stays
		expect(session.State.Active).toBe("Source/UI/HudNodes.ts");
		await session.Open("Source/Game.ts");
		session.Activate("Source/Notes.md");
		session.Edit("Source/Notes.md", "# Changed\n");
		expect(session.Close("Source/Notes.md")).toBe(false); // changed: kept
		expect(session.Close("Source/Notes.md", true)).toBe(true); // confirmed: closed, changes gone
		expect([session.State.Tabs.map((t) => t.Path), session.State.Active]).toEqual([["Source/UI/HudNodes.ts", "Source/Game.ts"], "Source/UI/HudNodes.ts"]); // its right-hand neighbour
		session.Close("Source/Game.ts");
		expect(session.State.Active).toBe("Source/UI/HudNodes.ts");
		session.Close("Source/UI/HudNodes.ts");
		expect(session.State.Active).toBeNull();
		expect(session.Close("Source/Ghost.ts")).toBe(false);
		session.Edit("Source/Ghost.ts", "x"); // not open: nothing
		session.Activate("Source/Ghost.ts");
		expect(session.State.Active).toBeNull();
	});

	it("a new file appears in the list; the memory host says what isn't there", async () => {
		const { host, session } = Make();
		await host.Write("Source/New.ts", "export {};\n");
		await session.Refresh();
		expect(session.State.Files).toContain("Source/New.ts");
		await expect(host.Read("Source/Missing.ts")).rejects.toThrow("There is no Source/Missing.ts");
		await expect(new MemoryCodeHost().Files()).resolves.toEqual([]);
	});

	it("reads every file's text for the language service; one that can't be read is left out", async () => {
		const { host, session } = Make();
		await session.Refresh();
		vi.spyOn(host, "Read").mockImplementation(async (path) => { if (path === "Source/Notes.md") throw new Error("locked"); return `// ${path}`; });
		expect(await session.ReadAll()).toEqual({ "Source/Game.ts": "// Source/Game.ts", "Source/UI/HudNodes.ts": "// Source/UI/HudNodes.ts" });
	});
});
