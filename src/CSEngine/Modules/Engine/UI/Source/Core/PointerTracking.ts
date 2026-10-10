// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { onUnmounted } from "vue";

/**
 * Follows the pointer across the whole window after a press (dragging a title bar, a border, a slider thumb):
 * `onMove` for every move, `onUp` once when the button is released. Listeners are removed on release or unmount.
 */
export function UsePointerTracking(): (onMove: (event: PointerEvent) => void, onUp: () => void) => void {
	let stop: (() => void) | null = null;

	const start = (onMove: (event: PointerEvent) => void, onUp: () => void): void => {
		const move = (event: Event): void => onMove(event as PointerEvent);
		const up = (): void => {
			stop!();
			onUp();
		};
		stop = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			stop = null;
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	};

	onUnmounted(() => stop?.());
	return start;
}
