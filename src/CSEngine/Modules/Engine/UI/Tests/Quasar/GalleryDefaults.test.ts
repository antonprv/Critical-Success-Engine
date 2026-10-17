// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://test.invalid/quasar.html"}
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuasarGallery from "../../Source/Gallery/QuasarGallery.vue";
import { QuasarComponentTable } from "../../Source/Quasar/QuasarTable.generated";

describe("the Quasar widget gallery, as it opens", () => {
	it("shows every component in the Classic kit, XP Blue; the bar switches kit, theme and dark", async () => {
		const wrapper = mount(QuasarGallery);
		expect(wrapper.findAll("[data-component]")).toHaveLength(QuasarComponentTable.length);
		expect(wrapper.get(".win-root").classes()).toEqual(expect.arrayContaining(["win-kit--classic", "win-theme--xp-blue"]));
		const [kit, theme] = wrapper.findAll(".quasar-gallery__bar select");
		await theme!.setValue("win98");
		expect(wrapper.get(".win-root").classes()).toContain("win-theme--win98");
		await kit!.setValue("tailwind");
		await wrapper.get('.quasar-gallery__bar input[type="checkbox"]').setValue(true);
		expect(wrapper.get(".win-root").classes()).toEqual(expect.arrayContaining(["win-kit--tailwind", "tw-dark"]));
		wrapper.unmount();
	}, 60_000);
});
