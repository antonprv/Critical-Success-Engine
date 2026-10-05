// @vitest-environment jsdom
// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it } from "vitest";
import { AnchorMode, NodeRect, NodeStyle, Reanchor } from "../../../Source/Toolkit/Designer/Anchors";
import { CreateNode, NewLayout, ParseLayout, SerializeLayout, WidgetType, type LayoutNode } from "../../../Source/Toolkit/Designer/Layout";

const Node = (anchors: Partial<LayoutNode> = {}): LayoutNode => ({ ...CreateNode(WidgetType.Button, "B", 10, 20), Width: 100, Height: 30, ...anchors });

describe("NodeStyle: anchors become CSS, so layouts reflow by themselves", () => {
	it("Start / Start (the default) is a plain offset from the top-left corner", () => {
		expect(NodeStyle(Node())).toEqual({ left: "10px", top: "20px", width: "100px", height: "30px" });
	});

	it("End keeps the margin to the right / bottom edge", () => {
		expect(NodeStyle(Node({ AnchorX: AnchorMode.End, AnchorY: AnchorMode.End }))).toEqual({ right: "10px", bottom: "20px", width: "100px", height: "30px" });
	});

	it("Center keeps the offset of its centre from the parent's centre", () => {
		expect(NodeStyle(Node({ AnchorX: AnchorMode.Center, AnchorY: AnchorMode.Center }))).toEqual({ left: "calc(50% + -40px)", top: "calc(50% + 5px)", width: "100px", height: "30px" });
	});

	it("Stretch keeps both margins and has no fixed size", () => {
		expect(NodeStyle(Node({ AnchorX: AnchorMode.Stretch, Right: 15, AnchorY: AnchorMode.Stretch, Bottom: 25 }))).toEqual({ left: "10px", right: "15px", top: "20px", bottom: "25px" });
		expect(NodeStyle(Node({ AnchorX: AnchorMode.Stretch }))).toMatchObject({ left: "10px", right: "0px" }); // no Right yet: flush to the edge
	});
});

describe("NodeRect: where a node is inside a parent of a given size", () => {
	it("resolves every mode", () => {
		expect(NodeRect(Node(), 400, 300)).toEqual({ Left: 10, Top: 20, Width: 100, Height: 30 });
		expect(NodeRect(Node({ AnchorX: AnchorMode.End, AnchorY: AnchorMode.End }), 400, 300)).toEqual({ Left: 290, Top: 250, Width: 100, Height: 30 });
		expect(NodeRect(Node({ AnchorX: AnchorMode.Center, AnchorY: AnchorMode.Center }), 400, 300)).toEqual({ Left: 160, Top: 155, Width: 100, Height: 30 });
		expect(NodeRect(Node({ AnchorX: AnchorMode.Stretch, Right: 15, AnchorY: AnchorMode.Stretch, Bottom: 25 }), 400, 300)).toEqual({ Left: 10, Top: 20, Width: 375, Height: 255 });
	});
});

describe("Reanchor: changing the anchors keeps the widget exactly where it is", () => {
	it("round trip through every mode leaves the rectangle unchanged", () => {
		const start = Node();
		const original = NodeRect(start, 400, 300);
		for (const x of [AnchorMode.End, AnchorMode.Center, AnchorMode.Stretch, AnchorMode.Start]) {
			for (const y of [AnchorMode.Stretch, AnchorMode.End, AnchorMode.Center, AnchorMode.Start]) {
				const moved = Reanchor(start, x, y, 400, 300);
				expect(NodeRect(moved, 400, 300), `${x}/${y}`).toEqual(original);
				expect([moved.AnchorX ?? AnchorMode.Start, moved.AnchorY ?? AnchorMode.Start]).toEqual([x, y]);
			}
		}
	});

	it("stretching stores the far margins; leaving stretch drops them", () => {
		const stretched = Reanchor(Node(), AnchorMode.Stretch, AnchorMode.Stretch, 400, 300);
		expect([stretched.X, stretched.Right, stretched.Y, stretched.Bottom]).toEqual([10, 290, 20, 250]);
		const back = Reanchor(stretched, AnchorMode.Start, AnchorMode.Start, 400, 300);
		expect([back.Right, back.Bottom, back.Width, back.Height]).toEqual([undefined, undefined, 100, 30]);
		expect(back).not.toHaveProperty("Right");
	});
});

describe("anchors in layout files", () => {
	it("are saved, and checked on load (unknown modes and bad margins fall back to the default)", () => {
		const layout = NewLayout("A");
		layout.Root.Children!.push(Node({ AnchorX: AnchorMode.Stretch, Right: 8, AnchorY: AnchorMode.End }));
		expect(ParseLayout(SerializeLayout(layout))).toEqual(layout);
		const text = SerializeLayout(layout).replace('"AnchorY": "end"', '"AnchorY": "sideways"').replace('"Right": 8', '"Right": "8"');
		const node = ParseLayout(text).Root.Children![0]!;
		expect([node.AnchorY, node.Right]).toEqual([undefined, undefined]);
	});
});

describe("stretch without a far margin yet", () => {
	it("counts as flush with the far edge", () => {
		expect(NodeRect(Node({ AnchorX: AnchorMode.Stretch, AnchorY: AnchorMode.Stretch }), 400, 300)).toEqual({ Left: 10, Top: 20, Width: 390, Height: 280 });
	});
});
