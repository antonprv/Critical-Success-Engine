// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * Injected before the app: a Pointer Lock simulation following the browser rules (a trusted input within 5 s is required,
 * Esc releases the lock and is swallowed). Headless Chromium leaks renderer memory while the real lock is held, so only
 * real-pointer-lock.spec.ts uses the real one. Self-contained: Playwright serialises it with toString().
 */
export function SimulatePointerLock(): void {
	let locked: Element | null = null;
	let lastGesture = Number.NEGATIVE_INFINITY;

	const fire = (name: string): void => {
		setTimeout(() => document.dispatchEvent(new Event(name)), 0);
	};

	for (const type of ["pointerdown", "mousedown", "click", "keydown", "touchstart"]) {
		window.addEventListener(type, (event) => {
			const isEscape = (event as KeyboardEvent).code === "Escape";
			if (event.isTrusted && !isEscape) lastGesture = performance.now();
		}, true);
	}

	Object.defineProperty(Document.prototype, "pointerLockElement", { get: () => locked, configurable: true });

	Element.prototype.requestPointerLock = function (this: Element): Promise<void> {
		if (performance.now() - lastGesture > 5000) {
			fire("pointerlockerror");
			return Promise.reject(new DOMException("A user gesture is required to request Pointer Lock.", "NotAllowedError"));
		}
		// The element the page called requestPointerLock() on IS what gets locked - that is the API.
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		locked = this;
		fire("pointerlockchange");
		return Promise.resolve();
	};

	document.exitPointerLock = (): void => {
		if (locked === null) return;
		locked = null;
		fire("pointerlockchange");
	};

	window.addEventListener("keydown", (event) => {
		if (event.code === "Escape" && locked !== null) {
			event.stopImmediatePropagation();
			event.preventDefault();
			document.exitPointerLock();
		}
	}, true);
}
