// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ClassesOf, CoverageFile, RenderCoverage } from "../../Scripts/QuasarCoverage.mjs";

describe("the coverage table of Quasar (docs/quasar-coverage.md)", () => {
	it("is up to date (run Scripts/QuasarCoverage.mjs when this fails)", () => {
		expect(readFileSync(CoverageFile, "utf8")).toBe(RenderCoverage());
	});

	it("finds a component's classes", () => {
		expect(ClassesOf("q-btn")).toEqual(["q-btn"]);
		expect(ClassesOf("q-item-section")).toEqual(["q-item-section", "q-item__section"]);
		expect(ClassesOf("q-spinner-dots")).toEqual(["q-spinner-dots", "q-spinner__dots", "q-spinner"]);
	});
});
