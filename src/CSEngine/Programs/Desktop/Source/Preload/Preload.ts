// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { contextBridge, ipcRenderer } from "electron";
import { DesignerChannels, ProjectChannels, type IpcResult } from "../Main/Ipc";

/** Calls the main process; a failure comes back as an Error with the main process's own message. */
async function Call<T>(channel: string, ...args: unknown[]): Promise<T> {
	const result = await ipcRenderer.invoke(channel, ...args) as IpcResult<T>;
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

/** The pages see only this (window.cse), never Node or Electron: context isolation. */
contextBridge.exposeInMainWorld("cse", {
	projects: {
		List: () => Call(ProjectChannels.List),
		Templates: () => Call(ProjectChannels.Templates),
		NameProblem: (name: string) => Call(ProjectChannels.NameProblem, name),
		DefaultLocation: () => Call(ProjectChannels.DefaultLocation),
		PickFolder: () => Call(ProjectChannels.PickFolder),
		Create: (options: { Template: string; Name: string; Location: string; }) => Call(ProjectChannels.Create, options),
		Remove: (file: string) => Call(ProjectChannels.Remove, file),
		OpenInDesigner: (file: string) => Call(ProjectChannels.OpenInDesigner, file),
	},
	designer: {
		Open: (file: string) => Call(DesignerChannels.Open, file),
		Read: (file: string, id: string) => Call(DesignerChannels.Read, file, id),
		IdProblem: (file: string, id: string) => Call(DesignerChannels.IdProblem, file, id),
		Save: (file: string, document: unknown) => Call(DesignerChannels.Save, file, document),
		CodeFiles: (file: string) => Call(DesignerChannels.CodeFiles, file),
		ReadCode: (file: string, path: string) => Call(DesignerChannels.CodeRead, file, path),
		WriteCode: (file: string, path: string, text: string) => Call(DesignerChannels.CodeWrite, file, path, text),
	},
});
