// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import * as monaco from "monaco-editor";
import EngineTypes from "virtual:cse/engine-types";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import CssWorker from "monaco-editor/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker?worker";

/**
 * Monaco, the editor of VS Code, set up for the engine's code: its workers come from the build (Vite workers), and the
 * TypeScript language service checks and completes with the engine's own compiler settings. Runs only in a real
 * browser (workers, layout): its tests are the end-to-end ones.
 */
/** Each language's service runs in its own worker (the rest in the editor's). */
const Workers: Record<string, new () => Worker> = {
	typescript: TypeScriptWorker, javascript: TypeScriptWorker,
	json: JsonWorker,
	css: CssWorker, scss: CssWorker, less: CssWorker,
	html: HtmlWorker, handlebars: HtmlWorker, razor: HtmlWorker,
};
self.MonacoEnvironment = { getWorker: (_id, label) => new (Workers[label] ?? EditorWorker)() };

monaco.typescript.typescriptDefaults.setCompilerOptions({
	target: monaco.typescript.ScriptTarget.ESNext,
	module: monaco.typescript.ModuleKind.ESNext,
	moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
	strict: true,
	allowNonTsExtensions: true,
	noUnusedLocals: true,
});

// Every model goes to the TypeScript worker, not only the shown ones: the project's other files are what its imports need.
monaco.typescript.typescriptDefaults.setEagerModelSync(true);
monaco.typescript.javascriptDefaults.setEagerModelSync(true);

// The engine's own types: imports of @cse/core and @cse/ui resolve, and their API completes.
for (const [path, text] of Object.entries(EngineTypes)) monaco.typescript.typescriptDefaults.addExtraLib(text, path);

export { monaco };
