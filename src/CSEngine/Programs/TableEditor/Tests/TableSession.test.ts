// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { Access } from "@cse/cstables";
import { MemoryFileSystem } from "@cse/solution";
import { Forms, OpenTable, RowId, TableError, TableSession } from "../Source/TableSession";

const Base = "# The main menu.\nMenuTitle = Главное меню\nGreeting = Привет, {name}!\nCoins[one] = {count} монета\nCoins[other] = {count} монет\n";
const English = "MenuTitle = Main menu\nGreeting = Hello, {who}!\n";

async function Make(extra: Record<string, string> = {}) {
	const files = new MemoryFileSystem({ "Game.cseproject": "{}", "Resources/UiNames.cstables": Base, "Resources/UiNames.en.cstables": English, ...extra });
	const session = new TableSession({ Files: files });
	await session.Refresh();
	return { files, session };
}

const Cells = (session: TableSession) => session.Rows().map((row) => [row.Cells["Name"], row.Cells["Value"], row.Cells["Comment"]]);

describe("the table editor's session", () => {
	it("lists the project's tables by table and language, opens one in a tab, shows its rows", async () => {
		const { session } = await Make({ "Resources/Other.cstables": "X = x", "Resources/Other.de.cstables": "", "Resources/Other.ab.cstables": "", "Notes.txt": "" });
		expect(session.Tables).toEqual(["Resources/Other.ab.cstables", "Resources/Other.cstables", "Resources/Other.de.cstables", "Resources/UiNames.cstables", "Resources/UiNames.en.cstables"]);
		expect(session.Groups()).toEqual([
			{ Table: "Other", Files: [{ Path: "Resources/Other.cstables", Language: null }, { Path: "Resources/Other.ab.cstables", Language: "ab" }, { Path: "Resources/Other.de.cstables", Language: "de" }] },
			{ Table: "UiNames", Files: [{ Path: "Resources/UiNames.cstables", Language: null }, { Path: "Resources/UiNames.en.cstables", Language: "en" }] },
		]);
		expect(session.Rows()).toEqual([]);
		const table = await session.OpenTable("Resources/UiNames.cstables");
		expect(await session.OpenTable("Resources/UiNames.cstables")).toBe(table);
		expect(table.Name).toEqual({ Table: "UiNames", Language: null });
		expect(Cells(session)).toEqual([
			["MenuTitle", "Главное меню", "The main menu."],
			["Greeting", "Привет, {name}!", ""],
			["Coins[one]", "{count} монета", ""],
			["Coins[other]", "{count} монет", ""],
		]);
		await expect(session.OpenTable("Resources/Nope.cstables")).rejects.toThrow(TableError);
		expect(RowId("Coins", "few")).toBe("Coins[few]");
		expect(Forms).toContain("many");
	});

	it("edits names, values and comments in place, keeping the rest of the file; marks what changed", async () => {
		const { session } = await Make();
		const table = await session.OpenTable("Resources/UiNames.cstables");
		session.Edit("MenuTitle", "Value", "Меню");
		session.Edit("Coins[one]", "Value", "{count} монетка");
		session.Edit("Greeting", "Comment", "Says hello.");
		session.Edit("MenuTitle", "Comment", "");
		session.Edit("Coins[other]", "Name", "Money");
		session.Edit("Money[one]", "Name", "Money[one]");
		expect(table.Text).toBe("MenuTitle = Меню\n# Says hello.\nGreeting = Привет, {name}!\nMoney[one] = {count} монетка\nMoney[other] = {count} монет\n");
		expect(session.Rows().filter((row) => row.Modified).map((row) => row.Id)).toEqual(["MenuTitle", "Money[one]", "Money[other]"]);
		expect(table.Dirty).toBe(true);
		expect(() => session.Edit("Money[one]", "Name", "2bad")).toThrow(/not a key/);
		expect(() => session.Edit("Money[one]", "Name", "Greeting")).toThrow(/already/);
	});

	it("adds keys from the last row, deletes keys, undoes and redoes each step", async () => {
		const { session } = await Make();
		const table = await session.OpenTable("Resources/UiNames.cstables");
		expect(session.Add("Name", " Fresh ")).toBe("Fresh");
		expect(session.Add("Value", "только значение")).toBe("Key1");
		expect(session.Add("Comment", "a note")).toBe("Key2");
		expect(() => session.Add("Name", "Fresh")).toThrow(/already/);
		expect(() => session.Add("Name", "no good")).toThrow(/not a key/);
		session.Delete(["Coins[one]", "Key1"]);
		expect(table.Document.Keys).toEqual(["MenuTitle", "Greeting", "Fresh", "Key2"]);
		expect(table.Document.Comment("Key2")).toBe("a note");
		session.Undo();
		expect(table.Document.Keys).toContain("Coins");
		session.Redo();
		expect(table.Document.Keys).not.toContain("Coins");
		for (let i = 0; i < 6; i++) session.Undo();
		expect(table.Text).toBe(Base);
		expect(table.CanUndo).toBe(false);
		session.Redo();
		expect(table.CanRedo).toBe(true);
		for (let i = 0; i < 6; i++) session.Redo();
		expect(table.CanRedo).toBe(false);
		// A change that changes nothing leaves no step.
		session.Edit("MenuTitle", "Value", "Главное меню");
		session.Undo();
		expect(table.Document.Keys).toContain("Fresh");
	});

	it("pastes a block from a spreadsheet into the rows, adding rows past the end, as one step", async () => {
		const { session } = await Make();
		const table = await session.OpenTable("Resources/UiNames.cstables");
		const order = session.Rows().map((row) => row.Id);
		session.Paste("Меню!\tnote\nПривет!\n", "MenuTitle", "Value", order);
		expect(Cells(session).slice(0, 2)).toEqual([["MenuTitle", "Меню!", "note"], ["Greeting", "Привет!", ""]]);
		session.Paste("Renamed\tx\nCoins[one]\ty\n", "MenuTitle", "Name", order);
		expect(table.Document.Keys.slice(0, 2)).toEqual(["Renamed", "Greeting"]);
		expect(table.Document.Entry("Greeting")!.Value).toBe("y");
		session.Paste("New1\tone\tc1\n2bad\ttwo\n\tthree\nNew1\tfour", "Coins[other]", "Name", [...session.Rows().map((row) => row.Id)]);
		expect(table.Document.Entry("New1", "other")!.Value).toBe("one");
		expect(table.Document.Comment("New1")).toBe("c1");
		expect(table.Document.Keys.slice(-3)).toEqual(["Key1", "Key2", "Key3"]);
		expect(table.Document.Entry("Key3")!.Value).toBe("four");
		session.Paste("ignored\tc\textra", "Nope", "Comment", ["Renamed"]);
		expect(table.Document.Comment("Renamed")).toBe("ignored");
		session.Paste("\t", "Renamed", "Value", ["Renamed"]);
		expect(table.Document.Comment("Renamed")).toBeNull();
		session.Undo();
		expect(table.Document.Comment("Renamed")).toBe("ignored");
		const fresh = await Make();
		await fresh.session.OpenTable("Resources/UiNames.en.cstables");
		fresh.session.Paste("Extra\tvalue", "nowhere", "Name", []);
		expect(fresh.session.Current!.Document.Entry("Extra")!.Value).toBe("value");
	});

	it("checks every table and marks the rows the problems are on", async () => {
		const { session } = await Make({ "Resources/UiNames.en.cstables": `${English}MenuTitle = again\nUnused = u\n` });
		await session.OpenTable("Resources/UiNames.en.cstables");
		const rows = session.Rows();
		expect(rows.find((row) => row.Id === "MenuTitle")!.Error).toBe(true);
		expect(rows.find((row) => row.Id === "Greeting")!.Warning).toBe(true);
		expect(rows.find((row) => row.Id === "Unused")!.Warning).toBe(true);
		expect(session.Check().map((d) => d.Code)).toEqual(expect.arrayContaining(["CST010", "CST020", "CST021", "CST022"]));
		// Problems of the table as a whole are on no row.
		expect(session.Rows([{ Severity: "Warning" as never, Code: "X", Message: "", File: "Resources/UiNames.en.cstables", Line: 0 }]).some((row) => row.Warning)).toBe(false);
	});

	it("sets the table's access, saves and generates the code (not with errors), creates tables and languages", async () => {
		const { session, files } = await Make();
		await session.OpenTable("Resources/UiNames.cstables");
		expect(session.Access).toBe(Access.Public);
		session.SetAccess(Access.Internal);
		expect(session.Access).toBe(Access.Internal);
		session.SetAccess(Access.Public);
		expect(session.Current!.Text).toBe(Base);
		expect(() => session.SetAccess("open" as Access)).toThrow(/not an access/);
		session.Edit("MenuTitle", "Value", "Меню");
		await session.OpenTable("Resources/UiNames.en.cstables");
		session.Edit("MenuTitle", "Value", "Menu");
		const problems = await session.Save();
		expect(problems.some((d) => d.Code === "CST022")).toBe(true);
		expect(await files.ReadText("Resources/UiNames.cstables")).toContain("MenuTitle = Меню");
		expect(await files.ReadText("Resources/UiNames.en.cstables")).toContain("MenuTitle = Menu");
		expect(await files.ReadText("Source/Generated/CSTables.ts")).toContain("get MenuTitle()");
		expect(session.Open.every((table) => !table.Dirty)).toBe(true);
		// Saved again unchanged: the generated files aren't written again.
		await session.Save("Resources/UiNames.cstables");
		session.Edit("Greeting", "Name", "MenuTitle2");
		session.Add("Name", "Twin");
		session.Current!.Change((document) => document.Set("Twin", "b", null));
		session.Current!.Change((document) => { document.Lines.push({ Kind: "Entry", Raw: null, Key: "Twin", Plural: null, Value: "c", Line: 0 } as never); });
		await files.WriteText("Source/Generated/CSTables.ts", "kept");
		const broken = await session.Save("Resources/UiNames.en.cstables");
		expect(broken.some((d) => d.Code === "CST010")).toBe(true);
		expect(await files.ReadText("Source/Generated/CSTables.ts")).toBe("kept");
		expect(await session.Save("Resources/Nope.cstables")).toBeDefined();
		expect(await session.NewTable("Menus")).toBe("Resources/Menus.cstables");
		await expect(session.NewTable("Menus")).rejects.toThrow(/exists already/);
		await expect(session.NewTable("2bad")).rejects.toThrow(/not a table name/);
		expect(await session.NewLanguage("UiNames", "pl")).toBe("Resources/UiNames.pl.cstables");
		await expect(session.NewLanguage("Nope", "pl")).rejects.toThrow(/no table Nope/);
		await expect(session.NewLanguage("UiNames", "Polish!")).rejects.toThrow(/not a language code/);
		await files.WriteText("Resources/Ghost.cstables", "");
		await expect(session.NewTable("Ghost")).rejects.toThrow(/exists already/);
		const empty = new TableSession({ Files: new MemoryFileSystem({}), BaseLanguage: "en" });
		expect(await empty.Save()).toEqual([]);
		expect(() => empty.Undo()).toThrow(/No table is open/);
		expect(() => empty.Redo()).toThrow(/No table is open/);
		expect(empty.Access).toBe(Access.Public);
	});

	it("takes a table changed outside, or marks a conflict when it has unsaved edits; closes tabs", async () => {
		const { session, files } = await Make();
		const base = await session.OpenTable("Resources/UiNames.cstables");
		const english = await session.OpenTable("Resources/UiNames.en.cstables");
		files.External((f) => f.Put("Resources/UiNames.cstables", "MenuTitle = снаружи\n"));
		await session.Refresh();
		expect(base.Document.Entry("MenuTitle")!.Value).toBe("снаружи");
		english.Change((document) => document.Set("MenuTitle", "mine"));
		files.External((f) => f.Put("Resources/UiNames.en.cstables", "MenuTitle = theirs\n"));
		await session.Refresh();
		expect(english.Conflict).toBe(true);
		expect(english.Document.Entry("MenuTitle")!.Value).toBe("mine");
		english.Reload("MenuTitle = theirs\n");
		expect(english.Conflict).toBe(false);
		// A table that disappeared stays open with its text (saving brings it back).
		files.External((f) => f.Remove("Resources/UiNames.en.cstables"));
		await session.Refresh();
		expect(session.Sources().some((source) => source.File === "Resources/UiNames.en.cstables")).toBe(true);
		session.Close("Resources/UiNames.en.cstables");
		expect(session.Current).toBe(base);
		// A closed tab's table still counts, as it was saved.
		files.External((f) => f.Put("Resources/Third.cstables", "T = t\n"));
		await session.Refresh();
		await session.OpenTable("Resources/Third.cstables");
		session.Current = base;
		session.Close("Resources/Third.cstables");
		expect(session.Current).toBe(base);
		expect(session.Sources().find((source) => source.File === "Resources/Third.cstables")!.Text).toBe("T = t\n");
		session.Close("Resources/UiNames.cstables");
		expect(session.Current).toBeNull();
		session.Close("Resources/Nope.cstables");
		const other = new OpenTable("Resources/A.cstables", "A = a\n");
		other.Undo();
		other.Redo();
		expect(other.Text).toBe("A = a\n");
		// A file removed while it was listed reads as empty for the checks.
		files.External((f) => f.Put("Resources/Late.cstables", "L = l"));
		await session.Refresh();
		const read = files.ReadText.bind(files);
		files.ReadText = async (path: string) => (path === "Resources/Late.cstables" ? null : read(path));
		await session.Refresh();
		expect(session.Sources().find((source) => source.File === "Resources/Late.cstables")!.Text).toBe("");
	});
});
