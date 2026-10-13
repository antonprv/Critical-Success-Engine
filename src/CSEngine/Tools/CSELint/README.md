# @cse/eslint-plugin

ESLint plugin of the engine. It makes `max-len` fix itself: `eslint --fix` (and Save in VSCodium, see `.vscode/settings.json`) wraps
the lines that are too long. Nothing to build: the config imports the sources.

## Rules

- `@cse/max-len` - the options of `@stylistic/max-len` (`code`, `comments`, `tabWidth`, `ignoreUrls`, `ignorePattern`), plus the fix.
- `@cse/empty-block-newline` - a block that holds only a comment goes over lines (`curly-newline` reports it but can't fix it).

## What the fix does

Only line breaks go into the code, in places where a break means nothing to the language; indentation and trailing commas are left
to `indent` and `comma-dangle`, which run in the same `--fix`.

- A line is broken at the outermost construct whose first break still fits: imports and exports, arguments, parameters, arrays,
  objects, generics, chains of calls, `&&`/`||` and other operators, ternaries, union types, `case x:` bodies, statements that share a line.
- An arrow function's expression body goes in parentheses: `( a ) => (\n\tbody\n)` (`implicit-arrow-linebreak: beside` allows it; `=>`
  can't start a line in TypeScript).
- A trailing `//` comment moves to the line above; comments are filled again to the width (lists, `@tags`, code and tables keep their lines).
- Last of all, a string or a template literal (between its `${}` parts) becomes `"head " + "tail"`, as an argument, an element,
  a value or an operand of `+`.
- Left alone, and only reported: what has no place to break (a URL, a word longer than the line, a regex), lines of a multi-line template,
  lines under `eslint-disable-next-line` / `@ts-*` comments.

## Use

`eslint.config.js` of Core registers it as `@cse`; the tools use Core's config. `pnpm run lint:fix` fixes, `pnpm run lint` only reports.
