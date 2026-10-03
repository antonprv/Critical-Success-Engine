// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://test.invalid/"}
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// In a file of its own: Quasar installs its Notify container once per page, so this needs a page with exactly one UI app -
// which is also what the real site has.

import { Notify } from "quasar";
import { nextTick } from "vue";
import { expect, it } from "vitest";
import { CreateUi } from "../Source/Ui/CreateUi";
import { UiStore } from "../Source/Ui/UiStore";

it("toasts are XP tray balloons: bottom right, black on pale yellow", async () => {
	Object.defineProperty(window.screen, "orientation", {
		configurable: true,
		value: { type: "landscape-primary", angle: 0, addEventListener: () => undefined, removeEventListener: () => undefined },
	});
	const mount = document.createElement("div");
	document.body.appendChild(mount);
	CreateUi(new UiStore(), mount);

	Notify.create({ message: "Player entered Trigger Pad" });
	await nextTick();
	await new Promise((resolve) => setTimeout(resolve, 30));

	const balloon = document.querySelector(".q-notification.xp-balloon")!;
	expect(balloon.textContent).toContain("Player entered Trigger Pad");
	expect(balloon.closest(".q-notifications__list--bottom")).not.toBeNull();
	expect(balloon.classList.contains("text-black")).toBe(true);
	expect(balloon.classList.contains("bg-transparent")).toBe(true); // the yellow comes from styles/theme.css
});
