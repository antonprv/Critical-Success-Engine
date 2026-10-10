// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { PlacePopup, PopupZIndex } from "../Source/Core/PopupPlacement";

const Viewport = { Width: 800, Height: 600 };
const Anchor = (top: number, left = 10) => ({ Left: left, Top: top, Bottom: top + 21, Width: 140 });

describe("PlacePopup: where a drop-down that may leave its window goes", () => {
	it("opens right under the anchor when it fits there, as wide as the anchor at least", () => {
		expect(PlacePopup(Anchor(100), 80, Viewport)).toEqual({ Left: 10, Top: 121, MinWidth: 140, MaxHeight: 475 });
	});

	it("opens above the anchor when it doesn't fit below and there is more room above", () => {
		expect(PlacePopup(Anchor(540), 200, Viewport)).toEqual({ Left: 10, Top: 340, MinWidth: 140, MaxHeight: 536 });
	});

	it("is limited to the room it has and scrolls: the larger side wins", () => {
		expect(PlacePopup(Anchor(540), 900, Viewport)).toMatchObject({ Top: 4, MaxHeight: 536 });
		expect(PlacePopup(Anchor(10), 700, Viewport)).toMatchObject({ Top: 31, MaxHeight: 565 });
	});

	it("goes below while it is not measured yet (height 0)", () => {
		expect(PlacePopup(Anchor(590), 0, Viewport)).toMatchObject({ Top: 611, MaxHeight: 0 });
	});

	it("stays inside the viewport horizontally", () => {
		expect(PlacePopup(Anchor(100, 750), 80, Viewport).Left).toBe(660);
		expect(PlacePopup(Anchor(100, -20), 80, Viewport).Left).toBe(0);
		expect(PlacePopup(Anchor(100, 30), 80, { Width: 100, Height: 600 }).Left).toBe(0);
	});

	it("sits above every window and modal host", () => {
		expect(PopupZIndex).toBeGreaterThan(2500);
	});
});
