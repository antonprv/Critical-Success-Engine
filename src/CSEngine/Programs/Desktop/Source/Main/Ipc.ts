// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import type { IpcMain } from "electron";
import type { DesignerService, DocumentToSave } from "./DesignerService";
import type { ProjectsService } from "./ProjectsService";

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
}

/** The project browser's calls, answered by the main process. */
export function RegisterProjectIpc(ipc: Pick<IpcMain, "handle">, service: ProjectsService, shell: DesktopShell): void {
	ipc.handle(ProjectChannels.List, () => Answer(() => service.List()));
	ipc.handle(ProjectChannels.Templates, () => Answer(() => service.Templates()));
	ipc.handle(ProjectChannels.NameProblem, (_event, name: string) => Answer(() => service.NameProblem(name)));
	ipc.handle(ProjectChannels.DefaultLocation, () => Answer(() => service.DefaultLocation()));
	ipc.handle(ProjectChannels.PickFolder, () => Answer(() => shell.PickFolder()));
	ipc.handle(ProjectChannels.Create, (_event, options: { Template: string; Name: string; Location: string; }) => Answer(() => service.Create(options)));
	ipc.handle(ProjectChannels.Remove, (_event, file: string) => Answer(() => service.Remove(file)));
	ipc.handle(ProjectChannels.OpenInDesigner, (_event, file: string) => Answer(() => shell.OpenInDesigner(file)));
}
