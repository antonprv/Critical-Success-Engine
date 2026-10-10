// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** Above every window (z-index 1..N) and every modal dialog host (2500) of the same theme root. */
export const PopupZIndex = 3000;

export interface PopupAnchor { Left: number; Top: number; Bottom: number; Width: number; }

export interface PopupViewport { Width: number; Height: number; }

export interface PopupPlacement {
	/** Viewport coordinates for `position: fixed`. */
	Left: number;
	Top: number;
	MinWidth: number;
	/** The pop-up scrolls when its content is taller than this. */
	MaxHeight: number;
}

/**
 * Where a drop-down of the given height goes (Windows' rule): right under its anchor, or right above it when it doesn't
 * fit below and there is more room above. A height of 0 means "not measured yet": the pop-up goes below.
 */
export function PlacePopup(anchor: PopupAnchor, height: number, viewport: PopupViewport, margin = 4): PopupPlacement {
	const roomBelow = Math.max(0, viewport.Height - anchor.Bottom - margin);
	const roomAbove = Math.max(0, anchor.Top - margin);
	const opensAbove = height > roomBelow && roomAbove > roomBelow;
	const room = opensAbove ? roomAbove : roomBelow;
	const shownHeight = Math.min(height, room);
	const rightmostLeft = Math.max(0, viewport.Width - anchor.Width);
	return {
		Left: Math.min(Math.max(0, anchor.Left), rightmostLeft),
		Top: opensAbove ? anchor.Top - shownHeight : anchor.Bottom,
		MinWidth: anchor.Width,
		MaxHeight: room,
	};
}
