import cse from "@cse/eslint-plugin";
import stylistic from "@stylistic/eslint-plugin";
import jsonc from "eslint-plugin-jsonc";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: [
			"node_modules/**",
			"coverage/**",
			".e2e/**",
			"test-results/**",
			"playwright-report/**",
			// generated from .contract files (rewritten on every change)
			"**/*.contract.ts",
			// what C# projects build to (a project's scripts: Binaries/Scripts)
			"**/Binaries/**",
			"**/obj/**",
			"**/bin/**",
		],
	},

	...tseslint.configs.recommended,
	...jsonc.configs["recommended-with-json"],
	...jsonc.configs["recommended-with-jsonc"],

	{
		files: [ "**/*.{ts,tsx,js,jsx}" ],

		plugins: {
			"@cse": cse,
			"@stylistic": stylistic,
		},

		rules: {
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{argsIgnorePattern: "^_"},
			],

			// Require tabs for indentation.
			"@stylistic/indent": [
				"error",
				"tab",
				{SwitchCase: 1},
			],

			// Limit code and comments to 80 characters; --fix wraps what is too
			// long (Tools/CSELint). Only what can't be wrapped stays a warning.
			"@cse/max-len": [
				"warn",
				{
					code: 80,
					comments: 80,
					tabWidth: 4,
					ignoreUrls: false,
				},
			],

			// Require spaces inside parentheses.
			"@stylistic/space-in-parens": [
				"error",
				"always",
			],

			// Require double quotes.
			"@stylistic/quotes": [
				"error",
				"double",
			],

			// Require semicolons.
			"@stylistic/semi": [
				"error",
				"always",
			],

			// Require trailing commas in multiline structures.
			"@stylistic/comma-dangle": [
				"error",
				"always-multiline",
			],

			// Require braces for all control-flow bodies.
			curly: [
				"error",
				"all",
			],

			// Require multiline blocks.
			"@stylistic/curly-newline": [
				"error",
				"always",
			],

			// Fixes what curly-newline can't: a block holding only a comment.
			"@cse/empty-block-newline": "error",

			// Require blank lines between class members.
			"@stylistic/lines-between-class-members": [
				"error",
				"always",
				{exceptAfterSingleLine: false},
			],

			// Require blank lines between function declarations.
			"@stylistic/padding-line-between-statements": [
				"error",
				{
					blankLine: "always",
					prev: "function",
					next: "function",
				},
				{
					blankLine: "always",
					prev: [ "const", "let", "var" ],
					next: [
						"if",
						"switch",
						"for",
						"while",
						"do",
						"try",
						"return",
						"throw",
					],
				},
			],

			// Require one variable declaration per line.
			"@stylistic/one-var-declaration-per-line": [
				"error",
				"always",
			],

			// Require a newline after every chained call.
			"@stylistic/newline-per-chained-call": [
				"error",
				{ignoreChainWithDepth: 2},
			],

			// Require multiline arrow-function bodies beside the arrow.
			"@stylistic/implicit-arrow-linebreak": [
				"error",
				"beside",
			],

			// Spaces around ${ } in template string literals.
			"@stylistic/template-curly-spacing": [ "error", "always" ],

			// Disallow trailing whitespace.
			"@stylistic/no-trailing-spaces": "error",

			// Disallow multiple consecutive empty lines.
			"@stylistic/no-multiple-empty-lines": [
				"warn",
				{
					max: 2,
					maxEOF: 0,
					maxBOF: 0,
				},
			],
		},
	},

	{
		files: [ "**/*.json", "**/*.jsonc" ],

		plugins: {"@stylistic": stylistic},

		rules: {

			"jsonc/no-comments": "off",

			// Require tabs for JSON indentation.
			"jsonc/indent": [
				"error",
				"tab",
			],

			// Limit JSON lines to 80 characters.
			"@stylistic/max-len": [
				"warn",
				{
					code: 140,
					comments: 140,
					tabWidth: 4,
					ignoreUrls: true,
				},
			],
		},
	},
);
