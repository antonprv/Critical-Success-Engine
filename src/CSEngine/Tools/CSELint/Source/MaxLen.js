// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { CommentFix } from "./Comments.js";
import { LineBreaker } from "./Breaks.js";
import {
	DetectEol,
	DirectivePattern,
	LeadingWhitespace,
	NextLineDirectivePattern,
	Width,
} from "./Text.js";

const UrlPattern = /[^:/?#]:\/\/[^?#]/;

/**
 * max-len that fixes what it finds. The limits and options are those of
 * @stylistic/max-len (code, comments, tabWidth, ignoreUrls, ignorePattern); a
 * line over the limit is reported all the same, and with a fix when there is a
 * way to break it: code is broken at the outermost bracket or operator that
 * fits (Breaks.js), comments are filled again (Comments.js). What can't be
 * broken (a long string, a URL) is only reported.
 */
export default {
	meta: {
		type: "layout",
		fixable: "code",
		docs: {
			description:
				"Enforce a maximum line length and wrap the lines that are too "
					+ "long.",
		},
		schema: [
			{
				type: "object",
				properties: {
					code: { type: "integer", minimum: 0 },
					comments: { type: "integer", minimum: 0 },
					tabWidth: { type: "integer", minimum: 0 },
					ignoreUrls: { type: "boolean" },
					ignorePattern: { type: "string" },
				},
				additionalProperties: false,
			},
		],
		messages: {
			max:
				"This line has a length of {{lineLength}}. Maximum allowed is "
					+ "{{maxLength}}.",
			maxComment:
				"This line has a comment length of {{lineLength}}. Maximum "
					+ "allowed is {{maxLength}}.",
		},
	},

	create( context ) {
		const options = {
			code: 80,
			tabWidth: 4,
			ignoreUrls: false,
			...context.options[0],
		};
		const commentLimit = options.comments ?? options.code;
		const ignorePattern = options.ignorePattern
			? new RegExp( options.ignorePattern, "u" )
			: null;
		const sourceCode = context.sourceCode;

		return {
			"Program:exit"() {
				const lines = sourceCode.lines;
				const text = sourceCode.text;
				const eol = DetectEol( text );
				const comments = sourceCode.getAllComments();
				const breaker = new LineBreaker(
					sourceCode,
					eol,
					options.tabWidth,
				);

				/** @type {Map<number, import("estree").Comment>} */
				const commentByLine = new Map();

				for ( const comment of comments ) {
					for ( let line = comment.loc.start.line; line
						<= comment.loc.end.line; line++ ) {
						commentByLine.set( line, comment );
					}
				}

				// Lines that code starts on, and the lines inside a token that
				// runs over several (a template literal).
				const codeLines = new Set();
				const insideToken = new Set();

				for ( const token of sourceCode.ast.tokens ) {
					codeLines.add( token.loc.start.line );

					for ( let line = token.loc.start.line + 1; line
						<= token.loc.end.line; line++ ) {
						insideToken.add( line );
					}
				}

				const IsComment = ( line ) => {
					const comment = commentByLine.get( line );

					return comment !== undefined
					&& ( !codeLines.has( line )
						|| comment.loc.start.line < line )
						&& !insideToken.has( line );
				};

				const LimitOf = ( line ) => IsComment( line )
					? commentLimit
					: options.code;
				const Directive = ( line ) => line > 1
					&& NextLineDirectivePattern.test( lines[line - 2] );

				const commentState = {
					sourceCode,
					lines,
					eol,
					max: commentLimit,
					tabWidth: options.tabWidth,
					isLong: ( line ) => Width(
						lines[line - 1],
						options.tabWidth,
					) > commentLimit,
				};

				const EditsFor = ( line ) => {
					const lineText = lines[line - 1];

					const disabled = /eslint-disable-line/.test( lineText );

					if ( disabled || Directive( line ) ) {
						return null;
					}

					const comment = commentByLine.get( line );

					if ( IsComment( line ) ) {
						const fix = CommentFix(
							commentState,
							comment,
							line,
							commentByLine,
						);

						return fix
							? [ fix ]
							: null;
					}

					if ( insideToken.has( line ) ) {
						return null;
					}

					if ( comment?.type === "Line"
					&& comment.loc.start.line === line
						&& lineText.slice( 0, comment.loc.start.column )
							.trim() !== ""
						&& !DirectivePattern.test( comment.value ) ) {
						const start = sourceCode.getIndexFromLoc(
							{ line, column: 0 },
						);
						const code = lineText.slice(
							0,
							comment.loc.start.column,
						).replace( /\s+$/, "" );
						const indent = LeadingWhitespace( lineText );

						return [
							{
								range: [ start, comment.range[1] ],
								text:
									`${ indent }//${ comment.value }${ eol }${ code }`,
							},
						];
					}
					return breaker.Fix( line, options.code );
				};

				lines.forEach( ( lineText, index ) => {
					const line = index + 1;
					const length = Width( lineText, options.tabWidth );
					const limit = LimitOf( line );

					if ( length <= limit
					|| ( options.ignoreUrls && UrlPattern.test( lineText ) )
						|| ( ignorePattern
							&& ignorePattern.test( lineText ) ) ) {
						return;
					}

					const edits = EditsFor( line );

					context.report( {
						loc: {
							start: { line, column: 0 },
							end: { line, column: lineText.length },
						},
						messageId: IsComment( line )
							? "maxComment"
							: "max",
						data: { lineLength: length, maxLength: limit },
						...( edits
							? {
								fix: ( fixer ) => edits.map(
									( edit ) => fixer.replaceTextRange(
										edit.range,
										edit.text,
									),
								),
							}
							: {} ),
					} );
				} );
			},
		};
	},
};
