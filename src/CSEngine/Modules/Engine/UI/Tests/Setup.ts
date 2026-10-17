// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// What jsdom lacks and Quasar reads when it installs (its Platform and Screen plugins): the screen's orientation.
if (typeof screen !== "undefined" && !("orientation" in screen)) {
	Object.defineProperty(screen, "orientation", { configurable: true, value: { type: "landscape-primary", angle: 0, addEventListener: () => undefined, removeEventListener: () => undefined } });
}

// ... and a ResizeObserver (Quasar's tabs and scroll areas watch their size).
if (typeof globalThis.ResizeObserver === "undefined") {
	globalThis.ResizeObserver = class {
		public observe(): void { /* jsdom lays nothing out */ }
		public unobserve(): void { /* nothing to stop */ }
		public disconnect(): void { /* nothing to stop */ }
	};
}
