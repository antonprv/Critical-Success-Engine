// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { DirectivePattern, Width } from "./Text.js";

/**
 * Wrapping comments. A paragraph of a comment (the lines that read as one text)
 * that has a line too long is set again to the width: its words are filled line
 * by line. Lists, tags (@param), blank lines, code and tables keep their lines.
 */

const WordPattern = /`[^`]*`\S*|\{@[^}]*\}\S*|\S+/g;
const BulletPattern = /^(?:[-*+]|\d+[.)])\s+/;

/**
 * @typedef {object} Paragraph
 * @property {string[]} Texts The text of each line, without the comment's own
 * marks.
 * @property {number[]} Lines The source line of each of them.
 * @property {boolean} Reflow Whether the lines are one text that can be set
 * again.
 * @property {string} Hang What a continuation line starts with (a list item's
 * text lines up).
 * @property {string} Lead What the first line starts with (an indented line
 * keeps its indentation).
 */

/** Splits the lines of a comment's text into paragraphs. */
function Paragraphs( texts, lines ) {
	/** @type {Paragraph[]} */
	const paragraphs = [];
	let open = null;
	let fenced = false;

	const Verbatim = ( text, line ) => {
		paragraphs.push(
			{ Texts: [text], Lines: [line], Reflow: false, Hang: "", Lead: "" },
		);
		open = null;
	};

	texts.forEach( ( text, index ) => {
		const line = lines[index];

		if ( /^```/.test( text ) ) {
			fenced = !fenced;
			Verbatim( text, line );
			return;
		}

		const indentation = /^\s*/.exec( text )[0];

		if ( fenced || text === "" || /^[|#]/.test( text ) ) {
			Verbatim( text, line );
			return;
		}

		if ( indentation !== "" && !( open !== null
			&& open.Hang !== ""
			&& open.Lead === "" ) ) {
			if ( open !== null && open.Lead === indentation ) {
				open.Texts.push( text.trim() );
				open.Lines.push( line );
			} else {
				open = {
					Texts: [text.trim()],
					Lines: [line],
					Reflow: true,
					Hang: indentation,
					Lead: indentation,
				};
				paragraphs.push( open );
			}
			return;
		}

		const bullet = BulletPattern.exec( text );

		if ( bullet || text.startsWith( "@" ) ) {
			open = {
				Texts: [text],
				Lines: [line],
				Reflow: true,
				Lead: "",
				Hang: bullet
					? " ".repeat( bullet[0].length )
					: "",
			};
			paragraphs.push( open );
			return;
		}

		if ( open === null ) {
			open = {
				Texts: [text],
				Lines: [line],
				Reflow: true,
				Hang: "",
				Lead: "",
			};
			paragraphs.push( open );
			return;
		}

		open.Texts.push( text.trim() );
		open.Lines.push( line );
	} );
	return paragraphs;
}

/**
 * Fills the words of a text into lines no wider than `available`; a word wider
 * than that keeps a line to itself.
 */
export function WrapText( text, available, hang, tabWidth, lead = "" ) {
	const words = text.match( WordPattern ) ?? [];
	const lines = [];
	let current = lead;

	for ( const word of words ) {
		if ( current.trim() === "" ) {
			current += word;
		} else if ( Width( `${current} ${word}`, tabWidth ) <= available ) {
			current += ` ${word}`;
		} else {
			lines.push( current );
			current = hang + word;
		}
	}

	if ( current.trim() !== "" ) {
		lines.push( current );
	}
	return lines;
}

/**
 * The lines of a paragraph, set again if one of its lines is over the limit
 * (the others as they are).
 */
function SetParagraph( paragraph, isLong, available, tabWidth, original ) {
	if ( !paragraph.Reflow || !paragraph.Lines.some( isLong ) ) {
		return paragraph.Texts.map(
			( text, index ) => original( paragraph.Lines[index], text ),
		);
	}

	return WrapText(
		paragraph.Texts.join( " " ),
		available,
		paragraph.Hang,
		tabWidth,
		paragraph.Lead,
	);
}

/** Whether a text reads as code (commented-out code is left alone). */
const LooksLikeCode = ( text ) => /[{}]\s*$/.test( text )
	|| /\)\s*;\s*$/.test( text )
	|| /=[^=].*;\s*$/.test( text )
	|| /^(?:const|let|var)\s+[\w$]+\s*[=:;]/.test( text )
	|| /^import\s*[\w{*].*\sfrom\s/.test( text )
	|| /^export\s+(?:const|let|function|class|default|type|interface|enum)\b/.test(
		text,
	)
	|| /^(?:if|for|while|switch)\s*\(/.test( text )
	|| /^(?:function|class)\s+[\w$]+\s*[({<]/.test( text );

/**
 * The fix for a comment with a line too long, or nothing if it can't be
 * wrapped.
 *
 * @param {object} state
 * @param {import("eslint").SourceCode} state.sourceCode
 * @param {string[]} state.lines
 * @param {string} state.eol
 * @param {number} state.max
 * @param {number} state.tabWidth
 * @param {( line: number ) => boolean} state.isLong
 * @param {import("estree").Comment} comment
 * @param {number} line The line that is too long.
 * @param {Map<number, import("estree").Comment>} commentByLine
 */
export function CommentFix( state, comment, line, commentByLine ) {
	return comment.type === "Block"
		? BlockCommentFix( state, comment )
		: LineCommentFix( state, comment, line, commentByLine );
}

function BlockCommentFix( state, comment ) {
	const { sourceCode, lines, eol, max, tabWidth, isLong } = state;
	const first = comment.loc.start.line;
	const last = comment.loc.end.line;
	const startLine = lines[first - 1];
	const indent = /^[ \t]*/.exec( startLine )[0];

	if ( startLine.slice( 0, comment.loc.start.column ).trim() !== ""
		|| lines[last - 1].slice( comment.loc.end.column ).trim() !== "" ) {
		return null;
	}

	if ( DirectivePattern.test( comment.value.replace( /^\*/, "" ) ) ) {
		return null;
	}

	const opener = comment.value.startsWith( "*" ) && comment.value.length > 1
		? "/**"
		: "/*";
	const raw = sourceCode.text.slice(
		comment.range[0] + opener.length,
		comment.range[1] - 2,
	);
	const rawLines = raw.split( /\r?\n/ );
	const texts = [];
	const numbers = [];

	for ( let index = 0; index < rawLines.length; index++ ) {
		let text = rawLines[index];

		if ( index === 0 ) {
			text = text.replace( /^\s/, "" );
		} else {
			const star = /^\s*\*(?!\/)/.exec( text );

			if ( !star && rawLines.length > 1 && index < rawLines.length - 1 ) {
				return null;
			}
			text = star
				? text.slice( star[0].length ).replace( /^ /, "" )
				: text.replace( /^\s+/, "" );
		}
		texts.push( text.replace( /\s+$/, "" ) );
		numbers.push( first + index );
	}

	while ( texts.length > 0 && texts[0] === "" ) {
		texts.shift();
		numbers.shift();
	}

	while ( texts.length > 0 && texts[texts.length - 1] === "" ) {
		texts.pop();
		numbers.pop();
	}

	const prefix = `${indent} * `;
	const available = max - Width( prefix, tabWidth );

	if ( texts.length === 0 || available < 20 ) {
		return null;
	}

	const Mark = ( text ) => text === ""
		? `${indent} *`
		: prefix + text;
	const body = [];

	for ( const paragraph of Paragraphs( texts, numbers ) ) {
		const wrapped = SetParagraph(
			paragraph,
			isLong,
			available,
			tabWidth,
			( _number, text ) => text,
		);
		body.push( ...wrapped.map( Mark ) );
	}

	const text = [ opener, ...body, `${indent} */` ].join( eol );

	return text === sourceCode.text.slice( comment.range[0], comment.range[1] )
		? null
		: { range: comment.range, text };
}

function LineCommentFix( state, comment, line, commentByLine ) {
	const { sourceCode, lines, eol, max, tabWidth, isLong } = state;
	const column = comment.loc.start.column;
	const indent = /^[ \t]*/.exec( lines[line - 1] )[0];

	const Standalone = ( candidate ) => candidate !== undefined
		&& candidate.type === "Line"
		&& candidate.loc.start.column === column
		&& lines[candidate.loc.start.line - 1].slice( 0, column ).trim() === ""
		&& !candidate.value.startsWith( "/" )
		&& !DirectivePattern.test( candidate.value );

	if ( !Standalone( comment ) ) {
		return null;
	}

	let from = line;
	let to = line;

	while ( Standalone( commentByLine.get( from - 1 ) ) ) {
		from--;
	}

	while ( Standalone( commentByLine.get( to + 1 ) ) ) {
		to++;
	}

	const run = [];

	for ( let number = from; number <= to; number++ ) {
		run.push( commentByLine.get( number ) );
	}

	const texts = run.map(
		( item ) => item.value.replace( /^ /, "" ).replace( /\s+$/, "" ),
	);

	if ( texts.some( LooksLikeCode ) ) {
		return null;
	}

	const prefix = `${indent}// `;
	const available = max - Width( prefix, tabWidth );

	if ( available < 20 ) {
		return null;
	}

	const numbers = run.map( ( item ) => item.loc.start.line );
	const out = [];

	for ( const paragraph of Paragraphs( texts, numbers ) ) {
		const wrapped = SetParagraph(
			paragraph,
			isLong,
			available,
			tabWidth,
			( number ) => sourceCode.text.slice(
				commentByLine.get( number ).range[0],
				commentByLine.get( number ).range[1],
			),
		);

		if ( paragraph.Reflow && paragraph.Lines.some( isLong ) ) {
			out.push( ...wrapped.map( ( text ) => `// ${text}` ) );
		} else {
			out.push( ...wrapped );
		}
	}

	const range = [ run[0].range[0], run[run.length - 1].range[1] ];
	const text = out.join( eol + indent );

	return text === sourceCode.text.slice( range[0], range[1] )
		? null
		: { range, text };
}
