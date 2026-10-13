// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/**
 * The width of a line the way max-len counts it: code points, tabs to the next
 * tab stop.
 */
export function Width( text, tabWidth ) {
	let column = 0;

	for ( const character of text ) {
		column += character === "\t"
			? tabWidth - ( column % tabWidth )
			: 1;
	}
	return column;
}

export function LeadingWhitespace( line ) {
	return /^[ \t]*/.exec( line )[0];
}

/** The file's line break: the one most lines end with. */
export function DetectEol( text ) {
	const crlf = ( text.match( /\r\n/g ) ?? [] ).length;
	const lf = ( text.match( /\n/g ) ?? [] ).length - crlf;

	return crlf > lf
		? "\r\n"
		: "\n";
}

/**
 * One level of indentation, in the way the line is indented already (tabs
 * unless it uses spaces).
 */
export function IndentUnit( indent ) {
	return indent.startsWith( " " )
		? "    "
		: "\t";
}

/**
 * Comments that tell a tool something: they stay where they are, as they are.
 */
export const DirectivePattern = new RegExp( "^\\s*(?:" + [
	"eslint[-\\s]",
	"@ts-",
	"@vitest",
	"prettier-",
	"istanbul\\s",
	"c8\\s",
	"v8\\s",
	"#region",
	"#endregion",
	"\\/",
	"@preserve",
	"@license",
	"@jsx",
	"@__",
].join( "|" ) + ")" );

/**
 * The comments above a line that apply to that line only: breaking it would
 * move what they point at.
 */
export const NextLineDirectivePattern =
	/^\s*(?:\/\/|\/\*)\s*(?:eslint-disable-next-line|@ts-|prettier-ignore)/;
