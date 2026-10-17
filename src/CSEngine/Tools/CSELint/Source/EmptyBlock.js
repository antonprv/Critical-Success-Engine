// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { DetectEol, IndentUnit, LeadingWhitespace } from "./Text.js";

/**
 * Fixes what curly-newline reports and can't fix: a block with nothing but a
 * comment in it, written on one line (braces with a block comment between
 * them). The comment goes on a line of its own.
 */
export default {
	meta: {
		type: "layout",
		fixable: "whitespace",
		docs: {
			description:
				"Put the comment of an otherwise empty block on a line of its "
					+ "own.",
		},
		schema: [],
		messages: {
			lines: "A block that holds a comment goes over lines.",
		},
	},

	create( context ) {
		const sourceCode = context.sourceCode;

		return {
			BlockStatement( node ) {
				if ( node.body.length > 0
				|| node.loc.start.line !== node.loc.end.line
					|| sourceCode.getCommentsInside( node ).length === 0 ) {
					return;
				}

				context.report( {
					node,
					messageId: "lines",
					fix( fixer ) {
						const line = sourceCode.lines[node.loc.start.line - 1];
						const indent = LeadingWhitespace( line );
						const eol = DetectEol( sourceCode.text );
						const inner = sourceCode.text.slice(
							node.range[0] + 1,
							node.range[1] - 1,
						).trim();

						return fixer.replaceText(
							node,
							`{${ eol }${ indent }${ IndentUnit( indent ) }${ inner }${ eol }${ indent }}`,
						);
					},
				} );
			},
		};
	},
};
