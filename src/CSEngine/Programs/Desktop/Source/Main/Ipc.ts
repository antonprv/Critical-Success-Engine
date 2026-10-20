// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { IpcMain } from "electron";
import type { ProjectTheme } from "../../../../Core/Source/Engine/Projects/ProjectDescriptor.ts";
import type { DesignerService, DocumentToSave } from "./DesignerService";
import type { ProjectsService } from "./ProjectsService";
import type { SolutionService } from "./SolutionService";
import type { BuildConfiguration, BuildPlatform, ProjectRunner, RunMode } from "./ProjectRunner";

/** A call's answer over IPC: the value, or the error's message (so the page reads the message, not Electron's wrapping). */
export type IpcResult<T> = { ok: true; value: T; } | { ok: false; error: string; };

/** What only the app's windows can do: the system's folder dialog, opening the UI Designer. */
export interface DesktopShell {
	PickFolder(): Promise<string | null>;
	OpenInDesigner(file: string): Promise<void>;
}

export const ProjectChannels = {
	List: "projects:list",
	Templates: "projects:templates",
	NameProblem: "projects:name-problem",
	DefaultLocation: "projects:default-location",
	PickFolder: "projects:pick-folder",
	Create: "projects:create",
	Remove: "projects:remove",
	OpenInDesigner: "projects:open-in-designer",
	RunModes: "projects:run-modes",
	Run: "projects:run",
	Build: "projects:build",
} as const;

async function Answer<T>(work: () => T | Promise<T>): Promise<IpcResult<T>> {
	try {
		return { ok: true, value: await work() };
	} catch (error) {
		return { ok: false, error: (error as Error).message };
	}
}

export const DesignerChannels = {
	Open: "designer:open",
	Read: "designer:read",
	IdProblem: "designer:id-problem",
	Save: "designer:save",
	CodeFiles: "designer:code-files",
	CodeRead: "designer:code-read",
	CodeWrite: "designer:code-write",
	SetTheme: "designer:set-theme",
} as const;

/** The UI designer's calls on a project, answered by the main process. */
export function RegisterDesignerIpc(ipc: Pick<IpcMain, "handle">, service: DesignerService): void {
	ipc.handle(DesignerChannels.Open, (_event, file: string) => Answer(() => service.Open(file)));
	ipc.handle(DesignerChannels.Read, (_event, file: string, id: string) => Answer(() => service.Read(file, id)));
	ipc.handle(DesignerChannels.IdProblem, (_event, file: string, id: string) => Answer(() => service.IdProblem(file, id)));
	ipc.handle(DesignerChannels.Save, (_event, file: string, document: DocumentToSave) => Answer(() => service.Save(file, document)));
	ipc.handle(DesignerChannels.CodeFiles, (_event, file: string) => Answer(() => service.CodeFiles(file)));
	ipc.handle(DesignerChannels.CodeRead, (_event, file: string, path: string) => Answer(() => service.ReadCode(file, path)));
	ipc.handle(DesignerChannels.CodeWrite, (_event, file: string, path: string, text: string) => Answer(() => service.WriteCode(file, path, text)));
	ipc.handle(DesignerChannels.SetTheme, (_event, file: string, theme: ProjectTheme) => Answer(() => service.SetTheme(file, theme)));
}

/** The project browser's calls, answered by the main process. */
export function RegisterProjectIpc(ipc: Pick<IpcMain, "handle">, service: ProjectsService, shell: DesktopShell, runner?: ProjectRunner): void {
	ipc.handle(ProjectChannels.List, () => Answer(() => service.List()));
	ipc.handle(ProjectChannels.Templates, () => Answer(() => service.Templates()));
	ipc.handle(ProjectChannels.NameProblem, (_event, name: string) => Answer(() => service.NameProblem(name)));
	ipc.handle(ProjectChannels.DefaultLocation, () => Answer(() => service.DefaultLocation()));
	ipc.handle(ProjectChannels.PickFolder, () => Answer(() => shell.PickFolder()));
	ipc.handle(ProjectChannels.Create, (_event, options: { Template: string; Name: string; Location: string; }) => Answer(() => service.Create(options)));
	ipc.handle(ProjectChannels.Remove, (_event, file: string) => Answer(() => service.Remove(file)));
	ipc.handle(ProjectChannels.OpenInDesigner, (_event, file: string) => Answer(() => shell.OpenInDesigner(file)));
	const Runner = (): ProjectRunner => { if (!runner) throw new Error("Running and building projects is not available here"); return runner; };
	ipc.handle(ProjectChannels.RunModes, (_event, file: string) => Answer(() => Runner().Availability(file)));
	ipc.handle(ProjectChannels.Run, (_event, file: string, mode: RunMode) => Answer(() => Runner().Run(file, mode)));
	ipc.handle(ProjectChannels.Build, (_event, file: string, platform: BuildPlatform, configuration: BuildConfiguration) => Answer(() => Runner().Build(file, platform, configuration)));
}

export const SolutionChannels = {
	List: "solution:list",
	CreateFolder: "solution:create-folder",
	Move: "solution:move",
	Copy: "solution:copy",
	Delete: "solution:delete",
	ReadText: "solution:read-text",
	WriteText: "solution:write-text",
	Watch: "solution:watch",
	Unwatch: "solution:unwatch",
	/** Main → page: a watched project's folder changed (with the watch's id). */
	Changed: "solution:changed",
} as const;

/** The page a call came from: where changes are sent, and how it tells it is gone. */
export interface IpcSender {
	send(channel: string, ...args: unknown[]): void;
	isDestroyed(): boolean;
	once(event: "destroyed", listener: () => void): unknown;
}

/** Solution Explorer's file calls on a project (S6-20), answered by the main process. */
export function RegisterSolutionIpc(ipc: Pick<IpcMain, "handle">, service: SolutionService): void {
	ipc.handle(SolutionChannels.List, (_event, project: string) => Answer(() => service.List(project)));
	ipc.handle(SolutionChannels.CreateFolder, (_event, project: string, path: string) => Answer(() => service.CreateFolder(project, path)));
	ipc.handle(SolutionChannels.Move, (_event, project: string, from: string, to: string) => Answer(() => service.Move(project, from, to)));
	ipc.handle(SolutionChannels.Copy, (_event, project: string, from: string, to: string) => Answer(() => service.Copy(project, from, to)));
	ipc.handle(SolutionChannels.Delete, (_event, project: string, path: string) => Answer(() => service.Delete(project, path)));
	ipc.handle(SolutionChannels.ReadText, (_event, project: string, path: string) => Answer(() => service.ReadText(project, path)));
	ipc.handle(SolutionChannels.WriteText, (_event, project: string, path: string, text: string) => Answer(() => service.WriteText(project, path, text)));
	ipc.handle(SolutionChannels.Watch, (event, project: string) => Answer(() => {
		const sender = event.sender as unknown as IpcSender;
		const id = service.Watch(project, () => {
			if (!sender.isDestroyed()) sender.send(SolutionChannels.Changed, id);
		});
		// A page closed without stopping: its watch goes with it.
		sender.once("destroyed", () => service.Unwatch(id));
		return id;
	}));
	ipc.handle(SolutionChannels.Unwatch, (_event, id: number) => Answer(() => service.Unwatch(id)));
}
