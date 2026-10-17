// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://test.invalid/quasar.html?kit=quasar&only=QBtn,QInput,QMenu&dark=1"}
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

describe("the Quasar widget gallery", () => {
	it("shows the components asked for, each normal, disabled and with an error, in the kit asked for", async () => {
		document.body.innerHTML = '<div id="gallery"></div>';
		await import("../../Source/Gallery/QuasarMain");
		await flushPromises();
		await vi.waitFor(() => expect(document.querySelectorAll(".win-quasar--loading")).toHaveLength(0));
		expect([...document.querySelectorAll("[data-component]")].map((row) => row.getAttribute("data-component"))).toEqual(["QBtn", "QInput", "QMenu"]);
		expect(document.querySelectorAll('[data-component="QInput"] [data-state]')).toHaveLength(5);
		expect(document.querySelector(".win-root")!.classList.contains("win-kit--quasar")).toBe(true);
		expect(document.querySelector(".win-root")!.classList.contains("tw-dark")).toBe(true);
		expect(document.querySelector('[data-component="QInput"] [data-state="error"] .q-field')!.classList.contains("q-field--error")).toBe(true);
		expect(document.querySelector('[data-component="QBtn"] [data-state="disabled"] .q-btn')!.classList.contains("disabled")).toBe(true);
	});
});
