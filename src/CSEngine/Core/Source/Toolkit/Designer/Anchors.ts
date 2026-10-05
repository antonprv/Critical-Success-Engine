// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { LayoutNode } from "./Layout";

/**
 * How a widget is pinned to its parent on one axis (UMG's anchors). Offsets are stored relative to the anchor, so the
 * layout reflows with CSS alone when the parent changes size.
 */
export const enum AnchorMode {
	/** X/Y is the margin to the left/top edge; Width/Height the size. The default. */
	Start = "start",
	/** X/Y is the margin to the right/bottom edge; Width/Height the size. */
	End = "end",
	/** X/Y is the offset of the widget's centre from the parent's centre. */
	Center = "center",
	/** X/Y is the near margin and Right/Bottom the far one: the widget stretches with its parent. */
	Stretch = "stretch",
}

export const AnchorModes: readonly AnchorMode[] = [AnchorMode.Start, AnchorMode.End, AnchorMode.Center, AnchorMode.Stretch];

export interface Rect { Left: number; Top: number; Width: number; Height: number; }

type Axis = { mode: AnchorMode; offset: number; size: number; far: number | undefined; };

const AxisX = (node: LayoutNode): Axis => ({ mode: node.AnchorX ?? AnchorMode.Start, offset: node.X, size: node.Width, far: node.Right });
const AxisY = (node: LayoutNode): Axis => ({ mode: node.AnchorY ?? AnchorMode.Start, offset: node.Y, size: node.Height, far: node.Bottom });

function AxisStyle(axis: Axis, near: string, far: string, size: string): Record<string, string> {
	switch (axis.mode) {
		case AnchorMode.End: return { [far]: `${axis.offset}px`, [size]: `${axis.size}px` };
		case AnchorMode.Center: return { [near]: `calc(50% + ${axis.offset - axis.size / 2}px)`, [size]: `${axis.size}px` };
		case AnchorMode.Stretch: return { [near]: `${axis.offset}px`, [far]: `${axis.far ?? 0}px` };
		default: return { [near]: `${axis.offset}px`, [size]: `${axis.size}px` };
	}
}

/** The CSS position of a widget inside its (positioned) parent. */
export function NodeStyle(node: LayoutNode): Record<string, string> {
	return { ...AxisStyle(AxisX(node), "left", "right", "width"), ...AxisStyle(AxisY(node), "top", "bottom", "height") };
}

/** [start, size] of a widget on one axis inside a parent of the given length. */
function Resolve(axis: Axis, parent: number): [number, number] {
	switch (axis.mode) {
		case AnchorMode.End: return [parent - axis.offset - axis.size, axis.size];
		case AnchorMode.Center: return [parent / 2 + axis.offset - axis.size / 2, axis.size];
		case AnchorMode.Stretch: return [axis.offset, parent - axis.offset - (axis.far ?? 0)];
		default: return [axis.offset, axis.size];
	}
}

/** Where the widget is inside a parent of the given size. */
export function NodeRect(node: LayoutNode, parentWidth: number, parentHeight: number): Rect {
	const [Left, Width] = Resolve(AxisX(node), parentWidth);
	const [Top, Height] = Resolve(AxisY(node), parentHeight);
	return { Left, Top, Width, Height };
}

/** Offset and far margin that put [start, size] in place under a mode. */
function Encode(mode: AnchorMode, start: number, size: number, parent: number): { offset: number; far?: number; } {
	switch (mode) {
		case AnchorMode.End: return { offset: parent - start - size };
		case AnchorMode.Center: return { offset: start + size / 2 - parent / 2 };
		case AnchorMode.Stretch: return { offset: start, far: parent - start - size };
		default: return { offset: start };
	}
}

/** The same widget under other anchors, in exactly the same place inside a parent of the given size. */
export function Reanchor(node: LayoutNode, anchorX: AnchorMode, anchorY: AnchorMode, parentWidth: number, parentHeight: number): LayoutNode {
	const rect = NodeRect(node, parentWidth, parentHeight);
	const x = Encode(anchorX, rect.Left, rect.Width, parentWidth);
	const y = Encode(anchorY, rect.Top, rect.Height, parentHeight);
	const next: LayoutNode = { ...node, X: x.offset, Y: y.offset, Width: rect.Width, Height: rect.Height };
	delete next.AnchorX;
	delete next.AnchorY;
	delete next.Right;
	delete next.Bottom;
	if (anchorX !== AnchorMode.Start) next.AnchorX = anchorX;
	if (anchorY !== AnchorMode.Start) next.AnchorY = anchorY;
	if (x.far !== undefined) next.Right = x.far;
	if (y.far !== undefined) next.Bottom = y.far;
	return next;
}
