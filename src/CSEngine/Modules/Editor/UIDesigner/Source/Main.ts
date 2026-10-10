// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { CodeSession, MemoryCodeHost } from "./Code/CodeSession";
import { GenerateGraphScript, GraphClassName } from "./GraphCodegen";
import { createApp } from "vue";
import LoginDialog from "./Examples/LoginDialog.ui.json?raw";
import { ExampleScripts } from "./Examples/LoginDialog";
import { ParseLayout } from "@cse/ui";
import { DesignerController } from "./DesignerController";
import { ProjectSession } from "./Project";
import WinDesigner from "./WinDesigner.vue";
import WinProjectChooser from "./WinProjectChooser.vue";

/**
 * The designer's page. In the desktop app (its preload gives window.cse): on the project given as ?project=, or asking
 * which project the UI is for. In a plain browser: on the examples.
 */
export async function StartDesigner(mount: HTMLElement, location: Pick<Location, "search" | "assign"> = window.location): Promise<void> {
	const api = window.cse?.designer;
	if (!api) {
		// A plain browser: the example, and its code in memory (the class its node graph makes, and a game file).
		const layout = ParseLayout(LoginDialog);
		const code = new CodeSession(new MemoryCodeHost({
			[`Source/UI/${GraphClassName(layout)}.ts`]: GenerateGraphScript(layout),
			"Source/Game.ts": "// The game's own code: the code editor knows TypeScript.\nexport const PlayerSpeed: number = 6;\n",
		}));
		await code.Refresh();
		createApp(WinDesigner, { layout, scripts: ExampleScripts(), code }).mount(mount);
		return;
	}
	const file = new URLSearchParams(location.search).get("project");
	if (file === null) {
		const projects = window.cse!.projects ?? { List: async () => [] };
		createApp(WinProjectChooser, { projects, open: (chosen: string) => location.assign(`?project=${encodeURIComponent(chosen)}`) }).mount(mount);
		return;
	}
	const controller = new DesignerController();
	const project = await ProjectSession.Start(api, file, controller);
	document.title = `UI Designer - ${project.State.Name}`;
	const code = new CodeSession(project.Code()); // the project's Source folder
	await code.Refresh();
	createApp(WinDesigner, { controller, project, code }).mount(mount);
}

const mount = document.getElementById("designer");
if (mount) void StartDesigner(mount);
