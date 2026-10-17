// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { createApp } from "vue";
import { describe, expect, it } from "vitest";
import { PortalHost } from "../../Source/Core/KitContext";
import { ConfigureQuasar, EnsureQuasar, FindQuasarComponent, HasQuasar, LoadedQuasarComponent, LoadedQuasarDirective, LoadQuasarComponent, LoadQuasarDirective, QuasarRules } from "../../Source/Quasar/QuasarRuntime";

describe("loading Quasar", () => {
	it("installs Quasar into an app once, with the configured options, its pop-ups going to the themed host", async () => {
		ConfigureQuasar({ config: { brand: { primary: "#123456" } } });
		const app = createApp({});
		expect(HasQuasar(app)).toBe(false);
		const first = EnsureQuasar(app);
		expect(EnsureQuasar(app)).toBe(first);
		await first;
		expect(HasQuasar(app)).toBe(true);
		expect((app.config.globalProperties["$q"] as { config: unknown; }).config).toEqual({ brand: { primary: "#123456" } });
		// Quasar's pop-ups now go into the themed host
		const { createGlobalNode } = await import("quasar/src/utils/private.config/nodes.js") as unknown as { createGlobalNode: (id: string) => HTMLElement; };
		expect(createGlobalNode("probe").parentElement).toBe(PortalHost());
		// an app that has Quasar from elsewhere keeps it
		const other = createApp({});
		other.config.globalProperties["$q"] = { mine: true };
		await EnsureQuasar(other);
		expect(other.config.globalProperties["$q"]).toEqual({ mine: true });
		ConfigureQuasar({});
	});

	it("loads each component and directive once", async () => {
		const row = FindQuasarComponent("q-separator")!;
		expect(row.Name).toBe("QSeparator");
		expect(FindQuasarComponent("q-nothing")).toBeUndefined();
		expect(LoadedQuasarComponent(row)).toBeUndefined();
		const component = await LoadQuasarComponent(row);
		expect(await LoadQuasarComponent(row)).toBe(component);
		expect(LoadedQuasarComponent(row)).toBe(component);

		expect(LoadedQuasarDirective("close-popup")).toBeUndefined();
		const directive = await LoadQuasarDirective("close-popup");
		expect(await LoadQuasarDirective("close-popup")).toBe(directive);
		expect(LoadedQuasarDirective("close-popup")).toBe(directive);
		await expect(LoadQuasarDirective("nothing")).rejects.toThrow('Quasar has no directive "nothing"');
	});
});

describe("validation rules", () => {
	const Check = (rules: Parameters<typeof QuasarRules>[0], value: unknown) => QuasarRules(rules).map((rule) => (typeof rule === "string" ? rule : rule(value)));

	it("keeps Quasar's rule names and makes functions of rule specs", () => {
		expect(QuasarRules(undefined)).toEqual([]);
		expect(QuasarRules("email")).toEqual([]);
		expect(QuasarRules(["email", 3, null, ["x"], { Value: 1 }])).toEqual(["email"]);

		expect(Check([{ Rule: "required" }], "")).toEqual(["Required"]);
		expect(Check([{ Rule: "required", Message: "Fill it" }], null)).toEqual(["Fill it"]);
		expect(Check([{ Rule: "required" }], "x")).toEqual([true]);
		expect(Check([{ Rule: "required" }], true)).toEqual([true]);
		expect(Check([{ Rule: "required" }], 0)).toEqual([true]);
		expect(Check([{ Rule: "required" }], [])).toEqual(["Required"]);
		expect(Check([{ Rule: "required" }], undefined)).toEqual(["Required"]);
		expect(Check([{ Rule: "min-length", Value: 3 }], "ab")).toEqual(["At least 3 characters"]);
		expect(Check([{ Rule: "min-length", Value: 3, Message: "Short" }], "abc")).toEqual([true]);
		expect(Check([{ Rule: "min-length", Value: 3, Message: "Short" }], "a")).toEqual(["Short"]);
		expect(Check([{ Rule: "max-length", Value: 2 }], "abc")).toEqual(["At most 2 characters"]);
		expect(Check([{ Rule: "max-length", Value: 2, Message: "Long" }], "abc")).toEqual(["Long"]);
		expect(Check([{ Rule: "max-length", Value: 2 }], "ab")).toEqual([true]);
		expect(Check([{ Rule: "min", Value: 5 }], 4)).toEqual(["At least 5"]);
		expect(Check([{ Rule: "min", Value: 5, Message: "Low" }], 4)).toEqual(["Low"]);
		expect(Check([{ Rule: "min", Value: 5 }], 5)).toEqual([true]);
		expect(Check([{ Rule: "max", Value: 5 }], 6)).toEqual(["At most 5"]);
		expect(Check([{ Rule: "max", Value: 5, Message: "High" }], 6)).toEqual(["High"]);
		expect(Check([{ Rule: "max", Value: 5 }], 5)).toEqual([true]);
		expect(Check([{ Rule: "pattern", Value: "^a" }], "ba")).toEqual(["Doesn't match the pattern"]);
		expect(Check([{ Rule: "pattern", Value: "^a", Message: "Starts with a" }], null)).toEqual(["Starts with a"]);
		expect(Check([{ Rule: "pattern", Value: "^a" }], "ab")).toEqual([true]);
		expect(Check([{ Rule: "pattern" }], "anything")).toEqual([true]);
	});
});
