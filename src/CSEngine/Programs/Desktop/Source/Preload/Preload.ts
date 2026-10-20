// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { contextBridge, ipcRenderer } from "electron";
import { DesignerChannels, ProjectChannels, SolutionChannels, type IpcResult } from "../Main/Ipc";

/** Calls the main process; a failure comes back as an Error with the main process's own message. */
async function Call<T>(channel: string, ...args: unknown[]): Promise<T> {
	const result = await ipcRenderer.invoke(channel, ...args) as IpcResult<T>;
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

/** Watches a project's folder: the main process sends the watch's id with each change. */
function Watch(project: string, changed: () => void): () => void {
	let id: number | null = null;
	let stopped = false;
	const listener = (_event: unknown, watch: number): void => {
		if (watch === id) changed();
	};
	ipcRenderer.on(SolutionChannels.Changed, listener);
	void Call<number>(SolutionChannels.Watch, project).then((watch) => {
		id = watch;
		if (stopped) void Call(SolutionChannels.Unwatch, watch);
	}, () => { /* not a project: nothing to watch */ });
	return () => {
		stopped = true;
		ipcRenderer.removeListener(SolutionChannels.Changed, listener);
		if (id !== null) void Call(SolutionChannels.Unwatch, id);
	};
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
		RunModes: (file: string) => Call(ProjectChannels.RunModes, file),
		Run: (file: string, mode: string) => Call(ProjectChannels.Run, file, mode),
		Build: (file: string, platform: string, configuration: string) => Call(ProjectChannels.Build, file, platform, configuration),
	},
	designer: {
		Open: (file: string) => Call(DesignerChannels.Open, file),
		Read: (file: string, id: string) => Call(DesignerChannels.Read, file, id),
		IdProblem: (file: string, id: string) => Call(DesignerChannels.IdProblem, file, id),
		Save: (file: string, document: unknown) => Call(DesignerChannels.Save, file, document),
		CodeFiles: (file: string) => Call(DesignerChannels.CodeFiles, file),
		ReadCode: (file: string, path: string) => Call(DesignerChannels.CodeRead, file, path),
		WriteCode: (file: string, path: string, text: string) => Call(DesignerChannels.CodeWrite, file, path, text),
		SetTheme: (file: string, theme: unknown) => Call(DesignerChannels.SetTheme, file, theme),
	},
	solution: {
		List: (project: string) => Call(SolutionChannels.List, project),
		CreateFolder: (project: string, path: string) => Call(SolutionChannels.CreateFolder, project, path),
		Move: (project: string, from: string, to: string) => Call(SolutionChannels.Move, project, from, to),
		Copy: (project: string, from: string, to: string) => Call(SolutionChannels.Copy, project, from, to),
		Delete: (project: string, path: string) => Call(SolutionChannels.Delete, project, path),
		ReadText: (project: string, path: string) => Call(SolutionChannels.ReadText, project, path),
		WriteText: (project: string, path: string, text: string) => Call(SolutionChannels.WriteText, project, path, text),
		Watch,
	},
});
