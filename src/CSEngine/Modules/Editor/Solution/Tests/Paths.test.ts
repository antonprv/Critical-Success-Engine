// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { CompareNames, IsWithin, Join, MatchesPattern, NameOf, NameProblem, Normalize, ParentOf, Rebase } from "../Source/Paths";

describe("Paths", () => {
	it("splits and joins paths inside a project", () => {
		expect(ParentOf("Content/UI/Menu.ui.json")).toBe("Content/UI");
		expect(ParentOf("Game.cseproject")).toBe("");
		expect(NameOf("Content/UI/Menu.ui.json")).toBe("Menu.ui.json");
		expect(NameOf("Readme.md")).toBe("Readme.md");
		expect(Join("", "Content")).toBe("Content");
		expect(Join("Content", "UI")).toBe("Content/UI");
	});

	it("knows what is inside a folder", () => {
		expect(IsWithin("Content/UI", "Content")).toBe(true);
		expect(IsWithin("Content", "Content")).toBe(true);
		expect(IsWithin("ContentX", "Content")).toBe(false);
		expect(IsWithin("anything", "")).toBe(true);
	});

	it("moves a path from one folder to another", () => {
		expect(Rebase("Content/UI/Menu.ui.json", "Content/UI", "Ui")).toBe("Ui/Menu.ui.json");
		expect(Rebase("Content/UI", "Content/UI", "Ui")).toBe("Ui");
		expect(Rebase("Source/Main.ts", "Content", "Ui")).toBe("Source/Main.ts");
		expect(Rebase("Source/Main.ts", "", "Ui")).toBe("Source/Main.ts");
	});

	it("refuses names some platform can't hold", () => {
		expect(NameProblem("Menu.ui.json")).toBeNull();
		expect(NameProblem("  ")).toMatch(/empty/);
		expect(NameProblem("..")).toMatch(/not a name/);
		expect(NameProblem("a/b")).toMatch(/can't hold/);
		expect(NameProblem("a?")).toMatch(/can't hold/);
		expect(NameProblem("file.")).toMatch(/end with/);
		expect(NameProblem("file ")).toMatch(/end with/);
		expect(NameProblem("CON")).toMatch(/reserved/);
		expect(NameProblem("lpt1.txt")).toMatch(/reserved/);
	});

	it("normalises what the host gives", () => {
		expect(Normalize("Content\\UI\\")).toBe("Content/UI");
		expect(Normalize("./Content//UI")).toBe("Content/UI");
		expect(Normalize("")).toBe("");
	});

	it("matches names with globs, case-insensitively, the whole name", () => {
		expect(MatchesPattern("Game.cseproject", "*.cseproject")).toBe(true);
		expect(MatchesPattern("Game.CSEPROJECT", "*.cseproject")).toBe(true);
		expect(MatchesPattern("Game.cseproject.bak", "*.cseproject")).toBe(false);
		expect(MatchesPattern("a1.txt", "a?.txt")).toBe(true);
		expect(MatchesPattern("a(1).txt", "a(1).txt")).toBe(true);
		expect(MatchesPattern("a(1).txt", "a(1).txt")).toBe(true);
	});

	it("orders names as Explorer does", () => {
		expect(["File10", "file2", "File1"].sort(CompareNames)).toEqual(["File1", "file2", "File10"]);
		expect(CompareNames("a", "A")).toBeGreaterThan(0);
		expect(CompareNames("A", "a")).toBeLessThan(0);
		expect(CompareNames("a", "a")).toBe(0);
	});
});
