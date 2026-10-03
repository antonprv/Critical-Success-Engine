// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * Runs inside the page (page.addInitScript) BEFORE the app: replaces the Pointer Lock API with a simulation that follows the
 * rules browsers enforce, so the game's whole pause/resume state machine runs exactly as for a real player:
 *
 *  - requestPointerLock() is refused with NotAllowedError (+ a `pointerlockerror` event) unless a TRUSTED user input
 *    (click, key press, touch) happened in the last 5 seconds - the browsers' "user gesture" rule;
 *  - when granted, `document.pointerLockElement` is the element and `pointerlockchange` fires;
 *  - Esc releases the lock and the page never receives that key press - the browser swallows it;
 *  - document.exitPointerLock() releases it.
 *
 * Why not the real thing everywhere: with the real lock held, the headless Chromium used for local runs leaks hundreds of MB
 * per 10 seconds into the renderer (observed only with the lock really held; with the app merely believing it holds the
 * lock, memory stays flat) - fine for a few seconds, fatal for a longer test. The real lock is exercised by
 * real-pointer-lock.spec.ts, which stays short.
 *
 * Must be fully self-contained: Playwright serialises it with toString().
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
