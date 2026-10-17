// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { beforeEach } from "vitest";

// The designer remembers its theme in localStorage: every test starts from the default.
beforeEach(() => localStorage.clear());

// What jsdom lacks and Quasar reads when it installs (a Quasar widget on the canvas): the screen's orientation.
if (!("orientation" in screen)) {
	Object.defineProperty(screen, "orientation", { configurable: true, value: { type: "landscape-primary", angle: 0, addEventListener: () => undefined, removeEventListener: () => undefined } });
}
