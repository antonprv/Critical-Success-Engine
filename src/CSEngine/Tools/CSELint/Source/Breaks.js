// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { IndentUnit, LeadingWhitespace, Width } from "./Text.js";

/**
 * Breaking a long line of code. Only line breaks are put into the code (in the
 * places between tokens where a break means nothing to the language), so
 * nothing else about the code changes; the indentation, trailing commas and the
 * like are left to the rules that own them (indent, comma-dangle).
 *
 * The syntax tree gives the places. Each construct that can be laid out over
 * lines is a plan: a list of gaps between two tokens (after an opening bracket,
 * after each comma, before an operator, before the closing bracket). A line
 * that is too long takes the plan of the outermost construct whose first break
 * still fits the line, and the plan that breaks the line the least among those
 * (the last bracket, the last operator). What is still too long after that is
 * taken again on its own, by the next pass of the fixer.
 */

/**
 * The keys of each node whose children stand inside the node's brackets (they
 * are one level deeper).
 */
const BracketKeys = new Map( [
	[ "CallExpression", [ "arguments" ] ],
	[ "NewExpression", [ "arguments" ] ],
	[ "ArrayExpression", [ "elements" ] ],
	[ "ArrayPattern", [ "elements" ] ],
	[ "TSTupleType", [ "elementTypes" ] ],
	[ "ObjectExpression", [ "properties" ] ],
	[ "ObjectPattern", [ "properties" ] ],
	[ "TSTypeLiteral", [ "members" ] ],
	[ "TSInterfaceBody", [ "body" ] ],
	[ "TSEnumDeclaration", [ "members" ] ],
	[ "ImportDeclaration", [ "specifiers" ] ],
	[ "ExportNamedDeclaration", [ "specifiers" ] ],
	[ "TSTypeParameterInstantiation", [ "params" ] ],
	[ "TSTypeParameterDeclaration", [ "params" ] ],
	[ "TemplateLiteral", [ "expressions" ] ],
	...[
		"FunctionDeclaration",
		"FunctionExpression",
		"ArrowFunctionExpression",
		"TSDeclareFunction",
		"TSEmptyBodyFunctionExpression",
		"TSFunctionType",
		"TSMethodSignature",
		"TSCallSignatureDeclaration",
		"TSConstructSignatureDeclaration",
		"TSConstructorType",
	].map( ( type ) => [ type, [ "params" ] ] ),
] );

const FunctionTypes = new Set( [
	"FunctionDeclaration",
	"FunctionExpression",
	"ArrowFunctionExpression",
	"TSDeclareFunction",
	"TSEmptyBodyFunctionExpression",
	"TSFunctionType",
	"TSMethodSignature",
	"TSCallSignatureDeclaration",
	"TSConstructSignatureDeclaration",
	"TSConstructorType",
] );

const Precedence = {
	"||": 1, "??": 1, "&&": 2, "|": 3, "^": 4, "&": 5,
	"==": 6, "!=": 6, "===": 6, "!==": 6,
	"<": 7, ">": 7, "<=": 7, ">=": 7, "instanceof": 7, "in": 7,
	"<<": 8, ">>": 8, ">>>": 8,
	"+": 9, "-": 9,
	"*": 10, "/": 10, "%": 10,
	"**": 11,
};

/** Which plan is taken first among those at the same depth (lower first). */
const Rank = {
	Fill: 0,
	Chain: 1,
	Bracket: 2,
	Arrow: 2,
	LoneOperator: 3,
	Assignment: 8,
};

const IsPunctuator = ( token, value ) => token?.type === "Punctuator"
	&& token.value === value;

export class LineBreaker {
	#sourceCode;

	#eol;

	#tabWidth;

	#built = false;

	/** @type {Map<number, object[]>} The plans with a gap on each line. */
	#byLine = new Map();

	/**
	 * @type {Map<number, object[]>} The string literals that may be split in
	 * two, by the line they start on.
	 */
	#strings = new Map();

	constructor( sourceCode, eol, tabWidth ) {
		this.#sourceCode = sourceCode;
		this.#eol = eol;
		this.#tabWidth = tabWidth;
	}

	/**
	 * The edits that break a line that is too long (ranges in the text), or
	 * nothing if it can't be broken.
	 *
	 * @param {number} line
	 * @param {number} max
	 */
	Fix( line, max ) {
		this.#Build();

		const lineText = this.#sourceCode.lines[line - 1];
		const indent = LeadingWhitespace( lineText );
		const candidates = [];

		for ( const plan of this.#byLine.get( line ) ?? [] ) {
			const gaps = plan.Gaps.filter( ( gap ) => this.#Open( gap, line ) );

			if ( gaps.length === 0 ) {
				continue;
			}

			const columns = gaps.map(
				( gap ) => Width(
					lineText.slice( 0, gap.Left.loc.end.column ),
					this.#tabWidth,
				),
			);
			candidates.push(
				{
					Plan: plan,
					First: Math.min( ...columns ) + ( plan.Extra ?? 0 ),
				},
			);
		}

		const fitting = candidates.filter(
			( candidate ) => candidate.First <= max,
		);
		const ordered = fitting.length > 0
			? fitting.sort(
				( a, b ) => a.Plan.Depth - b.Plan.Depth
					|| a.Plan.Rank - b.Plan.Rank
					|| b.First - a.First,
			)
			: candidates.sort( ( a, b ) => a.First - b.First );

		for ( const { Plan } of ordered ) {
			const edits = this.#Edits( Plan, line, indent, lineText );

			if ( edits ) {
				return edits;
			}
		}
		return this.#SplitString( line, max, indent, lineText );
	}

	/**
	 * The last thing to try: a string (or a template literal, between its ${}
	 * parts) too long for its line becomes two joined by + ("head " + "tail").
	 */
	#SplitString( line, max, indent, lineText ) {
		const unit = IndentUnit( indent );

		for ( const { Quote, Segments } of this.#strings.get( line ) ?? [] ) {
			let split = -1;

			for ( const segment of Segments ) {
				const text = this.#sourceCode.text.slice(
					segment.From,
					segment.To,
				);

				for (
					let index = text.indexOf( " " );
					index >= 0;
					index = text.indexOf( " ", index + 1 )
				) {
					const position = segment.From + index + 1;
					const column = position - segment.Token.range[0]
						+ segment.Token.loc.start.column;
					const fits = Width(
						lineText.slice( 0, column ),
						this.#tabWidth,
					) + 1 <= max;
					const whole = position > segment.From
						&& position < segment.To;

					if ( fits && whole && !text.slice( 0, index )
						.endsWith( "\\" ) ) {
						split = position;
					}
				}
			}

			if ( split >= 0 ) {
				const deeper = !lineText.slice( indent.length )
					.startsWith( "+" );

				return [ {
					range: [ split, split ],
					text:
						`${ Quote }${ this.#eol }${ indent }${ deeper ? unit : "" }+ ${ Quote }`,
				} ];
			}
		}
		return null;
	}

	/**
	 * Whether a gap is on the line and holds nothing but blanks: a break can go
	 * in.
	 */
	#Open( gap, line ) {
		return gap.Left.loc.end.line === line
			&& gap.Right.loc.start.line === line
			&& this.#Blank( gap );
	}

	#Blank( gap ) {
		return gap.Left.loc.end.line === gap.Right.loc.start.line
			&& /^[ \t]*$/.test(
				this.#sourceCode.text.slice(
					gap.Left.range[1],
					gap.Right.range[0],
				),
			);
	}

	#Edits( plan, line, indent, lineText ) {
		const unit = IndentUnit( indent );
		const eol = this.#eol;
		const edits = [];

		if ( plan.Kind === "arrow" ) {
			const [ gap ] = plan.Gaps;
			const end = plan.Last.range[1];

			edits.push(
				{
					range: [ gap.Left.range[1], gap.Right.range[0] ],
					text: ` (${ eol }${ indent }${ unit }`,
				},
			);
			edits.push( { range: [ end, end ], text: `${ eol }${ indent })` } );
			return edits;
		}

		const continuing = /^(?:\?\.|\.)/.test(
			lineText.slice( indent.length ),
		);

		for ( const gap of plan.Gaps ) {
			if ( !this.#Blank( gap ) ) {
				continue;
			}

			const deeper = plan.Kind === "chain"
				? !continuing
				: gap.Delta === 1;
			edits.push( {
				range: [ gap.Left.range[1], gap.Right.range[0] ],
				text: eol + indent + ( deeper ? unit : "" ),
			} );
		}
		return edits.length > 0
			? edits
			: null;
	}

	//#region Plans

	#Build() {
		if ( this.#built ) {
			return;
		}
		this.#built = true;

		const sourceCode = this.#sourceCode;
		const keys = sourceCode.visitorKeys;

		const Walk = ( node, parent, depth, inTemplate ) => {
			if ( !inTemplate ) {
				this.#Collect( node, parent, depth );
			}

			const bracketed = BracketKeys.get( node.type ) ?? [];

			for ( const key of keys[node.type] ?? [] ) {
				const child = node[key];
				const deeper = depth + ( bracketed.includes( key )
					? 1
					: 0 );
				const templated = inTemplate
					|| ( node.type === "TemplateLiteral"
						&& key === "expressions" );

				for ( const item of Array.isArray( child )
					? child
					: [ child ] ) {
					if ( item ) {
						Walk( item, node, deeper, templated );
					}
				}
			}
		};

		Walk( sourceCode.ast, null, 0, false );
	}

	#Add( plan ) {
		for ( const gap of plan.Gaps ) {
			if ( gap.Left.loc.end.line !== gap.Right.loc.start.line ) {
				continue;
			}

			const line = gap.Left.loc.end.line;
			const list = this.#byLine.get( line ) ?? [];

			if ( !list.includes( plan ) ) {
				list.push( plan );
			}
			this.#byLine.set( line, list );
		}
	}

	/**
	 * The gap after a separator (or after the item, when the item holds its
	 * own), between two items of a list.
	 */
	#SeparatorGap( before, after ) {
		const sourceCode = this.#sourceCode;
		const separator = sourceCode.getTokensBetween( before, after )
			.reverse()
			.find(
				( token ) => IsPunctuator( token, "," )
					|| IsPunctuator( token, ";" ),
			);
		const left = separator ?? sourceCode.getLastToken( before );

		return {
			Left: left,
			Right: sourceCode.getTokenAfter( left ),
			Delta: 1,
		};
	}

	/**
	 * A bracketed list (arguments, parameters, elements, properties,
	 * specifiers): one item to a line.
	 */
	#AddList( depth, open, close, items ) {
		const sourceCode = this.#sourceCode;

		if ( !open
			|| !close
			|| items.length === 0
			|| items.some( ( item ) => !item ) ) {
			return;
		}

		const first = sourceCode.getTokenAfter( open );

		if ( open.loc.end.line !== first.loc.start.line ) {
			// Already one item to a line (or several): a line too long in it is
			// filled, not spread.
			for ( let index = 0; index < items.length - 1; index++ ) {
				const gap = this.#SeparatorGap(
					items[index],
					items[index + 1],
				);
				this.#Add(
					{
						Kind: "fill",
						Depth: depth + 1,
						Rank: Rank.Fill,
						Gaps: [ { ...gap, Delta: 0 } ],
					},
				);
			}
			return;
		}

		const gaps = [ { Left: open, Right: first, Delta: 1 } ];

		for ( let index = 0; index < items.length - 1; index++ ) {
			gaps.push( this.#SeparatorGap( items[index], items[index + 1] ) );
		}

		gaps.push(
			{
				Left: sourceCode.getTokenBefore( close ),
				Right: close,
				Delta: 0,
			},
		);
		this.#Add(
			{ Kind: "list", Depth: depth, Rank: Rank.Bracket, Gaps: gaps },
		);
	}

	/**
	 * Operators of one expression (before each of them goes a break): all at
	 * once, or one at a time in a line already broken.
	 */
	#AddOperators( depth, operators, rank ) {
		const sourceCode = this.#sourceCode;
		const gaps = operators.map(
			( operator ) => ( {
				Left: sourceCode.getTokenBefore( operator ),
				Right: operator,
				Delta: 1,
			} ),
		);

		if ( gaps.every(
			( gap ) => gap.Left.loc.end.line === gap.Right.loc.start.line,
		) ) {
			this.#Add(
				{ Kind: "operators", Depth: depth, Rank: rank, Gaps: gaps },
			);
			return;
		}

		for ( const gap of gaps ) {
			this.#Add(
				{
					Kind: "fill",
					Depth: depth,
					Rank: Rank.Fill,
					Gaps: [ { ...gap, Delta: 0 } ],
				},
			);
		}
	}

	#Collect( node, parent, depth ) {
		const sourceCode = this.#sourceCode;
		const after = ( from, value ) => sourceCode.getTokenAfter(
			from,
			{ filter: ( token ) => IsPunctuator( token, value ) },
		);

		if (
			( node.type === "Literal"
				&& typeof node.value === "string"
				&& /^["']/.test( node.raw ) )
			|| node.type === "TemplateLiteral"
		) {
			this.#AddString( node, parent );
		}

		for ( const list of [ node.body, node.consequent ] ) {
			if ( Array.isArray( list ) ) {
				this.#AddStatements( depth, list );
			}
		}

		switch ( node.type ) {
			case "SwitchCase": {
				const colon = node.test
					? after( node.test, ":" )
					: sourceCode.getFirstToken( node, { skip: 1 } );
				const next = node.consequent[0]
					? sourceCode.getFirstToken( node.consequent[0] )
					: null;

				if ( IsPunctuator( colon, ":" ) && next ) {
					this.#Add(
						{
							Kind: "case",
							Depth: depth,
							Rank: Rank.LoneOperator,
							Gaps: [ { Left: colon, Right: next, Delta: 1 } ],
						},
					);
				}
				break;
			}

			case "CallExpression":
			case "NewExpression": {
				if ( node.arguments.length > 0 ) {
					const start = node.typeArguments ?? node.callee;
					const open = after( start, "(" );
					const close = sourceCode.getLastToken( node );

					if ( IsPunctuator( close, ")" )
						&& open
						&& open.range[1] <= node.arguments[0].range[0] ) {
						this.#AddList( depth, open, close, node.arguments );
					}
				}

				if ( node.type === "CallExpression"
				&& node.callee.type === "MemberExpression"
				&& !node.callee.computed
					&& this.#HasCallInChain( node.callee.object ) ) {
					const dot = sourceCode.getTokenBefore(
						node.callee.property,
					);

					if ( IsPunctuator( dot, "." )
						|| IsPunctuator( dot, "?." ) ) {
						this.#Add( {
							Kind: "chain",
							Depth: depth,
							Rank: Rank.Chain,
							Gaps: [
								{
									Left: sourceCode.getTokenBefore( dot ),
									Right: dot,
									Delta: 1,
								},
							],
						} );
					}
				}
				break;
			}

			case "ImportDeclaration":
			case "ExportNamedDeclaration": {
				const named = node.specifiers.filter(
					( specifier ) => specifier.type === "ImportSpecifier"
						|| specifier.type === "ExportSpecifier",
				);

				if ( named.length > 0 ) {
					const open = sourceCode.getTokenBefore( named[0] );
					const close = after( named[named.length - 1], "}" );
					this.#AddList(
						depth,
						IsPunctuator( open, "{" ) ? open : null,
						close,
						named,
					);
				}
				break;
			}

			case "ArrayExpression":
			case "ArrayPattern":
			case "TSTupleType": {
				const items = node.elements ?? node.elementTypes;
				const open = sourceCode.getFirstToken( node );
				const close = items.length > 0
					? after( items[items.length - 1], "]" )
					: null;
				this.#AddList(
					depth,
					IsPunctuator( open, "[" ) ? open : null,
					close,
					items,
				);
				break;
			}

			case "ObjectExpression":
			case "ObjectPattern":
			case "TSTypeLiteral":
			case "TSInterfaceBody": {
				const items = node.properties ?? node.members ?? node.body;
				const open = sourceCode.getFirstToken( node );
				const close = items.length > 0
					? after( items[items.length - 1], "}" )
						?? sourceCode.getLastToken( node )
					: null;
				this.#AddList(
					depth,
					IsPunctuator( open, "{" ) ? open : null,
					close,
					items,
				);
				break;
			}

			case "TSTypeParameterInstantiation":
			case "TSTypeParameterDeclaration": {
				const open = sourceCode.getFirstToken( node );
				const close = sourceCode.getLastToken( node );

				if ( IsPunctuator( open, "<" ) && IsPunctuator( close, ">" ) ) {
					this.#AddList( depth, open, close, node.params );
				}
				break;
			}

			case "BinaryExpression":
			case "LogicalExpression": {
				if ( parent
				&& ( parent.type === "BinaryExpression"
					|| parent.type === "LogicalExpression" )
					&& parent.left === node && parent.range[0] === node.range[0]
					&& Precedence[parent.operator]
						=== Precedence[node.operator] ) {
					break;
				}

				const operators = [];
				let current = node;

				for ( ;; ) {
					const operator = sourceCode.getTokenAfter( current.left, {
						filter: ( token ) => token.value === current.operator
							&& ( token.type === "Punctuator"
								|| token.type === "Keyword" ),
					} );

					if ( operator ) {
						operators.unshift( operator );
					}

					const left = current.left;

					if ( ( left.type === "BinaryExpression"
						|| left.type === "LogicalExpression" )
						&& left.range[0] === current.range[0]
						&& Precedence[left.operator]
							=== Precedence[current.operator] ) {
						current = left;
					} else {
						break;
					}
				}

				this.#AddOperators(
					depth,
					operators,
					node.type === "LogicalExpression" || operators.length > 1
						? Rank.Chain
						: Rank.LoneOperator,
				);
				break;
			}

			case "ConditionalExpression": {
				const question = after( node.test, "?" );
				const colon = after( node.consequent, ":" );

				if ( parent?.type === "ConditionalExpression"
				&& parent.alternate === node
					&& IsPunctuator(
						sourceCode.getTokenBefore( node ),
						":",
					) ) {
					break;
				}

				const operators = [ question, colon ];
				let alternate = node.alternate;

				while ( alternate.type === "ConditionalExpression"
					&& IsPunctuator(
						sourceCode.getTokenBefore( alternate ),
						":",
					) ) {
					operators.push(
						after( alternate.test, "?" ),
						after( alternate.consequent, ":" ),
					);
					alternate = alternate.alternate;
				}

				this.#AddOperators(
					depth,
					operators.filter( Boolean ),
					Rank.Chain,
				);
				break;
			}

			case "TSUnionType":
			case "TSIntersectionType": {
				const symbol = node.type === "TSUnionType"
					? "|"
					: "&";
				const operators = [];

				for ( let index = 1; index < node.types.length; index++ ) {
					const operator = sourceCode.getTokensBetween(
						node.types[index - 1],
						node.types[index],
					)
						.find( ( token ) => IsPunctuator( token, symbol ) );

					if ( operator ) {
						operators.push( operator );
					}
				}

				if ( operators.length > 0 ) {
					this.#AddOperators( depth, operators, Rank.Chain );
				}
				break;
			}

			case "VariableDeclarator":
			case "AssignmentExpression":
			case "AssignmentPattern":
			case "PropertyDefinition":
			case "TSTypeAliasDeclaration": {
				const target = node.id ?? node.left ?? node.key;
				const value = node.init
					?? node.right
					?? node.value
					?? node.typeAnnotation;

				if ( target && value && !( node.type === "PropertyDefinition"
					&& node.computed ) ) {
					this.#AddAfter(
						depth,
						target.type === "Identifier"
							|| node.type !== "TSTypeAliasDeclaration"
							? target
							: node.typeParameters ?? target,
						"=",
					);
				}
				break;
			}

			case "Property": {
				if ( !node.shorthand && !node.method && node.kind === "init" ) {
					this.#AddAfter( depth, node.key, ":" );
				}
				break;
			}

			case "ArrowFunctionExpression": {
				this.#AddArrow( node, depth );
				break;
			}

			default:
				break;
		}

		if ( FunctionTypes.has( node.type ) && node.params.length > 0 ) {
			const open = sourceCode.getTokenBefore( node.params[0] );
			const last = node.params[node.params.length - 1];
			const close = after( last, ")" );

			if ( IsPunctuator( open, "(" )
				&& open.range[0] >= node.range[0]
				&& close ) {
				this.#AddList( depth, open, close, node.params );
			}
		}
	}

	/**
	 * Statements that share a line (a; b; c;): one to a line, as many as the
	 * line needs.
	 */
	#AddStatements( depth, statements ) {
		const sourceCode = this.#sourceCode;

		for ( let index = 0; index < statements.length - 1; index++ ) {
			const left = sourceCode.getLastToken( statements[index] );
			const right = sourceCode.getFirstToken( statements[index + 1] );

			if ( left.loc.end.line === right.loc.start.line ) {
				this.#Add(
					{
						Kind: "fill",
						Depth: depth,
						Rank: Rank.Fill,
						Gaps: [ { Left: left, Right: right, Delta: 0 } ],
					},
				);
			}
		}
	}

	/**
	 * A string or template literal that may become two: as an argument, an
	 * element, a value or an operand of +, never as a callee, a member's object
	 * or a tag.
	 */
	#AddString( node, parent ) {
		const isArgument = parent
			&& [ "CallExpression", "NewExpression" ].includes( parent.type )
			&& parent.arguments.includes( node );
		const allowed = isArgument
			|| parent?.type === "ArrayExpression"
			|| ( parent?.type === "Property" && parent.value === node )
			|| ( parent?.type === "VariableDeclarator" && parent.init === node )
			|| ( parent?.type === "AssignmentExpression"
				&& parent.right === node )
			|| parent?.type === "ReturnStatement"
			|| ( parent?.type === "BinaryExpression"
				&& parent.operator === "+" );

		if ( !allowed || node.loc.start.line !== node.loc.end.line ) {
			return;
		}

		const sourceCode = this.#sourceCode;
		let quote = "`";
		let segments;

		if ( node.type === "Literal" ) {
			const token = sourceCode.getFirstToken( node );
			quote = token.value[0];
			segments = [
				{
					Token: token,
					From: token.range[0] + 1,
					To: token.range[1] - 1,
				},
			];
		} else {
			// The text parts: a Template token is `abc${ or }abc${ or }abc`,
			// the delimiters are not text.
			segments = sourceCode.getTokens( node )
				.filter( ( token ) => token.type === "Template" )
				.map( ( token ) => ( {
					Token: token,
					From: token.range[0] + 1,
					To: token.range[1] - ( token.value.endsWith( "${" )
						? 2
						: 1 ),
				} ) );
		}

		const line = node.loc.start.line;
		const list = this.#strings.get( line ) ?? [];

		list.push( { Quote: quote, Segments: segments } );
		this.#strings.set( line, list );
	}

	/**
	 * A break after an operator (= or :), the last thing to try for a line: the
	 * value goes on a line of its own.
	 */
	#AddAfter( depth, from, value ) {
		const sourceCode = this.#sourceCode;
		const operator = sourceCode.getTokenAfter(
			from,
			{ filter: ( token ) => IsPunctuator( token, value ) },
		);
		const next = operator
			? sourceCode.getTokenAfter( operator )
			: null;

		if ( operator && next ) {
			this.#Add(
				{
					Kind: "assignment",
					Depth: depth,
					Rank: Rank.Assignment,
					Gaps: [ { Left: operator, Right: next, Delta: 1 } ],
				},
			);
		}
	}

	/**
	 * An arrow function's expression body goes in parentheses over lines of its
	 * own: ( a ) => (\n body\n).
	 */
	#AddArrow( node, depth ) {
		const sourceCode = this.#sourceCode;

		if ( node.body.type === "BlockStatement" ) {
			return;
		}

		const arrow = sourceCode.getTokenBefore( node.body );

		if ( !IsPunctuator( arrow, "=>" ) ) {
			return;
		}

		this.#Add( {
			Kind: "arrow",
			Depth: depth,
			Rank: Rank.Arrow,
			Extra: 2,
			Last: sourceCode.getLastToken( node.body ),
			Gaps: [
				{
					Left: arrow,
					Right: sourceCode.getFirstToken( node.body ),
					Delta: 1,
				},
			],
		} );
	}

	/**
	 * Whether a call stands in the chain an expression is the start of (a().b:
	 * the second call may start a line).
	 */
	#HasCallInChain( object ) {
		let current = object;

		for ( ;; ) {
			if ( current.type === "CallExpression" ) {
				return true;
			}

			if ( current.type === "MemberExpression" ) {
				current = current.object;
			} else if ( current.type === "TSNonNullExpression"
				|| current.type === "ChainExpression" ) {
				current = current.expression;
			} else {
				return false;
			}
		}
	}

	//#endregion
}
