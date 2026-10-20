// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { contextBridge, ipcRenderer } from "electron";
import type { ProgramNative } from "../Source/Native";
import { ProgramChannels, type IpcAnswer } from "./Channels";

/** Calls the main process; a failure comes back as an Error with the main process's own message. */
async function Call<T>(channel: string, ...args: unknown[]): Promise<T> {
	const answer = await ipcRenderer.invoke(channel, ...args) as IpcAnswer<T>;
	if (!answer.ok) throw new Error(answer.error);
	return answer.value;
}

/** The page sees only this (window.cseProgram), never Node or Electron: context isolation. */
const native: ProgramNative = {
	Args: () => Call(ProgramChannels.Args),
	StartFiles: () => Call(ProgramChannels.StartFiles),
	OpenDialog: (options = {}) => Call(ProgramChannels.OpenDialog, options),
	SaveDialog: (options = {}) => Call(ProgramChannels.SaveDialog, options),
	ReadText: (path) => Call(ProgramChannels.ReadText, path),
	WriteText: (path, text) => Call(ProgramChannels.WriteText, path, text),
	SetTitle: (title) => Call(ProgramChannels.SetTitle, title),
	OnOpenFiles: (listener) => {
		const handler = (_event: unknown, files: string[]): void => listener(files);
		ipcRenderer.on(ProgramChannels.OpenFiles, handler);
		return () => ipcRenderer.removeListener(ProgramChannels.OpenFiles, handler);
	},
	ProjectOf: (file) => Call(ProgramChannels.ProjectOf, file),
	Files: {
		List: (folder) => Call(ProgramChannels.FilesList, folder),
		CreateFolder: (folder, path) => Call(ProgramChannels.FilesCreateFolder, folder, path),
		Move: (folder, from, to) => Call(ProgramChannels.FilesMove, folder, from, to),
		Copy: (folder, from, to) => Call(ProgramChannels.FilesCopy, folder, from, to),
		Delete: (folder, path) => Call(ProgramChannels.FilesDelete, folder, path),
		ReadText: (folder, path) => Call(ProgramChannels.FilesRead, folder, path),
		WriteText: (folder, path, text) => Call(ProgramChannels.FilesWrite, folder, path, text),
		Watch: (folder, changed) => {
			let id: number | null = null;
			let stopped = false;
			const listener = (_event: unknown, watch: number): void => {
				if (watch === id) changed();
			};
			ipcRenderer.on(ProgramChannels.FilesChanged, listener);
			void Call<number>(ProgramChannels.FilesWatch, folder).then((watch) => {
				id = watch;
				if (stopped) void Call(ProgramChannels.FilesUnwatch, watch);
			}, () => { /* not a granted folder: nothing to watch */ });
			return () => {
				stopped = true;
				ipcRenderer.removeListener(ProgramChannels.FilesChanged, listener);
				if (id !== null) void Call(ProgramChannels.FilesUnwatch, id);
			};
		},
	},
	Quit: (code = 0) => Call(ProgramChannels.Quit, code),
};

contextBridge.exposeInMainWorld("cseProgram", native);
