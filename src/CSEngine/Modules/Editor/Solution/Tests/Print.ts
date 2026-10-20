// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { SolutionNode } from "../Source/Tree";

/** A tree as lines, two spaces a level, with its flags: what the tests compare. */
export function Print(node: SolutionNode | null, depth = 0): string[] {
	if (node === null) return [];
	const flags = [node.Hidden ? "hidden" : "", node.Missing ? "missing" : "", node.Nested ? "nested" : ""].filter(Boolean);
	const line = `${"  ".repeat(depth)}${node.Label}${flags.length ? ` [${flags.join(", ")}]` : ""}`;
	return [line, ...node.Children.flatMap((child) => Print(child, depth + 1))];
}
