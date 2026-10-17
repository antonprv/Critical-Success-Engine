// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://test.invalid/quasar.html?sample=Settings&kit=tailwind&dark=1"}
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import QuasarGallery from "../../Source/Gallery/QuasarGallery.vue";

describe("the Quasar widget gallery, showing a sample app", () => {
	it("shows the sample alone, in the kit asked for", async () => {
		const wrapper = mount(QuasarGallery);
		await flushPromises();
		await vi.waitFor(() => expect(wrapper.find(".win-quasar--loading").exists()).toBe(false));
		expect(wrapper.find("[data-component]").exists()).toBe(false);
		expect(wrapper.get(".quasar-gallery__bar").text()).toContain("Settings");
		expect(wrapper.find('[data-sample] [data-name="Tabs"]').exists()).toBe(true);
		wrapper.unmount();
		// a sample there isn't: the components, as without one
		window.history.replaceState(null, "", "/quasar.html?sample=Nothing&only=QBtn");
		vi.resetModules();
		const { default: Again } = await import("../../Source/Gallery/QuasarGallery.vue");
		const again = mount(Again);
		expect(again.findAll("[data-component]")).toHaveLength(1);
		again.unmount();
	});
});
