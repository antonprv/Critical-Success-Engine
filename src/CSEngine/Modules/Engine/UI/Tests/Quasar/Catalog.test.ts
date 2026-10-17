// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { BuildCatalog, CatalogFile, DefaultOf, KindOf, RenderCatalog, RenderTable, TableFile, TypeOf } from "../../Scripts/GenerateQuasarCatalog.mjs";
import type { QuasarCatalog } from "../../Source/Quasar/QuasarTypes";
import { QuasarComponentTable, QuasarDirectiveTable, QuasarVersion } from "../../Source/Quasar/QuasarTable.generated";

const catalog = BuildCatalog() as QuasarCatalog;
const api = join(dirname(createRequire(import.meta.url).resolve("quasar/package.json")), "dist", "api");
const ApiOf = (type: string) => readdirSync(api).map((file) => JSON.parse(readFileSync(join(api, file), "utf8")) as { type: string; }).filter((info) => info.type === type).length;

describe("the Quasar catalog", () => {
	it("is up to date with the installed Quasar (run Scripts/GenerateQuasarCatalog.mjs when this fails)", () => {
		expect(readFileSync(TableFile, "utf8")).toBe(RenderTable(catalog));
		expect(readFileSync(CatalogFile, "utf8")).toBe(RenderCatalog(catalog));
		expect(QuasarVersion).toBe(catalog.Version);
	});

	it("has every component, directive and plugin Quasar describes", () => {
		expect(catalog.Components).toHaveLength(ApiOf("component") - 1); // QFormChildMixin is a mixin
		expect(catalog.Directives).toHaveLength(ApiOf("directive"));
		expect(catalog.Plugins).toHaveLength(ApiOf("plugin"));
		expect(QuasarComponentTable.map((row) => row.Name)).toEqual(catalog.Components.map((component) => component.Name));
		expect(QuasarDirectiveTable.map((row) => row.Attr)).toEqual(catalog.Directives.map((directive) => directive.Attr));
		const button = catalog.Components.find((component) => component.Name === "QBtn")!;
		expect(button).toMatchObject({ Type: "q-btn", Group: "Buttons", Model: false, Slots: ["default", "loading"], Events: ["click"] });
		expect(button.Props.find((prop) => prop.Key === "align")).toMatchObject({ Kind: "choice", Default: "center", Choices: ["left", "right", "center", "around", "between", "evenly"] });
		expect(catalog.Components.find((component) => component.Name === "QInput")!.Props.find((prop) => prop.Key === "rules")!.Kind).toBe("rules");
		expect(catalog.Components.find((component) => component.Name === "QSpinnerDots")!.Group).toBe("Spinners");
		// every starter value is a prop the component has; every starter child a component, its props its own
		const byType = new Map(catalog.Components.map((component) => [component.Type, component]));
		const Check = (component: (typeof catalog.Components)[number], props: Record<string, unknown>): void => {
			for (const key of Object.keys(props)) expect(component.Props.some((prop) => prop.Key === key), `${component.Name}.${key}`).toBe(true);
		};
		const Children = (children: NonNullable<(typeof catalog.Components)[number]["Children"]>): void => {
			for (const child of children) {
				const component = byType.get(child.Type)!;
				expect(component, child.Type).toBeDefined();
				Check(component, child.Props ?? {});
				Children(child.Children ?? []);
			}
		};
		for (const component of catalog.Components) {
			Check(component, component.Starter);
			Children(component.Children ?? []);
		}
	});

	it("reads Quasar's prop types, defaults and names", () => {
		expect(KindOf("x", { type: "Boolean" })).toBe("boolean");
		expect(KindOf("x", { type: "Number" })).toBe("number");
		expect(KindOf("x", { type: "String" })).toBe("text");
		expect(KindOf("x", { type: "String", values: ["'a'"] })).toBe("choice");
		expect(KindOf("x", { type: ["String", "Number", "null"] })).toBe("text");
		expect(KindOf("x", { type: ["Function", "String"] })).toBe("text");
		expect(KindOf("x", { type: ["Element", "null"] })).toBeNull();
		expect(KindOf("x", { type: "Function" })).toBeNull();
		expect(KindOf("x", { type: ["String", "Array", "Object"] })).toBe("json");
		expect(KindOf("x", { type: "Array", tsType: "ValidationRule" })).toBe("rules");
		expect(DefaultOf({ default: "'center'" })).toBe("center");
		expect(DefaultOf({ default: "true" })).toBe(true);
		expect(DefaultOf({ default: "() => []" })).toBeUndefined();
		expect(DefaultOf({})).toBeUndefined();
		expect(TypeOf("QBtnDropdown")).toBe("q-btn-dropdown");
		expect(TypeOf("TouchPan")).toBe("touch-pan");
	});
});

describe("the catalog for the designer", () => {
	it("loads on demand from the package's entry", async () => {
		const { LoadQuasarCatalog } = await import("../../Source/index");
		const loaded = await LoadQuasarCatalog();
		expect(loaded.Components.map((component) => component.Name)).toEqual(catalog.Components.map((component) => component.Name));
	});
});
