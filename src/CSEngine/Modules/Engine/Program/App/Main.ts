// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

// A program's page: the project's UI documents, its theme and its Program.ts (main), given by the build
// (Build/BuildProgram.mjs: the alias @cse-project is the project's folder, __CSE_PROGRAM__ what its .cseproject says).
import { ParseUiManifest } from "@cse/ui";
import { StartProgram, type ProgramTheme } from "../Source/Index";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - the project's own file, found through the build's alias
import * as Entry from "@cse-project/Source/Program.ts";

declare const __CSE_PROGRAM__: { Name: string; Manifest: string; Theme?: ProgramTheme; };

// Every document of the project, by its path from the project's folder; the manifest names them from its own folder.
const files = import.meta.glob("@cse-project/Content/**/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const ByPath = (path: string): string | undefined => Object.entries(files).find(([key]) => key.endsWith(`/${path}`))?.[1];
const manifestText = ByPath(__CSE_PROGRAM__.Manifest);
if (manifestText === undefined) throw new Error(`The program's UI manifest ${__CSE_PROGRAM__.Manifest} is not in its Content folder`);
const manifest = ParseUiManifest(manifestText);
const folder = __CSE_PROGRAM__.Manifest.split("/").slice(0, -1).join("/");
const documents = Object.fromEntries(manifest.Documents.flatMap((d) => {
	const text = ByPath(folder === "" ? d.Path : `${folder}/${d.Path}`);
	return text === undefined ? [] : [[d.Path, text]];
}));
const main = (Entry as { main?: (args: string[]) => void | Promise<void>; }).main;
if (!main) throw new Error("The program's Source/Program.ts has no main(args)");

// Ready (the smoke test asks): main(args) has run.
void StartProgram(document.getElementById("program")!, {
	Name: __CSE_PROGRAM__.Name, Manifest: manifest, Documents: documents, Main: main,
	...(__CSE_PROGRAM__.Theme ? { Theme: __CSE_PROGRAM__.Theme } : {}),
}).then(() => {
	document.documentElement.dataset["cseReady"] = "1";
}, (error: Error) => {
	console.error(`The program did not start: ${error.stack ?? error.message}`);
});
